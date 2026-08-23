export class Queue {

  constructor(concurrency = 4){

    this.concurrency = concurrency;

    this.active = 0;

    this.q = [];

    this.listeners = new Set();

  }

  on(fn){ this.listeners.add(fn); return () => this.listeners.delete(fn); }

  emit(job){ this.listeners.forEach(fn => fn(job, this)); }



  add(job){

    job.state = 'queued';

    job.progress = 0;

    job.controller = new AbortController();

    this.q.push(job);

    this.emit(job);

    this._pump();

    return job;

  }

  cancel(job){

    if (job.state === 'done' || job.state === 'error') return;

    job.controller.abort();

    if (job.state === 'queued'){

      this.q = this.q.filter(j => j !== job);

      job.state = 'cancelled';

      this.emit(job);

    }

  }

  get pendingCount(){ return this.q.length + this.active; }



  _pump(){

    while (this.active < this.concurrency && this.q.length){

      const job = this.q.shift();

      this.active++;

      job.state = 'running';

      this.emit(job);



      const ctx = {

        signal: job.controller.signal,

        progress: (v) => {

          job.progress = Math.max(0, Math.min(1, v));

          this.emit(job);

        },

      };



      Promise.resolve()

        .then(() => job.exec(ctx))

        .then(outputs => {

          if (job.controller.signal.aborted){ job.state = 'cancelled'; return; }

          job.outputs = [].concat(outputs).filter(Boolean);

          job.state = 'done';

          job.progress = 1;

        })

        .catch(err => {

          job.state = job.controller.signal.aborted ? 'cancelled' : 'error';

          job.error = err?.message || String(err);

        })

        .finally(() => {

          this.active--;

          this.emit(job);

          this._pump();

        });

    }

  }

}