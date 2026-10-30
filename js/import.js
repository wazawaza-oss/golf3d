/* golf3d — import: the スコアカードから取り込む screen in course registration. JSON pasted or picked as a file
   (made by an outside AI; no AI is called from here) → errors, or a preview table to check and fix → into the draft.
   Reading, checking and applying live in js/cardjson.js.
   Plain scripts loaded in order from index.html (no build step); they share top-level names. */
"use strict";

Object.assign(M_TITLE, { mRegCard: 'スコアカードの取り込み' });
Object.assign(M_RENDER, { mRegCard: () => renderCard() });
let rc = null;  // { card, mode: 'over'|'new', map: { cardTeeId: course tee id | 'new' }, cells: { key: td } }

$('rgCard').onclick = () => { mShow('mRegCard'); renderCard(); };
$('rcFile').onclick = () => $('rcFileIn').click();
$('rcFileIn').onchange = async e => {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  $('rcText').value = await f.text().catch(() => '');
  $('rcRead').click();
};
$('rcRead').onclick = () => {
  const info = $('rcInfo'), text = $('rcText').value;
  info.classList.remove('err');
  if (!text.trim()) { rc = null; info.textContent = 'JSONを貼り付けるか、ファイルを選んでください'; info.classList.add('err'); renderCard(); return; }
  const { card, errors } = readCard(text);
  if (!card) { rc = null; info.textContent = '取り込めません：' + errors.join('／'); info.classList.add('err'); renderCard(); return; }
  const c = S.draft.course, empty = !c.nines.some(x => x.holes.some(h => h.tee || h.green || Object.keys(h.yd).length));
  const same = !card.name || card.name === c.name || [UNNAMED, OLD_UNNAMED].includes(c.name) || empty;
  rc = { card, mode: same ? 'over' : 'new', map: cardTeeMap(card, c), cells: {} };
  $('rcName').value = card.name || ([UNNAMED, OLD_UNNAMED].includes(c.name) ? '' : c.name);
  info.textContent = `${card.nines.map(x => x.name).join('・')}（${card.nines.length}ハーフ）、ティー${card.tees.length}つを読みました。下で確かめてください`;
  renderCard();
  $('rcInfo').scrollIntoView({ block: 'center' });
};
$('rcOver').onclick = () => { rc.mode = 'over'; rc.map = cardTeeMap(rc.card, S.draft.course); renderCard(); };
$('rcNew').onclick = () => { rc.mode = 'new'; renderCard(); };

function renderCard() {
  $('rcView').hidden = !rc;
  if (!rc) return;
  const { card } = rc, c = S.draft.course;
  // the source page, to compare with (http / https only)
  const src = $('rcSrc'); src.textContent = '';
  if (card.url && /^https?:\/\//i.test(card.url)) {
    const a = el('a', 'rcsrc', '出典のページを開く（見比べて確かめてください）'); a.href = card.url; a.target = '_blank'; a.rel = 'noopener noreferrer';
    a.appendChild(el('small', '', card.url)); src.appendChild(a);
  }
  $('rcOver').setAttribute('aria-pressed', rc.mode === 'over'); $('rcNew').setAttribute('aria-pressed', rc.mode === 'new');
  $('rcModeInfo').textContent = rc.mode === 'over'
    ? `${[UNNAMED, OLD_UNNAMED].includes(c.name) ? '今のコース' : `「${c.name}」`}のパー・HDCP・ヤードを書き換えます。ハーフは同じ名前どうし（なければ順番）で合わせます。カードの空欄は今の値のままです`
    : '新しいコースとして下書きを作り直します。確定すると今のコース・スコア・ピン位置と置き換わります';
  // tee colours: one select per tee on the card
  const tees = $('rcTees'); tees.textContent = '';
  card.tees.forEach(t => {
    const row = el('div', 'mrow rctee'), sel = el('select');
    sel.setAttribute('aria-label', `${t.label}を入れる色`);
    c.tees.forEach(x => { const o = el('option', '', x.name + (x.id === c.baseTee && rc.mode === 'over' ? '（地図に置く色）' : '')); o.value = x.id; sel.appendChild(o); });
    const o = el('option', '', '新しい色として追加'); o.value = 'new'; sel.appendChild(o);
    sel.value = rc.map[t.id];
    sel.onchange = () => {
      card.tees.forEach(u => { if (u !== t && rc.map[u.id] === sel.value && sel.value !== 'new') rc.map[u.id] = 'new'; });  // each colour once
      rc.map[t.id] = sel.value; renderCard();
    };
    row.append(el('span', 'mtx', t.label), sel); tees.appendChild(row);
  });
  // one table per nine: no, par, HDCP, a column per tee; every cell can be fixed
  const unit = card.unit === 'meter' ? 'm' : 'Y', box = $('rcTables'); box.textContent = ''; rc.cells = {};
  const num = (get, set, key, label) => {
    const td = el('td'), inp = el('input'); inp.type = 'number'; inp.inputMode = 'numeric'; inp.placeholder = '—';
    inp.value = get() === null ? '' : get(); inp.setAttribute('aria-label', label);
    inp.onchange = () => { const v = inp.value.trim() === '' ? null : Math.round(+inp.value); set(isFinite(v) ? v : null); inp.value = get() === null ? '' : get(); paintCard(); };
    td.appendChild(inp); rc.cells[key] = td; return td;
  };
  card.nines.forEach((x, k) => {
    box.appendChild(el('div', 'grp-t', `${x.name}（距離は${unit === 'm' ? 'メートル' : 'ヤード'}）`));
    const wrap = el('div', 'ydt'), t = el('table'), head = el('tr');
    head.append(el('th', '', '番'), el('th', '', 'パー'), el('th', '', 'HDCP'));
    card.tees.forEach(u => head.appendChild(el('th', '', u.label)));
    t.appendChild(head);
    x.holes.forEach((h, i) => {
      const tr = el('tr');
      tr.append(el('td', 'hn', h.no),
        num(() => h.par, v => { h.par = v; }, `${k}.${i}.par`, `${x.name} ${h.no}番のパー`),
        num(() => h.hdcp, v => { h.hdcp = v; }, `${k}.${i}.hdcp`, `${x.name} ${h.no}番のHDCP`));
      card.tees.forEach(u => tr.appendChild(num(() => h.dist[u.id], v => { h.dist[u.id] = v > 0 ? v : null; }, `${k}.${i}.t.${u.id}`, `${x.name} ${h.no}番 ${u.label}の距離`)));
      t.appendChild(tr);
    });
    const sum = el('tr', 'sum');
    sum.append(el('td', '', '計'), rc.cells[`${k}.sum.par`] = el('td'), el('td'));
    card.tees.forEach(u => sum.appendChild(rc.cells[`${k}.sum.${u.id}`] = el('td')));
    t.appendChild(sum); wrap.appendChild(t); box.appendChild(wrap);
  });
  paintCard();
}
// after every change: the totals, the yellow cells and the list of things to check
function paintCard() {
  const { card } = rc, is = cardIssues(card);
  card.nines.forEach((x, k) => {
    const put = (key, v, printed) => {
      const td = rc.cells[key]; td.textContent = v || '';
      if (printed != null && printed !== v) td.appendChild(el('small', '', `カード ${printed}`));
    };
    put(`${k}.sum.par`, x.holes.reduce((a, h) => a + (h.par || 0), 0), x.totals && x.totals.par);
    card.tees.forEach(u => put(`${k}.sum.${u.id}`, x.holes.reduce((a, h) => a + (h.dist[u.id] || 0), 0), x.totals && x.totals.dist[u.id]));
  });
  Object.keys(rc.cells).forEach(key => rc.cells[key].classList.toggle('warn', is.cells.has(key)));
  const ul = $('rcWarn'); ul.textContent = '';
  is.list.forEach(s => ul.appendChild(el('li', '', s)));
  is.light.forEach(s => ul.appendChild(el('li', 'light', s)));
  if (!is.list.length && !is.light.length) ul.appendChild(el('li', 'ok', '気になる所はありません'));
}

// 登録: into the draft (saved with 確定 on the registration screen; 下書きを捨てる undoes it)
$('rcGo').onclick = () => {
  const d = S.draft, name = $('rcName').value.trim().slice(0, 40);
  if (rc.mode === 'new' && !name) { toast('コース名を入れてください'); $('rcName').focus(); return; }
  const go = () => {
    const out = applyCard(d.course, rc.card, rc.map, rc.mode);
    if (rc.mode === 'new') {
      out.name = name;
      if (!d.fresh) out.area = null;  // the area searched for the old golf club does not fit; search again in 1
      Object.assign(d, { fresh: true, named: true });
    } else if (name && name !== d.course.name) { out.name = name; d.named = true; }
    d.course = out; saveDraft();
    rc = null; $('rcText').value = ''; $('rcInfo').textContent = '';
    mShow('mReg'); renderReg();
    toast('下書きに入れました。「確定して保存」で保存されます');
  };
  if (rc.mode !== 'new') { go(); return; }
  const placed = d.course.nines.some(x => x.holes.some(h => h.tee || h.green));
  const note = [placed && '下書きで置いたティーとグリーンの位置は消えます', '確定するまで今のコースは残ります。念のため、今のコースを先に書き出しておけます'].filter(Boolean).join('。');
  if (placed || allHoles().some(registered) || roundHasData()) ask('別のコースとして下書きを作り直しますか？', note, '作り直す', go, { go: true, alt: ['先に書き出す', () => $('exportBtn').click()] });
  else go();
};
