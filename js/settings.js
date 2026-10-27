/* golf3d — settings: the settings sheet (grouped list) and its sub-screens
   Plain scripts loaded in order from index.html (no build step); they share top-level names. */
"use strict";

/* settings */
const openSheet = id => { $('menu').hidden = $('setup').hidden = $('players').hidden = $('share').hidden = true; $(id).hidden = false; };
// in-page confirm: ask('question', 'note', 'button', () => { ...done on yes })
function ask(q, note, yes, onYes) {
  $('askQ').textContent = q; $('askNote').textContent = note; $('askYes').textContent = yes;
  $('askYes').onclick = () => { $('ask').hidden = true; onYes(); };
  $('ask').hidden = false; $('askNo').focus();
}
$('askNo').onclick = () => $('ask').hidden = true;
// something to lose when the course or the round's nines change: scores entered or pins placed
const roundHasData = () => Object.keys(S.round.pins).length > 0 || Object.values(S.score.strokes).some(a => a && a.some(v => v != null));
function clearRound() {
  S.round.pins = {}; saveRound();
  S.score.strokes = {}; saveScore();
}
const OFF_KEY = 'golf3d.offline';  // { sig } of the course whose map was last saved to this phone
const courseSig = () => JSON.stringify(allHoles().map(h => [h.tee, h.green]));
const offSaved = () => { const o = loadJSON(OFF_KEY); return !!(o && o.sig === courseSig()); };
let offState = null;  // { pct } while the map is being saved
const M_TITLE = { mMain: '設定', mJump: 'コースの切り替え', mNine: 'ナインの選択', mTest: 'テスト用の機能' };
function mShow(id) {  // the main list, or one of its sub-screens
  Object.keys(M_TITLE).forEach(x => $(x).hidden = x !== id);
  $('mBack').hidden = id === 'mMain'; $('menuTitle').textContent = M_TITLE[id];
  $('menu').scrollTop = 0;
}
function renderMenu() {
  $('cnText').textContent = S.course.name || '名前なし';
  const all = allHoles(), n = all.filter(registered).length;  // every nine of the course
  $('ckSetupMark').className = 'ck ' + (n === all.length ? 'ok' : 'no'); $('ckSetupVal').textContent = `${n} / ${all.length}ホール`;
  const saved = offSaved() && !offState, busy = offState && `保存中 ${offState.pct}%`;
  $('ckOffMark').className = 'ck ' + (saved ? 'ok' : 'no');
  $('ckOffVal').textContent = busy || (saved ? '保存済み' : '保存する');
  $('offVal').textContent = busy || (saved ? '保存済み' : '未保存');
  $('offInfo').textContent = `約${Math.max(1, Math.round(offTiles().list.length * 25 / 1024))}MB・電波がなくても地図が見られる`;
  $('mvNine').textContent = playNines().map(x => x.name).join(' → ');
  $('mvPlayers').textContent = `${allPlayers().length}人`;
  $('mvShare').textContent = room ? room.code : '';
  const pins = Object.keys(S.round.pins).length;
  $('mvPins').textContent = pins ? `${pins}ホール設定中` : 'なし'; $('pinReset').disabled = !pins;
  $('bElev').setAttribute('aria-checked', !!S.prefs.elev);
}
$('bMenu').onclick = () => { mShow('mMain'); renderMenu(); openSheet('menu'); };
$('menuClose').onclick = () => { cnDone(); $('menu').hidden = true; };
$('mBack').onclick = () => mShow('mMain');
// course name: pencil turns the name into a text field
function cnDone() {
  const inp = $('courseName'); if (inp.hidden) return;
  const v = inp.value.trim(); if (v) { S.course.name = v; saveCourse(); }
  inp.hidden = true; $('cnText').hidden = false; renderMenu();
}
$('cnEdit').onclick = () => {
  const inp = $('courseName');
  if (!inp.hidden) { cnDone(); return; }
  inp.value = S.course.name || ''; inp.hidden = false; $('cnText').hidden = true; inp.focus(); inp.select();
};
$('courseName').onblur = cnDone;
$('courseName').onkeydown = e => { if (e.key === 'Enter' && !e.isComposing) $('courseName').blur(); };  // not while converting kana
$('ckSetup').onclick = $('goSetup').onclick = () => openSetup();
$('ckOff').onclick = $('offSave').onclick = () => offSaveRun();
$('goJump').onclick = () => mShow('mJump');
$('goTest').onclick = () => mShow('mTest');
// front / back nine of the round: one list each; the same nine twice is allowed (9-hole courses)
function renderNinePick() {
  [['nineFront', 'front'], ['nineBack', 'back']].forEach(([box, side]) => {
    const g = $(box); g.textContent = '';
    S.course.nines.forEach(x => {
      const on = S.round[side] === x.id, done = x.holes.filter(registered).length;
      const b = el('button', 'mrow');
      b.setAttribute('aria-pressed', on);
      b.append(el('span', 'mtx', x.name || '名前なし'), el('span', 'mval', `登録 ${done}/${NINE}`), el('span', 'pick', on ? '✓' : ''));
      b.onclick = () => { if (!on) setNine(side, x.id); };
      g.appendChild(b);
    });
  });
}
// changing a nine re-numbers the round, so entered scores and pins would no longer fit: ask first
function setNine(side, id) {
  const apply = () => {
    if (roundHasData()) clearRound();
    S.round[side] = id; saveRound();
    N = 1; S.tap = null; savePrefs(); refresh(); renderNinePick(); renderMenu();
    if (registered(hole())) camera(S.view);
  };
  if (roundHasData()) ask(`${side === 'front' ? '前半' : '後半'}を「${nineOf(id).name}」に変えますか？`, '今のスコアとピン位置は消えます', '変える', apply);
  else apply();
}
$('goNine').onclick = () => { renderNinePick(); mShow('mNine'); };
$('goSim').onclick = () => { $('menu').hidden = true; camKeep(); S.mode = 'me'; refresh(); };
$('bElev').onclick = () => { S.prefs.elev = !S.prefs.elev; savePrefs(); refresh(); renderMenu(); };
// undo bar: a few seconds to take back the last action
let snackT = null;
function snack(text, undo) {
  $('snackText').textContent = text; $('snack').hidden = false;
  $('snackUndo').onclick = () => { clearTimeout(snackT); $('snack').hidden = true; undo(); };
  clearTimeout(snackT); snackT = setTimeout(() => $('snack').hidden = true, 5000);
}
$('pinReset').onclick = () => {
  const prev = S.round.pins, n = Object.keys(prev).length;
  S.round = { pins: {} }; saveRound(); refresh(); renderMenu();
  snack(`ピン位置を消しました（${n}ホール）`, () => { S.round.pins = prev; saveRound(); refresh(); if (!$('menu').hidden) renderMenu(); });
};
