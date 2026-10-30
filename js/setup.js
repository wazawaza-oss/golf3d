/* golf3d — setup: the course registration screens in settings (コース登録 → nines, tee colours, yardages, the hole list,
   確定). Everything works on a draft (S.draft, saved as golf3d.courseDraft) until 確定 copies it into the course.
   Plain scripts loaded in order from index.html (no build step); they share top-level names. */
"use strict";

Object.assign(M_TITLE, { mReg: 'コース登録', mRegNines: 'ハーフとティー', mRegYard: 'パーとヤード' });
Object.assign(M_RENDER, { mReg: () => renderReg(), mRegNines: () => renderRegNines(), mRegYard: () => renderYard() });
const nextNineName = () => NINE_NAMES.find(n => !S.draft.course.nines.some(x => x.name === n)) || `ハーフ${S.draft.course.nines.length + 1}`;
const cleanCand = c => ({ greens: ((c && c.greens) || []).filter(isLL), tees: ((c && c.tees) || []).filter(isLL) });
// the draft left from last time, or a fresh copy of the course as it is
function loadDraft() {
  if (S.draft) return;
  const d = loadJSON(DRAFT_KEY), c = d && toCourse(d.course);
  S.draft = c ? { course: c, cand: cleanCand(d.cand), fresh: !!d.fresh, named: !!d.named }
    : { course: toCourse(JSON.parse(JSON.stringify(S.course))), cand: cleanCand(null), fresh: false, named: false };
}
function openSetup() {
  loadDraft(); $('onboard').hidden = true;
  mStack = ['mMain', 'mReg']; openMenu(true);
}
$('obStart').onclick = openSetup;
// あとで: not asked again for a week (kept in golf3d.prefs as obLater = time); settings' step 1 still opens it
const OB_WAIT = 7 * 864e5;
const obDue = () => !allHoles().some(registered) && !(Date.now() - (S.prefs.obLater || 0) < OB_WAIT);
$('obLater').onclick = () => { $('onboard').hidden = true; S.prefs.obLater = Date.now(); savePrefs(); };

// the half played second (today's back, or the 2nd one when today's round is not on this course) is called 10–18, as on the score card
const isBackHalf = (c, nine) => S.round.front !== S.round.back && c.nines.some(x => x.id === S.round.back) ? nine.id === S.round.back : c.nines.indexOf(nine) === 1;
const cardNo = (c, nine, n) => isBackHalf(c, nine) ? n + NINE : n;

/* ---------- the main registration screen ---------- */
function renderReg() {
  loadDraft();
  const c = S.draft.course;
  if (!$('rgInfo').dataset.busy) $('rgInfo').classList.remove('err');
  if (!$('rgInfo').dataset.busy) $('rgInfo').textContent = c.area && c.area.name ? `選んだゴルフ場：${c.area.name}` : c.area ? 'ゴルフ場の場所を選びました' : 'まだ選んでいません（今の地図の場所のまま進めることもできます）';
  const base = c.tees.find(t => t.id === c.baseTee);
  $('rgNinesS').textContent = `${c.nines.map(x => x.name).join('・')}／ティー ${c.tees.map(t => t.name).join('・')}（地図に置く色：${base ? base.name : ''}）`;
  const box = $('rgHoles'); box.textContent = '';
  c.nines.forEach(nine => {
    const st = nine.holes.map(h => holeState(h, c)), left = st.filter(s => s === 'none').length;
    const from = cardNo(c, nine, 1);
    box.appendChild(el('div', 'grp-t', `${nine.name}（${from}〜${from + NINE - 1}番）　${left ? `未設定 ${left}` : 'すべて設定済み'}`));
    const g = el('div', 'grp');
    nine.holes.forEach((h, i) => {
      const b = el('button', 'mrow hrow');
      const y = h.yd[c.baseTee];
      b.append(el('span', 'hn', `${cardNo(c, nine, h.n)}番`), el('span', 'mtx', `Par ${h.par}${h.hdcp ? `・HDCP ${h.hdcp}` : ''}${y ? `・${y}Y` : ''}${registered(h) ? `・地図 ${Math.round(yards(h.tee, h.green))}Y` : ''}`),
        el('span', 'hst ' + st[i], STATE_NAME[st[i]] + (st[i] === 'auto' && !h.ok ? '（未確認）' : '')), el('span', 'chev', '›'));
      b.setAttribute('aria-label', `${nine.name} ${cardNo(c, nine, h.n)}番 ${STATE_NAME[st[i]]}。押すとこのホールを置き直します`);
      b.onclick = () => guideStart(nine.id, h.n, true);
      g.appendChild(b);
    });
    box.appendChild(g);
  });
  const all = c.nines.flatMap(x => x.holes);
  $('rgGuide').textContent = all.some(registered) ? '案内を続ける（未設定のホールから）' : '案内を始める（1番から）';
}
$('rgNines').onclick = () => { renderRegNines(); mShow('mRegNines'); };
$('rgGuide').onclick = () => {
  const c = S.draft.course;
  const nine = c.nines.find(x => x.holes.some(h => !registered(h))) || c.nines[0];
  guideStart(nine.id, (nine.holes.find(h => !registered(h)) || nine.holes[0]).n, false);
};
// OSM: tees and greens of numbered holes are placed; the rest become candidates in the guide
$('rgOsm').onclick = async () => {
  const c = S.draft.course, info = $('rgOsmInfo'), btn = $('rgOsm');
  const say = (t, bad) => { info.textContent = t; info.classList.toggle('err', !!bad); };
  if (!c.area) { say('先に「1. ゴルフ場を探す」でゴルフ場を選んでください。', true); return; }
  btn.disabled = true; say('地図データを取得しています…（最大30秒）');
  try {
    const out = await draftCourse({ area: c.area, baseTee: c.baseTee,
      nines: c.nines.map(x => ({ id: x.id, name: x.name, holes: x.holes.map(h => ({ n: h.n, par: h.par, yd: Object.assign({}, h.yd) })) })) });
    const n = applyDraft(c, out);
    S.draft.cand = cleanCand(out.candidates); saveDraft();
    say(out.note + (n < out.holes.length ? `（手で置いた${out.holes.length - n}ホールはそのままにしました）` : ''));
  } catch (e) { say(e.message, true); }
  btn.disabled = false; renderReg();
};
/* 確定: the draft becomes the course. Same golf club: the round goes on (unless one of its nines was deleted);
   a different golf club (fresh) starts a new round, as importing a course does. */
$('rgSave').onclick = () => {
  const d = S.draft, c = toCourse(d.course);
  if (!d.fresh && !d.named) c.name = S.course.name;  // renamed in settings meanwhile
  const lost = !d.fresh && [S.round.front, S.round.back].some(id => !c.nines.some(x => x.id === id));
  const unset = c.nines.reduce((a, x) => a + x.holes.filter(h => !registered(h)).length, 0);
  const drops = (d.fresh || lost) && roundHasData();
  const go = () => {
    try { localStorage.removeItem(DRAFT_KEY); } catch (e) {}
    S.draft = null; $('menu').hidden = true;
    if (d.fresh) useCourse(c, `「${c.name}」を保存しました`);
    else {
      S.course = c; saveCourse();
      if (lost) clearRound();
      fixRound(); saveRound(); refresh();
      if (registered(hole())) camera(S.view);
      toast('コースを保存しました');
    }
    if (comp && comp.role === 'org') compPublishCourse().catch(() => toast('コンペの参加者に配れませんでした。電波のある所でもう一度確定してください'));
  };
  const notes = [unset && `未設定が${unset}ホールあります。あとで続きを置けます`, drops && '今のスコアとピン位置は消えます'].filter(Boolean);
  if (notes.length) ask(unset ? '未設定のホールが残っています。このまま確定しますか？' : 'コースを確定しますか？', notes.join('。'), '確定する', go);
  else go();
};
$('rgDiscard').onclick = () => ask('下書きを捨てますか？',
  `下書きで置いたグリーンとティー（${S.draft.course.nines.flatMap(x => x.holes).filter(registered).length}ホール分）と、ハーフ・色・ヤードの変更が消えます。確定済みの今のコースはそのままです`, '捨てる', () => {
  try { localStorage.removeItem(DRAFT_KEY); } catch (e) {}
  S.draft = null; loadDraft(); renderReg(); toast('下書きを捨てました');
});

/* ---------- nines and tee colours ---------- */
function renderRegNines() {
  const c = S.draft.course;
  const ns = $('rnNines'); ns.textContent = '';
  c.nines.forEach(nine => {
    const row = el('div', 'mrow field');
    const inp = el('input'); inp.type = 'text'; inp.maxLength = 12; inp.value = nine.name; inp.placeholder = 'ハーフの名前（例：東）'; inp.setAttribute('aria-label', 'ハーフの名前');
    inp.oninput = () => { const v = inp.value.trim(); if (v) { nine.name = v.slice(0, 12); saveDraft(); } };
    inp.onblur = () => { inp.value = nine.name; };
    const del = el('button', 'xbtn', '削除'); del.disabled = c.nines.length < 2; del.setAttribute('aria-label', `${nine.name}を削除`);
    del.onclick = () => {
      const placed = nine.holes.some(h => h.tee || h.green), used = [S.round.front, S.round.back].includes(nine.id);
      const note = [placed && '置いたティーとグリーンも消えます', used && '今日のラウンドで使っているので、確定するとスコアとピン位置も消えます'].filter(Boolean).join('。') || 'このハーフには何も置いていません';
      ask(`「${nine.name}」を削除しますか？`, note, '削除', () => { c.nines = c.nines.filter(x => x !== nine); saveDraft(); renderRegNines(); });
    };
    row.append(inp, del); ns.appendChild(row);
  });
  const ts = $('rnTees'); ts.textContent = '';
  c.tees.forEach(t => {
    const row = el('div', 'mrow field tee');
    const col = el('input'); col.type = 'color'; col.value = t.color; col.setAttribute('aria-label', `${t.name}の表示色`);
    col.oninput = () => { t.color = col.value; saveDraft(); };
    const inp = el('input'); inp.type = 'text'; inp.maxLength = 8; inp.value = t.name; inp.setAttribute('aria-label', '色の名前');
    inp.oninput = () => { const v = inp.value.trim(); if (v) { t.name = v.slice(0, 8); saveDraft(); } };
    inp.onblur = () => { inp.value = t.name; };
    const isBase = t.id === c.baseTee;
    const base = el('button', 'basebtn', isBase ? '地図に置く色' : 'この色を置く'); base.setAttribute('aria-pressed', isBase);
    base.onclick = () => {
      if (isBase) return;
      const set = () => { c.baseTee = t.id; saveDraft(); renderRegNines(); };
      if (c.nines.some(x => x.holes.some(h => h.tee))) ask(`地図に置く色を「${t.name}」にしますか？`, '置いてあるティーの位置は、そのまま「' + t.name + '」のティーとして扱われます', '変える', set);
      else set();
    };
    const del = el('button', 'xbtn', '削除'); del.disabled = c.tees.length < 2 || isBase; del.setAttribute('aria-label', `${t.name}を削除`);
    del.onclick = () => ask(`「${t.name}」の色を削除しますか？`, 'この色のヤードも消えます', '削除', () => {
      c.tees = c.tees.filter(x => x !== t); c.nines.forEach(x => x.holes.forEach(h => delete h.yd[t.id])); saveDraft(); renderRegNines();
    });
    row.append(col, inp, base, del); ts.appendChild(row);
  });
  const yd = $('rnYd'); yd.textContent = '';
  c.nines.forEach(nine => {
    const b = el('button', 'mrow'), filled = nine.holes.filter(h => h.yd[c.baseTee]).length;
    b.append(el('span', 'mtx', nine.name), el('span', 'mval', `パー ${nine.holes.reduce((a, h) => a + h.par, 0)}・ヤード ${filled}/${NINE}`), el('span', 'chev', '›'));
    b.onclick = () => { ydNine = nine.id; M_TITLE.mRegYard = `${nine.name}のパーとヤード`; renderYard(); mShow('mRegYard'); };
    yd.appendChild(b);
  });
}
$('rnNineAdd').onclick = () => { S.draft.course.nines.push(blankNine(nextNineName())); saveDraft(); renderRegNines(); const i = $('rnNines').querySelectorAll('input'); i[i.length - 1].select(); };
$('rnTeeAdd').onclick = () => {
  const c = S.draft.course; c.tees.push({ id: newId('t'), name: ['黒', '金', '緑', '黄'].find(n => !c.tees.some(t => t.name === n)) || '色', color: '#222222' });
  saveDraft(); renderRegNines();
};

/* ---------- par and yardage of one nine: a table, one row per hole, one column per colour ---------- */
let ydNine = null;
function renderYard() {
  const c = S.draft.course, nine = draftNine(ydNine), box = $('ryTable');
  box.textContent = '';
  const t = el('table'), head = el('tr');
  head.append(el('th', '', '番'), el('th', '', 'パー'), el('th', '', 'HDCP'));
  c.tees.forEach(x => { const th = el('th'); const dot = el('i', 'tdot'); dot.style.background = x.color; th.append(dot, x.name + (x.id === c.baseTee ? '（地図に置く色）' : '')); head.appendChild(th); });
  t.appendChild(head);
  const sumRow = el('tr', 'sum');
  const sums = () => {
    sumRow.textContent = '';
    sumRow.append(el('td', '', '計'), el('td', '', nine.holes.reduce((a, h) => a + h.par, 0)), el('td'));
    c.tees.forEach(x => { const s = nine.holes.reduce((a, h) => a + (h.yd[x.id] || 0), 0); sumRow.appendChild(el('td', '', s ? `${s}Y` : '')); });
  };
  nine.holes.forEach(h => {
    const tr = el('tr');
    const par = el('select'); par.setAttribute('aria-label', `${h.n}番のパー`);
    [3, 4, 5, 6].forEach(p => { const o = el('option', '', p); o.value = p; o.selected = h.par === p; par.appendChild(o); });
    par.onchange = () => { h.par = +par.value; saveDraft(); sums(); };
    const tdp = el('td'); tdp.appendChild(par);
    const hc = el('input'); hc.type = 'number'; hc.inputMode = 'numeric'; hc.min = 1; hc.max = 18; hc.placeholder = '—';
    hc.value = h.hdcp || ''; hc.setAttribute('aria-label', `${h.n}番のHDCP`);
    hc.onchange = () => { h.hdcp = cleanHdcp(Math.round(+hc.value)); hc.value = h.hdcp || ''; saveDraft(); };
    const tdh = el('td'); tdh.appendChild(hc);
    tr.append(el('td', 'hn', h.n), tdp, tdh);
    c.tees.forEach(x => {
      const inp = el('input'); inp.type = 'number'; inp.inputMode = 'numeric'; inp.min = 1; inp.max = 999; inp.placeholder = '—';
      inp.value = h.yd[x.id] || ''; inp.setAttribute('aria-label', `${h.n}番 ${x.name}のヤード`);
      inp.onchange = () => { const v = Math.round(+inp.value); if (v > 0 && v < 1000) h.yd[x.id] = v; else { delete h.yd[x.id]; inp.value = ''; } saveDraft(); sums(); };
      const td = el('td'); td.appendChild(inp); tr.appendChild(td);
    });
    t.appendChild(tr);
  });
  sums(); t.appendChild(sumRow);
  box.appendChild(t);
}
