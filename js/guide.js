/* golf3d — guide: placing greens and tees hole by hole ("1番のグリーンをタップしてください", then the tee).
   The map (GSI aerial photo) stays in view above the guide panel (#setup). Works on the draft (S.draft); 確定 is in settings.
   Plain scripts loaded in order from index.html (no build step); they share top-level names. */
"use strict";

/* markers: the green and the base tee can be dragged; the other colours' tees are estimates ("仮") */
const GM = { green: new maplibregl.Marker({ element: mkEl('gg hit', 'G'), draggable: true }), tee: new maplibregl.Marker({ element: mkEl('gt hit', 'T'), draggable: true }) };
let gExtra = [];  // estimate markers, rebuilt on every draw
const sameLL = (a, b) => !!(a && b && a[0] === b[0] && a[1] === b[1]);
function guideDrop(kind) {
  const p = GM[kind].getLngLat(), h = hole();
  h[kind] = [p.lng, p.lat]; h.src = 'manual'; h.ok = false;
  saveDraft(); refresh();
}
GM.green.on('dragend', () => guideDrop('green'));
GM.tee.on('dragend', () => guideDrop('tee'));
Object.values(GM).forEach(m => m.getElement().addEventListener('click', e => e.stopPropagation()));

function guideMarkers() {
  const on = inSetup(), h = on && hole(), c = on && S.draft.course;
  place(GM.green, on && h.green); place(GM.tee, on && h.tee);
  gExtra.forEach(m => m.remove()); gExtra = [];
  if (!on) return;
  const base = c.tees.find(t => t.id === c.baseTee) || c.tees[0];
  const te = GM.tee.getElement(); te.style.background = base.color; te.classList.toggle('light', isLight(base.color));
  c.tees.forEach(t => {  // the other colours: only where the estimate is not on the base tee itself
    const p = t.id === c.baseTee ? null : teeLL(h, t.id, c);
    if (!p || sameLL(p, h.tee)) return;
    const e = mkEl('gest', '仮'); e.style.background = t.color; e.classList.toggle('light', isLight(t.color)); e.title = `${t.name}（仮）`;
    gExtra.push(new maplibregl.Marker({ element: e }).setLngLat(p).addTo(map));
  });
}
const isLight = hex => { const n = parseInt(hex.slice(1), 16); return ((n >> 16) * 299 + ((n >> 8) & 255) * 587 + (n & 255) * 114) / 1000 > 150; };

/* ---------- the panel ---------- */
function renderGuide() {
  const h = hole(), c = S.draft.course, nine = draftNine(S.su.nine), green = S.su.step === 'green';
  const base = c.tees.find(t => t.id === c.baseTee) || c.tees[0], y = h.yd[c.baseTee];
  $('gHole').textContent = `${nine.name} ${cardNo(c, nine, h.n)}番`;
  if (document.activeElement !== $('gPar')) $('gPar').value = String(h.par);
  $('gInfo').textContent = y ? `${base.name} ${y}Y` : '';
  const item = green ? 'グリーン' : `ティー（${base.name}）`, has = green ? h.green : h.tee;
  $('gAsk').textContent = has ? `${cardNo(c, nine, h.n)}番の${item}：位置がよければ「次へ」。違うときはタップかドラッグで直します`
    : `${cardNo(c, nine, h.n)}番の${item}をタップしてください`;
  const issue = holeIssue(h, c);
  $('gWarn').hidden = !issue; if (issue) $('gWarn').textContent = `確認してください：${issue}`;
  const notes = [];
  if (has && h.src !== 'manual') notes.push(h.src === 'osm' ? '地図データから自動で置きました。位置を確かめてください' : '自動で置きました。位置を確かめてください');  // courses placed before this was removed
  if (!green && c.tees.length > 1 && h.tee) notes.push('「仮」はほかの色のティーの目安です（ヤードの差から計算）');
  $('gNote').textContent = notes.join('。');
  $('gCredit').hidden = !c.nines.some(x => x.holes.some(z => z.src === 'osm'));  // positions taken from OSM earlier
  const first = S.su.nine === c.nines[0].id && h.n === 1 && green;
  $('gBack').disabled = first;
  $('gNext').textContent = green ? '次へ ›' : S.su.only ? '一覧へ ›' : '次のホール ›';
}

/* ---------- moving through the holes ---------- */
function guideStart(nineId, n, only) {
  $('menu').hidden = true; openSheet('setup');
  if (S.is3D) set3D(false);
  S.tap = null; S.mode = 'setup-guide';
  S.su = { nine: nineId, n, step: 'green', only: !!only };
  guideShow();
}
function guideShow() { refresh(); guideCam(); }
function guideGo(nineId, n, step) { S.su = Object.assign(S.su, { nine: nineId, n, step }); guideShow(); }
function guideClose(msg) {
  $('setup').hidden = true; S.su = null; S.mode = null;
  refresh();
  mStack = ['mMain', 'mReg']; openMenu(true);
  if (msg) toast(msg);
}
// the next hole: through the nine, then on to the next nine; after the last one, back to the list
function guideAdvance() {
  const ns = S.draft.course.nines, k = ns.findIndex(x => x.id === S.su.nine);
  if (S.su.only) { guideClose(); return; }
  if (S.su.n < NINE) guideGo(S.su.nine, S.su.n + 1, 'green');
  else if (k + 1 < ns.length) guideGo(ns[k + 1].id, 1, 'green');
  else guideClose('最後のホールまで進みました。一覧で確かめて「確定して保存」を押してください');
}
function guideTap(ll) {
  const h = hole(), kind = S.su.step;
  h[kind] = ll; h.src = 'manual'; h.ok = false; saveDraft();
  if (kind === 'green') S.su.step = 'tee';
  guideShow();
}
$('gNext').onclick = () => {
  const h = hole();
  if (S.su.step === 'green') {
    if (!h.green) { toast('グリーンをタップしてください（置かないときは「スキップ」）'); return; }
    S.su.step = 'tee'; guideShow(); return;
  }
  if (!h.tee) { toast('ティーをタップしてください（置かないときは「スキップ」）'); return; }
  h.ok = true; saveDraft();
  guideAdvance();
};
$('gSkip').onclick = () => guideAdvance();
$('gBack').onclick = () => {
  if (S.su.step === 'tee') { S.su.step = 'green'; guideShow(); return; }
  const ns = S.draft.course.nines, k = ns.findIndex(x => x.id === S.su.nine);
  if (S.su.n > 1) guideGo(S.su.nine, S.su.n - 1, 'tee');
  else if (k > 0) guideGo(ns[k - 1].id, NINE, 'tee');
};
$('gList').onclick = () => guideClose();
$('gPar').onchange = () => { hole().par = +$('gPar').value; saveDraft(); refresh(); };

/* ---------- camera: the current hole, zoomed in between the distance panel and the guide panel ---------- */
const PAR_YD = { 3: 170, 4: 380, 5: 520, 6: 600 };
function guidePad() {
  const top = document.querySelector('.hud').getBoundingClientRect().bottom, low = $('setup').getBoundingClientRect().top;
  return { top: top + 24, bottom: Math.max(24, innerHeight - low + 24), left: 28, right: 28 };
}
// where to look when this hole has nothing yet: the previous hole's green, else the golf club, else the course centre
function prevGreen(only) {  // only: a green placed on an earlier hole, or null
  const ns = S.draft.course.nines, k = ns.findIndex(x => x.id === S.su.nine);
  const before = ns.slice(0, k).flatMap(x => x.holes).concat(ns[k].holes.slice(0, S.su.n - 1)).reverse();
  const g = before.find(x => x.green); if (g) return g.green;
  if (only) return null;
  const a = S.draft.course.area; return a ? [(a.bbox[0] + a.bbox[2]) / 2, (a.bbox[1] + a.bbox[3]) / 2] : S.draft.course.center;
}
function guideFit(pts, maxZoom, brg) {
  const b = pts.reduce((b, p) => b.extend(p), new maplibregl.LngLatBounds(pts[0], pts[0]));
  const cam = map.cameraForBounds(b, { padding: guidePad(), maxZoom, bearing: brg == null ? map.getBearing() : brg });
  if (cam) map.easeTo(Object.assign(cam, { pitch: 0, duration: matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 700, freezeElevation: true }));
}
// the panel grows with a warning or a note: aim again so the tee / green does not end up under it
let gPanelH = 0;
if ('ResizeObserver' in window) new ResizeObserver(() => {
  const h = $('setup').offsetHeight;
  if (inSetup() && gPanelH && Math.abs(h - gPanelH) > 8) guideCam();
  gPanelH = h;
}).observe($('setup'));
function guideCam() {
  const h = hole(), c = S.draft.course;
  if (h.tee && h.green) { guideFit([h.tee, h.green].concat(c.tees.map(t => teeLL(h, t.id, c))), 18, bearing(h.tee, h.green)); return; }  // with the estimated tees
  if (S.su.step === 'tee' && h.green) {
    // the tee is within the hole's length of the green, and usually near the previous hole's green
    const r = (h.yd[c.baseTee] || PAR_YD[h.par] || 380) * YD, pg = prevGreen(true), near = pg && distM(pg, h.green) < r * 1.6;
    const [w, s, e, n] = boxAround(h.green, r * (near ? .45 : .8));
    guideFit([[w, s], [e, n]].concat(near ? [pg] : []), 17, near ? bearing(pg, h.green) : null); return;
  }
  const p = h.green || h.tee || prevGreen();
  centerOn(p, { zoom: h.green || h.tee ? 18 : 16.5, duration: 700 });
}
