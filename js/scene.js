/* golf3d — scene: the hole being played in colour and everything else faded, and trees standing in 3D
   (settings › 表示 › ほかのホールを薄く / 3Dで木を表示).
   Fading follows the hole on screen (hole(): on hole 11 only hole 11 keeps its colour; the other holes, the other nines
   and the golf club next door turn grey). It is done on each map tile as it arrives (photo and map design both, through
   their protocols), with a soft edge. When the hole changes the tiles on screen are loaded again in place (the old ones
   stay until the new ones are in), so there is no blank flash.
   The colour follows the hole's own shape (the "land", built once per round from the aerial photo, z17 ≈ 1 m a pixel):
   tree cover is found in the photo (darker, greener and rougher than turf), each hole's line of play is the way from tee
   to green that keeps to open ground (so it bends round a dogleg), and every spot belongs to the hole it is nearest to,
   walking — crossing trees counts as a long way. A hole's area is its own ground within SPAN m either side of its line of
   play (so the trees round it show too), up to where a neighbour's begins, and only a little behind the tee. Until the land is ready (or with fading off for trees only) a capsule tee → green is used.
   Trees are drawn from the same tree cover as low-poly 3D trees (fill-extrusion, two stacked six-sided blocks), only in
   3D. Each tree knows the hole whose area it stands in; the ones by the hole on screen are green, the rest grey.
   Plain scripts loaded in order from index.html (no build step); they share top-level names. */
"use strict";

const fadeOn = () => S.prefs.fade !== false;
const treesOn = () => S.prefs.trees !== false;
// meters per pixel of a 256-px tile at zoom z and latitude lat
const mpp = (z, lat) => 156543.03 * Math.cos(rad(lat)) / 2 ** z;
const keyOf = v => JSON.stringify(v).split('').reduce((h, ch) => (Math.imul(h, 31) + ch.charCodeAt(0)) | 0, 7).toString(36);
const canvasCtx = (rf) => {
  const cv = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(256, 256) : Object.assign(document.createElement('canvas'), { width: 256, height: 256 });
  return [cv, cv.getContext('2d', rf ? { willReadFrequently: true } : undefined)];
};

/* ---------- capsules round a line, in metres (the fallback colour area, and the round's outline) ---------- */
const FADE_W = 30;  // the capsule's soft edge
function holeCaps(tee, green, pin) {
  const len = distM(tee, green), caps = [{ a: tee, b: green, r: 38 + .07 * len }, { a: green, b: green, r: 42 }];
  if (pin && distM(pin, green) > 5) caps.push({ a: pin, b: pin, r: 30 });
  return caps;
}
// wide enough for a dogleg's bend and the trees round the hole: where its line of play is looked for
const wideCaps = (tee, green) => { const len = distM(tee, green); return [{ a: tee, b: green, r: 45 + .22 * len }, { a: green, b: green, r: 70 }, { a: tee, b: tee, r: 45 }]; };
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

// the hole on screen: { n, caps, lat, mask } or null (nothing to fade: no hole placed, or registering holes).
// mask = the hole's shape on the land's grid (0–1, soft edged), once the land is ready
let focus = null, focusKey = '';
function focusCalc() {
  if (inSetup() || !fadeOn()) return null;
  const h = hole(), tee = roundTee();
  if (!h || !tee || !h.green) return null;
  return { caps: holeCaps(tee, h.green, pinLL()), lat: h.green[1], n: N, mask: null };
}
// the round: its holes (1–18, tee and green), and the course's other holes that may stand next to them
let round = null, roundKey = '';
function roundCalc() {
  if (inSetup() || !(treesOn() || fadeOn())) return null;
  const play = playHoles(), holes = [];
  play.forEach((h, i) => { if (h.tee && h.green) holes.push({ n: i + 1, tee: h.tee, green: h.green }); });
  if (!holes.length) return null;
  allHoles().forEach(h => { if (h.tee && h.green && !play.includes(h)) holes.push({ n: 0, tee: h.tee, green: h.green }); });
  const caps = [];
  holes.filter(o => o.n).forEach(o => caps.push({ a: o.tee, b: o.green, r: 50 + .12 * distM(o.tee, o.green) }, { a: o.green, b: o.green, r: 60 }));
  return { holes, caps, lat: holes[0].green[1] };
}

/* ---------- the land: tree cover and each hole's area, on a grid of about 3 m ---------- */
const LZ = 17, LC = 3;          // the photo zoom read, and the grid's cell in its pixels (≈ 2.9 m)
const TREE_W = 4;               // walking through trees counts as this many times the distance
const SPAN = 62;                // how far a hole's area goes either side of its line of play, in metres
const BEHIND = 25;              // and behind its tee
let land = null, landKey = '', landTok = 0, landBusy = false;
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
// a small binary heap of grid cells by cost
function heap() {
  let k = new Float64Array(1024), v = new Int32Array(1024), n = 0;
  return {
    get size() { return n; },
    push(key, val) {
      if (n === k.length) { const k2 = new Float64Array(n * 2), v2 = new Int32Array(n * 2); k2.set(k); v2.set(v); k = k2; v = v2; }
      let i = n++;
      while (i) { const p = (i - 1) >> 1; if (k[p] <= key) break; k[i] = k[p]; v[i] = v[p]; i = p; }
      k[i] = key; v[i] = val;
    },
    pop() {  // → the cell; its cost is left in .key
      const top = v[0]; this.key = k[0]; const lk = k[--n], lv = v[n]; let i = 0;
      for (;;) { let c = 2 * i + 1; if (c >= n) break; if (c + 1 < n && k[c + 1] < k[c]) c++; if (k[c] >= lk) break; k[i] = k[c]; v[i] = v[c]; i = c; }
      k[i] = lk; v[i] = lv; return top;
    }
  };
}
const STEPS = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2]];
// walking costs from seed cells over the grid (trees count TREE_W times); ok(i) = may be walked; stops past `limit`
// or at cell `goal`. Returns { cost, from, own } (own = the label of the seed each cell is reached from)
function walk(L, seeds, labels, ok, limit, goal, tw = TREE_W) {
  const { W, H, cm, tree } = L, n = W * H, cost = new Float64Array(n).fill(Infinity), from = new Int32Array(n).fill(-1), own = new Uint8Array(n);
  const q = heap();
  seeds.forEach((i, j) => { if (cost[i] > 0) { cost[i] = 0; own[i] = labels[j]; q.push(0, i); } });
  while (q.size) {
    const i = q.pop(), c = q.key;
    if (c > cost[i]) continue;
    if (i === goal || c > limit) break;
    const x = i % W, y = (i - x) / W;
    for (const [dx, dy, d] of STEPS) {
      const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const j = ny * W + nx; if (!ok(j, own[i])) continue;
      const nc = c + d * cm * (tree[j] ? tw : 1);
      if (nc < cost[j]) { cost[j] = nc; from[j] = i; own[j] = own[i]; q.push(nc, j); }
    }
  }
  return { cost, from, own };
}
// cells of the grid within capsules (in metres)
function capCells(L, caps) {
  const { W, H } = L, out = new Uint8Array(W * H);
  caps.forEach(c => {
    const ax = L.cx(c.a[0]), ay = L.cy(c.a[1]), bx = L.cx(c.b[0]), by = L.cy(c.b[1]), r = c.r / L.cm;
    const x0 = Math.max(0, Math.floor(Math.min(ax, bx) - r)), x1 = Math.min(W - 1, Math.ceil(Math.max(ax, bx) + r));
    const y0 = Math.max(0, Math.floor(Math.min(ay, by) - r)), y1 = Math.min(H - 1, Math.ceil(Math.max(ay, by) + r));
    const s = { ax, ay, bx, by, r };
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (segDist(x, y, s) <= 0) out[y * W + x] = 1;
  });
  return out;
}
// build the land for the round: read the photo, then each hole's line of play, then whose area each spot is
async function landBuild() {
  const tok = ++landTok, key = roundKey, R = round; landBusy = true;
  const s = 2 ** LZ, m1 = mpp(LZ, R.lat), wide = R.holes.filter(o => o.n).flatMap(o => wideCaps(o.tee, o.green));
  // the grid: round all the round's holes, with room for their trees (in photo pixels at LZ)
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  wide.forEach(c => { const pad = (c.r + SPAN) / m1; [c.a, c.b].forEach(p => { const fx = lng2x(p[0], LZ) * 256, fy = lat2y(p[1], LZ) * 256;
    x0 = Math.min(x0, fx - pad); x1 = Math.max(x1, fx + pad); y0 = Math.min(y0, fy - pad); y1 = Math.max(y1, fy + pad); }); });
  x0 = Math.floor(x0 / LC) * LC; y0 = Math.floor(y0 / LC) * LC;
  const W = Math.ceil((x1 - x0) / LC), H = Math.ceil((y1 - y0) / LC);
  if (W * H > 4e6) { landBusy = false; return; }  // a safety stop for a huge area
  const L = { x0, y0, W, H, cm: LC * m1, cov: new Uint8Array(W * H), tree: new Uint8Array(W * H),
    cx: lng => (lng2x(lng, LZ) * 256 - x0) / LC, cy: lat => (lat2y(lat, LZ) * 256 - y0) / LC };
  // tree cover from the photo tiles that touch the holes' wide areas (through the tile cache: saved maps work with no signal)
  const need = [], reach = wide.map(c => Object.assign({}, c, { r: c.r + SPAN }));
  for (let tx = Math.floor(x0 / 256); tx <= Math.floor(x1 / 256); tx++) for (let ty = Math.floor(y0 / 256); ty <= Math.floor(y1 / 256); ty++)
    if (nearest(128, 128, capPx(reach, R.lat, LZ, tx, ty)) < 182) need.push([tx, ty]);
  const [, g] = canvasCtx(true), sum = new Float32Array(W * H);
  const one = async ([tx, ty]) => {
    const b = await tileBlob(`${GSI}seamlessphoto/${LZ}/${tx}/${ty}.jpg`); if (!b || tok !== landTok) return;
    let px;
    try { const bmp = await createImageBitmap(b); g.clearRect(0, 0, 256, 256); g.drawImage(bmp, 0, 0, 256, 256); bmp.close && bmp.close(); px = g.getImageData(0, 0, 256, 256).data; } catch (e) { return; }
    const cov = canopy(px, 256, 256);
    for (let py = 0; py < 256; py++) {
      const gy = Math.floor((ty * 256 + py - y0) / LC); if (gy < 0 || gy >= H) continue;
      for (let qx = 0; qx < 256; qx++) {
        const gx = Math.floor((tx * 256 + qx - x0) / LC); if (gx < 0 || gx >= W) continue;
        sum[gy * W + gx] += cov[py * 256 + qx];
      }
    }
  };
  for (let i = 0; i < need.length; i += 6) { await Promise.all(need.slice(i, i + 6).map(one)); if (tok !== landTok) return; }
  for (let i = 0; i < W * H; i++) { L.cov[i] = Math.min(255, Math.round(sum[i] / (LC * LC) * 255)); L.tree[i] = L.cov[i] >= 128 ? 1 : 0; }
  await new Promise(r => setTimeout(r));
  // each hole's line of play: the cheapest walk tee → green inside its wide area (round a dogleg, keeping to open ground)
  const seeds = [], labels = [], pSeeds = [], pLabels = [], back = {};
  const disc = (ll, rM, lab) => { const cx = L.cx(ll[0]), cy = L.cy(ll[1]), r = rM / L.cm;
    for (let y = Math.floor(cy - r); y <= cy + r; y++) for (let x = Math.floor(cx - r); x <= cx + r; x++)
      if (x >= 0 && y >= 0 && x < W && y < H && Math.hypot(x - cx, y - cy) <= r) { seeds.push(y * W + x); labels.push(lab); } };
  const inGrid = ll => { const x = Math.round(L.cx(ll[0])), y = Math.round(L.cy(ll[1])); return x >= 0 && y >= 0 && x < W && y < H ? y * W + x : -1; };
  const lines = R.holes.map(o => ({ ax: L.cx(o.tee[0]), ay: L.cy(o.tee[1]), bx: L.cx(o.green[0]), by: L.cy(o.green[1]), r: 0 }));
  for (const o of R.holes) {
    if (tok !== landTok) return;
    const lab = o.n || 100, tc = inGrid(o.tee), gc = inGrid(o.green);
    if (tc < 0 && gc < 0) continue;  // another nine's hole, away from the round
    if (tc >= 0 && gc >= 0) {
      const area = capCells(L, wideCaps(o.tee, o.green)), w = walk(L, [tc], [1], j => area[j], Infinity, gc), path = [];
      for (let i = gc; i >= 0; i = w.from[i]) path.push(i);
      path.forEach(i => { seeds.push(i); labels.push(lab); pSeeds.push(i); pLabels.push(lab); });
      // and the straight line tee → green where it is open ground and nearer this hole's line than any other's: a hole
      // split by a row of trees keeps both its fairways, while a dogleg's straight line over trees or a neighbour does not
      const sx = L.cx(o.tee[0]), sy = L.cy(o.tee[1]), ex = L.cx(o.green[0]), ey = L.cy(o.green[1]), steps = Math.ceil(Math.hypot(ex - sx, ey - sy));
      for (let k = 0; k <= steps; k++) {
        const x = Math.round(sx + (ex - sx) * k / steps), y = Math.round(sy + (ey - sy) * k / steps), i = y * W + x;
        if (x < 0 || y < 0 || x >= W || y >= H || L.tree[i]) continue;
        const own = segDist(x, y, lines[R.holes.indexOf(o)]);
        if (lines.every((c, j) => j === R.holes.indexOf(o) || segDist(x, y, c) > own)) { seeds.push(i); labels.push(lab); pSeeds.push(i); pLabels.push(lab); }
      }
      // the way the hole starts (tee → a point about 40 m on): behind the tee its area stays short
      const a = path[Math.max(0, path.length - 1 - Math.round(40 / L.cm))];
      const tx = tc % W, ty = (tc - tx) / W, ax = a % W, ay = (a - ax) / W, l = Math.hypot(ax - tx, ay - ty) || 1;
      if (lab < 100) back[lab] = { tx, ty, ux: (ax - tx) / l, uy: (ay - ty) / l };
    }
    disc(o.green, 16, lab); disc(o.tee, 8, lab);
    await new Promise(r => setTimeout(r));
  }
  if (tok !== landTok) return;
  // whose ground: walking from all the lines of play at once (trees count as a long way), each spot goes to the hole
  // it is reached from first
  const all = walk(L, seeds, labels, () => true, SPAN * TREE_W);
  // a hole's area: its own ground within SPAN m of its line of play (so the trees on both sides show), and only a
  // little behind the tee
  const near = walk(L, pSeeds, pLabels, (j, lab) => all.own[j] === lab, SPAN, undefined, 1);
  L.area = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) {
    const lab = near.own[i]; if (near.cost[i] > SPAN || !lab || lab >= 100) continue;
    const b = back[lab];
    if (b) { const x = i % W, y = (i - x) / W, dx = x - b.tx, dy = y - b.ty;
      if (dx * b.ux + dy * b.uy < 0 && Math.hypot(dx, dy) * L.cm > BEHIND) continue; }
    L.area[i] = lab;
  }
  landBusy = false; land = L; landKey = key;
  if (focus) { focusMask(); retile(); }
  if (treeKey !== roundKey) treeKey = '';
  treesShow();
}
// the hole on screen's shape on the grid: its area, its edge softened (blurred, then eased so the edge looks clean)
function focusMask() {
  const f = focus, L = land; if (!f || !L || landKey !== roundKey) return;
  const n = L.W * L.H, a = new Float32Array(n); let any = 0;
  for (let i = 0; i < n; i++) if (L.area[i] === f.n) { a[i] = 1; any = 1; }
  if (!any) return;
  const b = boxMean(boxMean(a, L.W, L.H, 3), L.W, L.H, 3);
  for (let i = 0; i < n; i++) { const t = Math.max(0, Math.min(1, (b[i] - .12) / .76)); b[i] = t * t * (3 - 2 * t); }
  f.mask = b;
}

/* ---------- fading a tile ---------- */
// the tile as it should be drawn: null = unchanged (inside the colour, or nothing to fade), else an ImageBitmap
async function fadeTile(blob, z, x, y) {
  const f = focus, L = f && f.mask && land;
  if (!f || typeof createImageBitmap !== 'function') return null;
  let cut = null;  // how to keep the colour: 'caps' (capsules) or an alpha image (the hole's shape); null = all grey
  const soft = FADE_W / mpp(z, f.lat);
  let cs;
  if (L) {
    // the tile's cells on the grid: all in colour → unchanged; none → all grey
    const k = 2 ** (LZ - z) * 256 / LC, gx0 = Math.floor(x * k - L.x0 / LC), gy0 = Math.floor(y * k - L.y0 / LC);
    const gx1 = Math.ceil((x + 1) * k - L.x0 / LC), gy1 = Math.ceil((y + 1) * k - L.y0 / LC);
    let lo = 1, hi = 0;
    if (gx0 < 0 || gy0 < 0 || gx1 >= L.W || gy1 >= L.H) lo = 0;
    for (let gy = Math.max(0, gy0); gy <= Math.min(L.H - 1, gy1) && (lo > .99 || hi < .01); gy++)
      for (let gx = Math.max(0, gx0); gx <= Math.min(L.W - 1, gx1); gx++) { const v = f.mask[gy * L.W + gx]; if (v < lo) lo = v; if (v > hi) hi = v; }
    if (lo > .99) return null;
    if (hi >= .01) cut = 'mask';
  } else {
    cs = capPx(f.caps, f.lat, z, x, y);
    const d = nearest(128, 128, cs);
    if (d < -182) return null;  // the whole tile is in colour (182 ≈ half its diagonal)
    if (d < 182 + soft) cut = 'caps';
  }
  try {
    const bmp = await createImageBitmap(blob);
    const [cv, g] = canvasCtx();
    // grey: the tile's own brightness with no colour, then lighter, keeping its transparency (the design tiles have some)
    g.drawImage(bmp, 0, 0, 256, 256);
    g.globalCompositeOperation = 'saturation'; g.fillStyle = '#808080'; g.fillRect(0, 0, 256, 256);
    g.globalCompositeOperation = 'destination-in'; g.drawImage(bmp, 0, 0, 256, 256);
    g.globalCompositeOperation = 'source-atop'; g.fillStyle = 'rgba(246,248,244,.38)'; g.fillRect(0, 0, 256, 256);
    if (cut === 'caps') {
      // cut the grey away round the hole, in steps for a soft edge
      g.globalCompositeOperation = 'destination-out'; g.lineCap = 'round'; g.strokeStyle = 'rgba(0,0,0,.34)';
      for (let i = 0; i <= 10; i++) {
        const w = soft * (1 - i / 10);
        cs.forEach(c => { g.lineWidth = 2 * (c.r + w); g.beginPath(); g.moveTo(c.ax, c.ay); g.lineTo(c.bx + .01, c.by); g.stroke(); });
      }
    } else if (cut === 'mask') {
      // cut the grey away by the hole's shape (read off the grid, smoothly between its cells)
      const [mc, mg] = canvasCtx(), im = mg.createImageData(256, 256), d = im.data, k = 2 ** (LZ - z) / LC, M = f.mask, W = L.W, H = L.H;
      for (let py = 0; py < 256; py++) {
        const gy = ((y * 256 + py + .5) * k - L.y0 / LC) - .5, iy = Math.floor(gy), fy = gy - iy;
        for (let px = 0; px < 256; px++) {
          const gx = ((x * 256 + px + .5) * k - L.x0 / LC) - .5, ix = Math.floor(gx), fx = gx - ix;
          const at = (cx, cy) => cx < 0 || cy < 0 || cx >= W || cy >= H ? 0 : M[cy * W + cx];
          const v = (at(ix, iy) * (1 - fx) + at(ix + 1, iy) * fx) * (1 - fy) + (at(ix, iy + 1) * (1 - fx) + at(ix + 1, iy + 1) * fx) * fy;
          d[(py * 256 + px) * 4 + 3] = v * 255;
        }
      }
      mg.putImageData(im, 0, 0);
      g.globalCompositeOperation = 'destination-out'; g.drawImage(mc, 0, 0);
    }
    // and the colour tile under what is left
    if (cut) { g.globalCompositeOperation = 'destination-over'; g.drawImage(bmp, 0, 0, 256, 256); }
    bmp.close && bmp.close();
    return cv.transferToImageBitmap ? cv.transferToImageBitmap() : await createImageBitmap(cv);
  } catch (e) { return null; }
}
// what the photo / design protocols hand to the map
async function tileOut(blob, z, x, y) {
  const f = await fadeTile(blob, z, x, y);
  return { data: f || await blob.arrayBuffer() };
}

/* ---------- trees ---------- */
const TREE_STEP = 8;  // one tree every 8 photo pixels (≈ 8 m) at most
let treeKey = '';
// a fixed pseudo-random number per spot, so the same trees come back every time
const hash = (a, b, k) => { let h = Math.imul(a, 374761393) ^ Math.imul(b, 668265263) ^ Math.imul(k, 2246822519); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
// green for trees by the hole on screen, and a grey of about the same lightness for the rest
const TREE_COLORS = [['#2f6b35', '#7d817c'], ['#3c7d3c', '#8a8e88'], ['#4f9142', '#979b95'], ['#5d9a48', '#a1a59f']];
// a six-sided block round a point: r metres, from base to top; hs = ",3," the hole (1–18) whose area it stands in
function hexAt(ll, r, rot, base, top, col, hs) {
  const c = Math.cos(rad(ll[1])), ring = [];
  for (let i = 0; i <= 6; i++) { const a = rot + i % 6 * Math.PI / 3; ring.push([ll[0] + deg(r * Math.sin(a) / (6371008.8 * c)), ll[1] + deg(r * Math.cos(a) / 6371008.8)]); }
  return { type: 'Feature', properties: { b: base, t: top, c: col[0], g: col[1], hs }, geometry: { type: 'Polygon', coordinates: [ring] } };
}
// the trees round the round's holes, from the land's tree cover
function treesBuild() {
  const L = land, R = round, out = [], z = LZ;
  const caps = R.caps.map(c => Object.assign({}, c, { r: c.r + FADE_W }));
  // a loose grid in photo pixels (the same spots whatever the round), each spot moved a little at random
  for (let gx = Math.ceil(L.x0 / TREE_STEP); gx * TREE_STEP < L.x0 + L.W * LC; gx++) for (let gy = Math.ceil(L.y0 / TREE_STEP); gy * TREE_STEP < L.y0 + L.H * LC; gy++) {
    const wx = gx * TREE_STEP + (hash(gx, gy, 1) - .5) * TREE_STEP * .8, wy = gy * TREE_STEP + (hash(gx, gy, 2) - .5) * TREE_STEP * .8;
    const cx = Math.floor((wx - L.x0) / LC), cy = Math.floor((wy - L.y0) / LC);
    if (cx < 0 || cy < 0 || cx >= L.W || cy >= L.H || L.cov[cy * L.W + cx] < 140) continue;
    const ll = [(wx / 256 / 2 ** z) * 360 - 180, deg(Math.atan(Math.sinh(Math.PI * (1 - 2 * wy / 256 / 2 ** z))))];
    const a = L.area[cy * L.W + cx];
    if (!a) { const tx = Math.floor(wx / 256), ty = Math.floor(wy / 256); if (nearest(wx - tx * 256, wy - ty * 256, capPx(caps, R.lat, z, tx, ty)) > 0) continue; }
    const s = hash(gx, gy, 3), h = 9 + s * 7, r = 3.4 + hash(gx, gy, 4) * 1.8, rot = hash(gx, gy, 5) * Math.PI;
    const col = TREE_COLORS[Math.floor(hash(gx, gy, 6) * TREE_COLORS.length)], hs = `,${a},`;
    out.push(hexAt(ll, r, rot, h * .22, h * .72, col, hs), hexAt(ll, r * .62, rot + .5, h * .72, h, col, hs));
    if (out.length > 60000) break;  // a safety stop for a huge area
  }
  treeKey = roundKey;
  if (mapReady && map.getSource('trees')) map.getSource('trees').setData(fc(out));
}
// green by the hole on screen, grey elsewhere (all green when fading is off)
const treeColor = () => focus ? ['case', ['in', `,${focus.n},`, ['get', 'hs']], ['get', 'c'], ['get', 'g']] : ['get', 'c'];
let treeColorNow = '';
function treesShow() {
  if (!mapReady || !map.getLayer('trees')) return;
  const on = treesOn() && S.is3D && !!land && landKey === roundKey;
  map.setLayoutProperty('trees', 'visibility', on ? 'visible' : 'none');
  const tc = treeColor(), k = JSON.stringify(tc);
  if (k !== treeColorNow) { treeColorNow = k; map.setPaintProperty('trees', 'fill-extrusion-color', tc); }
  if (on && treeKey !== roundKey) treesBuild();
}

/* ---------- keeping it in step with the hole and the round ---------- */
// the photo and design tiles drawn now were faded for this ('' = none)
let tilesFor = '';
// MapLibre's own reload (a private part of the pinned 4.7.1): keeps each tile on screen until its new one is in;
// setTiles instead dropped them all at once
const reloadTiles = id => { const sc = map.style && map.style.sourceCaches && map.style.sourceCaches[id]; if (sc) sc.reload(); };
function retile() {
  if (!mapReady) return;
  const k = focusKey + (focus && focus.mask ? ':shape' : '');
  if (k !== tilesFor) { tilesFor = k; reloadTiles('photo'); reloadTiles('art'); }
}
function sceneSync() {
  const r = roundCalc(), rk = r ? keyOf(r.holes.map(o => [o.n, o.tee, o.green])) : '';
  if (rk !== roundKey) {
    round = r; roundKey = rk; landTok++; landBusy = false; treeKey = '';
    if (mapReady && map.getSource('trees')) map.getSource('trees').setData(fc([]));
  }
  const f = focusCalc(), fk = f ? keyOf([f.n, f.caps.map(c => [c.a, c.b])]) : '';
  if (fk !== focusKey) { focus = f; focusKey = fk; focusMask(); }
  if (round && landKey !== roundKey && !landBusy) landBuild();
  if (!mapReady) return;
  retile();
  treesShow();
}
map.on('load', () => {
  map.addSource('trees', { type: 'geojson', data: fc([]), maxzoom: 16, buffer: 8 });
  map.addLayer({ id: 'trees', type: 'fill-extrusion', source: 'trees', minzoom: 13, layout: { visibility: 'none' },
    paint: { 'fill-extrusion-color': ['get', 'c'], 'fill-extrusion-base': ['get', 'b'], 'fill-extrusion-height': ['get', 't'],
      'fill-extrusion-opacity': 1, 'fill-extrusion-vertical-gradient': true } });
  sceneSync();
});
