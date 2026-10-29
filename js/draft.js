/* golf3d — draft: a first guess at tees and greens for course registration, from OpenStreetMap (Overpass API)
   Plain scripts loaded in order from index.html (no build step); they share top-level names.

   draftCourse(input) is the one entry point, so an AI version can replace it later with the same shapes:
     input  = { area: { bbox: [w, s, e, n] }, nines: [{ id, name, holes: [{ n, par, yd: { teeId: yards } }] }], baseTee }
     output = { holes: [{ nine, n, par, tee: [lng, lat] | null, green: [lng, lat] | null, src: 'osm' }],
                candidates: { greens: [[lng, lat]], tees: [[lng, lat]] },   // found but not tied to a hole number
                note }                                                      // a line for the screen
   It throws an Error whose message is ready to show (network, timeout, busy, area too large). */
"use strict";

const OVERPASS = 'https://overpass-api.de/api/interpreter';
const OSM_CREDIT = '© OpenStreetMap contributors';
let osmLast = 0;  // one request at a time, and not again within 10 s (Overpass usage policy)

async function draftCourse(input) {
  return osmToDraft(await fetchOSM(input.area.bbox), input);
}
// golf=hole / green / tee inside the golf club's box, with their shapes
async function fetchOSM(bbox) {
  const [w, s, e, n] = bbox;
  if (!(e > w && n > s)) throw new Error('ゴルフ場の範囲がありません。先に「ゴルフ場を探す」で選んでください');
  if (e - w > .06 || n - s > .05) throw new Error('範囲が広すぎます（5kmまで）。ゴルフ場を選び直してください');
  const wait = osmLast + 10000 - Date.now();
  if (wait > 0) throw new Error(`続けての取得はできません。${Math.ceil(wait / 1000)}秒後にもう一度押してください`);
  osmLast = Date.now();
  const b = [s, w, n, e].map(v => v.toFixed(6)).join(',');
  const q = `[out:json][timeout:25];(way["golf"~"^(hole|green|tee)$"](${b});node["golf"~"^(green|tee)$"](${b}););out geom;`;
  const ac = new AbortController(), t = setTimeout(() => ac.abort(), 30000);
  let r;
  try { r = await fetch(OVERPASS, { method: 'POST', body: 'data=' + encodeURIComponent(q), headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, signal: ac.signal }); }
  catch (err) { throw new Error(err.name === 'AbortError' ? '時間切れになりました（30秒）。手動で置いてください' : 'OSMに接続できませんでした。電波を確かめるか、手動で置いてください'); }
  finally { clearTimeout(t); }
  if ([429, 502, 503, 504].includes(r.status)) throw new Error('OSMのサーバーが混んでいます。しばらくしてからもう一度、または手動で置いてください');
  if (!r.ok) throw new Error(`OSMから取得できませんでした（${r.status}）。手動で置いてください`);
  try { return await r.json(); } catch (err) { throw new Error('OSMの返事を読めませんでした。手動で置いてください'); }
}

/* Overpass JSON → output (no network: tests feed it sample data).
   A golf=hole line runs from tee to green: its ends pick the nearest tee / green shape within 60 m (else the end itself).
   ref 1–9 goes to the first nine, 10–18 to the second, 19–27 to the third; a number found twice is left to the guide. */
function osmToDraft(json, input) {
  const els = (json && json.elements) || [];
  const pts = g => (g || []).filter(p => p && isFinite(p.lon) && isFinite(p.lat)).map(p => [p.lon, p.lat]);
  const mid = ps => { if (ps.length > 2 && ps[0][0] === ps[ps.length - 1][0] && ps[0][1] === ps[ps.length - 1][1]) ps = ps.slice(0, -1);
    return [ps.reduce((a, p) => a + p[0], 0) / ps.length, ps.reduce((a, p) => a + p[1], 0) / ps.length]; };
  const spot = x => x.type === 'node' ? (isFinite(x.lon) ? [x.lon, x.lat] : null) : (pts(x.geometry).length ? mid(pts(x.geometry)) : null);
  const kind = k => els.filter(x => x.tags && x.tags.golf === k);
  const greens = kind('green').map(spot).filter(Boolean), tees = kind('tee').map(spot).filter(Boolean);
  const used = new Set();
  const near = (list, p) => {
    let best = null, bd = 60;
    list.forEach(q => { const d = distM(p, q); if (d < bd) { bd = d; best = q; } });
    if (best) used.add(best);
    return best || p;
  };
  const byRef = {};
  kind('hole').forEach(x => {
    const ref = parseInt(x.tags.ref, 10), line = pts(x.geometry);
    if (ref >= 1 && line.length >= 2) (byRef[ref] = byRef[ref] || []).push({ x, line });
  });
  const holes = [];
  Object.keys(byRef).map(Number).sort((a, b) => a - b).forEach(ref => {
    const nine = input.nines[Math.floor((ref - 1) / NINE)];
    if (!nine || byRef[ref].length > 1) return;
    const { x, line } = byRef[ref][0], par = +x.tags.par;
    holes.push({ nine: nine.id, n: (ref - 1) % NINE + 1, par: [3, 4, 5, 6].includes(par) ? par : null,
      tee: near(tees, line[0]), green: near(greens, line[line.length - 1]), src: 'osm' });
  });
  const candidates = { greens: greens.filter(p => !used.has(p)), tees: tees.filter(p => !used.has(p)) };
  const note = holes.length || greens.length || tees.length
    ? `${holes.length}ホールを仮置きしました。番号のないグリーン${candidates.greens.length}・ティー${candidates.tees.length}を候補として表示します`
    : 'このゴルフ場にはOSMのデータがありませんでした。手動で置いてください';
  return { holes, candidates, note };
}

/* put a draft into the course being registered. Holes already placed by hand are kept as they are. */
function applyDraft(course, out) {
  let n = 0;
  out.holes.forEach(d => {
    const nine = course.nines.find(x => x.id === d.nine); if (!nine) return;
    const h = nine.holes[d.n - 1];
    if (registered(h) && h.src === 'manual') return;
    h.tee = d.tee; h.green = d.green; h.src = d.src || 'osm'; h.ok = false;
    if (d.par) h.par = d.par;
    n++;
  });
  return n;
}
