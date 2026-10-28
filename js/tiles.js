/* golf3d — tiles: GSI aerial photo and elevation tiles, the tile cache, ground height at a point
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

