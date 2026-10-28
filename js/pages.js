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

