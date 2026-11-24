/* golf3d — scene: the hole being played in colour and everything else faded, and trees standing in 3D
   (settings › 表示 › ほかのホールを薄く / 3Dで木を表示).
   Fading follows the hole on screen (hole(): on hole 11 only hole 11 keeps its colour; the other holes, the other nines
   and the golf club next door turn grey). It is done on each map tile as it arrives (photo and map design both, through
   their protocols): round the hole, tee → green, the tile keeps its colour; farther out it turns grey and lighter, with a
   soft edge. Tile addresses carry the hole's key, so the map loads its tiles again when the hole changes.
   Trees are found once per round in the aerial photo (z17, about 1 m a pixel: tree cover is darker, greener and rougher
   than turf), over the area of all the round's holes, and drawn as low-poly 3D trees (fill-extrusion, two stacked
   six-sided blocks) only in 3D. Each tree knows which holes it stands by; the ones by the hole on screen are green,
   the rest grey like the ground under them.
   Plain scripts loaded in order from index.html (no build step); they share top-level names. */
"use strict";

const fadeOn = () => S.prefs.fade !== false;
const treesOn = () => S.prefs.trees !== false;
// meters per pixel of a 256-px tile at zoom z and latitude lat
const mpp = (z, lat) => 156543.03 * Math.cos(rad(lat)) / 2 ** z;
const keyOf = v => JSON.stringify(v).split('').reduce((h, ch) => (Math.imul(h, 31) + ch.charCodeAt(0)) | 0, 7).toString(36);

/* ---------- areas: capsules round a line, in metres ---------- */
// one hole's colour area: the line tee → green, wide enough for its fairway (longer holes bend more, so a little wider),
// and round the green (and today's pin). Narrow enough that the holes beside it fall outside.
const FADE_W = 30;  // the soft edge
function holeCaps(tee, green, pin) {
  const len = distM(tee, green), caps = [{ a: tee, b: green, r: 38 + .07 * len }, { a: green, b: green, r: 42 }];
  if (pin && distM(pin, green) > 5) caps.push({ a: pin, b: pin, r: 30 });
  return caps;
}
// tiles: an area's capsules in the pixels of tile z/x/y (distance < 0 = inside)
function capPx(caps, lat, z, x, y) {
  const m = mpp(z, lat);
  return caps.map(c => ({ ax: (lng2x(c.a[0], z) - x) * 256, ay: (lat2y(c.a[1], z) - y) * 256,
    bx: (lng2x(c.b[0], z) - x) * 256, by: (lat2y(c.b[1], z) - y) * 256, r: c.r / m }));
}
function segDist(px, py, c) {
  const dx = c.bx - c.ax, dy = c.by - c.ay, l2 = dx * dx + dy * dy;
  const t = l2 ? Math.max(0, Math.min(1, ((px - c.ax) * dx + (py - c.ay) * dy) / l2)) : 0;
  return Math.hypot(px - c.ax - t * dx, py - c.ay - t * dy) - c.r;
}
const nearest = (px, py, cs) => cs.reduce((a, c) => Math.min(a, segDist(px, py, c)), Infinity);

// the hole on screen: { caps, lat } or null (nothing to fade: no hole placed, or registering holes)
let focus = null, focusKey = '';
function focusCalc() {
  if (inSetup() || !fadeOn()) return null;
  const h = hole(), tee = roundTee();
  if (!h || !tee || !h.green) return null;
  return { caps: holeCaps(tee, h.green, pinLL()), lat: h.green[1], n: N };
}
// the round (all its holes, wider): where trees are looked for
let round = null, roundKey = '';
function roundCalc() {
  if (inSetup() || !treesOn()) return null;
  const caps = [];
  playHoles().forEach(h => { if (h.tee && h.green) caps.push({ a: h.tee, b: h.green, r: 50 + .12 * distM(h.tee, h.green) }, { a: h.green, b: h.green, r: 60 }); });
  return caps.length ? { caps, lat: caps[0].a[1] } : null;
}

/* ---------- fading a tile ---------- */
// the tile as it should be drawn: null = unchanged (inside the colour, or nothing to fade), else an ImageBitmap
async function fadeTile(blob, z, x, y) {
  const f = focus;
  if (!f || typeof createImageBitmap !== 'function') return null;
  const cs = capPx(f.caps, f.lat, z, x, y), soft = FADE_W / mpp(z, f.lat), d = nearest(128, 128, cs);
  if (d < -182) return null;  // the whole tile is in colour (182 ≈ half its diagonal)
  const edge = d < 182 + soft;  // part of it is
  try {
    const bmp = await createImageBitmap(blob);
    const cv = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(256, 256) : Object.assign(document.createElement('canvas'), { width: 256, height: 256 });
    const g = cv.getContext('2d');
    // grey: the tile's own brightness with no colour, then lighter, keeping its transparency (the design tiles have some)
    g.drawImage(bmp, 0, 0, 256, 256);
    g.globalCompositeOperation = 'saturation'; g.fillStyle = '#808080'; g.fillRect(0, 0, 256, 256);
    g.globalCompositeOperation = 'destination-in'; g.drawImage(bmp, 0, 0, 256, 256);
    g.globalCompositeOperation = 'source-atop'; g.fillStyle = 'rgba(246,248,244,.38)'; g.fillRect(0, 0, 256, 256);
    if (edge) {
      // cut the grey away round the hole, in steps for a soft edge, and show the colour tile through
      g.globalCompositeOperation = 'destination-out'; g.lineCap = 'round'; g.strokeStyle = 'rgba(0,0,0,.34)';
      for (let i = 0; i <= 10; i++) {
        const w = soft * (1 - i / 10);
        cs.forEach(c => { g.lineWidth = 2 * (c.r + w); g.beginPath(); g.moveTo(c.ax, c.ay); g.lineTo(c.bx + .01, c.by); g.stroke(); });
      }
      g.globalCompositeOperation = 'destination-over'; g.drawImage(bmp, 0, 0, 256, 256);
    }
    bmp.close && bmp.close();
    return cv.transferToImageBitmap ? cv.transferToImageBitmap() : await createImageBitmap(cv);
  } catch (e) { return null; }
}
// what the photo / design protocols hand to the map
async function tileOut(blob, z, x, y) {
  const f = await fadeTile(blob, z, x, y);
  return { data: f || await blob.arrayBuffer() };
}
// tile addresses carry the hole, so the map loads them again when it changes
const fadeQ = () => focus ? '?f=' + focusKey : '';

/* ---------- trees ---------- */
const TREE_Z = 17, TREE_STEP = 8;  // look at z17 photo tiles; one tree every 8 m at most (the photo's pixels ≈ 1 m)
let treeTok = 0, treeKey = '', treeBusy = false;
function boxMean(src, W, H, r) {
  const tmp = new Float32Array(W * H), out = new Float32Array(W * H), n = (2 * r + 1) ** 2;
  for (let y = 0; y < H; y++) {
    let s = 0; const o = y * W;
    for (let x = -r; x <= r; x++) s += src[o + Math.min(W - 1, Math.max(0, x))];
    for (let x = 0; x < W; x++) { tmp[o + x] = s; s += src[o + Math.min(W - 1, x + r + 1)] - src[o + Math.max(0, x - r)]; }
  }
  for (let x = 0; x < W; x++) {
    let s = 0;
    for (let y = -r; y <= r; y++) s += tmp[Math.min(H - 1, Math.max(0, y)) * W + x];
    for (let y = 0; y < H; y++) { out[y * W + x] = s / n; s += tmp[Math.min(H - 1, y + r + 1) * W + x] - tmp[Math.max(0, y - r) * W + x]; }
  }
  return out;
}
// tree cover in a photo tile (RGBA): greener than it is red, not bright, and rough (leaves and their shadows) — turf
// is pale and smooth, sand and roads are bright, water is smooth. Then smoothed, so lone specks drop out.
function canopy(px, W, H) {
  const N = W * H, L = new Float32Array(N), L2 = new Float32Array(N), D = new Float32Array(N);
  for (let i = 0, j = 0; i < N; i++, j += 4) { const l = .3 * px[j] + .59 * px[j + 1] + .11 * px[j + 2]; L[i] = l; L2[i] = l * l; D[i] = px[j + 1] - px[j]; }
  const m = boxMean(L, W, H, 3), m2 = boxMean(L2, W, H, 3), dm = boxMean(D, W, H, 3), c = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const sd = Math.sqrt(Math.max(0, m2[i] - m[i] * m[i]));
    c[i] = (dm[i] > 5 && m[i] < 175 && sd > 8) || (m[i] < 105 && dm[i] > -4) ? 1 : 0;
  }
  return boxMean(c, W, H, 5);
}
// a fixed pseudo-random number per spot, so the same trees come back every time
const hash = (a, b, k) => { let h = Math.imul(a, 374761393) ^ Math.imul(b, 668265263) ^ Math.imul(k, 2246822519); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
// green for trees by the hole on screen, and a grey of about the same lightness for the rest
const TREE_COLORS = [['#2f6b35', '#7d817c'], ['#3c7d3c', '#8a8e88'], ['#4f9142', '#979b95'], ['#5d9a48', '#a1a59f']];
// a six-sided block round a point: r metres, from base to top; hs = ",3,4," the holes (1–18) it stands by
function hexAt(ll, r, rot, base, top, col, hs) {
  const c = Math.cos(rad(ll[1])), ring = [];
  for (let i = 0; i <= 6; i++) { const a = rot + i % 6 * Math.PI / 3; ring.push([ll[0] + deg(r * Math.sin(a) / (6371008.8 * c)), ll[1] + deg(r * Math.cos(a) / 6371008.8)]); }
  return { type: 'Feature', properties: { b: base, t: top, c: col[0], g: col[1], hs }, geometry: { type: 'Polygon', coordinates: [ring] } };
}
// the trees of the round's area, read from the photo tiles (through the tile cache, so saved maps work with no signal)
async function treesBuild() {
  const tok = ++treeTok, key = roundKey, R = round; treeBusy = true;
  const out = [], z = TREE_Z, soft = FADE_W / mpp(z, R.lat);
  const holes = playHoles().map((h, i) => h.tee && h.green ? { n: i + 1, caps: holeCaps(h.tee, h.green) } : null).filter(Boolean);
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  R.caps.forEach(c => {
    const pad = (c.r + FADE_W) / mpp(z, R.lat) / 256;
    [c.a, c.b].forEach(p => { const fx = lng2x(p[0], z), fy = lat2y(p[1], z); x0 = Math.min(x0, fx - pad); x1 = Math.max(x1, fx + pad); y0 = Math.min(y0, fy - pad); y1 = Math.max(y1, fy + pad); });
  });
  const cv = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(256, 256) : Object.assign(document.createElement('canvas'), { width: 256, height: 256 });
  const g = cv.getContext('2d', { willReadFrequently: true });
  for (let x = Math.floor(x0); x <= Math.floor(x1); x++) for (let y = Math.floor(y0); y <= Math.floor(y1); y++) {
    if (tok !== treeTok) return;
    const cs = capPx(R.caps, R.lat, z, x, y);
    if (nearest(128, 128, cs) > 182 + soft) continue;  // tile outside the round's area
    const b = await tileBlob(`${GSI}seamlessphoto/${z}/${x}/${y}.jpg`); if (!b) continue;
    let px;
    try { const bmp = await createImageBitmap(b); g.clearRect(0, 0, 256, 256); g.drawImage(bmp, 0, 0, 256, 256); bmp.close && bmp.close(); px = g.getImageData(0, 0, 256, 256).data; } catch (e) { continue; }
    const cov = canopy(px, 256, 256), hcs = holes.map(o => ({ n: o.n, cs: capPx(o.caps, R.lat, z, x, y) }));
    // a loose grid in world pixels (the same spots whatever the tile), each spot moved a little at random
    const gx0 = Math.ceil(x * 256 / TREE_STEP), gy0 = Math.ceil(y * 256 / TREE_STEP);
    for (let gx = gx0; gx * TREE_STEP < (x + 1) * 256; gx++) for (let gy = gy0; gy * TREE_STEP < (y + 1) * 256; gy++) {
      const wx = gx * TREE_STEP + (hash(gx, gy, 1) - .5) * TREE_STEP * .8, wy = gy * TREE_STEP + (hash(gx, gy, 2) - .5) * TREE_STEP * .8;
      const ix = Math.floor(wx - x * 256), iy = Math.floor(wy - y * 256);
      if (ix < 0 || iy < 0 || ix > 255 || iy > 255 || cov[iy * 256 + ix] < .55) continue;
      if (nearest(ix, iy, cs) > soft) continue;
      // green where that hole's ground is (mostly) in colour
      const hs = ',' + hcs.filter(o => nearest(ix, iy, o.cs) < soft * .5).map(o => o.n).join(',') + ',';
      const ll = [(wx / 256 / 2 ** z) * 360 - 180, deg(Math.atan(Math.sinh(Math.PI * (1 - 2 * wy / 256 / 2 ** z))))];
      const s = hash(gx, gy, 3), h = 9 + s * 7, r = 3.4 + hash(gx, gy, 4) * 1.8, rot = hash(gx, gy, 5) * Math.PI;
      const col = TREE_COLORS[Math.floor(hash(gx, gy, 6) * TREE_COLORS.length)];
      out.push(hexAt(ll, r, rot, h * .22, h * .72, col, hs), hexAt(ll, r * .62, rot + .5, h * .72, h, col, hs));
    }
    if (out.length > 60000) break;  // a safety stop for a huge area
  }
  if (tok !== treeTok) return;
  treeBusy = false; treeKey = key;
  if (mapReady && map.getSource('trees')) map.getSource('trees').setData(fc(out));
}
// green by the hole on screen, grey elsewhere (all green when fading is off)
const treeColor = () => focus ? ['case', ['in', `,${focus.n},`, ['get', 'hs']], ['get', 'c'], ['get', 'g']] : ['get', 'c'];
let treeColorNow = '';
function treesShow() {
  if (!mapReady || !map.getLayer('trees')) return;
  const on = treesOn() && S.is3D && !!round;
  map.setLayoutProperty('trees', 'visibility', on ? 'visible' : 'none');
  const tc = treeColor(), k = JSON.stringify(tc);
  if (k !== treeColorNow) { treeColorNow = k; map.setPaintProperty('trees', 'fill-extrusion-color', tc); }
  if (on && treeKey !== roundKey && !treeBusy) treesBuild();
}

/* ---------- keeping it in step with the hole and the round ---------- */
let photoQ = '';  // the photo's tile addresses end in this now
function sceneSync() {
  const f = focusCalc(), fk = f ? keyOf([f.n, f.caps.map(c => [c.a, c.b])]) : '';
  if (fk !== focusKey) { focus = f; focusKey = fk; }
  const r = roundCalc(), rk = r ? keyOf(r.caps.map(c => [c.a, c.b])) : '';
  if (rk !== roundKey) { round = r; roundKey = rk; treeTok++; treeBusy = false; treeKey = ''; if (mapReady && map.getSource('trees')) map.getSource('trees').setData(fc([])); }
  if (!mapReady) return;
  if (fadeQ() !== photoQ) { photoQ = fadeQ(); map.getSource('photo').setTiles([`gsiphoto://{z}/{x}/{y}${photoQ}`]); }
  treesShow();
}
map.on('load', () => {
  map.addSource('trees', { type: 'geojson', data: fc([]), maxzoom: 16, buffer: 8 });
  map.addLayer({ id: 'trees', type: 'fill-extrusion', source: 'trees', minzoom: 13, layout: { visibility: 'none' },
    paint: { 'fill-extrusion-color': ['get', 'c'], 'fill-extrusion-base': ['get', 'b'], 'fill-extrusion-height': ['get', 't'],
      'fill-extrusion-opacity': 1, 'fill-extrusion-vertical-gradient': true } });
  sceneSync();
});
