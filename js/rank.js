/* golf3d — rank: the ranking page, everyone's scoreboard, the scorecard image (JPEG)
   Plain scripts loaded in order from index.html (no build step); they share top-level names. */
"use strict";

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
  $('rkInfo').textContent = (maxN ? `${maxN}ホールまでの成績です。` : 'スコアを入力すると順位が付きます。') + '順位は、入力したホールの「パーとの差」が少ない順です（同じ差なら同じ順位。この決め方は変えられません）。';
  if (comp) $('rkInfo').textContent += `　${(comp.meta && comp.meta.name) || 'コンペ'}${compLive ? '' : '（オフライン）'}`;
  // ranking table (scrolls inside its box when there are many players)
  const tb = el('table', 'rkt'), hd = el('tr');
  ['順位', '名前', 'パーとの差', '合計打数', 'ホール数'].forEach(x => hd.append(el('th', '', x)));
  tb.append(hd);
  rows.forEach(r => {
    const tr = el('tr', (r.pos === 1 ? 'top' : '') + (r.p.id === myId() ? ' me' : ''));
    tr.append(el('td', r.pos ? 'pos' : 'pos none', r.pos || '未入力'), el('td', 'nm', pName(r.p)), el('td', 'dv', r.n ? fmtDiff(r.diff) : '—'), el('td', '', r.n ? r.tot : '—'), el('td', '', r.n));
    tb.append(tr);
  });
  const list = $('rkList'); list.textContent = ''; list.appendChild(tb);
  // scorecard: front nine (1-9) and back nine (10-18); in a competition, cells you may enter open -/+ below that half
  const card = $('rkCard'); card.textContent = '';
  const ph = playHoles();
  if (rkSel && !all.some(p => p.id === rkSel.pid && canEdit(p.id))) rkSel = null;
  halves().forEach(({ name: label, from }) => {  // front / back nine, headed by the nine's name
    const t = el('table', 'sc'), head = el('tr'), par = el('tr', 'par');
    head.append(el('th', '', 'H')); par.append(el('td', '', 'Par'));
    let parSum = 0;
    for (let i = from; i < from + NINE; i++) { head.append(el('th', '', i + 1)); par.append(el('td', '', ph[i].par)); parSum += ph[i].par; }
    head.append(el('th', 'sum', label)); par.append(el('td', 'sum', parSum));
    t.append(head, par);
    all.forEach(p => {
      const tr = el('tr', p.id === myId() ? 'me' : ''), a = strokesOf(p); let sum = 0, any = false;
      tr.append(el('td', '', pName(p)));
      for (let i = from; i < from + NINE; i++) {
        const v = a[i], ed = comp && canEdit(p.id), c = scoreCell(p, i, rkSel && rkSel.pid === p.id && rkSel.i === i);
        if (ed) c.classList.add('ed');
        if (ed || c.classList.contains('fx')) {
          c.setAttribute('role', 'button');
          c.onclick = () => {
            fixNote(p, i);
            if (ed) { rkSel = rkSel && rkSel.pid === p.id && rkSel.i === i ? null : { pid: p.id, i }; renderRank(); }
          };
        }
        tr.append(c);
        if (v != null) { sum += v; any = true; }
      }
      tr.append(el('td', 'sum', any ? sum : ''));
      t.append(tr);
    });
    card.appendChild(t);
    if (rkSel && rkSel.i >= from && rkSel.i < from + NINE) {
      const p = all.find(x => x.id === rkSel.pid);
      card.appendChild(scoreStepper(p, rkSel.i, renderRank, p.name));
    }
  });
}
let rkSel = null;  // the scoreboard cell being changed: { pid, i }

/* ================= scorecard image (JPEG) ================= */
// a simple card to keep or send: course name, date, everyone's front / back nine, and the ranking
// the card's title: in a competition the organizer's club, otherwise this phone's course
const cardName = () => (comp && comp.course && comp.course.club) || S.course.name;
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
  text(fit(cardName() || 'コース', W - 2 * M, 44, 900), M, M + 26, 44, 900, '#0a1322', 'left');
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
      text(fit(pName(p), NAME - 20, 24, 800), M + 14, y + RH / 2, 24, 800, '#0a1322', 'left');
      const a = strokesOf(p); let sum = 0, any = false;
      for (let k = 0; k < NINE; k++) {
        const v = a[from + k], hp = holes[from + k].par;
        if (v == null) continue;
        sum += v; any = true;
        text(v, cx(k) + CELL / 2, y + RH / 2, 26, v < hp ? 900 : 700, SC_COLOR[scoreCls(v, hp)] || '#0a1322');
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
  [['順位', COL.pos], ['パーとの差', COL.diff], ['合計打数', COL.tot], ['ホール数', COL.n]].forEach(([s, x]) => text(s, x, y + HH / 2, 20, 800, '#36414d'));
  text('名前', COL.name, y + HH / 2, 20, 800, '#36414d', 'left');
  const top = y; y += HH;
  rows.forEach(r => {
    hline(y);
    text(r.pos || '—', COL.pos, y + RH / 2, 28, 900, r.pos === 1 ? '#8a6508' : '#0a1322');
    text(fit(pName(r.p), COL.diff - COL.name - 80, 26, 800), COL.name, y + RH / 2, 26, 800, '#0a1322', 'left');
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
  const name = `${(cardName() || 'score').replace(/[\/:*?"<>|\s]+/g, '_')}_${ymd}.jpg`;
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

