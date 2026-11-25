/* golf3d — art: illustrated map designs laid over the aerial photo, for the few courses that have them
   (settings › 表示の設定 › マップのデザイン). Each design is one picture of the whole course, made in the separate 3D project
   (Documents/golf-3d/golf-3d-prototype, tools/export-app-art.mjs) and cut into map tiles (XYZ, 256 px, transparent
   WebP) inside the course's box: art/<course>/<design>/<z>/<x>/<y>.webp. Shown as a raster layer over the photo, so it
   drapes over the 3D terrain like the photo (one big image source did not: with terrain only part of it was drawn).
   Outside the box the usual GSI photo shows.
   The choice is S.prefs.art (missing = 'aerial'); 'off' = the plain GSI photo. Tiles come through the tile cache
   (tileBlob, protocol golfart://), so once seen — or saved with マップを端末に保存 — they show with no signal.
   Plain scripts loaded in order from index.html (no build step); they share top-level names. */
"use strict";

const ART_DESIGNS = [
  ['aerial', '航空写真（標準）', '航空写真をもとに、芝・バンカー・池をくっきり'],
  ['flat', 'フラット・ミニマル', '色数をしぼった塗り分け。白い破線がティーからグリーンへの道筋'],
  ['navi', 'ゴルフナビ', 'ナビ画面のような明るい塗り分け'],
  ['pixel', 'ドット絵', 'レトロゲーム風のドット絵'],
];
// courses with designs: the picture's rectangle [west, south, east, north] (WGS84), its tile zooms, where its files are,
// and MB per design (for the offline-save estimate); all from art/<course>/tiles.json written by the export
const ART_COURSES = [
  { id: 'moonlake-tsurumai', name: 'ムーンレイクゴルフクラブ 鶴舞コース', dir: 'art/moonlake-tsurumai/',
    box: [140.1912432, 35.3046898, 140.2057588, 35.3265022], minzoom: 12, maxzoom: 18,
    mb: { aerial: 3.1, flat: .3, navi: .8, pixel: .5 },
    ver: { aerial: 2, flat: 2, navi: 3, pixel: 2 },  // bump when a design's tiles are re-made: the tile cache keeps files by address, so old ones would stay
    credit: 'コース図：地理院タイル（全国最新写真）と GreenOn のコース図をもとに作図／© OpenStreetMap contributors (ODbL)' },
];
const artChoice = () => ART_DESIGNS.some(d => d[0] === S.prefs.art) || S.prefs.art === 'off' ? S.prefs.art : 'aerial';
// the course on screen has designs when most of its placed tees and greens (or, with none yet, its centre) lie in the box
function artCourse() {
  const pts = []; (comp ? playHoles() : allHoles()).forEach(h => { if (h.tee) pts.push(h.tee); if (h.green) pts.push(h.green); });
  if (!pts.length && S.course.center) pts.push(S.course.center);
  return ART_COURSES.find(c => {
    const [w, s, e, n] = c.box, inside = pts.filter(p => p[0] >= w && p[0] <= e && p[1] >= s && p[1] <= n).length;
    return pts.length && inside >= pts.length / 2;
  }) || null;
}
const artTiles = (c, id) => `golfart://${c.id}/${id}/{z}/{x}/{y}`;
const artFile = (c, id, z, x, y) => new URL(`${c.dir}${id}/${z}/${x}/${y}.webp${c.ver && c.ver[id] ? '?v=' + c.ver[id] : ''}`, location.href).href;
maplibregl.addProtocol('golfart', async (params, ac) => {
  const [cid, id, z, x, y] = params.url.replace('golfart://', '').replace(/\?.*$/, '').split('/'), c = ART_COURSES.find(k => k.id === cid);
  const b = c && await tileBlob(artFile(c, id, z, x, y), ac && ac.signal);
  if (!b) throw new Error('art tile unavailable');
  return tileOut(b, +z, +x, +y);
});

let artShown = '';  // tiles on the map now ('' = none)
function artSync() {
  if (!mapReady) return;
  const c = artCourse(), id = artChoice(), url = c && id !== 'off' ? artTiles(c, id) : '';
  if (url === artShown) return;
  artShown = url;
  if (map.getLayer('art')) map.removeLayer('art');
  if (map.getSource('art')) map.removeSource('art');
  if (!url) return;
  map.addSource('art', { type: 'raster', tiles: [url], tileSize: 256, bounds: c.box, minzoom: c.minzoom, maxzoom: c.maxzoom });
  map.addLayer({ id: 'art', type: 'raster', source: 'art',
    paint: { 'raster-fade-duration': 0, 'raster-resampling': id === 'pixel' ? 'nearest' : 'linear' } }, 'rings');  // over the photo, under every line
}
// the tiles of every design of the course on screen, for マップを端末に保存 (all of them, so switching works with no signal too)
function artSaveList() {
  const c = artCourse(); if (!c) return [];
  const [w, s, e, n] = c.box, out = [];
  for (let z = c.minzoom; z <= c.maxzoom; z++) {
    const x0 = Math.floor(lng2x(w, z)), x1 = Math.floor(lng2x(e, z)), y0 = Math.floor(lat2y(n, z)), y1 = Math.floor(lat2y(s, z));
    for (const d of ART_DESIGNS) for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++)
      out.push(artFile(c, d[0], z, x, y));
  }
  return out;
}
const artSaveMB = () => { const c = artCourse(); return c ? Object.values(c.mb).reduce((a, b) => a + b, 0) : 0; };

/* ---------- in 表示の設定 (js/view.js) ---------- */
const artLabel = () => { const id = artChoice(); return id === 'off' ? '使わない' : ART_DESIGNS.find(d => d[0] === id)[1].replace('（標準）', ''); };
const ART_SHORT = { aerial: '航空写真', flat: 'フラット', navi: 'ナビ', pixel: 'ドット絵', off: '使わない' };
function setArt(id) {
  if (id === 'aerial') delete S.prefs.art; else S.prefs.art = id;
  savePrefs(); artSync(); renderArt();
}
// five small pictures side by side (the map above shows the real thing); the chosen one's description under them
function renderArt() {
  const box = $('artBody'), c = artCourse(), cur = artChoice(); box.textContent = '';
  if (!c) { box.append(el('p', 'grp-f', `いまのコースにはデザインがありません。使えるのは ${ART_COURSES.map(x => x.name).join('・')} だけです。`)); return; }
  const g = el('div', 'grp artpick');
  ART_DESIGNS.map(d => d[0]).concat('off').forEach(id => {
    const b = el('button', 'art1'), on = cur === id;
    const img = el('span', 'artpv');
    if (id !== 'off') img.style.backgroundImage = `url("${c.dir}${id}-s.jpg")`;
    b.setAttribute('aria-pressed', on); b.append(img, el('span', '', ART_SHORT[id]));
    b.onclick = () => setArt(id); g.append(b);
  });
  box.append(g);
  const d = ART_DESIGNS.find(x => x[0] === cur);
  box.append(el('p', 'grp-f', d ? `${d[1]}：${d[2]}。` : 'いつもの航空写真だけを表示します。'));
  box.append(el('p', 'grp-f credit', c.credit));
}
