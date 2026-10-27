/* golf3d — setup: registering tees and greens hole by hole
   Plain scripts loaded in order from index.html (no build step); they share top-level names. */
"use strict";

/* setup */
function renderSetup() {
  const h = hole();
  const min = !!S.prefs.setupMin;
  $('setup').classList.toggle('collapsed', min);
  $('sToggle').setAttribute('aria-expanded', !min); $('sChev').textContent = min ? '▲ ひらく' : '▼ たたむ';
  $('sHole').textContent = `${N}番`; $('sPar').value = String(h.par);
  $('sState').textContent = `Par ${h.par} ・ ` + (S.mode === 'setup-green' ? 'グリーン中心に十字を' : S.mode === 'setup-tee' ? 'ティーに十字を' : registered(h) ? '登録済み' : '');
  $('sPlace').hidden = !(S.mode === 'setup-tee' || S.mode === 'setup-green');
  $('sTee').setAttribute('aria-pressed', S.mode === 'setup-tee'); $('sGreen').setAttribute('aria-pressed', S.mode === 'setup-green');
  $('sTee').textContent = S.mode ? 'ティー' : 'ティーを置き直す'; $('sGreen').textContent = S.mode ? 'グリーン' : 'グリーンを置き直す';
  $('setupHint').textContent = S.mode === 'setup-green' ? '地図を動かして十字をグリーンの中心に合わせ、「ここに置く」を押してください。' : S.mode === 'setup-tee' ? '地図を動かして十字をティー（バックティー）に合わせ、「ここに置く」を押してください。' : '置き直したい項目のボタンを押してください。';
  const chips = $('chips'); chips.textContent = '';
  S.course.holes.forEach(x => {
    const b = document.createElement('button'); b.textContent = x.n;
    b.className = registered(x) ? 'done' : (x.tee || x.green) ? 'half' : '';
    b.setAttribute('aria-current', x.n === N); b.setAttribute('aria-label', `${x.n}番ホール${registered(x) ? '（登録済み）' : ''}`);
    b.onclick = () => { N = x.n; S.mode = registered(x) ? null : (x.tee ? 'setup-green' : 'setup-tee'); savePrefs(); refresh(); if (registered(x)) camera('top'); };
    chips.appendChild(b);
  });
}
function openSetup() {
  openSheet('setup'); $('onboard').hidden = true;
  const h = hole(); S.mode = !h.tee ? 'setup-tee' : !h.green ? 'setup-green' : null; S.tap = null;
  if (S.is3D) set3D(false);
  refresh();
}
function closeSetup() { $('setup').hidden = true; if (S.mode && S.mode.startsWith('setup')) S.mode = null; }
$('goSetup').onclick = openSetup;
$('obStart').onclick = () => { $('onboard').hidden = true; openSetup(); };
$('obLater').onclick = () => $('onboard').hidden = true;
$('setupDone').onclick = () => { closeSetup(); refresh(); if (registered(hole())) camera(S.view); };
$('sPar').onchange = () => { hole().par = +$('sPar').value; saveCourse(); refresh(); };
$('sTee').onclick = () => { S.mode = 'setup-tee'; refresh(); if (hole().tee) centerOn(hole().tee); };
$('sGreen').onclick = () => { S.mode = 'setup-green'; refresh(); if (hole().green) centerOn(hole().green); };
$('sToggle').onclick = () => {
  const ll = crossLL();  // keep the spot under the crosshair while the panel changes size
  S.prefs.setupMin = !S.prefs.setupMin; savePrefs(); refresh();
  if (isPlacing()) centerOn(ll, { duration: 0 });
};

