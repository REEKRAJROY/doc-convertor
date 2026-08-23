// Each preset: { w, h, unit, dpi, minKB, maxKB, mime, fit }

// unit 'px' → w/h are pixels. unit 'mm' → converted using dpi.

export const PRESETS = [

  { id:'none', label:'— Custom / no preset —' },



  { group:'India · competitive exams' },

  { id:'ssc-photo',  label:'SSC photo (3.5×4.5 cm, 20–50 KB)',

    w:35,h:45,unit:'mm',dpi:300,minKB:20,maxKB:50,mime:'image/jpeg',fit:'cover' },

  { id:'ssc-sign',   label:'SSC signature (10–20 KB)',

    w:60,h:20,unit:'mm',dpi:300,minKB:10,maxKB:20,mime:'image/jpeg',fit:'contain' },

  { id:'ibps-photo', label:'IBPS / bank photo (200×230 px, 20–50 KB)',

    w:200,h:230,unit:'px',dpi:200,minKB:20,maxKB:50,mime:'image/jpeg',fit:'cover' },

  { id:'ibps-sign',  label:'IBPS / bank signature (140×60 px, 10–20 KB)',

    w:140,h:60,unit:'px',dpi:200,minKB:10,maxKB:20,mime:'image/jpeg',fit:'contain' },

  { id:'upsc-photo', label:'UPSC photo (20–300 KB)',

    w:350,h:450,unit:'px',dpi:300,minKB:20,maxKB:300,mime:'image/jpeg',fit:'cover' },

  { id:'neet-photo', label:'NEET / JEE photo (10–200 KB)',

    w:350,h:450,unit:'px',dpi:300,minKB:10,maxKB:200,mime:'image/jpeg',fit:'cover' },

  { id:'gate-photo', label:'GATE photo (≤ 200 KB)',

    w:240,h:320,unit:'px',dpi:200,maxKB:200,mime:'image/jpeg',fit:'cover' },



  { group:'ID photo sizes' },

  { id:'us-2x2',     label:'US passport 2×2 in @300 dpi',

    w:600,h:600,unit:'px',dpi:300,mime:'image/jpeg',fit:'cover' },

  { id:'in-passport',label:'India passport 35×45 mm @300 dpi',

    w:35,h:45,unit:'mm',dpi:300,mime:'image/jpeg',fit:'cover' },

  { id:'schengen',   label:'Schengen visa 35×45 mm @300 dpi',

    w:35,h:45,unit:'mm',dpi:300,mime:'image/jpeg',fit:'cover' },



  { group:'Web & social' },

  { id:'web-1200',   label:'Web hero 1200 px wide (≤ 200 KB)',

    w:1200,h:0,unit:'px',maxKB:200,mime:'image/webp',fit:'contain' },

  { id:'avatar-512', label:'Avatar 512×512',

    w:512,h:512,unit:'px',mime:'image/jpeg',fit:'cover' },

];



export function resolvePreset(id){

  const p = PRESETS.find(x => x.id === id);

  if (!p || p.id === 'none') return null;

  const dpi = p.dpi || 300;

  const toPx = v => p.unit === 'mm' ? Math.round(v / 25.4 * dpi) : Math.round(v);

  return { ...p, wpx: toPx(p.w || 0), hpx: toPx(p.h || 0), dpi };

}