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
/* courses used before on this phone (golf3d.courses, js/state.js): tap one to use it again, × to forget it */
function renderLib() {
  const g = $('libList'), lib = loadLib(); g.textContent = '';
  $('libNone').hidden = lib.length > 0; g.hidden = !lib.length;
  lib.forEach(e => {
    const c = toCourse(e.course); if (!c) return;
    const cur = e.name === S.course.name, all = c.nines.flatMap(x => x.holes), d = new Date(e.at);
    const row = el('div', 'mrow lib'), b = el('button', 'mtx libgo', e.name);
    b.append(el('small', '', `${c.nines.map(x => x.name).join('・')}　${all.filter(registered).length}/${all.length}ホール　${d.getMonth() + 1}/${d.getDate()}`));
    row.append(b);
    if (cur) { b.disabled = true; row.append(el('span', 'mval', '使用中')); }
    else {
      b.onclick = () => {
        const go = () => { $('menu').hidden = true; useCourse(c, `「${c.name}」に切り替えました`); };
        if (roundHasData()) ask(`「${c.name}」に切り替えますか？`, '今のスコアとピン位置は消えます', '切り替える', go);
        else go();
      };
      const x = el('button', 'libdel', '×'); x.setAttribute('aria-label', `「${e.name}」を一覧から消す`);
      x.onclick = () => ask(`「${e.name}」を一覧から消しますか？`, '消すと元に戻せません', '消す', () => {
        saveJSON(LIB_KEY, loadLib().filter(y => y.name !== e.name)); renderLib();
      });
      row.append(x);
    }
    g.append(row);
  });
}
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
$('wipeBtn').onclick = () => ask(`「${S.course.name || 'このコース'}」の登録を消しますか？`, 'スコアとピン位置も消えます。消す前のコースは「別のコースに切り替え」の一覧から戻せます', '消す', () => {
  const c = blankCourse(); c.name = S.course.name; c.center = S.course.center;
  useCourse(c, '登録を消しました'); renderMenu();
});
