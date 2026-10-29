/* golf3d — menu: the settings sheet (grouped list) and its sub-screens
   Plain scripts loaded in order from index.html (no build step); they share top-level names. */
"use strict";

/* settings */
let fromMenu = false;  // the sheet now open was opened from settings: closing it goes back there
const openSheet = id => { fromMenu = id !== 'menu' && !$('menu').hidden; $('menu').hidden = $('setup').hidden = $('players').hidden = true; $(id).hidden = false; };
// in-page confirm: ask('question', 'note', 'button', () => { ...done on yes })
function ask(q, note, yes, onYes) {
  $('askQ').textContent = q; $('askNote').textContent = note; $('askYes').textContent = yes;
  $('askYes').onclick = () => { $('ask').hidden = true; onYes(); };
  $('ask').hidden = false; $('askNo').focus();
}
$('askNo').onclick = () => $('ask').hidden = true;
// something to lose when the course or the round's nines change: scores entered or pins placed
const roundHasData = () => Object.keys(S.round.pins).length > 0 || Object.keys(S.round.tees).length > 0 || Object.values(S.score.strokes).some(a => a && a.some(v => v != null));
function clearRound() {
  S.round.pins = {}; S.round.tees = {}; saveRound();
  S.score.strokes = {}; saveScore();
}
const OFF_KEY = 'golf3d.offline';  // { sig } of the course whose map was last saved to this phone
const courseSig = () => JSON.stringify((comp ? playHoles() : allHoles()).map(h => [h.tee, h.green]));
const offSaved = () => { const o = loadJSON(OFF_KEY); return !!(o && o.sig === courseSig()); };
let offState = null;  // { pct } while the map is being saved
const M_TITLE = { mMain: '設定', mJump: 'コースの切り替え', mNine: 'ナインの選択', mTest: 'テスト用の機能' };
const M_RENDER = { mMain: () => renderMenu(), mNine: () => renderNinePick() };  // redraw a screen when coming back to it
let mStack = ['mMain'];  // the screens passed through to get here; ‹ goes back one
function mShow(id, replace) {  // the main list, or one of its sub-screens
  if (id === 'mMain') mStack = ['mMain'];
  else { const i = mStack.indexOf(id); if (i >= 0) mStack.length = i + 1; else { if (replace && mStack.length > 1) mStack.pop(); mStack.push(id); } }
  mPaint();
}
function mPaint() {
  const id = mStack[mStack.length - 1], prev = mStack[mStack.length - 2];
  Object.keys(M_TITLE).forEach(x => $(x).hidden = x !== id);
  $('mBack').hidden = !prev; $('mBack').textContent = prev ? `‹ ${M_TITLE[prev]}` : '';
  $('menuTitle').textContent = M_TITLE[id];
  $('menu').scrollTop = 0;
}
// open settings at the top, or (keep) back on the screen that opened another sheet
function openMenu(keep) {
  if (!keep) mStack = ['mMain'];
  openSheet('menu'); mStack.forEach(x => M_RENDER[x] && M_RENDER[x]()); mPaint();
}
const backToMenu = () => { if (fromMenu) { fromMenu = false; openMenu(true); } };
function renderMenu() {
  $('cnText').textContent = (comp && comp.course && comp.course.club) || S.course.name || '名前なし';  // in a competition: the organizer's course
  renderCompRow(); applyRoles();
  const all = allHoles(), n = all.filter(registered).length;  // every nine of the course
  $('ckSetupMark').className = 'ck ' + (n === all.length ? 'ok' : 'no'); $('ckSetupVal').textContent = `${n} / ${all.length}ホール`;
  const saved = offSaved() && !offState, busy = offState && `保存中 ${offState.pct}%`;
  $('ckOffMark').className = 'ck ' + (saved ? 'ok' : 'no');
  $('ckOffVal').textContent = busy || (saved ? '保存済み' : '保存する');
  $('offVal').textContent = busy || (saved ? '保存済み' : '未保存');
  $('offInfo').textContent = `約${Math.max(1, Math.round(offTiles().list.length * 25 / 1024))}MB・電波がなくても地図が見られる`;
  $('mvNine').textContent = localNines().map(x => x.name).join(' → ');
  $('mvPlayers').textContent = `${allPlayers().length}人`;
  const handed = comp && comp.role === 'org' ? Object.keys(comp.pins || {}).filter(k => comp.pins[k]).map(k => +k.slice(1)) : [];
  const pins = new Set(Object.keys(S.round.pins).map(Number).concat(handed)).size, tees = Object.keys(S.round.tees).length;  // yours + handed out
  $('mvPins').textContent = [pins && `ピン${pins}`, tees && `ティー${tees}`].filter(Boolean).join('・') || 'なし'; $('pinReset').disabled = !pins && !tees;
  $('bElev').setAttribute('aria-checked', !!S.prefs.elev);
  $('bRings').setAttribute('aria-checked', !!S.prefs.rings);
}
$('bMenu').onclick = () => openMenu();
$('menuClose').onclick = () => { cnDone(); $('menu').hidden = true; };
$('mBack').onclick = () => { mStack.pop(); const id = mStack[mStack.length - 1]; if (M_RENDER[id]) M_RENDER[id](); mPaint(); };
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
  // in a competition the organizer's nines are everyone's course: changing one clears everyone's scores and pins
  const org = comp && comp.role === 'org';
  const has = org ? Object.keys(comp.scores || {}).length > 0 || Object.keys(comp.pins || {}).length > 0 : roundHasData();
  const apply = async () => {
    if (has) { if (org) await compClearRound().catch(() => {}); else clearRound(); }
    S.round[side] = id; saveRound();
    if (org) compPublishCourse().catch(() => toast('配れませんでした。電波のある所でもう一度選んでください'));
    N = 1; S.tap = null; savePrefs(); refresh(); renderNinePick(); renderMenu();
    if (registered(hole())) camera(S.view);
  };
  if (has) ask(`${side === 'front' ? '前半' : '後半'}を「${nineOf(id).name}」に変えますか？`, org ? '全員のスコアと配ったピン位置が消えます' : '今のスコアとピン位置は消えます', '変える', apply);
  else apply();
}
$('goNine').onclick = () => { renderNinePick(); mShow('mNine'); };
$('goSim').onclick = () => { $('menu').hidden = true; camKeep(); S.mode = 'me'; refresh(); };
$('bElev').onclick = () => { S.prefs.elev = !S.prefs.elev; savePrefs(); refresh(); renderMenu(); };
$('bRings').onclick = () => { S.prefs.rings = !S.prefs.rings; savePrefs(); refresh(); renderMenu(); };
// undo bar: a few seconds to take back the last action
let snackT = null;
function snack(text, undo) {
  $('snackText').textContent = text; $('snack').hidden = false;
  $('snackUndo').onclick = () => { clearTimeout(snackT); $('snack').hidden = true; undo(); };
  clearTimeout(snackT); snackT = setTimeout(() => $('snack').hidden = true, 5000);
}
$('pinReset').onclick = () => {
  const prev = S.round.pins, prevTees = S.round.tees;
  // the organizer's reset also takes back the pins handed out in the competition (undo puts them back)
  const org = comp && comp.role === 'org', prevComp = org ? comp.pins || {} : null;
  const setCompPins = p => { comp.pins = p; saveComp(); fb().then(f => f.D.set(f.D.ref(f.db, cp('pins')), Object.keys(p).length ? p : null)).catch(() => {}); };
  S.round.pins = {}; S.round.tees = {}; saveRound(); if (org) setCompPins({}); refresh(); renderMenu();  // keep the round's front / back nines
  snack('ピンとティーを登録した位置に戻しました', () => { S.round.pins = prev; S.round.tees = prevTees; saveRound(); if (org && comp) setCompPins(prevComp); refresh(); if (!$('menu').hidden) renderMenu(); });
};
