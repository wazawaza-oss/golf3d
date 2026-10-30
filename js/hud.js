/* golf3d — hud: redrawing everything on screen (refresh), the crosshair, and the distance panel at the top
   Plain scripts loaded in order from index.html (no build step); they share top-level names. */
"use strict";

/* ================= rendering ================= */
function refresh() {
  const h = hole(), setup = inSetup(), tee = roundTee();  // the guide draws its own (draggable) tee and green
  $('hNo').textContent = holeNo(); $('hPar').textContent = h.par;
  place(M.tee, setup ? null : tee);
  M.tee.getElement().classList.toggle('moved', !setup && !!S.round.tees[N]);
  place(M.gc, !setup && hasPin() && h.green ? h.green : null);
  place(M.pin, setup ? null : pinLL());
  place(M.me, S.me && S.me.ll);
  M.me.getElement().classList.toggle('sim', !!(S.me && S.me.src === 'sim'));
  tapDraw();
  numMarkers.forEach(m => m.remove()); numMarkers = [];
  // while registering, the other holes of the same nine show their numbers (at the green) and tee–green lines
  const setupNine = setup ? draftNine(S.su.nine).holes : [];
  setupNine.forEach(x => { const p = x.green || x.tee; if (p && x.n !== S.su.n) numMarkers.push(new maplibregl.Marker({ element: mkEl('num', String(x.n)) }).setLngLat(p).addTo(map)); });
  if (mapReady) {
    const f = [], pin = pinLL();
    if (setup) setupNine.forEach(x => { if (registered(x)) f.push(ln(x.tee, x.green, 'setup')); });
    else if (S.tap) { const p = tapLine(); if (p) f.push(p); }  // while marks are up, only their path to the pin
    else if (registered(h) && !S.me) f.push(ln(tee, pin, 'hole'));  // no line from you to the pin until you tap
    map.getSource('lines').setData(fc(f));
    // rings reach a little past the tee (or the player, if farther)
    const reach = pin && !setup && S.prefs.rings ? Math.max(tee ? yards(tee, pin) : 0, S.me ? yards(S.me.ll, pin) : 0, 150) + 25 : 0;
    map.getSource('rings').setData(fc(reach ? rings(pin, Math.min(600, reach)) : []));
  }
  // banner (pin / test position; setup has its own controls in the sheet)
  const BAN = { pin: `${N}番の今日のピン位置に十字を合わせる`, tee: `${N}番の今日のティー位置に十字を合わせる（この端末だけ）`, me: 'テスト用の現在地に十字を合わせる' };
  $('banner').hidden = !BAN[S.mode] || !$('setup').hidden; if (BAN[S.mode]) $('bannerText').textContent = BAN[S.mode];
  const pt = S.mode === 'pin' || S.mode === 'tee';
  $('bannerSel').hidden = !pt;
  $('banPin').setAttribute('aria-pressed', S.mode === 'pin'); $('banTee').setAttribute('aria-pressed', S.mode === 'tee');
  // 登録位置に戻す: only when there is something of yours to take back
  $('bannerReset').hidden = !(S.mode === 'tee' ? S.round.tees[N] : S.mode === 'pin' && (S.round.pins[N] || (comp && comp.role === 'org' && compPin(N))));
  document.querySelector('.side').hidden = !$('banner').hidden || setup;  // the banner / guide panel would cover the lower buttons
  $('tapReset').hidden = !S.tap;
  $('bElev').setAttribute('aria-checked', !!S.prefs.elev);
  $('bRings').setAttribute('aria-checked', !!S.prefs.rings);
  // GPS button: accuracy while on (green), 'オフ' while off
  $('bGps').setAttribute('aria-pressed', S.watch != null);
  $('gpsInfo').textContent = S.watch == null ? 'オフ' : S.me && S.me.src === 'gps' ? `±${Math.round(S.me.acc || 0)}m` : '取得中';
  $('bPin').setAttribute('aria-pressed', S.mode === 'pin' || S.mode === 'tee');
  // 3D / view / pin need the hole's tee and green: greyed out (state left alone) until it is registered
  const reg = registered(hole()), VIEW = { tee: 'ティー', top: '真上', green: 'グリーン' };
  ['b3d', 'bView', 'bPin'].forEach(id => $(id).classList.toggle('na', !reg && !inSetup() && !(id === 'b3d' && S.is3D)));
  $('b3d').setAttribute('aria-pressed', S.is3D); $('b3dState').textContent = S.is3D ? 'オン' : 'オフ';
  $('b3d').setAttribute('aria-label', `3D表示：${S.is3D ? 'オン' : 'オフ'}`);
  $('viewName').textContent = ''; $('viewName').append(VIEW[S.view], el('br'), 'から見る');
  $('bView').setAttribute('aria-label', `視点：${VIEW[S.view]}から見る（押すと切り替え）`);
  $('dock').hidden = !!S.mode || !$('setup').hidden;
  renderDock();
  if (setup) renderGuide();
  guideMarkers();
  placeCross();
  readout();
  renderBadge(); applyRoles();
}

/* crosshair: sits in the middle of the map area left visible between the HUD and the bottom panel */
const PLACING = ['pin', 'tee', 'me'];  // the guide places by tapping, without the crosshair
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
  if (S.mode === 'pin' && h.green) t = `グリーン中心から ${Math.round(yards(h.green, crossLL()))}Y`;
  else if (S.mode === 'tee' && h.green) t = `${target()}まで ${Math.round(yards(crossLL(), pinLL()))}Y`;
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
  map.easeTo(Object.assign({ center: ll, offset: [x - el.clientWidth / 2, y - el.clientHeight / 2], duration: 500, freezeElevation: true }, extra));  // freezeElevation: see camera() in js/map.js
}
map.on('move', () => { if (isPlacing()) crossLabel(); });
addEventListener('resize', placeCross);
if ('ResizeObserver' in window) { const ro = new ResizeObserver(placeCross); ro.observe($('setup')); ro.observe($('banner')); }
/* screen fit for the iPhone home-screen app. iOS can place "the bottom of the window" above or below the real
   screen bottom, so the bottom buttons end up hidden or with an empty strip under them. The real screen height
   comes from the iPhone model picked in settings (or screen.height on 自動); a full-height fixed element
   (#vprobe) shows where iOS puts the bottom; the difference (plus a manual adjustment) moves everything that sits
   on the bottom edge. Only in the home-screen app and upright; Safari and Android are left as they are. */
const IPHONES = [  // portrait size in points; every model here has a 34pt home indicator
  ['X / XS / 11 Pro / 12 mini / 13 mini', 375, 812],
  ['XR / XS Max / 11 / 11 Pro Max', 414, 896],
  ['12 / 12 Pro / 13 / 13 Pro / 14 / 16e', 390, 844],
  ['12 Pro Max / 13 Pro Max / 14 Plus', 428, 926],
  ['14 Pro / 15 / 15 Pro / 16', 393, 852],
  ['14 Pro Max / 15 Plus / 15 Pro Max / 16 Plus', 430, 932],
  ['16 Pro / 17 / 17 Pro', 402, 874],
  ['Air', 420, 912],
  ['16 Pro Max / 17 Pro Max', 440, 956]
];
const isHomeApp = () => !!(navigator.standalone || matchMedia('(display-mode: standalone)').matches);
let fitInfo = null;  // what was measured, shown in settings: { screenH, winH, fix }
function fitScreen() {
  const root = document.documentElement.style, dev = IPHONES[S.prefs.device];  // undefined = 自動
  const upright = innerHeight > innerWidth, on = isHomeApp() && upright && /iPhone|iPod/.test(navigator.userAgent);
  const screenH = dev ? dev[2] : Math.max(screen.width, screen.height), winH = Math.round($('vprobe').getBoundingClientRect().height);
  const fix = on ? Math.max(-120, Math.min(120, winH - screenH)) + (+S.prefs.devAdj || 0) : 0;
  fitInfo = { on, screenH, winH, fix };
  root.setProperty('--home', dev && on ? '34px' : 'env(safe-area-inset-bottom,0px)');
  if (root.getPropertyValue('--fixb') !== fix + 'px') { root.setProperty('--fixb', fix + 'px'); map.resize(); }
}
fitScreen(); addEventListener('resize', fitScreen); addEventListener('orientationchange', () => setTimeout(fitScreen, 300));
addEventListener('pageshow', () => setTimeout(fitScreen, 300));
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
  document.querySelector('.hud').classList.toggle('unreg', !inSetup() && !registered(h));  // no "Y" after the dash
  if (inSetup()) {  // registering: the hole's length as placed
    $('dNum').textContent = registered(h) ? Math.round(yards(h.tee, h.green)) : '—'; $('dLab').textContent = 'ティーからグリーン';
    sub.textContent = registered(h) ? '' : S.su.step === 'green' ? 'グリーンを置いてください' : 'ティーを置いてください';
    return;
  }
  if (!registered(h)) {
    $('dNum').textContent = '—'; $('dLab').textContent = '未登録のホール';
    if (comp && comp.role !== 'org') { sub.textContent = '主催者がこのホールをまだ登録していません'; return; }
    const go = el('button', 'subgo', 'コースを登録する'); go.onclick = () => openSetup();
    sub.append('このホールは距離が出ません', go);
    return;
  }
  if (S.tap) {
    // the big number is the first leg (from you, or from the farthest mark); the rest of the legs follow below
    const path = tapPath(pin), legs = path.slice(1).map((p, i) => Math.round(yards(path[i], p)));
    const [a, b] = path, y = yards(a, b);
    $('dNum').textContent = Math.round(y);
    $('dLab').textContent = legs.length === 1 ? `マークから${target()}` : tapFromMe() ? 'マークまで' : 'マーク間';
    const rest = legs.length === 3 ? `マーク間 ${legs[1]}Y・そこから${target()} ${legs[2]}Y` : legs.length === 2 ? `そこから${target()} ${legs[1]}Y` : '';
    sub.textContent = rest;
    if (S.prefs.elev && !quick) {
      const [ea, eb] = await Promise.all([elevAt(a), elevAt(b)]);
      if (tok !== rdTok || ea == null || eb == null) return;
      sub.textContent = ''; sub.append(...fmtElev(eb - ea, y)); if (rest) sub.append(`・${rest}`);
    }
    return;
  }
  if (!S.me) {
    $('dNum').textContent = Math.round(yards(roundTee(), pin)); $('dLab').textContent = `ティーから${target()}`;
    sub.textContent = S.watch ? '現在地を取得中…' : 'GPSをオンにすると現在地からの距離が出ます'; return;
  }
  const y = yards(S.me.ll, pin);
  $('dNum').textContent = Math.round(y); $('dLab').textContent = `${target()}まで`;
  // 4th line: elevation only (GPS accuracy is on the GPS button)
  const test = S.me.src === 'sim' ? 'テスト位置' : '';
  sub.textContent = test;
  if (S.prefs.elev) {
    const [a, b] = await Promise.all([elevAt(S.me.ll), elevAt(pin)]);
    if (tok !== rdTok || a == null || b == null) return;
    sub.textContent = ''; sub.append(...fmtElev(b - a, y)); if (test) sub.append(`・${test}`);
  }
}
