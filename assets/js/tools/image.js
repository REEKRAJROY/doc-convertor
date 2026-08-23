import { pool } from '../pool.js';

import { PRESETS, resolvePreset } from '../presets.js';

import { fmtBytes, replaceExt, sniffMime } from '../bytes.js';



const IMG_ACCEPT = 'image/*';

const EXT = { 'image/jpeg':'jpg', 'image/png':'png', 'image/webp':'webp' };



const presetOptions = PRESETS.map(p =>

  p.group ? { group: p.group } : { value: p.id, label: p.label });



async function readBytes(file){

  const buf = await file.arrayBuffer();

  return { buf, mime: file.type || sniffMime(new Uint8Array(buf.slice(0,16))) };

}



export const resizeCompress = {

  id: 'image-resize',

  group: 'Images',

  title: 'Resize & compress image',

  blurb: 'Hit an exact pixel size and an exact KB range — the combination government and exam portals demand. Presets included; everything runs on your device.',

  accept: IMG_ACCEPT,

  fields: [

    { key:'preset', label:'Preset', type:'select', options:presetOptions, value:'none', wide:true,

      hint:'Presets are community drafts — always re-check the official notification.' },

    { key:'width',  label:'Width (px, 0 = auto)',  type:'number', value:0, min:0 },

    { key:'height', label:'Height (px, 0 = auto)', type:'number', value:0, min:0 },

    { key:'fit',    label:'Fit', type:'select', value:'cover', options:[

        { value:'cover',   label:'Cover — crop to fill exactly' },

        { value:'contain', label:'Contain — pad, no crop' },

        { value:'stretch', label:'Stretch — ignore aspect ratio' }]},

    { key:'format', label:'Output format', type:'select', value:'image/jpeg', options:[

        { value:'image/jpeg', label:'JPEG' },

        { value:'image/png',  label:'PNG' },

        { value:'image/webp', label:'WebP' }]},

    { key:'maxKB', label:'Max size (KB, 0 = off)', type:'number', value:0, min:0 },

    { key:'minKB', label:'Min size (KB, 0 = off)', type:'number', value:0, min:0 },

    { key:'dpi',   label:'DPI tag (0 = leave)',    type:'number', value:0, min:0 },

    { key:'quality', label:'Quality (when no max size)', type:'number', value:90, min:5, max:100 },

    { key:'bg',    label:'Background (JPEG/pad)',  type:'color',  value:'#ffffff' },

    { key:'strip', label:'Remove metadata (EXIF/GPS)', type:'checkbox', value:true },

  ],

  // Applying a preset overwrites the dependent fields in the UI.

  onPreset(id, set){

    const p = resolvePreset(id);

    if (!p) return;

    set({ width:p.wpx, height:p.hpx, fit:p.fit || 'cover', format:p.mime || 'image/jpeg',

          maxKB:p.maxKB || 0, minKB:p.minKB || 0, dpi:p.dpi || 0 });

  },

  async run(file, o, ctx){

    const { buf, mime } = await readBytes(file);

    const r = await pool.run('process', {

      bytes: buf, name: file.name, srcMime: mime,

      targetMime: o.format,

      width: +o.width || 0, height: +o.height || 0, fit: o.fit,

      maxKB: +o.maxKB || 0, minKB: +o.minKB || 0,

      quality: (+o.quality || 90) / 100,

      dpi: +o.dpi || 0, strip: !!o.strip, bg: o.bg,

    }, { transfer: [buf], onProgress: ctx.progress });



    return {

      name: replaceExt(file.name, EXT[r.mime] || 'bin'),

      blob: new Blob([r.bytes], { type: r.mime }),

      note: [`${r.width}×${r.height}`, `was ${fmtBytes(file.size)}`, r.note]

              .filter(Boolean).join(' · '),

    };

  },

};



export const convert = {

  id: 'image-convert',

  group: 'Images',

  title: 'Convert image format',

  blurb: 'JPEG ⇄ PNG ⇄ WebP at original dimensions. HEIC support depends on your browser (Safari handles it).',

  accept: IMG_ACCEPT,

  fields: [

    { key:'format', label:'Convert to', type:'select', value:'image/jpeg', options:[

        { value:'image/jpeg', label:'JPEG' },

        { value:'image/png',  label:'PNG' },

        { value:'image/webp', label:'WebP' }]},

    { key:'quality', label:'Quality', type:'number', value:92, min:5, max:100 },

    { key:'bg', label:'Background for transparency', type:'color', value:'#ffffff' },

    { key:'strip', label:'Remove metadata', type:'checkbox', value:true },

  ],

  async run(file, o, ctx){

    const { buf, mime } = await readBytes(file);

    const r = await pool.run('process', {

      bytes: buf, name: file.name, srcMime: mime, targetMime: o.format,

      quality: (+o.quality || 92) / 100, strip: !!o.strip, bg: o.bg,

    }, { transfer: [buf], onProgress: ctx.progress });

    return {

      name: replaceExt(file.name, EXT[r.mime] || 'bin'),

      blob: new Blob([r.bytes], { type: r.mime }),

      note: `${r.width}×${r.height} · was ${fmtBytes(file.size)}`,

    };

  },

};



export const stripMeta = {

  id: 'image-strip',

  group: 'Images',

  title: 'Remove metadata (lossless)',

  blurb: 'Strips EXIF, GPS coordinates, device IDs, timestamps and XMP from JPEG/PNG by rewriting the container — pixel data is copied byte-for-byte, so there is zero quality loss.',

  accept: '.jpg,.jpeg,.png,image/jpeg,image/png',

  fields: [],

  async run(file, _o, ctx){

    const { buf, mime } = await readBytes(file);

    ctx.progress(0.3);

    const r = await pool.run('strip', { bytes: buf, srcMime: mime }, { transfer:[buf] });

    ctx.progress(1);

    return { name: file.name.replace(/(\.[^.]+)$/, '-clean$1'),

             blob: new Blob([r.bytes], { type: r.mime }), note: r.note };

  },

};
