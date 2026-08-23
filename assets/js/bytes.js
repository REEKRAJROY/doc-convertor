// ---------- generic ----------

export const KB = 1024;

export function fmtBytes(n){

  if (n < KB) return n + ' B';

  if (n < KB*KB) return (n/KB).toFixed(1) + ' KB';

  return (n/KB/KB).toFixed(2) + ' MB';

}

export function sniffMime(u8, fallback=''){

  const b = u8;

  if (b[0]===0xFF && b[1]===0xD8) return 'image/jpeg';

  if (b[0]===0x89 && b[1]===0x50 && b[2]===0x4E && b[3]===0x47) return 'image/png';

  if (b[0]===0x25 && b[1]===0x50 && b[2]===0x44 && b[3]===0x46) return 'application/pdf';

  if (b[0]===0x47 && b[1]===0x49 && b[2]===0x46) return 'image/gif';

  if (b[0]===0x52 && b[1]===0x49 && b[8]===0x57 && b[9]===0x45) return 'image/webp';

  if (b[0]===0x42 && b[1]===0x4D) return 'image/bmp';

  return fallback;

}

export function replaceExt(name, ext){

  return name.replace(/\.[^./\\]+$/, '') + '.' + ext;

}

function concat(parts){

  const total = parts.reduce((s,p)=>s+p.length,0);

  const out = new Uint8Array(total); let o=0;

  for (const p of parts){ out.set(p,o); o+=p.length; }

  return out;

}



// ---------- CRC32 (for PNG chunks) ----------

const CRC_TABLE = (()=>{

  const t = new Uint32Array(256);

  for (let n=0;n<256;n++){ let c=n;

    for (let k=0;k<8;k++) c = (c&1) ? (0xEDB88320 ^ (c>>>1)) : (c>>>1);

    t[n]=c>>>0; }

  return t;

})();

function crc32(buf){

  let c = 0xFFFFFFFF;

  for (let i=0;i<buf.length;i++) c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c>>>8);

  return (c ^ 0xFFFFFFFF) >>> 0;

}



// ---------- JPEG ----------

// Walk JPEG markers. Standalone markers carry no length payload.

function isStandalone(m){ return m===0x01 || (m>=0xD0 && m<=0xD9); }



/**

 * Losslessly remove identifying metadata from a JPEG.

 * Drops: APP1 (Exif/XMP), APP3-APP12, APP13 (IPTC/Photoshop), APP14/15, COM.

 * Keeps: APP0 (JFIF density), APP2 (ICC colour profile) so colours don't shift.

 * Entropy-coded scan data is copied byte-for-byte — no recompression.

 */

export function stripJpegMetadata(u8){

  if (!(u8[0]===0xFF && u8[1]===0xD8)) return u8;

  const out = [u8.subarray(0,2)];

  let i = 2;

  while (i < u8.length - 1){

    if (u8[i] !== 0xFF){ i++; continue; }

    let m = u8[i+1];

    while (m === 0xFF){ i++; m = u8[i+1]; }          // fill bytes

    if (isStandalone(m)){ out.push(u8.subarray(i,i+2)); i+=2; continue; }

    if (m === 0xDA){ out.push(u8.subarray(i)); return concat(out); } // SOS → rest verbatim

    const len = (u8[i+2]<<8) | u8[i+3];

    if (len < 2 || i+2+len > u8.length) break;        // malformed; bail safely

    const drop = (m===0xE1) || (m>=0xE3 && m<=0xEF) || (m===0xFE);

    if (!drop) out.push(u8.subarray(i, i+2+len));

    i += 2 + len;

  }

  return out.length > 1 ? concat(out) : u8;

}



/** Set JPEG resolution (JFIF APP0 density). Inserts APP0 if absent. */

export function setJpegDpi(u8, dpi){

  if (!dpi || !(u8[0]===0xFF && u8[1]===0xD8)) return u8;

  const d = Math.max(1, Math.min(65535, Math.round(dpi)));

  if (u8[2]===0xFF && u8[3]===0xE0 &&

      u8[6]===0x4A && u8[7]===0x46 && u8[8]===0x49 && u8[9]===0x46 && u8[10]===0x00){

    const c = u8.slice();

    c[13] = 1;                       // units = dots per inch

    c[14] = d>>8; c[15] = d&0xFF;    // Xdensity

    c[16] = d>>8; c[17] = d&0xFF;    // Ydensity

    return c;

  }

  const app0 = new Uint8Array([

    0xFF,0xE0, 0x00,0x10, 0x4A,0x46,0x49,0x46,0x00, 0x01,0x02, 0x01,

    d>>8, d&0xFF, d>>8, d&0xFF, 0x00,0x00

  ]);

  return concat([u8.subarray(0,2), app0, u8.subarray(2)]);

}



/**

 * Grow a JPEG to at least minBytes by inserting COM (comment) segments.

 * Many government portals enforce a MINIMUM file size; this is the standards-

 * compliant way to satisfy it without degrading the image.

 */

export function padJpegToMin(u8, minBytes){

  if (!minBytes || u8.length >= minBytes) return u8;

  let need = minBytes - u8.length;

  const segs = [];

  while (need > 0){

    const payload = Math.min(need - 4, 65531);

    if (payload < 1) break;

    const len = payload + 2;

    const seg = new Uint8Array(payload + 4);

    seg[0]=0xFF; seg[1]=0xFE; seg[2]=len>>8; seg[3]=len&0xFF;

    seg.fill(0x20, 4);                       // spaces

    segs.push(seg);

    need -= seg.length;

  }

  return concat([u8.subarray(0,2), ...segs, u8.subarray(2)]);

}



// ---------- PNG ----------

const PNG_SIG = [0x89,0x50,0x4E,0x47,0x0D,0x0A,0x1A,0x0A];

function pngChunks(u8){

  const chunks = []; let i = 8;

  while (i + 8 <= u8.length){

    const len = (u8[i]<<24 | u8[i+1]<<16 | u8[i+2]<<8 | u8[i+3]) >>> 0;

    const type = String.fromCharCode(u8[i+4],u8[i+5],u8[i+6],u8[i+7]);

    const end = i + 12 + len;

    if (end > u8.length) break;

    chunks.push({ type, raw: u8.subarray(i, end), data: u8.subarray(i+8, i+8+len) });

    i = end;

    if (type === 'IEND') break;

  }

  return chunks;

}

function pngChunk(type, data){

  const out = new Uint8Array(data.length + 12);

  const dv = new DataView(out.buffer);

  dv.setUint32(0, data.length);

  for (let k=0;k<4;k++) out[4+k] = type.charCodeAt(k);

  out.set(data, 8);

  dv.setUint32(out.length-4, crc32(out.subarray(4, 8+data.length)));

  return out;

}

const PNG_DROP = new Set(['tEXt','zTXt','iTXt','eXIf','tIME','dSIG']);



export function stripPngMetadata(u8){

  if (!PNG_SIG.every((b,i)=>u8[i]===b)) return u8;

  const keep = pngChunks(u8).filter(c => !PNG_DROP.has(c.type)).map(c=>c.raw);

  return keep.length ? concat([u8.subarray(0,8), ...keep]) : u8;

}



/** Set PNG pHYs resolution. */

export function setPngDpi(u8, dpi){

  if (!dpi || !PNG_SIG.every((b,i)=>u8[i]===b)) return u8;

  const ppm = Math.round(dpi / 0.0254);

  const d = new Uint8Array(9); const dv = new DataView(d.buffer);

  dv.setUint32(0, ppm); dv.setUint32(4, ppm); d[8] = 1;   // unit = metre

  const phys = pngChunk('pHYs', d);

  const parts = [u8.subarray(0,8)];

  let inserted = false;

  for (const c of pngChunks(u8)){

    if (c.type === 'pHYs') continue;

    if (!inserted && c.type === 'IDAT'){ parts.push(phys); inserted = true; }

    parts.push(c.raw);

  }

  if (!inserted) parts.splice(1, 0, phys);

  return concat(parts);

}



// ---------- dispatchers ----------

export function stripMetadata(u8, mime){

  if (mime === 'image/jpeg') return stripJpegMetadata(u8);

  if (mime === 'image/png')  return stripPngMetadata(u8);

  return u8;

}

export function applyDpi(u8, mime, dpi){

  if (mime === 'image/jpeg') return setJpegDpi(u8, dpi);

  if (mime === 'image/png')  return setPngDpi(u8, dpi);

  return u8;

}
