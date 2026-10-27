/* golf3d — map: GSI tiles, the map, markers, distance readout, tapping/measuring, map buttons and GPS
   Plain scripts loaded in order from index.html (no build step); they share top-level names. */
"use strict";

/* ================= tiles + cache ================= */
let cachePromise = null;
function openCache() {
  if (!cachePromise) cachePromise = ('caches' in window ? caches.open(CACHE_NAME) : Promise.reject()).catch(() => null);
  return cachePromise;
}
async function tileBlob(url, signal) {
  const cache = await openCache();
  if (cache) { try { const hit = await cache.match(url); if (hit) return await hit.blob(); } catch (e) {} }
  let res;
  try { res = await fetch(url, { signal, mode: 'cors' }); } catch (e) { return null; }
  if (!res.ok) return null;
  if (cache) { try { await cache.put(url, res.clone()); } catch (e) {} }
  return await res.blob();
}

/* GSI elevation PNG -> heights (m). (128,0,0) = no data */
function decodeGsi(px) {
  const out = new Float32Array(256 * 256);
  for (let i = 0, j = 0; i < out.length; i++, j += 4) {
    const r = px[j], g = px[j + 1], b = px[j + 2];
    if (r === 128 && g === 0 && b === 0) { out[i] = NaN; continue; }
    let x = r * 65536 + g * 256 + b; if (x > 8388608) x -= 16777216;
    out[i] = x * 0.01;
  }
  // fill no-data holes from neighbours, else 0
  for (let i = 0; i < out.length; i++) if (Number.isNaN(out[i])) {
    const x = i % 256, y = (i / 256) | 0; let s = 0, c = 0;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) { const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx > 255 || yy > 255) continue; const v = out[yy * 256 + xx]; if (!Number.isNaN(v)) { s += v; c++; } }
    out[i] = c ? s / c : 0;
  }
  return out;
}
/* heights -> Mapbox Terrain-RGB pixels */
function encodeRgb(h, px) {
  for (let i = 0, j = 0; i < h.length; i++, j += 4) {
    const v = Math.max(0, Math.round((h[i] + 10000) * 10));
    px[j] = (v >> 16) & 255; px[j + 1] = (v >> 8) & 255; px[j + 2] = v & 255; px[j + 3] = 255;
  }
  return px;
}
function upsample(parent, qx, qy) {
  const out = new Float32Array(256 * 256);
  for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) {
    const fx = qx * 128 + x / 2, fy = qy * 128 + y / 2;
    const x0 = Math.min(255, Math.floor(fx)), y0 = Math.min(255, Math.floor(fy)), x1 = Math.min(255, x0 + 1), y1 = Math.min(255, y0 + 1), tx = fx - x0, ty = fy - y0;
    const a = parent[y0 * 256 + x0], b = parent[y0 * 256 + x1], c = parent[y1 * 256 + x0], d = parent[y1 * 256 + x1];
    out[y * 256 + x] = (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty;
  }
  return out;
}
let scratch = null;
function canvas256() {
  if (!scratch) {
    if (typeof OffscreenCanvas !== 'undefined') scratch = new OffscreenCanvas(256, 256);
    else { scratch = document.createElement('canvas'); scratch.width = scratch.height = 256; }
  }
  return scratch;
}
async function blobToPixels(blob) {
  const bmp = await createImageBitmap(blob);
  const c = canvas256(), ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.clearRect(0, 0, 256, 256); ctx.drawImage(bmp, 0, 0, 256, 256); bmp.close && bmp.close();
  return ctx.getImageData(0, 0, 256, 256).data;
}
async function pixelsToPng(px) {
  const c = canvas256(), ctx = c.getContext('2d');
  ctx.putImageData(new ImageData(px, 256, 256), 0, 0);
  const blob = c.convertToBlob ? await c.convertToBlob({ type: 'image/png' }) : await new Promise(r => c.toBlob(r, 'image/png'));
  return await blob.arrayBuffer();
}
const hCache = new Map();
async function demRaw(name, z, x, y) {
  const b = await tileBlob(`${GSI}${name}/${z}/${x}/${y}.png`);
  if (!b) return null;
  try { return decodeGsi(await blobToPixels(b)); } catch (e) { return null; }
}
/* heights for a tile: z15 = 5m mesh (laser), falls back to 10m mesh */
function heights(z, x, y) {
  const key = `${z}/${x}/${y}`;
  if (hCache.has(key)) return hCache.get(key);
  const p = (async () => {
    if (z >= 15) {
      const h = await demRaw('dem5a_png', 15, x, y); if (h) return h;
      const par = await heights(14, x >> 1, y >> 1); return par ? upsample(par, x & 1, y & 1) : null;
    }
    return await demRaw('dem_png', z, x, y);
  })();
  hCache.set(key, p);
  if (hCache.size > 400) hCache.delete(hCache.keys().next().value);
  return p;
}
async function elevAt(ll) {
  if (!ll) return null;
  const z = 15, fx = lng2x(ll[0], z), fy = lat2y(ll[1], z), x = Math.floor(fx), y = Math.floor(fy);
  const h = await heights(z, x, y); if (!h) return null;
  const px = Math.min(254.999, (fx - x) * 256 - .5 < 0 ? 0 : (fx - x) * 256 - .5), py = Math.min(254.999, (fy - y) * 256 - .5 < 0 ? 0 : (fy - y) * 256 - .5);
  const x0 = Math.floor(px), y0 = Math.floor(py), tx = px - x0, ty = py - y0;
  const a = h[y0 * 256 + x0], b = h[y0 * 256 + x0 + 1], c = h[(y0 + 1) * 256 + x0], d = h[(y0 + 1) * 256 + x0 + 1];
  return (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty;
}
const parseZXY = url => url.replace(/^[a-z]+:\/\//, '').split('/').map(Number);
maplibregl.addProtocol('gsiphoto', async (params, ac) => {
  const [z, x, y] = parseZXY(params.url);
  const b = await tileBlob(`${GSI}seamlessphoto/${z}/${x}/${y}.jpg`, ac && ac.signal);
  if (!b) throw new Error('photo tile unavailable');
  return { data: await b.arrayBuffer() };
});
maplibregl.addProtocol('gsidem', async (params) => {
  const [z, x, y] = parseZXY(params.url);
  const h = (await heights(z, x, y)) || new Float32Array(256 * 256);
  return { data: await pixelsToPng(encodeRgb(h, new Uint8ClampedArray(256 * 256 * 4))) };
});

/* ================= map ================= */
const map = new maplibregl.Map({
  container: 'map',
  center: S.course.center || DEFAULT_CENTER, zoom: 16, maxZoom: 19.5, maxPitch: 80,
  attributionControl: false,
  style: {
    version: 8,
    sources: {
      photo: { type: 'raster', tiles: ['gsiphoto://{z}/{x}/{y}'], tileSize: 256, minzoom: 2, maxzoom: 18,
        attribution: '<a href="https://maps.gsi.go.jp/development/ichiran.html" target="_blank" rel="noopener">地理院タイル</a>' },
      dem: { type: 'raster-dem', tiles: ['gsidem://{z}/{x}/{y}'], tileSize: 256, minzoom: 2, maxzoom: 15, encoding: 'mapbox' }
    },
    layers: [
      { id: 'bg', type: 'background', paint: { 'background-color': '#cfd8c8' } },
      { id: 'photo', type: 'raster', source: 'photo', paint: { 'raster-fade-duration': 0 } }
    ]
  }
});
// no attribution badge on the map; the GSI credit is shown in the menu sheet instead
map.touchZoomRotate.enableRotation();

const mkEl = (cls, html) => { const d = document.createElement('div'); d.className = 'mk ' + cls; if (html) d.textContent = html; return d; };
const M = {
  tee: new maplibregl.Marker({ element: mkEl('tee', 'T') }),
  gc: new maplibregl.Marker({ element: mkEl('gc') }),
  pin: new maplibregl.Marker({ element: Object.assign(mkEl('pin'), { innerHTML:
    '<svg width="54" height="50" viewBox="0 0 54 50" aria-hidden="true">' +
    '<path d="M27 48V3" stroke="#fff" stroke-width="6" stroke-linecap="round"/><path d="M27 48V3" stroke="#0a1322" stroke-width="2.5" stroke-linecap="round"/>' +
    '<path d="M28 3L51 13L28 23Z" fill="none" stroke="rgba(0,0,0,.6)" stroke-width="6" stroke-linejoin="round"/>' +
    '<path d="M28 3L51 13L28 23Z" fill="#ff2bd6" stroke="#fff" stroke-width="3" stroke-linejoin="round"/></svg>' }), anchor: 'bottom' }),
  me: new maplibregl.Marker({ element: mkEl('me') }),
};
// measuring marks (yellow diamonds): up to two, both draggable in 2D and 3D; S.tap holds their positions in tap order
const TM = [0, 1].map(i => {
  const m = new maplibregl.Marker({ element: Object.assign(mkEl('tap'), { innerHTML: '<span class="dot"></span>' }), draggable: true });
  m.on('dragstart', () => clearTimeout(tapT));  // no auto-clear while a finger is on it
  m.on('drag', () => { if (!S.tap || !S.tap[i]) return; const p = m.getLngLat(); S.tap[i] = [p.lng, p.lat]; tapDraw(true); });
  m.on('dragend', () => { cancelAnimationFrame(tapRaf); tapRaf = 0; refresh(); tapIdle(); });  // full redraw with elevation
  m.getElement().addEventListener('click', e => { e.stopPropagation(); tapIdle(); });  // touching a mark keeps it up
  return m;
});
// leg distances shown on the map when there are two marks
const LM = [0, 1, 2].map(() => new maplibregl.Marker({ element: mkEl('leg'), anchor: 'left', offset: [12, 0] }));
let numMarkers = [];
function place(m, ll) { if (ll) { m.setLngLat(ll); if (!m._shown) { m.addTo(map); m._shown = true; } } else if (m._shown) { m.remove(); m._shown = false; } }

const fc = f => ({ type: 'FeatureCollection', features: f });
const ln = (a, b, kind) => ({ type: 'Feature', properties: { kind }, geometry: { type: 'LineString', coordinates: [a, b] } });
/* faint ripple rings around the pin every 50Y; drawn as map lines so they drape over the 3D terrain */
function rings(pin, maxY) {
  const out = [], cos = Math.cos(rad(pin[1]));
  for (let r = 50; r <= maxY; r += 50) {
    const m = r * YD, pts = [];
    for (let i = 0; i <= 96; i++) {
      const a = i / 96 * 2 * Math.PI;
      pts.push([pin[0] + deg(m * Math.sin(a) / (6371008.8 * cos)), pin[1] + deg(m * Math.cos(a) / 6371008.8)]);
    }
    out.push({ type: 'Feature', properties: { r }, geometry: { type: 'LineString', coordinates: pts } });
  }
  return out;
}
let mapReady = false;
map.on('load', () => {
  map.addSource('rings', { type: 'geojson', data: fc([]) });
  map.addLayer({ id: 'rings-glow', type: 'line', source: 'rings',
    paint: { 'line-color': '#ffffff', 'line-width': 5, 'line-blur': 4, 'line-opacity': ['interpolate', ['linear'], ['get', 'r'], 50, .06, 400, .02] } });
  map.addLayer({ id: 'rings', type: 'line', source: 'rings',
    paint: { 'line-color': '#ffffff', 'line-width': ['case', ['==', ['%', ['get', 'r'], 100], 0], 1.1, .8], 'line-opacity': ['interpolate', ['linear'], ['get', 'r'], 50, .28, 400, .1] } });
  map.addSource('lines', { type: 'geojson', data: fc([]) });
  map.addLayer({ id: 'lines-dash', type: 'line', source: 'lines', filter: ['in', ['get', 'kind'], ['literal', ['hole', 'setup']]],
    layout: { 'line-cap': 'round' }, paint: { 'line-color': '#ffffff', 'line-width': 2, 'line-opacity': .8, 'line-dasharray': [2, 2] } });
  // measured path (only after you tap the map): white casing under a dashed fluorescent lime line
  map.addLayer({ id: 'lines-case', type: 'line', source: 'lines', filter: ['in', ['get', 'kind'], ['literal', ['tap']]],
    layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#ffffff', 'line-width': 5.5, 'line-opacity': .5 } });
  map.addLayer({ id: 'lines-tap', type: 'line', source: 'lines', filter: ['==', ['get', 'kind'], 'tap'],
    layout: { 'line-join': 'round' }, paint: { 'line-color': '#ffd84d', 'line-width': 3, 'line-dasharray': [2, 1.6] } });
  mapReady = true;
  refresh();
  if (registered(hole())) camera(S.view, 0);
  else if (!S.course.holes.some(registered)) $('onboard').hidden = false;
});

/* camera presets per hole */
let camTok = 0;
map.on('movestart', e => { if (e.originalEvent) camTok++; });  // user gesture cancels a pending re-aim
function camera(view, duration = 900, settle = true) {
  const h = hole(); if (!registered(h)) return;
  const len = Math.max(60, distM(h.tee, h.green)), brg = bearing(h.tee, h.green);
  const el = map.getContainer(), H = el.clientHeight || 700;
  const lat = (h.tee[1] + h.green[1]) / 2;
  const base = Math.log2(156543.03 * Math.cos(rad(lat)) * (H * .5) / len);
  const pitch3 = S.is3D;
  let opt;
  if (view === 'top') opt = { center: lerpLL(h.tee, h.green, .5), bearing: brg, pitch: 0, zoom: base };
  else if (view === 'green') opt = { center: lerpLL(h.tee, h.green, pitch3 ? .45 : .5), bearing: (brg + 180) % 360, pitch: pitch3 ? 62 : 0, zoom: base + (pitch3 ? .35 : 0) };
  else opt = { center: lerpLL(h.tee, h.green, pitch3 ? .6 : .5), bearing: brg, pitch: pitch3 ? 62 : 0, zoom: base + (pitch3 ? .35 : 0) };
  map.easeTo(Object.assign(opt, { duration: matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : duration }));
  // in 3D the ground height under the new view is known only after its elevation tiles load;
  // aim again once they have, otherwise the camera can end up inside the hillside (looks hugely zoomed in)
  if (S.is3D && settle) { const tok = ++camTok; map.once('idle', () => { if (S.is3D && tok === camTok) camera(view, 400, false); }); }
}
/* turn terrain on/off; the camera moves only after the elevation tiles are in, so its height is right */
function set3D(on) {
  S.is3D = on; camTok++;
  map.setTerrain(on ? { source: 'dem', exaggeration: 1 } : null);
  const aim = () => {
    if (S.is3D !== on) return;
    if (registered(hole()) && !(S.mode && S.mode.startsWith('setup'))) camera(S.view, 900, false);
    else map.easeTo({ pitch: on ? 60 : 0, duration: 700 });
  };
  if (on) map.once('idle', aim); else aim();
}

/* ================= rendering ================= */
function refresh() {
  const h = hole(), setup = S.mode && S.mode.startsWith('setup');
  $('hNo').textContent = N; $('hPar').textContent = h.par;
  place(M.tee, h.tee);
  place(M.gc, S.round.pins[N] && h.green ? h.green : null);
  place(M.pin, pinLL());
  place(M.me, S.me && S.me.ll);
  M.me.getElement().classList.toggle('sim', !!(S.me && S.me.src === 'sim'));
  tapDraw();
  numMarkers.forEach(m => m.remove()); numMarkers = [];
  if (setup) S.course.holes.forEach(x => { if (x.tee && x.n !== N) numMarkers.push(new maplibregl.Marker({ element: mkEl('num', String(x.n)) }).setLngLat(x.tee).addTo(map)); });
  if (mapReady) {
    const f = [], pin = pinLL();
    if (setup) S.course.holes.forEach(x => { if (registered(x)) f.push(ln(x.tee, x.green, 'setup')); });
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
  if (!registered(h)) { $('dNum').textContent = '—'; $('dLab').textContent = '未登録のホール'; sub.textContent = '右の「設定」→「コース登録」で登録できます'; return; }
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
let toastT = null;
function toast(msg) { const t = $('toast'); t.textContent = msg; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => t.hidden = true, 2600); }

/* ================= interactions ================= */
/* place the current item (tee / green / pin / test position) at ll */
function placeAt(ll) {
  const h = hole();
  switch (S.mode) {
    case 'setup-tee': h.tee = ll; S.mode = 'setup-green'; saveCourse(); break;
    case 'setup-green':
      h.green = ll; saveCourse();
      if (N < 18) { N++; const nx = hole(); S.mode = registered(nx) ? null : nx.tee ? 'setup-green' : 'setup-tee'; }
      else { S.mode = null; closeSetup(); toast('18ホールの登録が終わりました'); }
      savePrefs(); break;
    case 'pin': S.round.pins[N] = ll; saveRound(); S.mode = null; toast(`${N}番のピンを置きました`); break;
    case 'me': S.me = { ll, acc: null, src: 'sim' }; S.mode = null; break;
    default: return;
  }
  refresh();
  if (!S.mode) camBack();
}
/* placing the pin or a test position zooms in on the spot; afterwards (placed or cancelled)
   the map goes back to the view it had before */
let camSave = null;
const camKeep = () => { camSave = { center: map.getCenter(), zoom: map.getZoom(), bearing: map.getBearing(), pitch: map.getPitch() }; };
function camBack() { if (camSave) { map.easeTo(Object.assign(camSave, { duration: 600 })); camSave = null; } }
$('sPlace').onclick = $('bannerPlace').onclick = () => placeAt(crossLL());
/* measuring marks. 1st tap: a mark, distance to the pin. 2nd tap: a second mark — closer to the pin than
   the first, it splits that leg; farther out, the path now starts there. A 3rd tap starts over.
   Marks clear themselves after a few idle seconds and the display goes back to your position. */
let tapT = null;
// the measured path: the marks farthest-first, then the pin. With one mark it starts from your position
// (when known); with two the marks alone are the path, so there is no line from you
const tapFromMe = () => !!(S.me && S.tap && S.tap.length === 1);
const tapPath = pin => S.tap && pin ? (tapFromMe() ? [S.me.ll] : []).concat(S.tap.slice().sort((a, b) => yards(b, pin) - yards(a, pin)), [pin]) : null;
const tapLine = () => { const p = tapPath(pinLL()); return p && { type: 'Feature', properties: { kind: 'tap' }, geometry: { type: 'LineString', coordinates: p } }; };
function tapIdle() {
  clearTimeout(tapT);
  tapT = setTimeout(() => { S.tap = null; refresh(); }, S.tap && S.tap.length > 1 ? 10000 : 5000);
}
// while dragging, drag events come faster than the screen redraws: do the work at most once per frame,
// and leave the elevation lookups for when the finger lifts
let tapRaf = 0;
function tapDraw(dragging) {
  if (dragging) { if (!tapRaf) tapRaf = requestAnimationFrame(() => { tapRaf = 0; tapPaint(true); }); return; }
  tapPaint(false);
}
function tapPaint(dragging) {
  const path = tapPath(pinLL());
  TM.forEach((m, i) => place(m, S.tap && S.tap[i]));
  LM.forEach((m, i) => {  // a label on every leg once there are two or more
    const on = path && path.length >= 3 && i < path.length - 1, e = m.getElement();
    if (on) { const t = `${Math.round(yards(path[i], path[i + 1]))}Y`; if (e.textContent !== t) e.textContent = t; }
    place(m, on ? lerpLL(path[i], path[i + 1], .5) : null);
  });
  if (dragging && mapReady) { const p = tapLine(); map.getSource('lines').setData(fc(p ? [p] : [])); readout(true); }
}
const tapClear = () => { clearTimeout(tapT); S.tap = null; refresh(); };
$('tapReset').onclick = tapClear;
M.me.getElement().addEventListener('click', e => { e.stopPropagation(); if (S.tap) tapClear(); });
map.on('click', e => {
  if (e.originalEvent && e.originalEvent.target.closest && e.originalEvent.target.closest('.mk.tap, .mk.me')) return;
  const ll = [e.lngLat.lng, e.lngLat.lat];
  // while placing, a tap only brings that spot under the crosshair; the button does the placing
  if (isPlacing()) { centerOn(ll); return; }
  S.tap = S.tap && S.tap.length === 1 ? [S.tap[0], ll] : [ll];
  refresh(); tapIdle();
  const dot = TM[S.tap.length - 1].getElement().firstChild;  // replay the pop on the new mark
  dot.style.animation = 'none'; void dot.offsetWidth; dot.style.animation = '';
});
function goHole(n) {
  N = ((n - 1 + 18) % 18) + 1; S.tap = null; savePrefs();
  if (S.mode === 'pin') S.mode = null;
  camSave = null;  // the new hole gets its own view
  if (S.mode && S.mode.startsWith('setup') || !$('setup').hidden) { const h = hole(); S.mode = registered(h) ? null : h.tee ? 'setup-green' : 'setup-tee'; }
  refresh();
  if (!(S.mode && S.mode.startsWith('setup'))) camera(S.view);
}
$('prevHole').onclick = () => goHole(N - 1);
$('nextHole').onclick = () => goHole(N + 1);
$('bannerCancel').onclick = () => { if (S.mode && S.mode.startsWith('setup')) closeSetup(); S.mode = null; refresh(); camBack(); };

$('b3d').onclick = () => { if (!mapReady) return; set3D(!S.is3D); refresh(); };
$('bView').onclick = () => {
  S.view = { tee: 'top', top: 'green', green: 'tee' }[S.view];
  if (!registered(hole())) toast('このホールはまだ登録されていません'); else camera(S.view);
  refresh();
};
$('bMe').onclick = () => {
  if (!S.me) { toast('現在地がありません。GPSをオンにしてください'); return; }
  const pin = pinLL();
  if (!pin) { map.easeTo({ center: S.me.ll, zoom: Math.max(map.getZoom(), 17), duration: 700 }); return; }
  // fit you and the pin between the panels, turned so the pin is straight ahead (up the screen)
  const top = document.querySelector('.hud').getBoundingClientRect().bottom, low = $('dock').hidden ? innerHeight : $('dock').getBoundingClientRect().top;
  const cam = map.cameraForBounds([S.me.ll, pin].reduce((b, p) => b.extend(p), new maplibregl.LngLatBounds(S.me.ll, S.me.ll)), {
    bearing: bearing(S.me.ll, pin), maxZoom: 18,
    padding: { top: top + 66, bottom: innerHeight - low + 36, left: 48, right: 90 }  // top: room for the flag; right: the button column
  });
  if (cam) map.easeTo(Object.assign(cam, { pitch: map.getPitch(), duration: 800 }));
};
$('bPin').onclick = () => {
  if (!hole().green) { toast('先にこのホールを登録してください'); return; }
  S.mode = S.mode === 'pin' ? null : 'pin'; S.tap = null;
  refresh();
  if (S.mode === 'pin') { camKeep(); centerOn(S.round.pins[N] || hole().green, { zoom: Math.max(map.getZoom(), 18.3), duration: 700 }); }
  else camBack();
};

/* GPS */
async function wakeOn() { try { if ('wakeLock' in navigator) S.wake = await navigator.wakeLock.request('screen'); } catch (e) {} }
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && S.watch) wakeOn(); });
function gpsStart() {
  if (!('geolocation' in navigator)) { toast('この端末では位置情報を使えません'); return; }
  S.watch = navigator.geolocation.watchPosition(p => {
    S.me = { ll: [p.coords.longitude, p.coords.latitude], acc: p.coords.accuracy, src: 'gps' };
    refresh();
  }, err => {
    toast(err.code === 1 ? '位置情報が許可されていません。ブラウザの設定で許可してください' : '現在地を取得できませんでした。空の見える場所でお試しください');
    if (err.code === 1) gpsStop();
  }, { enableHighAccuracy: true, maximumAge: 3000, timeout: 20000 });
  S.prefs.gps = true; savePrefs(); wakeOn(); refresh();
}
function gpsStop() {
  if (S.watch != null) navigator.geolocation.clearWatch(S.watch);
  S.watch = null; if (S.me && S.me.src === 'gps') S.me = null;
  try { S.wake && S.wake.release(); } catch (e) {} S.wake = null;
  S.prefs.gps = false; savePrefs(); refresh();
}
$('bGps').onclick = () => S.watch != null ? gpsStop() : gpsStart();

