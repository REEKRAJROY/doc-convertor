import { TOOLS, DEFAULT_TOOL } from './tools/index.js';

import { Queue } from './queue.js';

import { loadJsZip } from './vendor.js';

import { fmtBytes } from './bytes.js';

import { mountAds } from './ads.js';



const $ = s => document.querySelector(s);

const el = (t, cls, txt) => { const n = document.createElement(t);

  if (cls) n.className = cls; if (txt != null) n.textContent = txt; return n; };



const CONCURRENCY = Math.max(2, Math.min(6, navigator.hardwareConcurrency || 4));

const queue = new Queue(CONCURRENCY);



let current = TOOLS.find(t => t.id === (location.hash.slice(1) || DEFAULT_TOOL)) || TOOLS[0];

let opts = {};

const jobEls = new Map();

let jobSeq = 0;



// ---------- navigation ----------

function buildNav(){

  const nav = $('#toolnav');

  nav.replaceChildren();

  let lastGroup = null;

  for (const t of TOOLS){

    if (t.group !== lastGroup){ nav.append(el('div','group',t.group)); lastGroup = t.group; }

    const b = el('button', null, t.title);

    b.type = 'button';

    b.setAttribute('aria-current', String(t.id === current.id));

    b.onclick = () => { location.hash = t.id; selectTool(t); };

    nav.append(b);

  }

}



function selectTool(t){

  current = t;

  buildNav();

  renderHeader();

  renderForm();

  $('#fileinput').setAttribute('accept', t.accept || '');

  $('#fileinput').toggleAttribute('multiple', true);

}



function renderHeader(){

  const h = $('#tool-header');

  h.replaceChildren(el('h1', null, current.title), el('p','blurb',current.blurb));

  if (current.id === 'image-resize')

    h.append(el('div','warn',

      'Preset sizes are best-effort drafts contributed by users. Always confirm dimensions and file-size limits against the official notification before you submit.'));

  if (current.batch)

    h.append(el('div','warn','This tool combines every file you drop into one job, in the order added.'));

}



// ---------- declarative form ----------

function renderForm(){

  const wrap = $('#tool-form');

  wrap.replaceChildren();

  opts = {};

  const inputs = {};



  for (const f of current.fields || []){

    opts[f.key] = f.value;

    const field = el('div', 'field' + (f.type === 'checkbox' ? ' check' : '') + (f.wide ? ' wide' : ''));

    const label = el('label', null, f.label);

    label.htmlFor = `f-${f.key}`;



    let input;

    if (f.type === 'select'){

      input = el('select');

      for (const o of f.options){

        if (o.group){ const g = el('optgroup'); g.label = o.group; input.append(g); continue; }

        const opt = el('option', null, o.label);

        opt.value = o.value;

        const last = input.lastElementChild;

        (last && last.tagName === 'OPTGROUP' ? last : input).append(opt);

      }

      input.value = f.value;

    } else {

      input = el('input');

      input.type = f.type === 'checkbox' ? 'checkbox'

                 : f.type === 'number' ? 'number'

                 : f.type === 'color' ? 'color' : 'text';

      if (f.type === 'checkbox') input.checked = !!f.value; else input.value = f.value;

      if (f.min != null) input.min = f.min;

      if (f.max != null) input.max = f.max;

    }

    input.id = `f-${f.key}`;

    inputs[f.key] = input;



    input.addEventListener('input', () => {

      opts[f.key] = f.type === 'checkbox' ? input.checked : input.value;

      if (f.key === 'preset' && current.onPreset)

        current.onPreset(input.value, patch => {

          for (const [k, v] of Object.entries(patch)){

            opts[k] = v;

            if (inputs[k]) inputs[k].value = v;

          }

        });

    });



    if (f.type === 'checkbox'){ field.append(input, label); }

    else { field.append(label, input); }

    if (f.hint) field.append(el('div','hint',f.hint));

    wrap.append(field);

  }

}



// ---------- job intake ----------

function accepts(file){

  const a = (current.accept || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);

  if (!a.length) return true;

  const name = file.name.toLowerCase(), type = (file.type || '').toLowerCase();

  return a.some(rule =>

    rule.startsWith('.') ? name.endsWith(rule)

    : rule.endsWith('/*') ? type.startsWith(rule.slice(0, -1))

    : type === rule);

}



function intake(fileList){

  const files = Array.from(fileList);

  if (!files.length) return;

  const good = files.filter(accepts);

  const bad = files.filter(f => !accepts(f));

  if (bad.length) toastJob(`Skipped ${bad.length} file(s) this tool can't handle: ` +

                           bad.slice(0,3).map(f=>f.name).join(', '));

  if (!good.length) return;



  const snapshot = { ...opts };   // freeze settings at drop time

  if (current.batch){

    addJob(`${current.title}: ${good.length} files`, ctx => current.run(good, snapshot, ctx));

  } else {

    for (const f of good)

      addJob(f.name, ctx => current.run(f, snapshot, ctx), f.size);

  }

}



function addJob(label, exec, size){

  const job = { id: ++jobSeq, label, size, exec, tool: current.title };

  queue.add(job);

}



function toastJob(msg){

  const li = el('li','job error');

  li.append(el('div','name', msg), el('div','bar'));

  $('#jobs').prepend(li);

  setTimeout(() => li.remove(), 6000);

}



// ---------- rendering jobs ----------

const STATE_TEXT = { queued:'Queued…', running:'Working…', done:'Done',

                     error:'Failed', cancelled:'Cancelled' };



queue.on((job) => {

  let li = jobEls.get(job.id);

  if (!li){

    li = el('li','job');

    li.append(el('div','name'), el('div','act'), el('div','meta'),

              (() => { const b = el('div','bar'); b.append(el('i')); return b; })());

    jobEls.set(job.id, li);

    $('#jobs').prepend(li);

  }

  li.className = 'job ' + job.state;

  li.querySelector('.name').textContent = `${job.label} — ${job.tool}`;

  li.querySelector('.bar i').style.width = (job.progress * 100).toFixed(1) + '%';



  const meta = li.querySelector('.meta');

  const act = li.querySelector('.act');

  act.replaceChildren();



  if (job.state === 'done'){

    const parts = [];

    for (const out of job.outputs){

      const a = el('a','btn', `Download ${out.name}`);

      a.href = URL.createObjectURL(out.blob);

      a.download = out.name;

      act.append(a);

      parts.push(`${out.name} — ${fmtBytes(out.blob.size)}${out.note ? ' · ' + out.note : ''}`);

      if (act.childElementCount >= 3) break;

    }

    if (job.outputs.length > 3)

      parts.push(`+${job.outputs.length - 3} more (use “Download all”)`);

    meta.textContent = parts.join('  |  ');

  } else if (job.state === 'error'){

    meta.textContent = '';

    let err = li.querySelector('.err');

    if (!err){ err = el('div','err'); li.append(err); }

    err.textContent = job.error;

  } else {

    meta.textContent = STATE_TEXT[job.state] +

      (job.size ? ` · ${fmtBytes(job.size)}` : '') +

      (job.state === 'running' ? ` · ${Math.round(job.progress * 100)}%` : '');

    if (job.state !== 'cancelled'){

      const c = el('button','btn ghost','Cancel');

      c.onclick = () => queue.cancel(job);

      act.append(c);

    }

  }

  refreshQueueUI();

});



function doneJobs(){

  return [...jobEls.keys()].map(id => finished.get(id)).filter(Boolean);

}

const finished = new Map();

queue.on(job => { if (job.state === 'done') finished.set(job.id, job); });



function refreshQueueUI(){

  const pending = queue.pendingCount;

  $('#queue-count').textContent = pending

    ? `· ${pending} in progress (${CONCURRENCY} at a time)`

    : (finished.size ? `· ${finished.size} finished` : '');

  const total = [...finished.values()].reduce((s,j) => s + j.outputs.length, 0);

  $('#zip-all').disabled = total < 2;

  $('#zip-all').textContent = total > 1 ? `Download all ${total} files (.zip)` : 'Download all (.zip)';

}



// ---------- bulk zip ----------

$('#zip-all').onclick = async (e) => {

  const btn = e.currentTarget;

  btn.disabled = true; btn.textContent = 'Zipping…';

  try {

    const JSZip = await loadJsZip();

    const zip = new JSZip();

    const used = new Map();

    for (const job of finished.values()){

      for (const out of job.outputs){

        let name = out.name;

        const n = (used.get(name) || 0) + 1;

        used.set(name, n);

        if (n > 1) name = name.replace(/(\.[^.]+)?$/, `-${n}$1`);

        zip.file(name, out.blob);

      }

    }

    const blob = await zip.generateAsync({ type:'blob' });

    const a = el('a');

    a.href = URL.createObjectURL(blob);

    a.download = 'local-file-toolkit.zip';

    a.click();

    setTimeout(() => URL.revokeObjectURL(a.href), 30000);

  } catch (err){

    toastJob('Could not build the ZIP: ' + err.message);

  } finally { refreshQueueUI(); }

};



$('#clear-done').onclick = () => {

  for (const [id, job] of finished){

    jobEls.get(id)?.remove();

    jobEls.delete(id);

    job.outputs?.forEach(o => o._url && URL.revokeObjectURL(o._url));

  }

  finished.clear();

  refreshQueueUI();

};



// ---------- dropzone ----------

const dz = $('#dropzone'), fi = $('#fileinput');

dz.onclick = () => fi.click();

dz.onkeydown = e => { if (e.key === 'Enter' || e.key === ' '){ e.preventDefault(); fi.click(); } };

fi.onchange = () => { intake(fi.files); fi.value = ''; };

['dragenter','dragover'].forEach(ev => dz.addEventListener(ev, e => {

  e.preventDefault(); dz.classList.add('over'); }));

['dragleave','drop'].forEach(ev => dz.addEventListener(ev, e => {

  e.preventDefault(); dz.classList.remove('over'); }));

dz.addEventListener('drop', e => { if (e.dataTransfer?.files) intake(e.dataTransfer.files); });

// Stop the browser navigating away when a file is dropped outside the zone.

['dragover','drop'].forEach(ev => window.addEventListener(ev, e => e.preventDefault()));



window.addEventListener('hashchange', () => {

  const t = TOOLS.find(x => x.id === location.hash.slice(1));

  if (t && t.id !== current.id) selectTool(t);

});

window.addEventListener('beforeunload', e => {

  if (queue.pendingCount){ e.preventDefault(); e.returnValue = ''; }

});



selectTool(current);

mountAds();​