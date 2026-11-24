/* golf3d — art: illustrated map designs laid over the aerial photo, for the few courses that have them
   (settings › 表示 › マップのデザイン). Each design is one picture of the whole course, made in the separate 3D project
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
  ['navi', 'ゴルフナビ', '黄色の線が道筋、白丸はグリーン中心まで200・150・100ヤード'],
  ['pixel', 'ドット絵', 'レトロゲーム風のドット絵'],
];
// courses with designs: the picture's rectangle [west, south, east, north] (WGS84), its tile zooms, where its files are,
// and MB per design (for the offline-save estimate); all from art/<course>/tiles.json written by the export
const ART_COURSES = [
  { id: 'moonlake-tsurumai', name: 'ムーンレイクゴルフクラブ 鶴舞コース', dir: 'art/moonlake-tsurumai/',
    box: [140.1912432, 35.3046898, 140.2057588, 35.3265022], minzoom: 12, maxzoom: 18,
    mb: { aerial: 3.1, flat: .3, navi: .9, pixel: .5 },
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
maplibregl.addProtocol('golfart', async (params, ac) => {
  const [cid, id, z, x, y] = params.url.replace('golfart://', '').split('/'), c = ART_COURSES.find(k => k.id === cid);
  const b = c && await tileBlob(new URL(`${c.dir}${id}/${z}/${x}/${y}.webp`, location.href).href, ac && ac.signal);
  if (!b) throw new Error('art tile unavailable');
  return { data: await b.arrayBuffer() };
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
      out.push(new URL(`${c.dir}${d[0]}/${z}/${x}/${y}.webp`, location.href).href);
  }
  return out;
}
const artSaveMB = () => { const c = artCourse(); return c ? Object.values(c.mb).reduce((a, b) => a + b, 0) : 0; };

/* ---------- the settings screen ---------- */
Object.assign(M_TITLE, { mArt: 'マップのデザイン' });
Object.assign(M_RENDER, { mArt: () => renderArt() });
$('goArt').onclick = () => { renderArt(); mShow('mArt'); };
const artLabel = () => { const id = artChoice(); return id === 'off' ? '使わない' : ART_DESIGNS.find(d => d[0] === id)[1].replace('（標準）', ''); };
function setArt(id) {
  if (id === 'aerial') delete S.prefs.art; else S.prefs.art = id;
  savePrefs(); artSync(); renderArt();
}
function renderArt() {
  const box = $('artBody'), c = artCourse(), cur = artChoice(); box.textContent = '';
  box.append(el('p', 'grp-f', c ? `いまのコース（${c.name.replace('ゴルフクラブ ', ' ')}）で使えます。地図の上に、コース全体の絵を重ねて表示します。`
    : `いまのコースにはデザインがありません。使えるのは ${ART_COURSES.map(x => x.name).join('・')} だけです。`));
  const g = el('div', 'grp artlist');
  ART_DESIGNS.forEach(([id, name, sub]) => {
    const on = cur === id, b = el('button', 'mrow art1');
    const img = el('img', 'artpv'); img.alt = ''; img.loading = 'lazy'; img.src = ART_COURSES[0].dir + id + '-s.jpg';
    const tx = el('span', 'mtx', name); tx.appendChild(el('small', '', sub));
    b.setAttribute('aria-pressed', on); b.append(img, tx, el('span', 'pick', on ? '✓' : ''));
    b.onclick = () => setArt(id); g.append(b);
  });
  const off = el('button', 'mrow'), offTx = el('span', 'mtx', '使わない'); offTx.appendChild(el('small', '', 'いつもの航空写真だけ'));
  off.setAttribute('aria-pressed', cur === 'off'); off.append(offTx, el('span', 'pick', cur === 'off' ? '✓' : ''));
  off.onclick = () => setArt('off'); g.append(off);
  box.append(g);
  box.append(el('p', 'grp-f', '変えた内容はこのスマホだけに残ります。電波のない所でも使うときは、ラウンド前に「マップを端末に保存」をしてください（デザインも一緒に保存します）。'));
  box.append(el('p', 'grp-f credit', ART_COURSES[0].credit));
}
