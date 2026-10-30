/* golf3d — pages: swiping between ranking ← map → score
   Plain scripts loaded in order from index.html (no build step); they share top-level names. */
"use strict";

/* ================= page swipe: [ranking] ← map → [score] ================= */
const PAGE_POS = { rank: -1, map: 0, score: 1 };
const PAGE_EL = [['pRank', -1], ['pScore', 1]];
function pageView(v, dragging) {
  PAGE_EL.forEach(([id, o]) => {
    const p = $(id);
    p.classList.toggle('drag', !!dragging);
    p.classList.toggle('on', Math.abs(o - v) < 1);
    p.style.transform = `translateX(${(o - v) * 100}%)`;
  });
}
function goPage(name) {

  if (name === 'score') { scoreEnter(); renderScore(); }
  else scPlayer = null;  // swiping to the score page always shows your own card
  if (name === 'rank') renderRank();
  if (name === 'map') renderDock();
  S.page = name; pageView(PAGE_POS[name]);
  // the first time 順位表 / スコア表 opens: they can also be reached by swiping the map (kept in golf3d.prefs as swipeHint)
  if (name !== 'map' && !S.prefs.swipeHint) {
    S.prefs.swipeHint = Date.now(); savePrefs();
    snack('地図を左右にスライドしても、順位表 ← マップ → スコア表 と切り替えられます', () => {}, 'OK');
  }
}
const canSwipe = () => S.page !== 'map' || (!S.mode && $('menu').hidden && $('setup').hidden && $('players').hidden && $('onboard').hidden);
let sw = null, swallowClick = false;
function swipeStart(e) {
  if ((e.pointerType === 'mouse' && e.button) || !canSwipe() || e.target.closest('input,select')) return;
  sw = { id: e.pointerId, x: e.clientX, y: e.clientY, t: performance.now(), from: S.page, to: null };
}
document.addEventListener('pointermove', e => {
  if (!sw || e.pointerId !== sw.id) return;
  const dx = e.clientX - sw.x, dy = e.clientY - sw.y;
  if (!sw.to) {
    if (Math.abs(dy) > 12 && Math.abs(dy) > Math.abs(dx)) { sw = null; return; }
    if (Math.abs(dx) < 12 || Math.abs(dx) < Math.abs(dy) * 1.3) return;
    // finger moving left reveals the page on the right, and vice versa
    sw.to = sw.from === 'map' ? (dx < 0 ? 'score' : 'rank') : (PAGE_POS[sw.from] > 0) === (dx > 0) ? 'map' : null;
    if (!sw.to) { sw = null; return; }
    if (sw.to === 'score') { scoreEnter(); renderScore(); } else if (sw.to === 'rank') renderRank();
  }
  const a = PAGE_POS[sw.from], b = PAGE_POS[sw.to];
  pageView(Math.min(Math.max(a, b), Math.max(Math.min(a, b), a - dx / innerWidth)), true);
});
function swipeEnd(e) {
  if (!sw || e.pointerId !== sw.id) return;
  const s = sw; sw = null;
  if (!s.to) return;
  const dx = e.clientX - s.x, speed = Math.abs(dx) / Math.max(1, performance.now() - s.t);
  const toward = Math.sign(PAGE_POS[s.from] - PAGE_POS[s.to]) === Math.sign(dx);
  goPage(e.type === 'pointerup' && toward && (Math.abs(dx) > innerWidth * .3 || speed > .5) ? s.to : s.from);
  swallowClick = true; setTimeout(() => swallowClick = false, 60);
}
document.addEventListener('pointerup', swipeEnd);
document.addEventListener('pointercancel', swipeEnd);
document.addEventListener('click', e => { if (swallowClick) { e.preventDefault(); e.stopPropagation(); swallowClick = false; } }, true);
[document.querySelector('.hud'), $('pRank'), $('pScore')].forEach(x => x.addEventListener('pointerdown', swipeStart));
$('dkRank').onclick = () => goPage('rank');
$('dkCard').onclick = () => goPage('score');
document.querySelectorAll('[data-go]').forEach(b => b.onclick = () => goPage(b.dataset.go));
pageView(0);

/* ================= the browser's / phone's back ================= */
/* Every screen or dialog opened over the map adds one browser history entry; back closes the top one.
   navDepth() counts what is open; the history follows it (push when more is open, go back when something
   was closed with its own button). On the map with nothing open, back leaves the app as before. */
const navDepth = () =>
  (S.page !== 'map' ? 1 : 0)
  + (!$('setup').hidden ? 3 : !$('menu').hidden ? mStack.length : 0)  // the guide sits on top of 設定 › コース登録
  + (!$('players').hidden ? (fromMenu ? 2 : 1) : 0)
  + (!$('banner').hidden ? 1 : 0)
  + ['onboard', 'a2hs', 'qr', 'ask'].filter(id => !$(id).hidden).length;
// close the top layer, the same as its own ✕ / キャンセル / ‹ button
function navCloseTop() {
  if (!$('ask').hidden) $('askNo').click();
  else if (!$('qr').hidden) $('qrClose').click();
  else if (!$('a2hs').hidden) $('a2hs').hidden = true;
  else if (!$('onboard').hidden) $('onboard').hidden = true;
  else if (!$('banner').hidden) $('bannerCancel').click();
  else if (!$('players').hidden) $('plClose').click();
  else if (!$('setup').hidden) guideClose();
  else if (!$('menu').hidden) $(mStack.length > 1 ? 'mBack' : 'menuClose').click();
  else if (S.page !== 'map') goPage('map');
}
let navH = 0, navWait = false, navAgain = false;  // navH: entries this page added; navWait: our own history.go is on its way
function navSync() {
  if (navWait) { navAgain = true; return; }
  const d = navDepth();
  if (d > navH) while (navH < d) history.pushState({ golf3d: ++navH }, '');
  else if (d < navH) { navWait = true; history.go(d - navH); navH = d; }
}
addEventListener('popstate', e => {
  if (navWait) { navWait = false; if (navAgain) { navAgain = false; navSync(); } return; }
  navH = (e.state && e.state.golf3d) || 0;  // the entry the browser went to
  for (let k = 0; k < 10 && navDepth() > navH; k++) navCloseTop();
  if (navDepth() !== navH) navSync();  // forward, or a layer that cannot close: line the history up again
});
// whatever opens or closes a screen (hidden attribute, page change) ends up here, once per change
let navQ = false;
const navSoon = () => { if (!navQ) { navQ = true; queueMicrotask(() => { navQ = false; navSync(); }); } };
const navObs = new MutationObserver(navSoon);
['menu', 'players', 'setup', 'banner', 'onboard', 'a2hs', 'qr', 'ask'].forEach(id => navObs.observe($(id), { attributes: true, attributeFilter: ['hidden'], subtree: id === 'menu' }));
PAGE_EL.forEach(([id]) => navObs.observe($(id), { attributes: true, attributeFilter: ['class'] }));

