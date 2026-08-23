// Single place to swap CDN → vendored copies. Semver ranges avoid pinning to

// patch versions; pin exactly before you rely on this in production.

export const CDN = {

  pdfLib:      'https://esm.sh/pdf-lib@1.17.1',

  jszip:       'https://esm.sh/jszip@3.10.1',

  pdfjs:       'https://cdn.jsdelivr.net/npm/pdfjs-dist@4/build/pdf.min.mjs',

  pdfjsWorker: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4/build/pdf.worker.min.mjs',

};







const cache = new Map();

function once(key, fn){

  if (!cache.has(key)) cache.set(key, fn().catch(e => { cache.delete(key); throw e; }));

  return cache.get(key);

}

const fail = (n) => (e) => {

  throw new Error(`Could not load ${n}. Check your connection or ad-blocker. (${e.message})`);

};







export const loadPdfLib = () =>

  once('pdflib', () => import(/* @vite-ignore */ CDN.pdfLib).catch(fail('pdf-lib')));







export const loadJsZip = () =>

  once('jszip', () => import(/* @vite-ignore */ CDN.jszip)

    .then(m => m.default || m).catch(fail('JSZip')));







export const loadPdfJs = () =>

  once('pdfjs', () => import(/* @vite-ignore */ CDN.pdfjs).then(m => {

    m.GlobalWorkerOptions.workerSrc = CDN.pdfjsWorker;

    return m;

  }).catch(fail('pdf.js')));
