/* golf3d — look: colours and shapes of the pin, the measuring marks and the lines on the map
   (settings › 表示 › ピン・マーク・線のデザイン). Kept in S.prefs.look; a missing key is the default, which is the original look.
   Plain scripts loaded in order from index.html (no build step); they share top-level names. */
"use strict";

const LOOK_DEF = { pinColor: '#ff2bd6', pinShape: 'flag', markColor: '#ffd84d', markShape: 'diamond',
  tapColor: '#ffd84d', tapDash: 'dash', tapWidth: 'mid', holeColor: '#ffffff', holeDash: 'dash', holeWidth: 'mid' };
const LOOK_COLORS = [['#ff2bd6', 'マゼンタ'], ['#ff3b30', '赤'], ['#ff9500', 'オレンジ'], ['#ffd84d', '黄'], ['#32d2ff', '水色'], ['#2f6fff', '青'], ['#ffffff', '白'], ['#0a1322', '黒']];
const LOOK_SHAPES = {
  pinShape: [['flag', '三角の旗'], ['square', '四角の旗'], ['dot', '丸']],
  markShape: [['diamond', 'ひし形'], ['circle', '丸'], ['square', '四角']],
  dash: [['dash', '点線'], ['solid', '実線'], ['dot', '細かい点線']],
  width: [['thin', '細い'], ['mid', 'ふつう'], ['thick', '太い']]
};
const LOOK_W = { thin: .65, mid: 1, thick: 1.6 };
const look = () => Object.assign({}, LOOK_DEF, S.prefs.look || {});
// dash patterns in line widths (as MapLibre counts them); null = solid
const lookDash = (d, def) => d === 'solid' ? null : d === 'dot' ? [.6, 1.4] : def;

// the pin marker's picture (54×50, anchored at the bottom: the foot of the pole, or for 丸 the centre after the offset)
function pinSvg(c, shape) {
  const open = '<svg width="54" height="50" viewBox="0 0 54 50" aria-hidden="true">';
  if (shape === 'dot') return open + `<circle cx="27" cy="25" r="12" fill="none" stroke="rgba(0,0,0,.55)" stroke-width="6"/><circle cx="27" cy="25" r="12" fill="${c}" stroke="#fff" stroke-width="3"/><circle cx="27" cy="25" r="3" fill="#fff"/></svg>`;
  const f = shape === 'square' ? 'M28 3H50V21H28Z' : 'M28 3L51 13L28 23Z';
  return open + '<path d="M27 48V3" stroke="#fff" stroke-width="6" stroke-linecap="round"/><path d="M27 48V3" stroke="#0a1322" stroke-width="2.5" stroke-linecap="round"/>' +
    `<path d="${f}" fill="none" stroke="rgba(0,0,0,.6)" stroke-width="6" stroke-linejoin="round"/><path d="${f}" fill="${c}" stroke="#fff" stroke-width="3" stroke-linejoin="round"/></svg>`;
}
// markers (pin, yellow marks) right away; the map's lines once the map has loaded (map.js calls lookPaint)
function applyLook() {
  const L = look();
  M.pin.getElement().innerHTML = pinSvg(L.pinColor, L.pinShape);
  M.pin.setOffset([0, L.pinShape === 'dot' ? 25 : 0]);
  document.documentElement.style.setProperty('--tapc', L.markColor);
  TM.forEach(m => { const e = m.getElement(); e.classList.remove('s-circle', 's-square'); if (L.markShape !== 'diamond') e.classList.add('s-' + L.markShape); });
  lookPaint();
}
function lookPaint() {
  if (!mapReady) return;
  const L = look(), set = (id, k, v) => map.setPaintProperty(id, k, v);
  set('lines-tap', 'line-color', L.tapColor); set('lines-tap', 'line-width', 3 * LOOK_W[L.tapWidth]);
  set('lines-tap', 'line-dasharray', lookDash(L.tapDash, [2, 1.6]) || undefined);
  set('lines-case', 'line-width', 5.5 * LOOK_W[L.tapWidth]);
  set('lines-dash', 'line-color', L.holeColor); set('lines-dash', 'line-width', 2 * LOOK_W[L.holeWidth]);
  set('lines-dash', 'line-dasharray', lookDash(L.holeDash, [2, 2]) || undefined);
}
applyLook();

/* ---------- the settings screen ---------- */
Object.assign(M_TITLE, { mLook: 'ピン・マーク・線のデザイン' });
Object.assign(M_RENDER, { mLook: () => renderLook() });
$('goLook').onclick = () => { renderLook(); mShow('mLook'); };
function setLook(k, v) {
  const L = Object.assign({}, S.prefs.look || {}, { [k]: v });
  if (L[k] === LOOK_DEF[k]) delete L[k];
  S.prefs.look = L; savePrefs(); applyLook(); refresh(); renderLook();
}
// a small picture of the hole with the chosen look: tee → pin line, a mark and its line to the pin
function lookPreview(L) {
  const T = [34, 96], P = [262, 40], K = [170, 100], wt = LOOK_W[L.tapWidth], wh = LOOK_W[L.holeWidth];
  const da = (d, def, w) => { const p = lookDash(d, def); return p ? ` stroke-dasharray="${p.map(v => +(v * w).toFixed(1)).join(' ')}"` : ''; };
  const mark = L.markShape === 'circle' ? `<circle cx="${K[0]}" cy="${K[1]}" r="7"` : `<rect x="${K[0] - 6.5}" y="${K[1] - 6.5}" width="13" height="13" rx="2"${L.markShape === 'diamond' ? ` transform="rotate(45 ${K[0]} ${K[1]})"` : ''}`;
  const pin = `<g transform="translate(${P[0] - 27} ${P[1] - (L.pinShape === 'dot' ? 25 : 48)}) scale(1)">${pinSvg(L.pinColor, L.pinShape).replace(/^<svg[^>]*>|<\/svg>$/g, '')}</g>`;
  return `<svg viewBox="0 0 300 130" role="img" aria-label="見本">
    <rect width="300" height="130" rx="10" fill="#4f7f3f"/><path d="M0 70Q120 30 300 10V130H0Z" fill="#6c9a4f"/><ellipse cx="262" cy="40" rx="34" ry="20" fill="#86b862"/>
    <line x1="${T[0]}" y1="${T[1]}" x2="${P[0]}" y2="${P[1]}" stroke="${L.holeColor}" stroke-width="${2 * wh}" stroke-opacity=".85" stroke-linecap="round"${da(L.holeDash, [2, 2], 2 * wh)}/>
    <line x1="${K[0]}" y1="${K[1]}" x2="${P[0]}" y2="${P[1]}" stroke="#fff" stroke-opacity=".5" stroke-width="${5.5 * wt}" stroke-linecap="round"/>
    <line x1="${K[0]}" y1="${K[1]}" x2="${P[0]}" y2="${P[1]}" stroke="${L.tapColor}" stroke-width="${3 * wt}"${da(L.tapDash, [2, 1.6], 3 * wt)}/>
    <circle cx="${T[0]}" cy="${T[1]}" r="11" fill="#2f6fd1" stroke="#fff" stroke-width="2"/><text x="${T[0]}" y="${T[1] + 4}" text-anchor="middle" font-size="11" font-weight="700" fill="#fff">T</text>
    ${mark} fill="${L.markColor}" stroke="#fff" stroke-width="2.5"/>${pin}</svg>`;
}
function renderLook() {
  const L = look(), box = $('lookBody'); box.textContent = '';
  const pv = el('div', 'lookpv'); pv.innerHTML = lookPreview(L); box.append(pv);
  const colors = (k) => {
    const row = el('div', 'mrow lookrow'), list = el('div', 'sws');
    row.append(el('span', 'mtx', '色'), list);
    LOOK_COLORS.forEach(([c, name]) => {
      const b = el('button', 'sw1'); b.style.background = c; b.setAttribute('aria-label', name + (c === LOOK_DEF[k] ? '（元の色）' : ''));
      b.setAttribute('aria-pressed', L[k] === c); b.onclick = () => setLook(k, c); list.append(b);
    });
    return row;
  };
  const seg = (label, k, opts) => {
    const row = el('div', 'mrow lookrow'), list = el('div', 'lseg');
    row.append(el('span', 'mtx', label), list);
    opts.forEach(([v, name]) => { const b = el('button', '', name); b.setAttribute('aria-pressed', L[k] === v); b.onclick = () => setLook(k, v); list.append(b); });
    return row;
  };
  const group = (title, rows) => { const g = el('div', 'grp'); g.append(...rows); box.append(el('div', 'grp-t', title), g); };
  group('ピン', [colors('pinColor'), seg('形', 'pinShape', LOOK_SHAPES.pinShape)]);
  group('地図をタップしたマーク', [colors('markColor'), seg('形', 'markShape', LOOK_SHAPES.markShape)]);
  group('マークからピンへの線', [colors('tapColor'), seg('線', 'tapDash', LOOK_SHAPES.dash), seg('太さ', 'tapWidth', LOOK_SHAPES.width)]);
  group('ティーからピンへの線', [colors('holeColor'), seg('線', 'holeDash', LOOK_SHAPES.dash), seg('太さ', 'holeWidth', LOOK_SHAPES.width)]);
  const reset = el('button', 'mrow center', '元のデザインに戻す');
  reset.disabled = !Object.keys(S.prefs.look || {}).length;
  reset.onclick = () => { S.prefs.look = {}; savePrefs(); applyLook(); refresh(); renderLook(); toast('元のデザインに戻しました'); };
  const g = el('div', 'grp mgap'); g.append(reset); box.append(g);
  box.append(el('p', 'grp-f', '変えた内容はこのスマホだけに残ります。ほかの人の画面は変わりません。'));
}
