/* golf3d — view: 表示の設定, every display setting on one screen with the map in sight.
   While it is open the settings sheet covers only the lower part of the screen (#menu.peek) and the panels and side
   buttons are put away (body.peek), so each change shows at once on the real map above. A bar in the sheet's header
   switches hole, 2D / 3D and the view, and makes the map part larger or smaller, so it can all be tried without
   leaving the screen. The camera aims into the visible part (js/map.js camera() asks viewPeekBox()).
   The settings themselves live where they always did: switches and sliders in js/menu.js, trees in js/scene.js,
   pin / marks / lines in js/look.js, map designs in js/art.js.
   Plain scripts loaded in order from index.html (no build step); they share top-level names. */
"use strict";

Object.assign(M_TITLE, { mView: '表示の設定' });
Object.assign(M_RENDER, { mView: () => renderView() });
$('goView').onclick = () => { mShow('mView'); renderView(); };

// shown on the main list's row: the design in use, or nothing
const viewSummary = () => artCourse() ? artLabel() : '';
let viewLow = false;  // the larger map: the sheet lower down (the bar's ▾ / ▴ button)
const viewOpen = () => !$('menu').hidden && mStack[mStack.length - 1] === 'mView';
// the part of the screen the map shows in, for camera(): from the top (below the status bar) to the sheet
function viewPeekBox() {
  if (!document.body.classList.contains('peek')) return null;
  const sat = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--sat')) || 0;
  return { top: sat + 4, low: $('menu').getBoundingClientRect().top - 8 };
}
// peek on / off as the screen opens or closes (by ‹, 完了, another sheet, the guide…); the map is aimed again each time
let viewPeekNow = false;
function viewPeekSync() {
  const on = viewOpen();
  $('vBar').hidden = !on;
  $('menu').classList.toggle('peek', on); $('menu').classList.toggle('low', on && viewLow);
  document.body.classList.toggle('peek', on);
  if (on === viewPeekNow) return;
  viewPeekNow = on;
  if (mapReady && registered(hole()) && !inSetup()) camera(S.view, 500);
}
new MutationObserver(viewPeekSync).observe($('menu'), { attributes: true, attributeFilter: ['hidden'] });
const mPaintBase = mPaint;
mPaint = function () { mPaintBase(); viewPeekSync(); };

/* ---------- the bar: hole, 2D / 3D, view, map size ---------- */
function renderViewBar() {
  const h = hole();
  $('vHole').textContent = `${holeNo()}番` + (h && h.par ? ` Par ${h.par}` : '');
  $('v3d').querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', (b.dataset.v === '1') === S.is3D));
  $('vView').querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', b.dataset.v === S.view));
  $('vSize').textContent = viewLow ? '▴' : '▾';
  $('vSize').setAttribute('aria-label', viewLow ? '設定を広く見る' : '地図を広く見る');
  $('v3dNote').hidden = S.is3D;
}
$('vPrev').onclick = () => { goHole(holeNo() - 1); renderView(); };
$('vNext').onclick = () => { goHole(holeNo() + 1); renderView(); };
$('v3d').onclick = e => {
  const b = e.target.closest('button'); if (!b || (b.dataset.v === '1') === S.is3D) return;
  $('b3d').click(); renderViewBar();
};
$('vView').onclick = e => {
  const b = e.target.closest('button'); if (!b || b.dataset.v === S.view || needHole()) return;
  S.view = b.dataset.v; camera(S.view); savePrefs(); refresh(); renderViewBar();
};
$('vSize').onclick = () => {
  viewLow = !viewLow; viewPeekSync(); renderViewBar();
  if (mapReady && registered(hole())) camera(S.view, 500);
};

/* ---------- the tree size sliders ---------- */
// while the finger moves the heights follow at once (a paint change); 大きさ also makes the trees wider when it lifts
['treeSize', 'treeHeight'].forEach(k => {
  $(k).oninput = () => {
    const v = Math.round(+$(k).value * 10) / 10;
    if (v === 1) delete S.prefs[k]; else S.prefs[k] = v;
    $(k + 'Val').textContent = `×${v.toFixed(1)}`;
    treesPaintH();
  };
  $(k).onchange = () => { savePrefs(); if (k === 'treeSize') treesMake(); };
});
// the parts of this screen that js/menu.js's renderMenu does not keep up to date
function renderViewRows() {
  ['treeSize', 'treeHeight'].forEach(k => { $(k).value = treeK(k); $(k + 'Val').textContent = `×${treeK(k).toFixed(1)}`; });
  $('treeSizeRow').hidden = $('treeHRow').hidden = !treesOn();
}
function renderView() {
  renderMenu();  // the switches and sliders (and this screen's rows, through renderViewRows)
  renderViewBar(); renderArt(); renderLook();
}
