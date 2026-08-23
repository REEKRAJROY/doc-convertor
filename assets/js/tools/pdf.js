import { loadPdfLib, loadJsZip, loadPdfJs } from '../vendor.js';

import { fmtBytes, replaceExt, sniffMime } from '../bytes.js';







const PDF_ACCEPT = '.pdf,application/pdf';







function parseRanges(spec, total){

  if (!spec || !spec.trim()) return Array.from({ length: total }, (_, i) => i);

  const out = [];

  for (const part of spec.split(',')){

    const s = part.trim();

    if (!s) continue;

    const m = s.match(/^(\d+)?\s*-\s*(\d+)?$/);

    if (m){

      const a = Math.max(1, parseInt(m[1] || '1', 10));

      const b = Math.min(total, parseInt(m[2] || String(total), 10));

      for (let i = a; i <= b; i++) out.push(i - 1);

    } else {

      const n = parseInt(s, 10);

      if (Number.isFinite(n)) out.push(n - 1);

    }

  }

  const seen = new Set();

  return out.filter(i => i >= 0 && i < total && !seen.has(i) && seen.add(i));

}







async function loadDoc(PDFLib, file, { ignoreEncryption = true } = {}){

  const bytes = new Uint8Array(await file.arrayBuffer());

  if (sniffMime(bytes) !== 'application/pdf')

    throw new Error(`${file.name} is not a PDF.`);

  try {

    return await PDFLib.PDFDocument.load(bytes, { ignoreEncryption });

  } catch (e){

    throw new Error(/encrypt|password/i.test(e.message)

      ? `${file.name} is password-protected. Remove the password in your PDF reader first.`

      : `Could not read ${file.name}: ${e.message}`);

  }

}







/** Render PDF pages to JPEG/PNG blobs via pdf.js. */

async function rasterize(file, { dpi = 150, mime = 'image/jpeg', quality = 0.82,

                                 pages = null, maxSide = 5000, onProgress } = {}){

  const pdfjs = await loadPdfJs();

  const data = new Uint8Array(await file.arrayBuffer());

  const doc = await pdfjs.getDocument({ data, isEvalSupported: false }).promise;

  const idx = pages || Array.from({ length: doc.numPages }, (_, i) => i);

  const out = [];

  const canvas = document.createElement('canvas');

  const ctx = canvas.getContext('2d');







  for (let k = 0; k < idx.length; k++){

    const page = await doc.getPage(idx[k] + 1);

    let scale = dpi / 72;

    const probe = page.getViewport({ scale });

    const biggest = Math.max(probe.width, probe.height);

    if (biggest > maxSide) scale *= maxSide / biggest;      // memory guard

    const vp = page.getViewport({ scale });







    canvas.width = Math.max(1, Math.ceil(vp.width));

    canvas.height = Math.max(1, Math.ceil(vp.height));

    ctx.fillStyle = '#ffffff';

    ctx.fillRect(0, 0, canvas.width, canvas.height);

    await page.render({ canvasContext: ctx, viewport: vp }).promise;







    const blob = await new Promise(r => canvas.toBlob(r, mime, quality));

    out.push({ index: idx[k], blob, width: canvas.width, height: canvas.height });

    page.cleanup();

    onProgress?.((k + 1) / idx.length);

  }

  await doc.destroy();

  canvas.width = canvas.height = 0;

  return out;

}







export const merge = {

  id: 'pdf-merge',

  group: 'PDF',

  title: 'Merge PDFs',

  blurb: 'Combine several PDFs into one, in the order you add them. Pages are copied losslessly.',

  accept: PDF_ACCEPT,

  batch: true,                      // receives all files at once

  fields: [{ key:'name', label:'Output filename', type:'text', value:'merged.pdf', wide:true }],

  async run(files, o, ctx){

    if (files.length < 2) throw new Error('Add at least two PDFs to merge.');

    const PDFLib = await loadPdfLib();

    const out = await PDFLib.PDFDocument.create();

    for (let i = 0; i < files.length; i++){

      const src = await loadDoc(PDFLib, files[i]);

      const pages = await out.copyPages(src, src.getPageIndices());

      pages.forEach(p => out.addPage(p));

      ctx.progress((i + 1) / (files.length + 1));

    }

    const bytes = await out.save({ useObjectStreams: true });

    ctx.progress(1);

    const name = (o.name || 'merged.pdf').replace(/\.?(pdf)?$/i, '.pdf');

    return { name, blob: new Blob([bytes], { type:'application/pdf' }),

             note: `${out.getPageCount()} pages · ${fmtBytes(bytes.length)}` };

  },

};







export const split = {

  id: 'pdf-split',

  group: 'PDF',

  title: 'Split / extract pages',

  blurb: 'Pull out a page range as a single PDF, or burst every page into its own file. Ranges like 1-3,5,8- work.',

  accept: PDF_ACCEPT,

  fields: [

    { key:'ranges', label:'Pages (blank = all)', type:'text', value:'', wide:true,

      hint:'Examples: 1-3,7  ·  5-  ·  2,4,6' },

    { key:'mode', label:'Output', type:'select', value:'single', options:[

        { value:'single', label:'One PDF containing the selected pages' },

        { value:'each',   label:'One PDF per page' }]},

  ],

  async run(file, o, ctx){

    const PDFLib = await loadPdfLib();

    const src = await loadDoc(PDFLib, file);

    const total = src.getPageCount();

    const idx = parseRanges(o.ranges, total);

    if (!idx.length) throw new Error(`No valid pages selected (document has ${total}).`);

    const base = file.name.replace(/\.pdf$/i, '');







    if (o.mode === 'each'){

      const results = [];

      for (let i = 0; i < idx.length; i++){

        const d = await PDFLib.PDFDocument.create();

        const [pg] = await d.copyPages(src, [idx[i]]);

        d.addPage(pg);

        results.push({ name: `${base}-p${idx[i] + 1}.pdf`,

                       blob: new Blob([await d.save()], { type:'application/pdf' }) });

        ctx.progress((i + 1) / idx.length);

      }

      results[0].note = `${results.length} files`;

      return results;

    }

    const d = await PDFLib.PDFDocument.create();

    const pages = await d.copyPages(src, idx);

    pages.forEach(p => d.addPage(p));

    const bytes = await d.save({ useObjectStreams: true });

    ctx.progress(1);

    return { name: `${base}-pages.pdf`, blob: new Blob([bytes], { type:'application/pdf' }),

             note: `${idx.length} of ${total} pages · ${fmtBytes(bytes.length)}` };

  },

};







export const imagesToPdf = {

  id: 'img-to-pdf',

  group: 'PDF',

  title: 'Images → PDF',

  blurb: 'Turn photos or scans into a single PDF. Useful when a portal accepts only PDF but you have JPEGs.',

  accept: 'image/jpeg,image/png,.jpg,.jpeg,.png',

  batch: true,

  fields: [

    { key:'page', label:'Page size', type:'select', value:'fit', options:[

        { value:'fit',    label:'Fit page to each image' },

        { value:'a4',     label:'A4 portrait' },

        { value:'letter', label:'US Letter portrait' }]},

    { key:'margin', label:'Margin (pt)', type:'number', value:0, min:0, max:150 },

    { key:'name', label:'Output filename', type:'text', value:'images.pdf' },

  ],

  async run(files, o, ctx){

    const PDFLib = await loadPdfLib();

    const doc = await PDFLib.PDFDocument.create();

    const SIZES = { a4:[595.28, 841.89], letter:[612, 792] };

    const margin = Math.max(0, +o.margin || 0);







    for (let i = 0; i < files.length; i++){

      const f = files[i];

      const bytes = new Uint8Array(await f.arrayBuffer());

      const mime = f.type || sniffMime(bytes);

      let img;

      try {

        img = mime === 'image/png' ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);

      } catch {

        throw new Error(`${f.name}: only baseline JPEG and PNG can be embedded. ` +

                        `Run it through “Convert image format” first.`);

      }

      if (o.page === 'fit'){

        const page = doc.addPage([img.width + margin*2, img.height + margin*2]);

        page.drawImage(img, { x:margin, y:margin, width:img.width, height:img.height });

      } else {

        const [pw, ph] = SIZES[o.page];

        const page = doc.addPage([pw, ph]);

        const aw = pw - margin*2, ah = ph - margin*2;

        const s = Math.min(aw / img.width, ah / img.height);

        const w = img.width * s, h = img.height * s;

        page.drawImage(img, { x:(pw - w)/2, y:(ph - h)/2, width:w, height:h });

      }

      ctx.progress((i + 1) / (files.length + 1));

    }

    const bytes = await doc.save({ useObjectStreams: true });

    ctx.progress(1);

    return { name: (o.name || 'images.pdf').replace(/\.?(pdf)?$/i, '.pdf'),

             blob: new Blob([bytes], { type:'application/pdf' }),

             note: `${files.length} pages · ${fmtBytes(bytes.length)}` };

  },

};







export const pdfToImages = {

  id: 'pdf-to-img',

  group: 'PDF',

  title: 'PDF → images (ZIP)',

  blurb: 'Render each page to JPEG or PNG and download them as a ZIP.',

  accept: PDF_ACCEPT,

  fields: [

    { key:'dpi', label:'Resolution (DPI)', type:'number', value:150, min:36, max:600 },

    { key:'format', label:'Format', type:'select', value:'image/jpeg', options:[

        { value:'image/jpeg', label:'JPEG' }, { value:'image/png', label:'PNG' }]},

    { key:'quality', label:'JPEG quality', type:'number', value:85, min:20, max:100 },

    { key:'ranges', label:'Pages (blank = all)', type:'text', value:'' },

  ],

  async run(file, o, ctx){

    const pdfjs = await loadPdfJs();

    const probe = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;

    const total = probe.numPages;

    await probe.destroy();







    const pages = parseRanges(o.ranges, total);

    if (!pages.length) throw new Error(`No valid pages selected (document has ${total}).`);







    const rendered = await rasterize(file, {

      dpi:+o.dpi || 150, mime:o.format, quality:(+o.quality || 85)/100,

      pages, onProgress: p => ctx.progress(p * 0.85),

    });







    const JSZip = await loadJsZip();

    const zip = new JSZip();

    const ext = o.format === 'image/png' ? 'png' : 'jpg';

    const base = file.name.replace(/\.pdf$/i, '');

    const pad = String(total).length;

    for (const r of rendered)

      zip.file(`${base}-p${String(r.index + 1).padStart(pad, '0')}.${ext}`, r.blob);







    const blob = await zip.generateAsync({ type:'blob' },

      m => ctx.progress(0.85 + m.percent / 100 * 0.15));

    return { name: `${base}-images.zip`, blob,

             note: `${rendered.length} pages · ${fmtBytes(blob.size)}` };

  },

};







export const compressPdf = {

  id: 'pdf-compress',

  group: 'PDF',

  title: 'Compress PDF',

  blurb: 'Two modes. Optimise rewrites the file structure and is lossless but modest. Rasterise re-renders every page as an image — it shrinks scans dramatically but destroys selectable text.',

  accept: PDF_ACCEPT,

  fields: [

    { key:'mode', label:'Mode', type:'select', value:'raster', options:[

        { value:'optimise', label:'Optimise structure (lossless, modest)' },

        { value:'raster',   label:'Rasterise pages (lossy, strong)' }]},

    { key:'dpi', label:'Rasterise DPI', type:'number', value:120, min:50, max:300 },

    { key:'quality', label:'Rasterise JPEG quality', type:'number', value:70, min:20, max:95 },

    { key:'maxKB', label:'Target max size (KB, 0 = off)', type:'number', value:0, min:0 },

  ],

  async run(file, o, ctx){

    const PDFLib = await loadPdfLib();

    const outName = replaceExt(file.name, 'pdf').replace(/\.pdf$/i, '-compressed.pdf');







    if (o.mode === 'optimise'){

      const src = await loadDoc(PDFLib, file);

      const bytes = await src.save({ useObjectStreams: true });

      ctx.progress(1);

      const delta = file.size - bytes.length;

      return { name: outName, blob: new Blob([bytes], { type:'application/pdf' }),

               note: delta > 0

                 ? `${fmtBytes(file.size)} → ${fmtBytes(bytes.length)} (saved ${fmtBytes(delta)})`

                 : `No structural savings available (${fmtBytes(bytes.length)}). Try rasterise mode.` };

    }







    // Rasterise, optionally iterating down to hit a size target.

    const target = (+o.maxKB || 0) * 1024;

    let dpi = +o.dpi || 120;

    let quality = (+o.quality || 70) / 100;

    let best = null;







    for (let attempt = 0; attempt < (target ? 5 : 1); attempt++){

      const rendered = await rasterize(file, {

        dpi, mime:'image/jpeg', quality,

        onProgress: p => ctx.progress((attempt + p * 0.8) / (target ? 5 : 1)),

      });

      const doc = await PDFLib.PDFDocument.create();

      for (const r of rendered){

        const img = await doc.embedJpg(new Uint8Array(await r.blob.arrayBuffer()));

        const page = doc.addPage([img.width * 72 / dpi, img.height * 72 / dpi]);

        page.drawImage(img, { x:0, y:0, width:page.getWidth(), height:page.getHeight() });

      }

      const bytes = await doc.save({ useObjectStreams: true });

      best = { bytes, dpi, quality };

      if (!target || bytes.length <= target) break;

      quality = Math.max(0.3, quality * 0.8);

      dpi = Math.max(60, Math.round(dpi * 0.85));

    }

    ctx.progress(1);

    const note = `${fmtBytes(file.size)} → ${fmtBytes(best.bytes.length)} · ` +

                 `${best.dpi} DPI, q${Math.round(best.quality * 100)} · text is no longer selectable` +

                 (target && best.bytes.length > target ? ' · could not reach target' : '');

    return { name: outName, blob: new Blob([best.bytes], { type:'application/pdf' }), note };

  },

};
