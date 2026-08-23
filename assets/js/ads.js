/**

 * Ad slot loader.

 *

 * Slots render as empty reserved boxes until you fill in a provider below.

 * Keeping this in one file means the rest of the app has no ad coupling.

 *

 * IMPORTANT — AdSense requires an approved account and a live site with real

 * content. Apply only after the site is deployed and has a privacy policy.

 */

export const AD_CONFIG = {

  provider: 'none',            // 'none' | 'adsense'

  adsenseClient: '',           // e.g. 'ca-pub-0000000000000000'

  slots: {

    leaderboard: '',           // AdSense ad slot IDs

    rail: '',

    footer: '',

  },

};



let scriptLoaded = false;

function loadAdSense(client){

  if (scriptLoaded) return;

  scriptLoaded = true;

  const s = document.createElement('script');

  s.async = true;

  s.crossOrigin = 'anonymous';

  s.src = 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=' +

          encodeURIComponent(client);

  document.head.appendChild(s);

}



export function mountAds(){

  const slots = document.querySelectorAll('[data-ad]');

  if (AD_CONFIG.provider !== 'adsense' || !AD_CONFIG.adsenseClient) return;

  loadAdSense(AD_CONFIG.adsenseClient);

  slots.forEach(el => {

    const slotId = AD_CONFIG.slots[el.dataset.ad];

    if (!slotId) return;

    const ins = document.createElement('ins');

    ins.className = 'adsbygoogle';

    ins.style.display = 'block';

    ins.style.width = '100%';

    ins.dataset.adClient = AD_CONFIG.adsenseClient;

    ins.dataset.adSlot = slotId;

    ins.dataset.adFormat = 'auto';

    ins.dataset.fullWidthResponsive = 'true';

    el.replaceChildren(ins);

    el.removeAttribute('aria-hidden');

    try { (window.adsbygoogle = window.adsbygoogle || []).push({}); } catch {}

  });

}