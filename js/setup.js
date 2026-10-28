/* golf3d — setup: registering tees and greens, nine by nine (pick a nine, then its holes 1–9)
   Plain scripts loaded in order from index.html (no build step); they share top-level names. */
"use strict";

/* setup */
const nextNineName = () => NINE_NAMES.find(n => !S.course.nines.some(x => x.name === n)) || `ナイン${S.course.nines.length + 1}`;
// start on hole n of a nine (or its first hole still to register), placing whatever is missing there
function setupGo(id, n) {
  const nine = nineOf(id);
  S.su = { nine: nine.id, n: n || (nine.holes.find(x => !registered(x)) || nine.holes[0]).n };
  const h = hole(); S.mode = !h.tee ? 'setup-tee' : !h.green ? 'setup-green' : null; S.tap = null;
  refresh();
  if (registered(h)) camera('top');
}
function renderSetup() {
  const h = hole(), nine = nineOf(S.su.nine);
  const min = !!S.prefs.setupMin;
  $('setup').classList.toggle('collapsed', min);
  $('sToggle').setAttribute('aria-expanded', !min); $('sChev').textContent = min ? '▲ ひらく' : '▼ たたむ';
  $('sHole').textContent = `${nine.name} ${S.su.n}番`; $('sPar').value = String(h.par);
  $('sState').textContent = `Par ${h.par} ・ ` + (S.mode === 'setup-green' ? 'グリーン中心に十字を' : S.mode === 'setup-tee' ? 'ティーに十字を' : registered(h) ? '登録済み' : '');
  $('sPlace').hidden = !(S.mode === 'setup-tee' || S.mode === 'setup-green');
  $('sTee').setAttribute('aria-pressed', S.mode === 'setup-tee'); $('sGreen').setAttribute('aria-pressed', S.mode === 'setup-green');
  $('sTee').textContent = S.mode ? 'ティー' : 'ティーを置き直す'; $('sGreen').textContent = S.mode ? 'グリーン' : 'グリーンを置き直す';
  $('setupHint').textContent = S.mode === 'setup-green' ? '地図を動かして十字をグリーンの中心に合わせ、「ここに置く」を押してください。' : S.mode === 'setup-tee' ? '地図を動かして十字をティー（バックティー）に合わせ、「ここに置く」を押してください。' : '置き直したい項目のボタンを押してください。';
  // nines: pick one to register, or add another (東・西・南 …)
  const ns = $('sNines'); ns.textContent = '';
  S.course.nines.forEach(x => {
    const b = el('button', x.holes.every(registered) ? 'done' : '', x.name || '名前なし');
    b.setAttribute('aria-pressed', x.id === nine.id);
    b.onclick = () => { if (x.id !== nine.id) setupGo(x.id); };
    ns.appendChild(b);
  });
  const add = el('button', 'add', '＋ ナインを追加');
  add.onclick = () => { const x = blankNine(nextNineName()); S.course.nines.push(x); saveCourse(); setupGo(x.id, 1); $('sNineName').select(); };
  ns.appendChild(add);
  if (document.activeElement !== $('sNineName')) $('sNineName').value = nine.name;
  $('sNineDel').disabled = S.course.nines.length < 2;  // a course keeps at least one nine
  $('sHolesTitle').textContent = `${nine.name || 'このナイン'}のホール`;
  const chips = $('chips'); chips.textContent = '';
  nine.holes.forEach(x => {
    const b = document.createElement('button'); b.textContent = x.n;
    b.className = registered(x) ? 'done' : (x.tee || x.green) ? 'half' : '';
    b.setAttribute('aria-current', x.n === S.su.n); b.setAttribute('aria-label', `${nine.name} ${x.n}番ホール${registered(x) ? '（登録済み）' : ''}`);
    b.onclick = () => setupGo(nine.id, x.n);
    chips.appendChild(b);
  });
}
// opens on the nine and hole the round is on now
function openSetup() {
  openSheet('setup'); $('onboard').hidden = true;
  if (S.is3D) set3D(false);
  setupGo(localNines()[N > NINE ? 1 : 0].id, ((N - 1) % NINE) + 1);
}
function closeSetup() { $('setup').hidden = true; S.su = null; if (S.mode && S.mode.startsWith('setup')) S.mode = null; }
$('goSetup').onclick = openSetup;
$('obStart').onclick = () => { $('onboard').hidden = true; openSetup(); };
$('obLater').onclick = () => $('onboard').hidden = true;
// the organizer's registrations reach everyone in the competition when the sheet is closed
$('setupDone').onclick = () => { closeSetup(); refresh(); if (registered(hole())) camera(S.view); if (comp && comp.role === 'org') compPublishCourse().catch(() => {}); };
$('sPar').onchange = () => { hole().par = +$('sPar').value; saveCourse(); refresh(); };
$('sTee').onclick = () => { S.mode = 'setup-tee'; refresh(); if (hole().tee) centerOn(hole().tee); };
$('sGreen').onclick = () => { S.mode = 'setup-green'; refresh(); if (hole().green) centerOn(hole().green); };
// renaming: the chip and titles follow as you type
$('sNineName').oninput = () => { const v = $('sNineName').value.trim(); if (v) { nineOf(S.su.nine).name = v.slice(0, 12); saveCourse(); renderSetup(); } };
$('sNineName').onblur = () => renderSetup();
// deleting a nine asks first; if today's round uses it, its scores and pins go too
$('sNineDel').onclick = () => {
  const nine = nineOf(S.su.nine), used = localNines().some(x => x.id === nine.id), placed = nine.holes.some(x => x.tee || x.green);
  const note = [placed && '登録したティーとグリーンも消えます', used && '今日のラウンドで使っているので、スコアとピン位置も消えます'].filter(Boolean).join('。') || 'このナインには何も登録されていません';
  ask(`「${nine.name}」を削除しますか？`, note, '削除', () => {
    S.course.nines = S.course.nines.filter(x => x !== nine); saveCourse();
    if (used) { clearRound(); fixRound(); saveRound(); }
    setupGo(S.course.nines[0].id, 1);
    toast(`「${nine.name}」を削除しました`);
  });
};
$('sToggle').onclick = () => {
  const ll = crossLL();  // keep the spot under the crosshair while the panel changes size
  S.prefs.setupMin = !S.prefs.setupMin; savePrefs(); refresh();
  if (isPlacing()) centerOn(ll, { duration: 0 });
};
