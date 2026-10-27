/* golf3d — course: switching course location, export / import, deleting the course
   Plain scripts loaded in order from index.html (no build step); they share top-level names. */
"use strict";

$('jumpGo').onclick = () => {
  const u = $('jumpUrl').value;
  let m = u.match(/lat=(-?[\d.]+)&lon=(-?[\d.]+)/) || null, ll = null, z = 16;
  if (m) ll = [+m[2], +m[1]];
  else if ((m = u.match(/#(\d+(?:\.\d+)?)\/(-?[\d.]+)\/(-?[\d.]+)/))) { z = +m[1]; ll = [+m[3], +m[2]]; }
  if (!ll || !isFinite(ll[0]) || !isFinite(ll[1])) { toast('URLから場所を読み取れませんでした'); return; }
  S.course.center = ll; saveCourse(); $('menu').hidden = true;
  map.jumpTo({ center: ll, zoom: Math.max(15, Math.min(18, z)), bearing: 0, pitch: S.is3D ? 60 : 0 });
};
$('exportBtn').onclick = () => {
  const blob = new Blob([JSON.stringify(S.course, null, 1)], { type: 'application/json' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `${S.course.name || 'course'}.json`;
  document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
};
$('importBtn').onclick = () => $('importFile').click();
$('importFile').onchange = async e => {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  try {
    const c = JSON.parse(await f.text());
    if (!Array.isArray(c.holes) || c.holes.length !== 18) throw 0;
    S.course = { name: String(c.name || 'コース'), center: c.center || DEFAULT_CENTER, holes: c.holes.map((h, i) => ({ n: i + 1, par: [3, 4, 5].includes(+h.par) ? +h.par : 4, tee: h.tee || null, green: h.green || null })) };
    saveCourse(); S.round = { pins: {} }; saveRound(); N = 1; $('menu').hidden = true; refresh();
    if (registered(hole())) camera(S.view); else map.jumpTo({ center: S.course.center, zoom: 16 });
    toast(`「${S.course.name}」を読み込みました`);
  } catch (err) { toast('このファイルは読み込めませんでした'); }
};
// deleting the course asks inside the sheet (no browser confirm())
$('wipeBtn').onclick = () => { $('wipeQ').textContent = `「${S.course.name || 'このコース'}」の登録を消しますか？`; $('wipeAsk').hidden = false; $('wipeNo').focus(); };
$('wipeNo').onclick = () => $('wipeAsk').hidden = true;
$('wipeYes').onclick = () => {
  $('wipeAsk').hidden = true;
  S.course.holes = blankHoles(); saveCourse(); S.round = { pins: {} }; saveRound(); N = 1; S.tap = null; refresh(); renderMenu(); toast('登録を消しました');
};

