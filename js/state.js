/* golf3d — state: shared state S, saving / loading, the course model, and small helpers ($, el, toast)
   Plain scripts loaded in order from index.html (no build step); they share top-level names. */
"use strict";

const $ = id => document.getElementById(id);
const GSI = 'https://cyberjapandata.gsi.go.jp/xyz/';
const CACHE_NAME = 'golf3d-tiles-v1';
const YD = 0.9144;
const DEFAULT_CENTER = [139.101508, 35.223713];

/* ================= course: golf club → nines → holes 1–9 =================
   course = { v: 2, name, center, nines: [{ id, name, holes: [{ n: 1..9, par, hdcp, tee, green, src: 'manual'|'osm'|'ai', ok, yd }] }],
              tees: [{ id, name, color }], baseTee, area }
   hdcp: the hole's handicap 1–18 from the score card, or null (older data has none).
   tee is the base colour's tee (baseTee, e.g. white); yd = { teeId: yards } (may be empty). The other colours' tees are
   not stored: teeLL works them out from the yardage difference, so they are always shown as estimates ("仮").
   area = { bbox: [w, s, e, n], osm, name } of the golf club found by the search (or null).
   A round plays two nines, front then back (the same nine twice on a 9-hole course), as holes 1–18. */
const NINE = 9, ROUND = 2 * NINE;
const NINE_NAMES = ['OUT', 'IN', '東', '西', '南', '北', '中'];
const SOURCES = ['manual', 'osm', 'ai'];
const newId = p => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const defaultTees = () => [{ id: 'blue', name: '青', color: '#1f5fd1' }, { id: 'white', name: '白', color: '#ffffff' }, { id: 'red', name: '赤', color: '#d93025' }];
const blankHole = n => ({ n, par: 4, hdcp: null, tee: null, green: null, src: 'manual', ok: false, yd: {} });
const cleanHdcp = v => typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= 18 ? v : null;
const blankNine = (name, id) => ({ id: id || newId('n'), name, holes: Array.from({ length: NINE }, (_, i) => blankHole(i + 1)) });
const UNNAMED = '未登録のコース', OLD_UNNAMED = 'テストコース';  // the name before a golf club is chosen (older versions: テストコース)
const blankCourse = () => ({ v: 2, name: UNNAMED, center: DEFAULT_CENTER, nines: [blankNine('OUT', 'out'), blankNine('IN', 'in')], tees: defaultTees(), baseTee: 'white', area: null });
const isLL = p => Array.isArray(p) && p.length === 2 && p.every(v => typeof v === 'number' && isFinite(v));
// a hole from a file or old data; holes placed by hand before this format count as checked
const cleanHole = (h, i) => ({
  n: i + 1, par: [3, 4, 5, 6].includes(+h.par) ? +h.par : 4, hdcp: cleanHdcp(h.hdcp), tee: isLL(h.tee) ? h.tee : null, green: isLL(h.green) ? h.green : null,
  src: SOURCES.includes(h.src) ? h.src : 'manual', ok: 'ok' in h ? !!h.ok : !!(h.tee && h.green),
  yd: h.yd && typeof h.yd === 'object' ? h.yd : {}
});
function cleanTees(t) {
  if (!Array.isArray(t) || !t.length) return defaultTees();
  const out = [];
  t.forEach(x => { if (x && x.id && !out.some(y => y.id === String(x.id).slice(0, 24))) out.push({ id: String(x.id).slice(0, 24), name: String(x.name || '色').slice(0, 8), color: /^#[0-9a-f]{6}$/i.test(x.color) ? x.color : '#888888' }); });
  return out.length ? out : defaultTees();
}
const cleanArea = a => a && Array.isArray(a.bbox) && a.bbox.length === 4 && a.bbox.every(v => typeof v === 'number' && isFinite(v))
  ? { bbox: a.bbox.slice(), osm: a.osm ? String(a.osm) : null, name: a.name ? String(a.name).slice(0, 80) : null } : null;
// the current format, or the old 18-hole one (→ OUT = 1–9, IN = 10–18); null if it is neither.
// Courses saved before tee colours existed get blue / white / red with white as the base (their tee is the white one).
function toCourse(c) {
  if (!c || typeof c !== 'object') return null;
  const tees = cleanTees(c.tees), ids = tees.map(x => x.id);
  const base = { v: 2, name: String(c.name || 'コース').slice(0, 40), center: isLL(c.center) ? c.center : DEFAULT_CENTER,
    tees, baseTee: ids.includes(c.baseTee) ? c.baseTee : ids.includes('white') ? 'white' : ids[0], area: cleanArea(c.area) };
  let nines = null;
  if (Array.isArray(c.nines) && c.nines.length && c.nines.every(x => x && Array.isArray(x.holes) && x.holes.length === NINE))
    nines = c.nines.map((x, k) => ({ id: String(x.id || 'n' + k), name: String(x.name || NINE_NAMES[k] || `ナイン${k + 1}`).slice(0, 12), holes: x.holes.map(cleanHole) }));
  else if (Array.isArray(c.holes) && c.holes.length === ROUND)
    nines = [{ id: 'out', name: 'OUT', holes: c.holes.slice(0, NINE).map(cleanHole) }, { id: 'in', name: 'IN', holes: c.holes.slice(NINE).map(cleanHole) }];
  if (!nines) return null;
  // yardages only for colours that exist, whole yards 1–999
  nines.forEach(x => x.holes.forEach(h => {
    const yd = {}; ids.forEach(id => { const v = Math.round(+h.yd[id]); if (v > 0 && v < 1000) yd[id] = v; }); h.yd = yd;
  }));
  return Object.assign(base, { nines });
}
/* the other colours' tees: on the line from the base tee to the green, moved by the yardage difference.
   A colour without a yardage (or a hole without the base yardage) sits on the base tee. */
function teeLL(h, id, c) {
  if (!h.tee) return null;
  const yd = h.yd || {}, yb = yd[c.baseTee], yt = yd[id];
  if (id === c.baseTee || !h.green || !(yb > 0) || !(yt > 0)) return h.tee;
  const len = distM(h.tee, h.green); if (!len) return h.tee;
  return lerpLL(h.tee, h.green, Math.max(-1, Math.min(.9, (yb - yt) * YD / len)));
}
/* a hole whose positions look wrong for its par (or for the yardage typed in): a message, else null.
   Only a warning — the hole is saved either way. */
const PAR_RANGE = { 3: [60, 260], 4: [220, 500], 5: [380, 650], 6: [450, 750] };
function holeIssue(h, c) {
  if (!registered(h)) return null;
  const d = Math.round(yards(h.tee, h.green)), [lo, hi] = PAR_RANGE[h.par] || [60, 750];
  if (d < lo || d > hi) return `パー${h.par}なのに、ティーからグリーンまで${d}Yあります`;
  const y = c && (h.yd || {})[c.baseTee];
  if (y > 0 && Math.abs(d - y) > Math.max(40, y * .2)) return `入力した${y}Yと、地図の上の${d}Yが離れています`;
  return null;
}
// the state shown in the course list: not set / please check / automatic (OSM, AI) / placed by hand
const holeState = (h, c) => !registered(h) ? 'none' : holeIssue(h, c) ? 'check' : h.src !== 'manual' ? 'auto' : 'manual';
const STATE_NAME = { none: '未設定', check: '要確認', auto: '自動', manual: '手動' };
// older phones keep their 18-hole course: it is converted once, and the original is kept as golf3d.course.v1backup
function loadCourse() {
  const raw = loadJSON('golf3d.course'), old = raw && !Array.isArray(raw.nines) && Array.isArray(raw.holes);
  if (old && !loadJSON('golf3d.course.v1backup')) saveJSON('golf3d.course.v1backup', raw);
  const c = toCourse(raw) || blankCourse();
  if (old) saveJSON('golf3d.course', c);
  if (c.name === OLD_UNNAMED && !c.nines.some(x => x.holes.some(h => h.tee && h.green))) c.name = UNNAMED;  // the old placeholder name, nothing placed yet
  return c;
}

/* ================= state ================= */
function loadJSON(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } }
function saveJSON(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
const S = {
  course: loadCourse(),
  round: loadJSON('golf3d.round') || { pins: {} },  // { pins: { 1..18: [lng, lat] }, tees: { 1..18: [lng, lat] }, front, back } (nine ids)
  su: null,  // guide in progress: { nine: id, n: 1..9, step: 'green'|'tee', only } (only: opened for one hole from the list)
  draft: null,  // course registration in progress (see DRAFT_KEY)
  prefs: Object.assign({ elev: true, rings: true, ringsAlpha: 50, device: null, devAdj: 0, gps: false, n: 1, setupMin: matchMedia('(max-width:700px)').matches }, loadJSON('golf3d.prefs') || {}),
  score: (() => { const s = loadJSON('golf3d.score'); return s && Array.isArray(s.players) && s.players.length ? s : { players: [{ id: 'p1', name: '自分' }], strokes: {} }; })(),
  is3D: false, view: 'tee', mode: null, me: null, tap: null, watch: null, wake: null, page: 'map'
};
S.view = ['tee', 'top', 'green'].includes(S.prefs.view) ? S.prefs.view : 'tee';  // kept over a reload (3D: S.prefs.is3D, turned on once the map is in)
let N = clampHole(S.prefs.n);
function clampHole(n) { return Math.min(ROUND, Math.max(1, n | 0 || 1)); }
const nineOf = id => S.course.nines.find(x => x.id === id) || S.course.nines[0];
// the round's two nines; with two nines in the course they are simply those, otherwise the first ones until picked
function fixRound() {
  const ids = S.course.nines.map(x => x.id);
  if (!ids.includes(S.round.front)) S.round.front = ids[0];
  if (!ids.includes(S.round.back)) S.round.back = ids.find(i => i !== S.round.front) || ids[0];
  if (!S.round.pins) S.round.pins = {};
  if (!S.round.tees) S.round.tees = {};  // rounds saved before tees could be moved
}
fixRound();
const localNines = () => [nineOf(S.round.front), nineOf(S.round.back)];  // this phone's own course
// in a competition everyone plays the organizer's two nines (compNines, js/share.js); otherwise this phone's
const playNines = () => compNines() || localNines();
const playHoles = () => playNines().flatMap(x => x.holes);  // holes 1–18 of this round (the course's own hole objects)
const allHoles = () => S.course.nines.flatMap(x => x.holes);
const halves = () => playNines().map((x, k) => ({ name: x.name, from: k * NINE }));  // score-card blocks: front, back
/* course registration works on a copy (the draft) until 確定; the copy is kept in golf3d.courseDraft so a reload
   does not lose it: { course, cand: { greens, tees }, fresh } (fresh: a different golf club, starts a new round) */
const DRAFT_KEY = 'golf3d.courseDraft';
const saveDraft = () => { if (S.draft) saveJSON(DRAFT_KEY, S.draft); };
const draftNine = id => S.draft.course.nines.find(x => x.id === id) || S.draft.course.nines[0];
// while the guide panel is open, "the hole" is the one being registered (any nine of the draft), not the round's hole N
const inSetup = () => !!S.su && !!S.draft && !$('setup').hidden;
const hole = () => inSetup() ? draftNine(S.su.nine).holes[S.su.n - 1] : playHoles()[N - 1];
// a pin you placed yourself, else the one the organizer handed out, else the green's centre
const pinLL = () => (!inSetup() && (S.round.pins[N] || compPin(N))) || hole().green;
const hasPin = () => !inSetup() && !!(S.round.pins[N] || compPin(N));  // otherwise distances go to the green's centre
const target = () => hasPin() ? 'ピン' : 'グリーン';  // what the distances are measured to (the green's centre without a pin), for labels
// today's tee: one you moved for this round (this phone only), else the registered one
const roundTee = () => (!inSetup() && S.round.tees[N]) || hole().tee;
const holeNo = () => inSetup() ? S.su.n : N;  // the number shown in the panel
const saveCourse = () => saveJSON('golf3d.course', S.course);
const saveRound = () => saveJSON('golf3d.round', S.round);
const savePrefs = () => { S.prefs.n = N; S.prefs.view = S.view; if (!inSetup()) S.prefs.is3D = S.is3D; saveJSON('golf3d.prefs', S.prefs); };  // the guide turns 3D off for a while
const registered = h => !!(h.tee && h.green);

/* small shared helpers: a short message at the top of the screen; making an element */
let toastT = null;
function toast(msg) { const t = $('toast'); t.textContent = msg; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => t.hidden = true, 2600); }
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
