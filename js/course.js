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
// export: the nine-based format (v: 2)
$('exportBtn').onclick = () => {
  const blob = new Blob([JSON.stringify(S.course, null, 1)], { type: 'application/json' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `${S.course.name || 'course'}.json`;
  document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
};
// a new course (or the same one re-imported) starts a fresh round on its first two nines
function useCourse(c, msg) {
  S.course = c; saveCourse();
  S.round = { pins: {} }; fixRound(); saveRound();
  S.score.strokes = {}; saveScore();
  N = 1; S.tap = null; savePrefs(); refresh();
  if (registered(hole())) camera(S.view); else map.jumpTo({ center: S.course.center, zoom: 16 });
  toast(msg);
}
// import: the nine-based format, or an old 18-hole file (read as OUT / IN)
$('importBtn').onclick = () => $('importFile').click();
$('importFile').onchange = async e => {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  let c = null;
  try { c = toCourse(JSON.parse(await f.text())); } catch (err) {}
  if (!c) { toast('このファイルは読み込めませんでした'); return; }
  const go = () => { $('menu').hidden = true; useCourse(c, `「${c.name}」を読み込みました`); };
  if (roundHasData()) ask(`「${c.name}」に切り替えますか？`, '今のスコアとピン位置は消えます', '切り替える', go);
  else go();
};
// deleting the course asks inside the page (no browser confirm()); it leaves two empty nines, OUT and IN
$('wipeBtn').onclick = () => ask(`「${S.course.name || 'このコース'}」の登録を消しますか？`, '消すと元に戻せません（スコアとピン位置も消えます）', '消す', () => {
  const c = blankCourse(); c.name = S.course.name; c.center = S.course.center;
  useCourse(c, '登録を消しました'); renderMenu();
});
