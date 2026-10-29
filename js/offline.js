/* golf3d — offline: saving the course map to this phone
   Plain scripts loaded in order from index.html (no build step); they share top-level names. */
"use strict";

/* offline save */
function offTiles() {
  // in a competition: the organizer's course; otherwise every nine of this phone's course
  const pts = []; (comp ? playHoles() : allHoles()).forEach(h => { if (h.tee) pts.push(h.tee); if (h.green) pts.push(h.green); });
  let w, s, e, n;
  if (pts.length) {
    w = Math.min(...pts.map(p => p[0])); e = Math.max(...pts.map(p => p[0])); s = Math.min(...pts.map(p => p[1])); n = Math.max(...pts.map(p => p[1]));
    const dLat = 220 / 111320, dLng = 220 / (111320 * Math.cos(rad((s + n) / 2)));
    w -= dLng; e += dLng; s -= dLat; n += dLat;
  } else { const b = map.getBounds(); w = b.getWest(); e = b.getEast(); s = b.getSouth(); n = b.getNorth(); }
  const list = [];
  const range = (z, fn) => { const x0 = Math.floor(lng2x(w, z)), x1 = Math.floor(lng2x(e, z)), y0 = Math.floor(lat2y(n, z)), y1 = Math.floor(lat2y(s, z)); for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) fn(x, y); };
  for (let z = 12; z <= 18; z++) range(z, (x, y) => list.push({ kind: 'photo', z, x, y }));
  for (let z = 12; z <= 15; z++) range(z, (x, y) => list.push({ kind: 'dem', z, x, y }));
  return { list, fromHoles: pts.length > 0 };
}
// save the aerial photos and elevation around the course to this phone; progress shows in the settings rows
async function offSaveRun() {
  if (offState) return;
  if (!(await openCache())) { toast('このブラウザでは端末に保存できません'); return; }
  const { list } = offTiles(); let done = 0, fail = 0, i = 0;
  offState = { pct: 0 }; renderMenu();
  const worker = async () => {
    while (i < list.length) {
      const t = list[i++];
      try {
        if (t.kind === 'photo') { if (!(await tileBlob(`${GSI}seamlessphoto/${t.z}/${t.x}/${t.y}.jpg`))) fail++; }
        else if (!(await heights(t.z, t.x, t.y))) fail++;
      } catch (e) { fail++; }
      const p = Math.floor(++done / list.length * 100);
      if (p !== offState.pct) { offState.pct = p; if (!$('menu').hidden) renderMenu(); }
    }
  };
  await Promise.all(Array.from({ length: 6 }, worker));
  offState = null;
  const ok = fail <= list.length * .3;
  if (ok) saveJSON(OFF_KEY, { sig: courseSig(), at: Date.now() });
  renderMenu();
  toast(ok ? '端末に保存しました。電波がなくても地図が見られます' : '一部しか保存できませんでした。電波の良い場所でもう一度お試しください');
}


/* the app itself works offline through the service worker (sw.js). When a new version takes over,
   reload once so the page and its files come from the same release. */
if ('serviceWorker' in navigator) {
  const hadWorker = !!navigator.serviceWorker.controller;
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (hadWorker && !reloaded) { reloaded = true; location.reload(); } });
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

/* Add to Home Screen: on a phone, in any browser (not the home-screen app), a card with the steps for that
   browser. あとで hides it for 20 hours (golf3d.a2hsClosed = time closed); settings keeps a row to open it again. */
const A2_SHARE = '<svg width="20" height="22" viewBox="0 0 20 22" fill="none" stroke="#0b5cad" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-label="共有ボタン"><path d="M10 14V2M6 6l4-4 4 4"/><path d="M6 9H3v11h14V9h-3"/></svg>';
const a2 = (() => {
  const ua = navigator.userAgent;
  const iOS = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const android = /Android/.test(ua);
  const app = navigator.standalone || matchMedia('(display-mode: standalone)').matches;
  const inApp = /Line\/|FBAN|FBAV|Instagram|GSA\//.test(ua);  // LINE and other in-app browsers cannot add to the home screen
  return { on: (iOS || android) && !app, iOS, android, inApp, chrome: /CriOS/.test(ua) };
})();
let a2Prompt = null;  // Android Chrome: the browser's own install dialog, kept until the button is pressed
addEventListener('beforeinstallprompt', e => { e.preventDefault(); a2Prompt = e; $('a2hsInstall').hidden = false; a2Steps(); });
function a2Steps() {
  const ol = $('a2hsHow');
  ol.innerHTML = a2Prompt ? '' : a2.inApp
    ? `<li>右上（または右下）の「…」や ${A2_SHARE} から「${a2.iOS ? 'Safari' : 'ブラウザ'}で開く」を選ぶ</li><li>開いた画面で、もう一度この案内に従う</li>`
    : a2.iOS
      ? `<li>${a2.chrome ? 'アドレスバーの右の' : '画面の下（または上）の'} ${A2_SHARE} を押す</li><li>「ホーム画面に追加」を選ぶ（見えないときは下にスクロール）</li><li>右上の「追加」を押す</li>`
      : '<li>右上の「︙」（メニュー）を押す</li><li>「ホーム画面に追加」または「アプリをインストール」を選ぶ</li>';
}
function a2Show() { a2Steps(); $('a2hs').hidden = false; }
$('a2hsClose').onclick = () => { $('a2hs').hidden = true; saveJSON('golf3d.a2hsClosed', Date.now()); };
$('a2hsInstall').onclick = async () => {
  if (!a2Prompt) return;
  a2Prompt.prompt();
  const r = await a2Prompt.userChoice.catch(() => null); a2Prompt = null;
  $('a2hsInstall').hidden = true; $('a2hs').hidden = true;
  if (r && r.outcome === 'accepted') toast('ホーム画面に追加しました。次からはホーム画面のアイコンから開いてください');
};
$('a2hsOpen').onclick = () => { $('menu').hidden = true; a2Show(); };
$('a2hsRow').hidden = !a2.on;
addEventListener('appinstalled', () => { $('a2hs').hidden = $('a2hsRow').hidden = true; });
if (a2.on) {
  const closed = loadJSON('golf3d.a2hsClosed');  // older versions saved true: show it again
  if (typeof closed !== 'number' || Date.now() - closed > 20 * 3600e3) a2Show();
}
