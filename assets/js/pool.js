const WORKER_URL = new URL('./workers/image.worker.js', import.meta.url);



export class WorkerPool {

  constructor(size){

    this.size = size || Math.max(2, Math.min(6, navigator.hardwareConcurrency || 4));

    this.workers = [];

    this.idle = [];

    this.waiting = [];

    this.seq = 0;

    this.pending = new Map();

    this.broken = false;

  }

  _spawn(){

    let w;

    try { w = new Worker(WORKER_URL, { type:'module' }); }

    catch(e){ this.broken = true; throw e; }

    w.onmessage = ({data}) => {

      const entry = this.pending.get(data.id);

      if (!entry) return;

      if (data.type === 'progress'){ entry.onProgress?.(data.value); return; }

      this.pending.delete(data.id);

      this._release(w);

      data.type === 'error' ? entry.reject(new Error(data.message))

                            : entry.resolve(data.result);

    };

    w.onerror = (e) => { this.broken = true; e.preventDefault?.(); };

    this.workers.push(w);

    return w;

  }

  _acquire(){

    if (this.idle.length) return Promise.resolve(this.idle.pop());

    if (this.workers.length < this.size) return Promise.resolve(this._spawn());

    return new Promise(res => this.waiting.push(res));

  }

  _release(w){

    const next = this.waiting.shift();

    next ? next(w) : this.idle.push(w);

  }

  async run(op, payload, { transfer = [], onProgress } = {}){

    const w = await this._acquire();

    const id = ++this.seq;

    return new Promise((resolve, reject) => {

      this.pending.set(id, { resolve, reject, onProgress });

      try { w.postMessage({ id, op, payload }, transfer); }

      catch (err){ this.pending.delete(id); this._release(w); reject(err); }

    });

  }

  destroy(){ this.workers.forEach(w => w.terminate()); this.workers = []; this.idle = []; }

}



export const pool = new WorkerPool();​