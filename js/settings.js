/* golf3d — settings: the settings sheet (grouped list) and its sub-screens
   Plain scripts loaded in order from index.html (no build step); they share top-level names. */
"use strict";

/* settings */
const openSheet = id => { $('menu').hidden = $('setup').hidden = $('players').hidden = $('share').hidden = true; $(id).hidden = false; };
const OFF_KEY = 'golf3d.offline';  // { sig } of the course whose map was last saved to this phone
const courseSig = () => JSON.stringify(S.course.holes.map(h => [h.tee, h.green]));
const offSaved = () => { const o = loadJSON(OFF_KEY); return !!(o && o.sig === courseSig()); };
let offState = null;  // { pct } while the map is being saved
const M_TITLE = { mMain: '設定', mJump: 'コースの切り替え', mTest: 'テスト用の機能' };
function mShow(id) {  // the main list, or one of its sub-screens
  Object.keys(M_TITLE).forEach(x => $(x).hidden = x !== id);
  $('mBack').hidden = id === 'mMain'; $('menuTitle').textContent = M_TITLE[id];
  $('menu').scrollTop = 0;
}
function renderMenu() {
  $('cnText').textContent = S.course.name || '名前なし';
  const n = S.course.holes.filter(registered).length;
  $('ckSetupMark').className = 'ck ' + (n === 18 ? 'ok' : 'no'); $('ckSetupVal').textContent = `${n} / 18ホール`;
  const saved = offSaved() && !offState, busy = offState && `保存中 ${offState.pct}%`;
  $('ckOffMark').className = 'ck ' + (saved ? 'ok' : 'no');
  $('ckOffVal').textContent = busy || (saved ? '保存済み' : '保存する');
  $('offVal').textContent = busy || (saved ? '保存済み' : '未保存');
  $('offInfo').textContent = `約${Math.max(1, Math.round(offTiles().list.length * 25 / 1024))}MB・電波がなくても地図が見られる`;
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
