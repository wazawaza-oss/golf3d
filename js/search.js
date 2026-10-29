/* golf3d — search: finding the golf club by name for course registration.
   Nominatim (OpenStreetMap) first; the GSI place-name search (msearch.gsi.go.jp) as a fallback.
   Only on the 検索 button (never while typing), one request at a time, at most one per second to Nominatim.
   Plain scripts loaded in order from index.html (no build step); they share top-level names. */
"use strict";

const NOMINATIM = 'https://nominatim.openstreetmap.org/search';
const GSI_SEARCH = 'https://msearch.gsi.go.jp/address-search/AddressSearch';
let searchBusy = false, nomLast = 0;
async function getJSON(url) {
  const ac = new AbortController(), t = setTimeout(() => ac.abort(), 15000);
  try {
    const r = await fetch(url, { signal: ac.signal });
    if (!r.ok) throw new Error(r.status === 429 ? '検索が混んでいます。少し待ってからもう一度押してください' : `検索できませんでした（${r.status}）`);
    return await r.json();
  } catch (e) {
    throw new Error(e.name === 'AbortError' ? '時間切れになりました。もう一度押してください' : e.message.startsWith('検索') ? e.message : '検索できませんでした。電波を確かめてください');
  } finally { clearTimeout(t); }
}
// a box of m metres around a point: the area for places without an outline
const boxAround = (ll, m) => { const dy = m / 111195, dx = dy / Math.cos(rad(ll[1])); return [ll[0] - dx, ll[1] - dy, ll[0] + dx, ll[1] + dy]; };
// place = { name, sub, center: [lng, lat], bbox: [w, s, e, n], osm, golf }
async function searchOSM(q) {
  const wait = nomLast + 1100 - Date.now();
  if (wait > 0) await new Promise(r => setTimeout(r, wait));
  nomLast = Date.now();
  const list = await getJSON(`${NOMINATIM}?format=jsonv2&countrycodes=jp&accept-language=ja&limit=10&q=${encodeURIComponent(q)}`);
  return (Array.isArray(list) ? list : []).map(x => {
    const parts = String(x.display_name || '').split(',').map(s => s.trim());
    const golf = x.category === 'leisure' && x.type === 'golf_course', center = [+x.lon, +x.lat], b = (x.boundingbox || []).map(Number);
    // a golf club's outline (plus a little room for tees at the edge); anything else gets 900 m around it
    const bbox = golf && b.length === 4 && b.every(isFinite) ? [b[2], b[0], b[3], b[1]].map((v, i) => v + (i < 2 ? -.001 : .001)) : boxAround(center, 900);
    return { name: x.name || parts[0], sub: parts.slice(1).filter(s => s !== '日本' && !/^\d{3}-?\d{4}$/.test(s)).reverse().slice(0, 3).join(' '),
      center, bbox, osm: x.osm_type && x.osm_id ? `${x.osm_type}/${x.osm_id}` : null, golf };
  }).filter(p => p.center.every(isFinite)).sort((a, b) => b.golf - a.golf);
}
async function searchGSI(q) {
  const list = await getJSON(`${GSI_SEARCH}?q=${encodeURIComponent(q)}`);
  return (Array.isArray(list) ? list : []).slice(0, 10).map(x => {
    const center = ((x.geometry || {}).coordinates || []).map(Number);
    return { name: String((x.properties || {}).title || ''), sub: '国土地理院の地名検索', center, bbox: boxAround(center, 900), osm: null, golf: false };
  }).filter(p => p.name && p.center.length === 2 && p.center.every(isFinite));
}
async function runSearch(gsi) {
  const q = $('rgQ').value.trim(), info = $('rgInfo');
  if (!q) { $('rgQ').focus(); return; }
  if (searchBusy) return;
  searchBusy = true; $('rgGo').disabled = $('rgGsi').disabled = true;
  info.dataset.busy = '1'; info.textContent = gsi ? '国土地理院の地名検索で探しています…' : '検索しています…';
  const box = $('rgList'); box.textContent = '';
  let list = [];
  try {
    list = await (gsi ? searchGSI(q) : searchOSM(q));
    info.textContent = list.length ? `${list.length}件見つかりました。選ぶと地図がそこへ移動します` : gsi ? '見つかりませんでした。地名（市町村名など）で探して、地図を動かしても登録できます' : '見つかりませんでした。下の「国土地理院の地名検索」も試してください';
  } catch (e) { info.textContent = e.message; }
  list.forEach(p => {
    const b = el('button', 'mrow');
    const tx = el('span', 'mtx', p.name); if (p.sub) tx.appendChild(el('small', '', p.sub));
    b.append(tx, el('span', 'mval', p.golf ? 'ゴルフ場' : ''));
    b.onclick = () => { regUsePlace(p); box.textContent = ''; };
    box.appendChild(b);
  });
  $('rgGsi').hidden = false;
  searchBusy = false; $('rgGo').disabled = $('rgGsi').disabled = false; delete info.dataset.busy;
}
$('rgGo').onclick = () => runSearch(false);
$('rgGsi').onclick = () => runSearch(true);
$('rgQ').onkeydown = e => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); runSearch(false); } };

/* a chosen place: the map goes there and the draft remembers the area (used by the OSM draft).
   Far from the course being registered, with holes already placed there: that is a different golf club, ask first */
function regUsePlace(p) {
  const d = S.draft, c = d.course, area = { bbox: p.bbox, osm: p.golf ? p.osm : null, name: p.name };
  const far = distM(c.center, p.center) > 3000, placed = c.nines.some(x => x.holes.some(h => h.tee || h.green));
  const apply = fresh => {
    if (fresh) {
      const n = blankCourse(); n.tees = c.tees; n.baseTee = c.baseTee;
      d.course = n; d.cand = cleanCand(null); d.fresh = true;
    }
    Object.assign(d.course, { center: p.center, area });
    if (fresh || d.named || S.course.name === 'テストコース' || !S.course.name) { d.course.name = p.name.slice(0, 40); d.named = true; }
    saveDraft();
    map.fitBounds([[p.bbox[0], p.bbox[1]], [p.bbox[2], p.bbox[3]]], { padding: 30, maxZoom: 17, bearing: 0, pitch: 0, duration: 0 });
    renderReg();
    $('rgInfo').textContent = `「${p.name}」に移動しました` + (p.golf ? '（敷地の範囲を取得しました）' : '');
  };
  if (far && placed) ask(`「${p.name}」で新しく登録を始めますか？`, '下書きで置いた位置は消えます。今のコースは「確定」するまで残ります', '新しく始める', () => apply(true));
  else apply(far && allHoles().some(registered));
}
