/* golf3d — hud: redrawing everything on screen (refresh), the crosshair, and the distance panel at the top
   Plain scripts loaded in order from index.html (no build step); they share top-level names. */
"use strict";

/* ================= rendering ================= */
function refresh() {
  const h = hole(), setup = S.mode && S.mode.startsWith('setup');
  $('hNo').textContent = holeNo(); $('hPar').textContent = h.par;
  place(M.tee, h.tee);
  place(M.gc, S.round.pins[N] && h.green ? h.green : null);
  place(M.pin, pinLL());
  place(M.me, S.me && S.me.ll);
  M.me.getElement().classList.toggle('sim', !!(S.me && S.me.src === 'sim'));
  tapDraw();
  numMarkers.forEach(m => m.remove()); numMarkers = [];
  // while registering, the other holes of the same nine show their numbers and tee–green lines
  const setupNine = setup && inSetup() ? nineOf(S.su.nine).holes : [];
  setupNine.forEach(x => { if (x.tee && x.n !== S.su.n) numMarkers.push(new maplibregl.Marker({ element: mkEl('num', String(x.n)) }).setLngLat(x.tee).addTo(map)); });
  if (mapReady) {
    const f = [], pin = pinLL();
    if (setup) setupNine.forEach(x => { if (registered(x)) f.push(ln(x.tee, x.green, 'setup')); });
    else if (S.tap) { const p = tapLine(); if (p) f.push(p); }  // while marks are up, only their path to the pin
    else if (registered(h) && !S.me) f.push(ln(h.tee, h.green, 'hole'));  // no line from you to the pin until you tap
    map.getSource('lines').setData(fc(f));
    // rings reach a little past the tee (or the player, if farther)
    const reach = pin && !setup ? Math.max(h.tee ? yards(h.tee, pin) : 0, S.me ? yards(S.me.ll, pin) : 0, 150) + 25 : 0;
    map.getSource('rings').setData(fc(reach ? rings(pin, Math.min(600, reach)) : []));
  }
  // banner (pin / test position; setup has its own controls in the sheet)
  const BAN = { pin: `${N}番のピン位置に十字を合わせる`, me: 'テスト用の現在地に十字を合わせる' };
  $('banner').hidden = !BAN[S.mode] || !$('setup').hidden; if (BAN[S.mode]) $('bannerText').textContent = BAN[S.mode];
  document.querySelector('.side').hidden = !$('banner').hidden;  // the banner would cover the lower buttons
  $('tapReset').hidden = !S.tap;
  $('bElev').setAttribute('aria-checked', !!S.prefs.elev);
  // GPS button: accuracy while on (green), 'オフ' while off
  $('bGps').setAttribute('aria-pressed', S.watch != null);
  $('gpsInfo').textContent = S.watch == null ? 'オフ' : S.me && S.me.src === 'gps' ? `±${Math.round(S.me.acc || 0)}m` : '取得中';
  $('bPin').setAttribute('aria-pressed', S.mode === 'pin');
  $('b3d').setAttribute('aria-pressed', S.is3D);
  $('viewName').textContent = { tee: 'ティー', top: '真上', green: 'グリーン' }[S.view];
  $('dock').hidden = !!S.mode || !$('setup').hidden;
  renderDock();
  if (!$('setup').hidden) renderSetup();
  placeCross();
  readout();
  renderBadge(); applyRoles();
}

/* crosshair: sits in the middle of the map area left visible between the HUD and the bottom panel */
const PLACING = ['setup-tee', 'setup-green', 'pin', 'me'];
const isPlacing = () => PLACING.includes(S.mode);
function crossXY() {
  const top = document.querySelector('.hud').getBoundingClientRect().bottom;
  const low = !$('setup').hidden ? $('setup') : !$('banner').hidden ? $('banner') : null;
  const bottom = low ? low.getBoundingClientRect().top : innerHeight;
  return [Math.round(innerWidth / 2), Math.round((top + bottom) / 2)];
}
function crossLL() { const p = map.unproject(crossXY()); return [p.lng, p.lat]; }
function crossLabel() {
  const h = hole(), lab = $('crossLab'); let t = '';
  if (S.mode === 'setup-green' && h.tee) t = `ティーから ${Math.round(yards(h.tee, crossLL()))}Y`;
  else if (S.mode === 'pin' && h.green) t = `グリーン中心から ${Math.round(yards(h.green, crossLL()))}Y`;
  lab.textContent = t; lab.hidden = !t;
}
function placeCross() {
  const c = $('cross'); c.hidden = !isPlacing(); if (c.hidden) return;
  const [x, y] = crossXY(); c.style.left = x + 'px'; c.style.top = y + 'px';
  crossLabel();
}
/* move the map so that ll ends up under the crosshair */
function centerOn(ll, extra = {}) {
  const [x, y] = crossXY(), el = map.getContainer();
  map.easeTo(Object.assign({ center: ll, offset: [x - el.clientWidth / 2, y - el.clientHeight / 2], duration: 500 }, extra));
}
map.on('move', () => { if (isPlacing()) crossLabel(); });
addEventListener('resize', placeCross);
if ('ResizeObserver' in window) { const ro = new ResizeObserver(placeCross); ro.observe($('setup')); ro.observe($('banner')); }
// the button column and toast start just below the distance panel
const hudEdge = () => document.documentElement.style.setProperty('--hudb', Math.round(document.querySelector('.hud').getBoundingClientRect().bottom) + 'px');
hudEdge(); addEventListener('resize', hudEdge);
if ('ResizeObserver' in window) new ResizeObserver(hudEdge).observe(document.querySelector('.hud'));
const fmtElev = (d, y) => {
  const cls = d >= 0 ? 'up' : 'down', word = d >= 0 ? '打ち上げ' : '打ち下ろし';
  const span = document.createElement('span'); span.className = cls;
  span.textContent = Math.abs(d) < .5 ? '高低差なし' : `${d >= 0 ? '↑' : '↓'}${Math.abs(d).toFixed(0)}m ${word}`;
  return [span, `実質${Math.round(y + d / YD)}Y`];  // the pill already separates the two
};
let rdTok = 0;
async function readout(quick) {  // quick: distances only (while dragging a mark)
  const tok = ++rdTok, h = hole(), pin = pinLL(), sub = $('dSub');
  sub.textContent = '';
  if (!registered(h)) { $('dNum').textContent = '—'; $('dLab').textContent = '未登録のホール'; sub.textContent = comp && comp.role !== 'org' ? '主催者がこのホールをまだ登録していません' : '右の「設定」→「コース登録」で登録できます'; return; }
  if (S.tap) {
    // the big number is the first leg (from you, or from the farthest mark); the rest of the legs follow below
    const path = tapPath(pin), legs = path.slice(1).map((p, i) => Math.round(yards(path[i], p)));
    const [a, b] = path, y = yards(a, b);
    $('dNum').textContent = Math.round(y);
    $('dLab').textContent = legs.length === 1 ? 'マークからピン' : tapFromMe() ? 'マークまで' : 'マーク間';
    const rest = legs.length === 3 ? `マーク間 ${legs[1]}Y・そこからピン ${legs[2]}Y` : legs.length === 2 ? `そこからピン ${legs[1]}Y` : '';
    sub.textContent = rest;
    if (S.prefs.elev && !quick) {
      const [ea, eb] = await Promise.all([elevAt(a), elevAt(b)]);
      if (tok !== rdTok || ea == null || eb == null) return;
      sub.textContent = ''; sub.append(...fmtElev(eb - ea, y)); if (rest) sub.append(`・${rest}`);
    }
    return;
  }
  if (!S.me) {
    $('dNum').textContent = Math.round(yards(h.tee, pin)); $('dLab').textContent = 'ティーからピン';
    sub.textContent = S.watch ? '現在地を取得中…' : 'GPSをオンにすると現在地からの距離が出ます'; return;
  }
  const y = yards(S.me.ll, pin);
  $('dNum').textContent = Math.round(y); $('dLab').textContent = 'ピンまで';
  // 4th line: elevation only (GPS accuracy is on the GPS button)
  const test = S.me.src === 'sim' ? 'テスト位置' : '';
  sub.textContent = test;
  if (S.prefs.elev) {
    const [a, b] = await Promise.all([elevAt(S.me.ll), elevAt(pin)]);
    if (tok !== rdTok || a == null || b == null) return;
    sub.textContent = ''; sub.append(...fmtElev(b - a, y)); if (test) sub.append(`・${test}`);
  }
}
