/* golf3d — art: illustrated map designs laid over the aerial photo, for the few courses that have them
   (settings › 表示 › マップのデザイン). Each design is one picture of the whole course, made in the separate 3D project
   (Documents/golf-3d/golf-3d-prototype, tools/export-app-art.mjs), placed on the map as an image source by its
   four corners; it drapes over the 3D terrain like the photo. Outside its rectangle the usual GSI photo shows.
   The choice is S.prefs.art (missing = 'aerial'); 'off' = the plain GSI photo. The picture is fetched through the
   tile cache (tileBlob), so once seen — or saved with マップを端末に保存 — it shows with no signal.
   Plain scripts loaded in order from index.html (no build step); they share top-level names. */
"use strict";

const ART_DESIGNS = [
  ['aerial', '航空写真（標準）', '航空写真をもとに、芝・バンカー・池をくっきり', 'jpg'],
  ['flat', 'フラット・ミニマル', '色数をしぼった塗り分け。白い破線がティーからグリーンへの道筋', 'jpg'],
  ['navi', 'ゴルフナビ', '黄色の線が道筋、白丸はグリーン中心まで200・150・100ヤード', 'jpg'],
  ['pixel', 'ドット絵', 'レトロゲーム風のドット絵', 'png'],
];
// courses with designs: the picture's rectangle [west, south, east, north] (WGS84), and where its files are
const ART_COURSES = [
  { id: 'moonlake-tsurumai', name: 'ムーンレイクゴルフクラブ 鶴舞コース', dir: 'art/moonlake-tsurumai/',
    box: [140.1912432, 35.3046898, 140.2057588, 35.3265022],
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
const artUrl = (c, id) => c.dir + id + '.' + ART_DESIGNS.find(d => d[0] === id)[3];

let artShown = '', artTok = 0;  // artShown = url on the map now ('' = none)
async function artSync() {
  if (!mapReady) return;
  const c = artCourse(), id = artChoice(), url = c && id !== 'off' ? artUrl(c, id) : '';
  if (url === artShown) return;
  artShown = url; const tok = ++artTok;
  if (!url) { if (map.getLayer('art')) map.removeLayer('art'); if (map.getSource('art')) map.removeSource('art'); return; }
  const blob = await tileBlob(new URL(url, location.href).href);
  if (tok !== artTok) return;  // chosen again meanwhile
  if (!blob) { artShown = ''; toast('マップのデザインを読み込めませんでした。電波の良い場所でもう一度お試しください'); return; }
  const [w, s, e, n] = c.box, src = URL.createObjectURL(blob), coords = [[w, n], [e, n], [e, s], [w, s]];
  if (map.getSource('art')) { const old = map.getSource('art'); old.updateImage({ url: src, coordinates: coords }); }
  else {
    map.addSource('art', { type: 'image', url: src, coordinates: coords });
    map.addLayer({ id: 'art', type: 'raster', source: 'art', paint: { 'raster-fade-duration': 0 } }, 'rings');  // over the photo, under every line
  }
  map.setPaintProperty('art', 'raster-resampling', id === 'pixel' ? 'nearest' : 'linear');  // dots stay square
  setTimeout(() => URL.revokeObjectURL(src), 10000);
}
// the designs of the course on screen, for マップを端末に保存 (all of them, so switching works with no signal too)
const artSaveList = () => { const c = artCourse(); return c ? ART_DESIGNS.map(d => new URL(artUrl(c, d[0]), location.href).href) : []; };

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
