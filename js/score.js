/* golf3d — score: the score page, the -/+ stepper, the bottom dock, the participants sheet (solo)
   Plain scripts loaded in order from index.html (no build step); they share top-level names. */
"use strict";

/* ================= score entry ================= */
const saveScore = () => saveJSON('golf3d.score', S.score);  // this phone's own players (solo); a competition's scores go through setStroke
const strokesOf = p => p.remote ? p.strokes : S.score.strokes[p.id] || (S.score.strokes[p.id] = Array(ROUND).fill(null));
function totals(p) {
  let tot = 0, par = 0, n = 0;
  const ph = playHoles(); strokesOf(p).forEach((v, i) => { if (v) { tot += v; par += ph[i].par; n++; } });
  return { tot, diff: tot - par, n };
}
// a player's name everywhere on screen (empty names from older data look the same on every screen)
const pName = p => (p && p.name) || '（名前なし）';
/* a name as it is saved: trimmed, never empty (fallback), never the same as another one (…（2）),
   at most max characters. Says so with a toast when it had to change what was typed. */
function cleanName(v, others, fallback, max = 12) {
  let s = String(v || '').trim().slice(0, max), why = '';
  if (!s) { s = fallback; why = `名前が空なので「${s}」にしました`; }
  if (others.includes(s)) {
    const base = s; let k = 2;
    do { const tag = `（${k++}）`; s = base.slice(0, max - tag.length) + tag; } while (others.includes(s));
    why = `同じ名前の人がいるので「${s}」にしました`;
  }
  if (why) toast(why);
  return s;
}
// a name box: a toast when the text reaches the limit, so a cut-off name never goes unnoticed
function nameLimit(inp) { inp.addEventListener('input', () => { if (inp.value.length >= inp.maxLength) toast(`名前は${inp.maxLength}文字までです`); }); }
// one colour rule for a score everywhere (map bar, score table, scoreboard, JPEG): under par red, double bogey or worse blue
const scoreCls = (v, par) => v == null ? '' : v < par ? 'under' : v >= par + 2 ? 'over2' : '';
const SC_COLOR = { under: '#b3261e', over2: '#0b5cad' };  // = --sc-under / --sc-over in css/style.css
const fmtDiff = d => d === 0 ? '±0' : (d > 0 ? '+' : '') + d;
const TERM = { '-3': 'アルバトロス', '-2': 'イーグル', '-1': 'バーディー', '0': 'パー', '1': 'ボギー', '2': 'ダブルボギー', '3': 'トリプル' };
const termOf = (v, par) => v === 1 ? 'ホールインワン' : TERM[v - par] || fmtDiff(v - par);
/* score page: one player's 18-hole card (you, unless opened from the participants sheet);
   tapping a score cell opens -/+ right under that half of the card */
let scPlayer = null, scHole = 0;  // scPlayer: id of another player, null = you
const scWho = () => allPlayers().find(p => p.id === scPlayer) || me();  // me(): js/roles.js
function scoreEnter() { if (S.page !== 'score') scHole = N - 1; }
function renderScore() {
  const p = scWho(), sum = $('scSum'), board = $('scBoard');
  sum.textContent = ''; board.textContent = '';
  if (!p) { $('scTitle').textContent = 'スコア表'; sum.append(el('span', '', '設定 → コンペ で自分の名前を選ぶと入力できます')); return; }
  const a = strokesOf(p), t = totals(p), isMe = comp ? p.id === comp.player : p === me(), edit = canEdit(p.id);
  $('scTitle').textContent = isMe ? 'スコア表' : `${pName(p)} のスコア表`;
  sum.append(el('b', '', t.n ? fmtDiff(t.diff) : '—'), el('span', '', t.n ? `計 ${t.tot}打 ・ ${t.n}ホール` : 'まだ入力がありません'));
  const ph = playHoles();
  halves().forEach(({ name: label, from }) => {  // front / back nine, headed by the nine's name
    const tb = el('table', 'sc my'), head = el('tr'), par = el('tr', 'par'), row = el('tr', 'mine');
    head.append(el('th', '', 'H')); par.append(el('td', '', 'Par')); row.append(el('td', '', '打数'));
    let parSum = 0, s = 0, any = false;
    for (let i = from; i < from + NINE; i++) {
      const hp = ph[i].par, v = a[i];
      head.append(el('th', '', i + 1)); par.append(el('td', '', hp)); parSum += hp;
      const c = scoreCell(p, i, i === scHole);
      c.setAttribute('role', 'button');
      c.onclick = () => { fixNote(p, i); scHole = i; renderScore(); };
      row.append(c);
      if (v != null) { s += v; any = true; }
    }
    head.append(el('th', 'sum', label)); par.append(el('td', 'sum', parSum)); row.append(el('td', 'sum', any ? s : ''));
    tb.append(head, par, row);
    board.appendChild(tb);
    if (edit && scHole >= from && scHole < from + NINE) board.appendChild(scoreStepper(p, scHole, renderScore));  // view only when not yours to enter
  });
}
// one score cell: colored against par; a small mark when someone else changed it (tap for who and when)
function scoreCell(p, i, sel) {
  const v = strokesOf(p)[i], hp = playHoles()[i].par, fx = comp && compFix(p.id, i);
  const c = el('td', scoreCls(v, hp) + (fx ? ' fx' : '') + (sel ? ' sel' : ''), v == null ? '' : v);
  c.setAttribute('aria-label', `${i + 1}番 ${v == null ? '未入力' : v + '打'}${fx ? `（${fx.who}が修正）` : ''}`);
  return c;
}
function fixNote(p, i) {
  const fx = comp && compFix(p.id, i); if (!fx) return;
  const d = new Date(fx.t);
  toast(`${i + 1}番：${fx.who}が修正（${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}）`);
}
function scoreStepper(p, i, after, title) {
  const hp = playHoles()[i].par, v = strokesOf(p)[i], box = el('div', 'stepper');
  const set = nv => { setStroke(p, i, nv); after(); };
  const hd = el('div', 'sh'); hd.append(el('b', '', `${title ? title + ' ' : ''}${i + 1}番`), el('span', '', `Par ${hp}`));
  const stp = el('div', 'stp'), minus = el('button', '', '−'), plus = el('button', '', '＋');
  const val = el('div', 'val ' + scoreCls(v, hp));
  val.append(el('b', '', v == null ? '—' : v), el('small', '', v == null ? '未入力' : termOf(v, hp)));
  minus.setAttribute('aria-label', '1打減らす'); plus.setAttribute('aria-label', '1打増やす');
  minus.onclick = () => set(v == null ? hp - 1 : Math.max(1, v - 1));
  plus.onclick = () => set(v == null ? hp : Math.min(20, v + 1));
  stp.append(minus, val, plus);
  const clr = el('button', 'clr', '消す'); clr.disabled = v == null;
  clr.onclick = () => { set(null); snack(`${allPlayers().length > 1 ? p.name + 'の' : ''}${i + 1}番の${v}打を消しました`, () => set(v)); };  // undo for a few seconds
  box.append(hd, stp, clr);
  return box;
}

/* bottom dock: the score for the hole on screen, entered with − / ＋ (same rules as the score page).
   In a competition it is the player's own name, or — for a team lead / the organizer — the person
   shown in the dock; tapping that name moves to the next person they may enter for. */
function renderDock() {
  const p = me(), i = N - 1, hp = playHoles()[i].par, v = p ? strokesOf(p)[i] : null, many = comp && roleKind() !== 'player';
  $('dkMinus').disabled = $('dkPlus').disabled = !p;
  $('dkVal').className = 'dv ' + scoreCls(v, hp) + (many ? ' who' : '');
  $('dkHole').textContent = !p ? '名前を選んでください' : comp ? `${p.name}${many ? '▸' : ''}・${N}番 P${hp}` : `${N}番 Par ${hp}`;
  $('dkNum').textContent = v == null ? '—' : v;
  $('dkTerm').textContent = v == null ? '未入力' : termOf(v, hp);
}
function dockStep(d) {
  const p = me(); if (!p) return;
  const i = N - 1, hp = playHoles()[i].par, v = strokesOf(p)[i];
  setStroke(p, i, d < 0 ? (v == null ? hp - 1 : Math.max(1, v - 1)) : (v == null ? hp : Math.min(20, v + 1)));
  renderDock();
}
$('dkMinus').onclick = () => dockStep(-1);
$('dkPlus').onclick = () => dockStep(1);
$('dkVal').onclick = () => dockNext();

// names saved by older versions: empty ones and repeats get told apart once (only the names change)
(() => {
  const seen = [];
  S.score.players.forEach((p, i) => {
    const base = String(p.name || '').trim() || (i ? `参加者${i + 1}` : '自分');
    let s = base;
    for (let k = 2; seen.includes(s); k++) s = `${base.slice(0, 9)}（${k}）`;
    if (s !== p.name) p.name = s;
    seen.push(s);
  });
})();

/* participants sheet (menu): names, adding/removing, and entering other people's scores */
function renderPlayers() {
  const list = $('plList'); list.textContent = '';
  S.score.players.forEach((p, idx) => {
    const row = el('div', 'prow'), inp = el('input');
    inp.type = 'text'; inp.value = p.name; inp.maxLength = 12; inp.setAttribute('aria-label', '名前');
    inp.oninput = () => { p.name = inp.value; saveScore(); };
    nameLimit(inp);
    inp.onchange = () => {  // when the box is left: no empty name, no second "自分"
      p.name = inp.value = cleanName(inp.value, S.score.players.filter(x => x !== p).map(x => x.name), idx ? `参加者${idx + 1}` : '自分');
      saveScore();
    };
    const go = el('button', 'btn', idx ? 'スコア表' : '自分');
    go.disabled = !idx;
    go.onclick = () => { $('players').hidden = true; scPlayer = p.id; scHole = N - 1; goPage('score'); };
    const del = el('button', 'del', '削除'); del.setAttribute('aria-label', `${p.name}を削除`); del.disabled = !idx;
    del.onclick = () => {
      const k = (S.score.strokes[p.id] || []).filter(x => x != null).length;
      ask(`「${pName(p)}」を削除しますか？`, k ? `入力済みのスコア（${k}ホール分）も消えます` : 'スコアはまだ入っていません', '削除',
        () => { S.score.players = S.score.players.filter(x => x !== p); delete S.score.strokes[p.id]; saveScore(); renderPlayers(); });
    };
    row.append(inp, go, del);
    list.appendChild(row);
  });
  $('plAdd').disabled = S.score.players.length >= 8;
}
$('goPlayers').onclick = () => { renderPlayers(); openSheet('players'); };
$('plClose').onclick = () => { $('players').hidden = true; backToMenu(); };
$('plAdd').onclick = () => {
  let k = S.score.players.length + 1; while (S.score.players.some(x => x.name === `参加者${k}`)) k++;
  S.score.players.push({ id: 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), name: `参加者${k}` });
  saveScore(); renderPlayers();
  const ins = $('plList').querySelectorAll('input'); ins[ins.length - 1].select();
};
$('scWipe').onclick = () => {
  const k = Object.values(S.score.strokes).reduce((s, a) => s + (a || []).filter(x => x != null).length, 0);
  if (!k) { toast('消すスコアはありません'); return; }
  ask(`全員分（${S.score.players.length}人）のスコアを消しますか？`, `入力済みの${k}ホール分がすべて消えます。消すと元に戻せません。参加者の名前は残ります`, 'すべて消す',
    () => { S.score.strokes = {}; saveScore(); toast('スコアを消しました'); });
};

