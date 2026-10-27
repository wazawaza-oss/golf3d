/* golf3d — score: score entry, bottom dock, players, ranking, scorecard image, page swipe
   Plain scripts loaded in order from index.html (no build step); they share top-level names. */
"use strict";

/* ================= score entry ================= */
const saveScore = () => { saveJSON('golf3d.score', S.score); roomPush(); };
const strokesOf = p => p.remote ? p.strokes : S.score.strokes[p.id] || (S.score.strokes[p.id] = Array(ROUND).fill(null));
function totals(p) {
  let tot = 0, par = 0, n = 0;
  const ph = playHoles(); strokesOf(p).forEach((v, i) => { if (v) { tot += v; par += ph[i].par; n++; } });
  return { tot, diff: tot - par, n };
}
const fmtDiff = d => d === 0 ? '±0' : (d > 0 ? '+' : '') + d;
const TERM = { '-3': 'アルバトロス', '-2': 'イーグル', '-1': 'バーディー', '0': 'パー', '1': 'ボギー', '2': 'ダブルボギー', '3': 'トリプル' };
const termOf = (v, par) => v === 1 ? 'ホールインワン' : TERM[v - par] || fmtDiff(v - par);
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
/* score page: one player's 18-hole card (you, unless opened from the participants sheet);
   tapping a score cell opens -/+ right under that half of the card */
const me = () => S.score.players[0];
let scPlayer = null, scHole = 0;  // scPlayer: id of another player, null = you
const scWho = () => S.score.players.find(p => p.id === scPlayer) || me();
function scoreEnter() { if (S.page !== 'score') scHole = N - 1; }
function renderScore() {
  const p = scWho(), a = strokesOf(p), t = totals(p), isMe = p === me();
  $('scTitle').textContent = isMe ? 'マイスコア' : `${p.name || '名前なし'} のスコア`;
  const sum = $('scSum'); sum.textContent = '';
  sum.append(el('b', '', t.n ? fmtDiff(t.diff) : '—'), el('span', '', t.n ? `計 ${t.tot}打 ・ ${t.n}ホール` : 'まだ入力がありません'));
  const board = $('scBoard'); board.textContent = '';
  const ph = playHoles();
  halves().forEach(({ name: label, from }) => {  // front / back nine, headed by the nine's name
    const tb = el('table', 'sc my'), head = el('tr'), par = el('tr', 'par'), row = el('tr', 'mine');
    head.append(el('th', '', 'H')); par.append(el('td', '', 'Par')); row.append(el('td', '', 'スコア'));
    let parSum = 0, s = 0, any = false;
    for (let i = from; i < from + NINE; i++) {
      const hp = ph[i].par, v = a[i];
      head.append(el('th', '', i + 1)); par.append(el('td', '', hp)); parSum += hp;
      const c = el('td', (v == null ? '' : v < hp ? 'under' : v >= hp + 2 ? 'over2' : '') + (i === scHole ? ' sel' : ''), v == null ? '' : v);
      c.setAttribute('role', 'button'); c.setAttribute('aria-label', `${i + 1}番 ${v == null ? '未入力' : v + '打'}`);
      c.onclick = () => { scHole = i; renderScore(); };
      row.append(c);
      if (v != null) { s += v; any = true; }
    }
    head.append(el('th', 'sum', label)); par.append(el('td', 'sum', parSum)); row.append(el('td', 'sum', any ? s : ''));
    tb.append(head, par, row);
    board.appendChild(tb);
    if (scHole >= from && scHole < from + NINE) board.appendChild(scoreStepper(p, scHole));
  });
}
function scoreStepper(p, i) {
  const hp = playHoles()[i].par, v = strokesOf(p)[i], box = el('div', 'stepper');
  const set = nv => { strokesOf(p)[i] = nv; saveScore(); renderScore(); };
  const hd = el('div', 'sh'); hd.append(el('b', '', `${i + 1}番`), el('span', '', `Par ${hp}`));
  const stp = el('div', 'stp'), minus = el('button', '', '−'), plus = el('button', '', '＋');
  const val = el('div', 'val' + (v == null ? '' : v < hp ? ' under' : v > hp ? ' over' : ''));
  val.append(el('b', '', v == null ? '—' : v), el('small', '', v == null ? '未入力' : termOf(v, hp)));
  minus.setAttribute('aria-label', '1打減らす'); plus.setAttribute('aria-label', '1打増やす');
  minus.onclick = () => set(v == null ? hp - 1 : Math.max(1, v - 1));
  plus.onclick = () => set(v == null ? hp : Math.min(20, v + 1));
  stp.append(minus, val, plus);
  const clr = el('button', 'clr', '消す'); clr.disabled = v == null; clr.onclick = () => set(null);
  box.append(hd, stp, clr);
  return box;
}

/* bottom dock: your score for the hole on screen, entered with − / ＋ (same rules as the score page) */
function renderDock() {
  const i = N - 1, hp = playHoles()[i].par, v = strokesOf(me())[i];
  $('dkVal').className = 'dv' + (v == null ? '' : v < hp ? ' under' : v > hp ? ' over' : '');
  $('dkHole').textContent = `${N}番 Par ${hp}`;
  $('dkNum').textContent = v == null ? '—' : v;
  $('dkTerm').textContent = v == null ? '未入力' : termOf(v, hp);
}
function dockStep(d) {
  const a = strokesOf(me()), i = N - 1, hp = playHoles()[i].par, v = a[i];
  a[i] = d < 0 ? (v == null ? hp - 1 : Math.max(1, v - 1)) : (v == null ? hp : Math.min(20, v + 1));
  saveScore(); renderDock();
}
$('dkMinus').onclick = () => dockStep(-1);
$('dkPlus').onclick = () => dockStep(1);

/* participants sheet (menu): names, adding/removing, and entering other people's scores */
function renderPlayers() {
  const list = $('plList'); list.textContent = '';
  S.score.players.forEach((p, idx) => {
    const row = el('div', 'prow'), inp = el('input');
    inp.type = 'text'; inp.value = p.name; inp.maxLength = 12; inp.setAttribute('aria-label', '名前');
    inp.oninput = () => { p.name = inp.value; saveScore(); };
    const go = el('button', 'btn', idx ? 'スコア入力' : '自分');
    go.disabled = !idx;
    go.onclick = () => { $('players').hidden = true; scPlayer = p.id; scHole = N - 1; goPage('score'); };
    const del = el('button', 'del', '✕'); del.setAttribute('aria-label', `${p.name}を外す`); del.disabled = !idx;
    del.onclick = () => { S.score.players = S.score.players.filter(x => x !== p); delete S.score.strokes[p.id]; saveScore(); renderPlayers(); };
    row.append(inp, go, del);
    list.appendChild(row);
  });
  $('plAdd').disabled = S.score.players.length >= 8;
}
$('goPlayers').onclick = () => { renderPlayers(); openSheet('players'); };
$('plClose').onclick = () => $('players').hidden = true;
$('plAdd').onclick = () => {
  S.score.players.push({ id: 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), name: `参加者${S.score.players.length + 1}` });
  saveScore(); renderPlayers();
  const ins = $('plList').querySelectorAll('input'); ins[ins.length - 1].select();
};
let scWipeArm = null;
$('scWipe').onclick = () => {
  if (!scWipeArm) { $('scWipe').textContent = 'もう一度押すと消します'; scWipeArm = setTimeout(() => { scWipeArm = null; $('scWipe').textContent = 'スコアをすべて消す'; }, 3500); return; }
  clearTimeout(scWipeArm); scWipeArm = null; $('scWipe').textContent = 'スコアをすべて消す';
  S.score.strokes = {}; saveScore(); toast('スコアを消しました');
};

/* ================= ranking ================= */
// everyone sorted by score against par; pos is the shared rank (0 = no holes played yet)
function rankedRows() {
  const rows = allPlayers().map(p => Object.assign({ p }, totals(p)));
  rows.sort((a, b) => (b.n > 0) - (a.n > 0) || a.diff - b.diff || a.tot - b.tot);
  let pos = 0;
  rows.forEach((r, i) => { if (r.n && (i === 0 || r.diff !== rows[i - 1].diff || !rows[i - 1].n)) pos = i + 1; r.pos = r.n ? pos : 0; });
  return rows;
}
function renderRank() {
  const all = allPlayers(), rows = rankedRows();
  const maxN = Math.max(0, ...rows.map(r => r.n));
  $('rkInfo').textContent = maxN ? `${maxN}ホールまでの成績（パーとの差で順位）` : 'スコアを入力すると、ここに順位が出ます。';
  if (room) $('rkInfo').textContent += `　共有中：${room.code}${roomLive ? '' : '（オフライン）'}`;
  // ranking table (scrolls inside its box when there are many players)
  const tb = el('table', 'rkt'), hd = el('tr');
  ['順位', '名前', 'スコア', '打数', 'H'].forEach(x => hd.append(el('th', '', x)));
  tb.append(hd);
  rows.forEach(r => {
    const tr = el('tr', (r.pos === 1 ? 'top' : '') + (r.p === me() ? ' me' : ''));
    tr.append(el('td', 'pos', r.pos || '—'), el('td', 'nm', r.p.name || '名前なし'), el('td', 'dv', r.n ? fmtDiff(r.diff) : '—'), el('td', '', r.n ? r.tot : '—'), el('td', '', r.n));
    tb.append(tr);
  });
  const list = $('rkList'); list.textContent = ''; list.appendChild(tb);
  // scorecard: front nine (1-9) and back nine (10-18)
  const card = $('rkCard'); card.textContent = '';
  const ph = playHoles();
  halves().forEach(({ name: label, from }) => {  // front / back nine, headed by the nine's name
    const t = el('table', 'sc'), head = el('tr'), par = el('tr', 'par');
    head.append(el('th', '', 'H')); par.append(el('td', '', 'Par'));
    let parSum = 0;
    for (let i = from; i < from + NINE; i++) { head.append(el('th', '', i + 1)); par.append(el('td', '', ph[i].par)); parSum += ph[i].par; }
    head.append(el('th', 'sum', label)); par.append(el('td', 'sum', parSum));
    t.append(head, par);
    all.forEach(p => {
      const tr = el('tr', p === me() ? 'me' : ''), a = strokesOf(p); let sum = 0, any = false;
      tr.append(el('td', '', p.name || '—'));
      for (let i = from; i < from + NINE; i++) {
        const v = a[i], hp = ph[i].par;
        tr.append(el('td', v == null ? '' : v < hp ? 'under' : v >= hp + 2 ? 'over2' : '', v == null ? '' : v));
        if (v != null) { sum += v; any = true; }
      }
      tr.append(el('td', 'sum', any ? sum : ''));
      t.append(tr);
    });
    card.appendChild(t);
  });
}

/* ================= scorecard image (JPEG) ================= */
// a simple card to keep or send: course name, date, everyone's front / back nine, and the ranking
function scoreCardCanvas() {
  const players = allPlayers(), rows = rankedRows(), holes = playHoles();
  const W = 1080, M = 40, NAME = 190, CELL = 80, SUM = 90, HH = 44, RH = 50, GAP = 34;
  const FONT = 'system-ui,-apple-system,"Hiragino Sans","Yu Gothic UI","Meiryo",sans-serif';
  const tableH = HH + RH * (players.length + 1);  // hole numbers + par + one row per player
  const H = M + 130 + 2 * (tableH + GAP) + HH + RH * rows.length + 70;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  const font = (size, weight) => g.font = `${weight} ${size}px ${FONT}`;
  const text = (s, x, y, size, weight, color, align = 'center') => {
    font(size, weight); g.fillStyle = color; g.textAlign = align; g.textBaseline = 'middle'; g.fillText(String(s), x, y);
  };
  const fit = (s, w, size, weight) => { font(size, weight); s = String(s); while (s.length > 1 && g.measureText(s).width > w) s = s.slice(0, -1); return s; };
  const hline = (y, x1 = M, x2 = W - M) => { g.fillStyle = '#c9d0c4'; g.fillRect(x1, y, x2 - x1, 1.5); };
  g.fillStyle = '#fff'; g.fillRect(0, 0, W, H);
  // header
  text(fit(S.course.name || 'コース', W - 2 * M, 44, 900), M, M + 26, 44, 900, '#0a1322', 'left');
  text(new Date().toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' }), M, M + 80, 26, 700, '#36414d', 'left');
  let y = M + 130;
  const cx = k => M + NAME + k * CELL;  // left edge of hole column k (0 .. NINE-1); k = NINE is the sum column
  halves().forEach(({ name: label, from }) => {  // front / back nine, headed by the nine's name
    const top = y;
    g.fillStyle = '#e6ece1'; g.fillRect(M, y, W - 2 * M, HH);
    text('H', M + 14, y + HH / 2, 20, 800, '#36414d', 'left');
    for (let k = 0; k < NINE; k++) text(from + k + 1, cx(k) + CELL / 2, y + HH / 2, 22, 800, '#0a1322');
    text(fit(label, SUM - 8, 22, 900), cx(NINE) + SUM / 2, y + HH / 2, 22, 900, '#0a1322');
    y += HH;
    let parSum = 0;
    text('Par', M + 14, y + RH / 2, 20, 700, '#36414d', 'left');
    for (let k = 0; k < NINE; k++) { const hp = holes[from + k].par; parSum += hp; text(hp, cx(k) + CELL / 2, y + RH / 2, 21, 700, '#36414d'); }
    text(parSum, cx(NINE) + SUM / 2, y + RH / 2, 21, 800, '#36414d');
    y += RH;
    players.forEach((p, idx) => {
      if (idx % 2 === 0) { g.fillStyle = '#f6f8f3'; g.fillRect(M, y, W - 2 * M, RH); }
      hline(y);
      text(fit(p.name || '名前なし', NAME - 20, 24, 800), M + 14, y + RH / 2, 24, 800, '#0a1322', 'left');
      const a = strokesOf(p); let sum = 0, any = false;
      for (let k = 0; k < NINE; k++) {
        const v = a[from + k], hp = holes[from + k].par;
        if (v == null) continue;
        sum += v; any = true;
        text(v, cx(k) + CELL / 2, y + RH / 2, 26, v < hp ? 900 : 700, v < hp ? '#b3261e' : v >= hp + 2 ? '#0b5cad' : '#0a1322');
      }
      if (any) text(sum, cx(NINE) + SUM / 2, y + RH / 2, 26, 900, '#0a1322');
      y += RH;
    });
    // grid
    g.fillStyle = '#c9d0c4';
    for (let k = 0; k <= NINE; k++) g.fillRect(cx(k), top, 1.5, y - top);
    g.strokeStyle = '#9aa494'; g.lineWidth = 2; g.strokeRect(M, top, W - 2 * M, y - top);
    y += GAP;
  });
  // ranking
  const COL = { pos: M + 50, name: M + 110, diff: M + 640, tot: M + 790, n: M + 920 };
  g.fillStyle = '#e6ece1'; g.fillRect(M, y, W - 2 * M, HH);
  [['順位', COL.pos], ['スコア', COL.diff], ['打数', COL.tot], ['ホール', COL.n]].forEach(([s, x]) => text(s, x, y + HH / 2, 20, 800, '#36414d'));
  text('名前', COL.name, y + HH / 2, 20, 800, '#36414d', 'left');
  const top = y; y += HH;
  rows.forEach(r => {
    hline(y);
    text(r.pos || '—', COL.pos, y + RH / 2, 28, 900, r.pos === 1 ? '#a8780a' : '#0a1322');
    text(fit(r.p.name || '名前なし', COL.diff - COL.name - 80, 26, 800), COL.name, y + RH / 2, 26, 800, '#0a1322', 'left');
    text(r.n ? fmtDiff(r.diff) : '—', COL.diff, y + RH / 2, 28, 900, '#0a1322');
    text(r.n ? r.tot : '—', COL.tot, y + RH / 2, 24, 700, '#36414d');
    text(r.n, COL.n, y + RH / 2, 24, 700, '#36414d');
    y += RH;
  });
  g.strokeStyle = '#9aa494'; g.lineWidth = 2; g.strokeRect(M, top, W - 2 * M, y - top);
  text('ゴルフ3Dマップ', W - M, H - 30, 18, 700, '#7a8490', 'right');
  return c;
}
async function saveScoreCard() {
  // build the file synchronously so the share sheet still counts as a response to the tap
  const url = scoreCardCanvas().toDataURL('image/jpeg', 0.92), bin = atob(url.split(',')[1]);
  const bytes = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const d = new Date(), ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  const name = `${(S.course.name || 'score').replace(/[\/:*?"<>|\s]+/g, '_')}_${ymd}.jpg`;
  const file = new File([bytes], name, { type: 'image/jpeg' });
  // on a phone the share sheet offers 「画像を保存」 (Photos); elsewhere it is a normal download
  if (matchMedia('(pointer: coarse)').matches && navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: 'スコア表' }); return; }
    catch (e) { if (e.name === 'AbortError') return; }
  }
  const a = document.createElement('a'); a.href = URL.createObjectURL(file); a.download = name;
  document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  toast('スコア表を保存しました');
}
$('saveCard').onclick = saveScoreCard;

/* ================= page swipe: [ranking] ← map → [score] ================= */
const PAGE_POS = { rank: -1, map: 0, score: 1 };
const PAGE_EL = [['pRank', -1], ['pScore', 1]];
function pageView(v, dragging) {
  PAGE_EL.forEach(([id, o]) => {
    const p = $(id);
    p.classList.toggle('drag', !!dragging);
    p.classList.toggle('on', Math.abs(o - v) < 1);
    p.style.transform = `translateX(${(o - v) * 100}%)`;
  });
}
function goPage(name) {
  if (S.page === 'score' && name !== 'score') roomSendNow();
  if (name === 'score') { scoreEnter(); renderScore(); }
  else scPlayer = null;  // swiping to the score page always shows your own card
  if (name === 'rank') { renderRank(); if (S.page !== 'rank') roomPull(); }
  if (name === 'map') renderDock();
  S.page = name; pageView(PAGE_POS[name]);
}
const canSwipe = () => S.page !== 'map' || (!S.mode && $('menu').hidden && $('setup').hidden && $('players').hidden && $('share').hidden && $('onboard').hidden);
let sw = null, swallowClick = false;
function swipeStart(e) {
  if ((e.pointerType === 'mouse' && e.button) || !canSwipe() || e.target.closest('input,select')) return;
  sw = { id: e.pointerId, x: e.clientX, y: e.clientY, t: performance.now(), from: S.page, to: null };
}
document.addEventListener('pointermove', e => {
  if (!sw || e.pointerId !== sw.id) return;
  const dx = e.clientX - sw.x, dy = e.clientY - sw.y;
  if (!sw.to) {
    if (Math.abs(dy) > 12 && Math.abs(dy) > Math.abs(dx)) { sw = null; return; }
    if (Math.abs(dx) < 12 || Math.abs(dx) < Math.abs(dy) * 1.3) return;
    // finger moving left reveals the page on the right, and vice versa
    sw.to = sw.from === 'map' ? (dx < 0 ? 'score' : 'rank') : (PAGE_POS[sw.from] > 0) === (dx > 0) ? 'map' : null;
    if (!sw.to) { sw = null; return; }
    if (sw.to === 'score') { scoreEnter(); renderScore(); } else if (sw.to === 'rank') renderRank();
  }
  const a = PAGE_POS[sw.from], b = PAGE_POS[sw.to];
  pageView(Math.min(Math.max(a, b), Math.max(Math.min(a, b), a - dx / innerWidth)), true);
});
function swipeEnd(e) {
  if (!sw || e.pointerId !== sw.id) return;
  const s = sw; sw = null;
  if (!s.to) return;
  const dx = e.clientX - s.x, speed = Math.abs(dx) / Math.max(1, performance.now() - s.t);
  const toward = Math.sign(PAGE_POS[s.from] - PAGE_POS[s.to]) === Math.sign(dx);
  goPage(e.type === 'pointerup' && toward && (Math.abs(dx) > innerWidth * .3 || speed > .5) ? s.to : s.from);
  swallowClick = true; setTimeout(() => swallowClick = false, 60);
}
document.addEventListener('pointerup', swipeEnd);
document.addEventListener('pointercancel', swipeEnd);
document.addEventListener('click', e => { if (swallowClick) { e.preventDefault(); e.stopPropagation(); swallowClick = false; } }, true);
[document.querySelector('.hud'), $('pRank'), $('pScore')].forEach(x => x.addEventListener('pointerdown', swipeStart));
$('dkRank').onclick = () => goPage('rank');
$('dkCard').onclick = () => goPage('score');
document.querySelectorAll('[data-go]').forEach(b => b.onclick = () => goPage(b.dataset.go));
pageView(0);

