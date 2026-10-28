/* golf3d — geo: distances, bearings and tile coordinates
   Plain scripts loaded in order from index.html (no build step); they share top-level names. */
"use strict";

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
