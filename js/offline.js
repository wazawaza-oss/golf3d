/* golf3d — offline: saving the course map to this phone
   Plain scripts loaded in order from index.html (no build step); they share top-level names. */
"use strict";

/* offline save */
function offTiles() {
  const pts = []; S.course.holes.forEach(h => { if (h.tee) pts.push(h.tee); if (h.green) pts.push(h.green); });
  let w, s, e, n;
  if (pts.length) {
    w = Math.min(...pts.map(p => p[0])); e = Math.max(...pts.map(p => p[0])); s = Math.min(...pts.map(p => p[1])); n = Math.max(...pts.map(p => p[1]));
    const dLat = 220 / 111320, dLng = 220 / (111320 * Math.cos(rad((s + n) / 2)));
    w -= dLng; e += dLng; s -= dLat; n += dLat;
  } else { const b = map.getBounds(); w = b.getWest(); e = b.getEast(); s = b.getSouth(); n = b.getNorth(); }
  const list = [];
  const range = (z, fn) => { const x0 = Math.floor(lng2x(w, z)), x1 = Math.floor(lng2x(e, z)), y0 = Math.floor(lat2y(n, z)), y1 = Math.floor(lat2y(s, z)); for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) fn(x, y); };
  for (let z = 12; z <= 18; z++) range(z, (x, y) => list.push({ kind: 'photo', z, x, y }));
  for (let z = 12; z <= 15; z++) range(z, (x, y) => list.push({ kind: 'dem', z, x, y }));
  return { list, fromHoles: pts.length > 0 };
}
// save the aerial photos and elevation around the course to this phone; progress shows in the settings rows
async function offSaveRun() {
  if (offState) return;
  if (!(await openCache())) { toast('このブラウザでは端末に保存できません'); return; }
  const { list } = offTiles(); let done = 0, fail = 0, i = 0;
  offState = { pct: 0 }; renderMenu();
  const worker = async () => {
    while (i < list.length) {
      const t = list[i++];
      try {
        if (t.kind === 'photo') { if (!(await tileBlob(`${GSI}seamlessphoto/${t.z}/${t.x}/${t.y}.jpg`))) fail++; }
        else if (!(await heights(t.z, t.x, t.y))) fail++;
      } catch (e) { fail++; }
      const p = Math.floor(++done / list.length * 100);
      if (p !== offState.pct) { offState.pct = p; if (!$('menu').hidden) renderMenu(); }
    }
  };
  await Promise.all(Array.from({ length: 6 }, worker));
  offState = null;
  const ok = fail <= list.length * .3;
  if (ok) saveJSON(OFF_KEY, { sig: courseSig(), at: Date.now() });
  renderMenu();
  toast(ok ? '端末に保存しました。電波がなくても地図が見られます' : '一部しか保存できませんでした。電波の良い場所でもう一度お試しください');
}

