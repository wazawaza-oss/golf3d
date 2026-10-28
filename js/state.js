/* golf3d — state: shared state S, saving / loading, the course model, and small helpers ($, el, toast)
   Plain scripts loaded in order from index.html (no build step); they share top-level names. */
"use strict";

const $ = id => document.getElementById(id);
const GSI = 'https://cyberjapandata.gsi.go.jp/xyz/';
const CACHE_NAME = 'golf3d-tiles-v1';
const YD = 0.9144;
const DEFAULT_CENTER = [139.101508, 35.223713];

/* ================= course: golf club → nines → holes 1–9 =================
   course = { v: 2, name, center, nines: [{ id, name, holes: [{ n: 1..9, par, tee, green, src: 'manual'|'osm'|'ai', ok }] }] }
   A round plays two nines, front then back (the same nine twice on a 9-hole course), as holes 1–18. */
const NINE = 9, ROUND = 2 * NINE;
const NINE_NAMES = ['OUT', 'IN', '東', '西', '南', '北', '中'];
const SOURCES = ['manual', 'osm', 'ai'];
const newId = p => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const blankHole = n => ({ n, par: 4, tee: null, green: null, src: 'manual', ok: false });
const blankNine = (name, id) => ({ id: id || newId('n'), name, holes: Array.from({ length: NINE }, (_, i) => blankHole(i + 1)) });
const blankCourse = () => ({ v: 2, name: 'テストコース', center: DEFAULT_CENTER, nines: [blankNine('OUT', 'out'), blankNine('IN', 'in')] });
// a hole from a file or old data; holes placed by hand before this format count as checked
const cleanHole = (h, i) => ({
  n: i + 1, par: [3, 4, 5, 6].includes(+h.par) ? +h.par : 4, tee: h.tee || null, green: h.green || null,
  src: SOURCES.includes(h.src) ? h.src : 'manual', ok: 'ok' in h ? !!h.ok : !!(h.tee && h.green)
});
// the current format, or the old 18-hole one (→ OUT = 1–9, IN = 10–18); null if it is neither
function toCourse(c) {
  if (!c || typeof c !== 'object') return null;
  const base = { v: 2, name: String(c.name || 'コース').slice(0, 40), center: Array.isArray(c.center) ? c.center : DEFAULT_CENTER };
  if (Array.isArray(c.nines) && c.nines.length && c.nines.every(x => x && Array.isArray(x.holes) && x.holes.length === NINE))
    return Object.assign(base, { nines: c.nines.map((x, k) => ({ id: String(x.id || 'n' + k), name: String(x.name || NINE_NAMES[k] || `ナイン${k + 1}`).slice(0, 12), holes: x.holes.map(cleanHole) })) });
  if (Array.isArray(c.holes) && c.holes.length === ROUND)
    return Object.assign(base, { nines: [{ id: 'out', name: 'OUT', holes: c.holes.slice(0, NINE).map(cleanHole) }, { id: 'in', name: 'IN', holes: c.holes.slice(NINE).map(cleanHole) }] });
  return null;
}
// older phones keep their 18-hole course: it is converted once, and the original is kept as golf3d.course.v1backup
function loadCourse() {
  const raw = loadJSON('golf3d.course'), old = raw && !Array.isArray(raw.nines) && Array.isArray(raw.holes);
  if (old && !loadJSON('golf3d.course.v1backup')) saveJSON('golf3d.course.v1backup', raw);
  const c = toCourse(raw) || blankCourse();
  if (old) saveJSON('golf3d.course', c);
  return c;
}

/* ================= state ================= */
function loadJSON(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } }
function saveJSON(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
const S = {
  course: loadCourse(),
  round: loadJSON('golf3d.round') || { pins: {} },  // { pins: { 1..18: [lng, lat] }, front, back } (nine ids)
  su: null,  // course setup in progress: { nine: id, n: 1..9 }
  prefs: Object.assign({ elev: true, gps: false, n: 1, setupMin: matchMedia('(max-width:700px)').matches }, loadJSON('golf3d.prefs') || {}),
  score: (() => { const s = loadJSON('golf3d.score'); return s && Array.isArray(s.players) && s.players.length ? s : { players: [{ id: 'p1', name: '自分' }], strokes: {} }; })(),
  is3D: false, view: 'tee', mode: null, me: null, tap: null, watch: null, wake: null, page: 'map'
};
let N = clampHole(S.prefs.n);
function clampHole(n) { return Math.min(ROUND, Math.max(1, n | 0 || 1)); }
const nineOf = id => S.course.nines.find(x => x.id === id) || S.course.nines[0];
// the round's two nines; with two nines in the course they are simply those, otherwise the first ones until picked
function fixRound() {
  const ids = S.course.nines.map(x => x.id);
  if (!ids.includes(S.round.front)) S.round.front = ids[0];
  if (!ids.includes(S.round.back)) S.round.back = ids.find(i => i !== S.round.front) || ids[0];
}
fixRound();
const localNines = () => [nineOf(S.round.front), nineOf(S.round.back)];  // this phone's own course
// in a competition everyone plays the organizer's two nines (compNines, js/share.js); otherwise this phone's
const playNines = () => compNines() || localNines();
const playHoles = () => playNines().flatMap(x => x.holes);  // holes 1–18 of this round (the course's own hole objects)
const allHoles = () => S.course.nines.flatMap(x => x.holes);
const halves = () => playNines().map((x, k) => ({ name: x.name, from: k * NINE }));  // score-card blocks: front, back
// while the setup sheet is open, "the hole" is the one being registered (any nine), not the round's hole N
const inSetup = () => !!S.su && !$('setup').hidden;
const hole = () => inSetup() ? nineOf(S.su.nine).holes[S.su.n - 1] : playHoles()[N - 1];
// a pin you placed yourself, else the one the organizer handed out, else the green's centre
const pinLL = () => (!inSetup() && (S.round.pins[N] || compPin(N))) || hole().green;
const holeNo = () => inSetup() ? S.su.n : N;  // the number shown in the panel
const saveCourse = () => saveJSON('golf3d.course', S.course);
const saveRound = () => saveJSON('golf3d.round', S.round);
const savePrefs = () => { S.prefs.n = N; saveJSON('golf3d.prefs', S.prefs); };
const registered = h => !!(h.tee && h.green);

/* small shared helpers: a short message at the top of the screen; making an element */
let toastT = null;
function toast(msg) { const t = $('toast'); t.textContent = msg; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => t.hidden = true, 2600); }
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
