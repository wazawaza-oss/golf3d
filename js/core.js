/* golf3d — core: shared helpers, geo math and app state
   Plain scripts loaded in order from index.html (no build step); they share top-level names. */
"use strict";

const $ = id => document.getElementById(id);
const GSI = 'https://cyberjapandata.gsi.go.jp/xyz/';
const CACHE_NAME = 'golf3d-tiles-v1';
const YD = 0.9144;
const DEFAULT_CENTER = [139.101508, 35.223713];

/* ================= geo math ================= */
const rad = d => d * Math.PI / 180, deg = r => r * 180 / Math.PI;
function distM(a, b) {
  const R = 6371008.8, p1 = rad(a[1]), p2 = rad(b[1]), dp = p2 - p1, dl = rad(b[0] - a[0]);
  const h = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
const yards = (a, b) => distM(a, b) / YD;
function bearing(a, b) {
  const p1 = rad(a[1]), p2 = rad(b[1]), dl = rad(b[0] - a[0]);
  const y = Math.sin(dl) * Math.cos(p2), x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl);
  return (deg(Math.atan2(y, x)) + 360) % 360;
}
const lerpLL = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
const lng2x = (lng, z) => (lng + 180) / 360 * 2 ** z;
const lat2y = (lat, z) => { const r = rad(lat); return (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * 2 ** z; };


/* ================= state ================= */
const blankHoles = () => Array.from({ length: 18 }, (_, i) => ({ n: i + 1, par: 4, tee: null, green: null }));
function loadJSON(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } }
function saveJSON(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
const S = {
  course: (() => { const c = loadJSON('golf3d.course'); return c && Array.isArray(c.holes) && c.holes.length === 18 ? c : { name: 'テストコース', center: DEFAULT_CENTER, holes: blankHoles() }; })(),
  round: loadJSON('golf3d.round') || { pins: {} },
  prefs: Object.assign({ elev: true, gps: false, n: 1, setupMin: matchMedia('(max-width:700px)').matches }, loadJSON('golf3d.prefs') || {}),
  score: (() => { const s = loadJSON('golf3d.score'); return s && Array.isArray(s.players) && s.players.length ? s : { players: [{ id: 'p1', name: '自分' }], strokes: {} }; })(),
  is3D: false, view: 'tee', mode: null, me: null, tap: null, watch: null, wake: null, page: 'map'
};
let N = clampHole(S.prefs.n);
function clampHole(n) { return Math.min(18, Math.max(1, n | 0 || 1)); }
const hole = () => S.course.holes[N - 1];
const pinLL = () => S.round.pins[N] || hole().green;
const saveCourse = () => saveJSON('golf3d.course', S.course);
const saveRound = () => saveJSON('golf3d.round', S.round);
const savePrefs = () => { S.prefs.n = N; saveJSON('golf3d.prefs', S.prefs); };
const registered = h => !!(h.tee && h.green);

