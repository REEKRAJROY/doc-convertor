import {

  stripMetadata, applyDpi, padJpegToMin, sniffMime

} from '../bytes.js';



const MAX_DIM = 12000;       // guard against absurd canvases

const HARD_PIXELS = 60e6;    // ~60 MP ceiling



self.onmessage = async ({ data }) => {

  const { id, op, payload } = data;

  const post = (type, extra) => self.postMessage({ id, type, ...extra });

  const progress = v => post('progress', { value: v });

  try {

    const result = op === 'process' ? await process(payload, progress)

                 : op === 'strip'   ? await stripOnly(payload)

                 : (() => { throw new Error('Unknown op: ' + op); })();

    post('done', { result });

  } catch (err){

    post('error', { message: err?.message || String(err) });

  }

};



async function decode(bytes, mime){

  const blob = new Blob([bytes], { type: mime || 'application/octet-stream' });

  try {

    return await createImageBitmap(blob, { imageOrientation: 'from-image' });

  } catch {

    // Some engines reject the options bag; retry bare before giving up.

    try { return await createImageBitmap(blob); }

    catch {

      throw new Error(

        /hei[cf]|avif/i.test(mime || '')

          ? 'This browser cannot decode HEIC/HEIF. Convert to JPEG on your phone first, or open in Safari.'

          : 'Could not decode this image (unsupported or corrupt format).'

      );

    }

  }

}



/** Compute target dimensions honouring fit mode. 0 = auto from aspect ratio. */

function targetSize(sw, sh, tw, th, fit){

  if (!tw && !th) return { w: sw, h: sh };

  if (tw && !th)  return { w: tw, h: Math.max(1, Math.round(sh * tw / sw)) };

  if (!tw && th)  return { w: Math.max(1, Math.round(sw * th / sh)), h: th };

  if (fit === 'contain'){

    const s = Math.min(tw / sw, th / sh);

    return { w: tw, h: th, drawW: Math.round(sw*s), drawH: Math.round(sh*s), letterbox: true };

  }

  return { w: tw, h: th };  // cover / stretch handled at draw time

}



function drawTo(bmp, spec, bg, fit){

  const { w, h } = spec;

  if (w > MAX_DIM || h > MAX_DIM || w*h > HARD_PIXELS)

    throw new Error(`Output too large (${w}×${h}). Reduce the dimensions.`);

  const c = new OffscreenCanvas(w, h);

  const ctx = c.getContext('2d', { alpha: true });

  ctx.imageSmoothingEnabled = true;

  ctx.imageSmoothingQuality = 'high';

  if (bg){ ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h); }



  if (spec.letterbox){

    ctx.drawImage(bmp, (w-spec.drawW)/2|0, (h-spec.drawH)/2|0, spec.drawW, spec.drawH);

  } else if (fit === 'stretch'){

    ctx.drawImage(bmp, 0, 0, w, h);

  } else {                                    // cover: centre-crop

    const s = Math.max(w / bmp.width, h / bmp.height);

    const dw = bmp.width * s, dh = bmp.height * s;

    ctx.drawImage(bmp, (w-dw)/2, (h-dh)/2, dw, dh);

  }

  return c;

}



async function encode(canvas, mime, quality){

  const opts = { type: mime };

  if (mime === 'image/jpeg' || mime === 'image/webp') opts.quality = quality;

  const blob = await canvas.convertToBlob(opts);

  if (!blob) throw new Error('Encoding failed for ' + mime);

  if (blob.type && blob.type !== mime && mime === 'image/webp')

    throw new Error('This browser cannot encode WebP. Choose JPEG or PNG.');

  return new Uint8Array(await blob.arrayBuffer());

}



async function process(p, progress){

  const {

    bytes, name, srcMime, targetMime = 'image/jpeg',

    width = 0, height = 0, fit = 'cover',

    maxKB = 0, minKB = 0, quality = 0.9, dpi = 0,

    strip = true, bg = '#ffffff'

  } = p;



  const src = new Uint8Array(bytes);

  const mime = srcMime || sniffMime(src);

  progress(0.05);



  const bmp = await decode(src, mime);

  progress(0.2);



  const lossy   = targetMime === 'image/jpeg' || targetMime === 'image/webp';

  const needsBg = targetMime === 'image/jpeg' ? bg : null;

  const maxBytes = maxKB * 1024;

  const notes = [];



  let scale = 1, out = null, finalCanvas = null;



  for (let attempt = 0; attempt < 8; attempt++){

    const base = targetSize(bmp.width, bmp.height, width, height, fit);

    const spec = {

      ...base,

      w: Math.max(1, Math.round(base.w * scale)),

      h: Math.max(1, Math.round(base.h * scale)),

      drawW: base.drawW ? Math.round(base.drawW * scale) : undefined,

      drawH: base.drawH ? Math.round(base.drawH * scale) : undefined,

    };

    const canvas = drawTo(bmp, spec, needsBg, fit);

    finalCanvas = canvas;



    if (!maxBytes){ out = await encode(canvas, targetMime, quality); break; }



    if (lossy){

      // Binary search the highest quality that still fits the size budget.

      let lo = 0.05, hi = 0.96, best = null;

      for (let i = 0; i < 9; i++){

        const mid = (lo + hi) / 2;

        const enc = await encode(canvas, targetMime, mid);

        if (enc.length <= maxBytes){ best = enc; lo = mid; } else { hi = mid; }

        progress(0.2 + 0.7 * ((attempt * 9 + i + 1) / 72));

      }

      if (best){ out = best; break; }

    } else {

      const enc = await encode(canvas, targetMime, quality);

      if (enc.length <= maxBytes){ out = enc; break; }

      notes.push('PNG has no quality dial — reduced dimensions instead.');

    }

    scale *= 0.85;                       // still too big → shrink and retry

    if (attempt === 7){

      out = await encode(canvas, targetMime, lossy ? 0.05 : quality);

      notes.push('Could not reach the size limit; this is the smallest achievable output.');

    }

  }



  const dims = { w: finalCanvas.width, h: finalCanvas.height };

  bmp.close?.();



  if (strip) out = stripMetadata(out, targetMime);

  if (dpi)   out = applyDpi(out, targetMime, dpi);

  if (minKB && targetMime === 'image/jpeg'){

    const before = out.length;

    out = padJpegToMin(out, minKB * 1024);

    if (out.length > before) notes.push(`Padded to meet the ${minKB} KB minimum.`);

  } else if (minKB && out.length < minKB*1024){

    notes.push(`Below the ${minKB} KB minimum — minimum-size padding only supports JPEG.`);

  }

  progress(1);



  return {

    bytes: out.buffer, mime: targetMime, name,

    width: dims.w, height: dims.h,

    note: notes.join(' ')

  };

}



async function stripOnly({ bytes, srcMime }){

  const src = new Uint8Array(bytes);

  const mime = srcMime || sniffMime(src);

  if (mime !== 'image/jpeg' && mime !== 'image/png')

    throw new Error('Lossless metadata removal supports JPEG and PNG only.');

  const out = stripMetadata(src, mime);

  return {

    bytes: out.buffer, mime,

    note: out.length === src.length

      ? 'No removable metadata found.'

      : `Removed ${src.length - out.length} bytes of metadata (pixels untouched).`

  };

}
