/* golf3d — import: the スコアカードから取り込む screen in course registration. JSON pasted or picked as a file
   (made by an outside AI; no AI is called from here) → errors, or a preview table to check and fix → into the draft.
   Reading, checking and applying live in js/cardjson.js.
   Plain scripts loaded in order from index.html (no build step); they share top-level names. */
"use strict";

Object.assign(M_TITLE, { mRegCard: 'スコアカードの取り込み' });
Object.assign(M_RENDER, { mRegCard: () => renderCard() });
let rc = null;  // { card, mode: 'over'|'new', map: { cardTeeId: course tee id | 'new' }, cells: { key: td } }

/* the request people send to their own AI (ChatGPT, Gemini, Claude…): it asks for the card in the format readCard reads.
   The golf club's name goes on the first line (the draft's name when it has one). */
function cardPrompt() {
  const n = S.draft && S.draft.course.name, name = n && ![UNNAMED, OLD_UNNAMED].includes(n) ? n : '（ここにゴルフ場の名前を書いてください）';
  return `ゴルフ場名：${name}

上のゴルフ場のスコアカード（各ホールのパー・ハンディキャップ・ティーごとの距離）を調べて、下の形式のJSONにしてください。ゴルフアプリに取り込みます。
スコアカードの写真を一緒に送った場合は、写真の値をいちばん優先してください。

【ルール】
- 答えは JSON だけを、\`\`\`json のコードブロック1つで返してください。前後の説明は要りません。
- 調べるときは、ゴルフ場の公式サイトのスコアカードやコースガイドを優先し、使ったページのURLを sourceUrl に入れてください（写真だけなら null）。
- ハーフ（OUT・IN、東・西・南など）ごとに nines に入れます。holes は必ず9件、no は 1〜9 です。
  18ホールのコースは OUT（1〜9番）と IN（10〜18番）に分け、IN の no も 1〜9 にします。3ハーフ以上あれば全部入れてください。
- par はパー（3〜5）、hdcp はハンディキャップ（1〜18、なければ null）。
- tees はカードの距離の列（バック・レギュラー・レディースなど）です。id は "t1"、"t2"… と順に付け、label にカードの表記（色や名前）を入れます。
  ベント・コーライなどグリーンによって距離が違うときは、別のティーとして分けてください。
- dist は各ティーの id ごとの距離です。unit はカードの単位で "yard" か "meter"。
- 分からない値は推測で埋めず null にしてください。
- printedTotals はカードに印刷されているハーフの合計（なければこの項目ごと省いてください）。
- tee と green は各ホールのティーとグリーンの位置（緯度 lat・経度 lng）です。分かるときだけ入れ、分からなければ null。
  source は調べ方（"official"：公式の資料、"osm"：OpenStreetMap、"map_view"：地図や航空写真を見て判断）、confidence は "high"・"medium"・"low"。
  center はコースのおおよその中心です。
- 自信のない値や気になる点は、warnings に日本語で短く書いてください。

【形式】（holes は各ハーフ9件。例は1件だけ書いています）
{
  "schemaVersion": 1,
  "course": {
    "name": "〇〇カントリークラブ",
    "unit": "yard",
    "sourceUrl": "https://example.com/course/",
    "center": { "lat": 35.0, "lng": 139.0 },
    "tees": [
      { "id": "t1", "label": "バック" },
      { "id": "t2", "label": "レギュラー" },
      { "id": "t3", "label": "レディース" }
    ],
    "nines": [
      {
        "name": "OUT",
        "holes": [
          { "no": 1, "par": 4, "hdcp": 7, "dist": { "t1": 385, "t2": 360, "t3": 310 },
            "tee": { "lat": 35.0012, "lng": 139.0021, "source": "map_view", "confidence": "low" },
            "green": { "lat": 35.0040, "lng": 139.0005, "source": "map_view", "confidence": "low" } }
        ],
        "printedTotals": { "par": 36, "dist": { "t1": 3400, "t2": 3200, "t3": 2800 } }
      }
    ]
  },
  "warnings": []
}`;
}
$('rcPrompt').onclick = async () => {
  const s = cardPrompt(); $('rcPromptText').value = s;
  try { await navigator.clipboard.writeText(s); toast('お願い文をコピーしました。AIのアプリに貼り付けてください'); }
  catch (e) {  // older browsers: copy the selected text, else leave it shown and selected for a long press
    const d = $('rcPromptText'); d.closest('details').open = true; d.focus(); d.setSelectionRange(0, s.length);
    let ok = false; try { ok = document.execCommand('copy'); } catch (e2) {}
    toast(ok ? 'お願い文をコピーしました。AIのアプリに貼り付けてください' : 'コピーできませんでした。下の文を長押しして全部選び、コピーしてください');
  }
};
$('rgCard').onclick = () => { $('rcPromptText').value = cardPrompt(); mShow('mRegCard'); renderCard(); };
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
  const hasPos = card.nines.some(x => x.holes.some(h => h.tee || h.green));
  $('rcOver').setAttribute('aria-pressed', rc.mode === 'over'); $('rcNew').setAttribute('aria-pressed', rc.mode === 'new');
  $('rcModeInfo').textContent = rc.mode === 'over'
    ? `${[UNNAMED, OLD_UNNAMED].includes(c.name) ? '今のコース' : `「${c.name}」`}のパー・HDCP・ヤードを書き換えます。ハーフは同じ名前どうし（なければ順番）で合わせます。カードの空欄は今の値のままです${hasPos ? '。地図の位置は、まだ置いていないホールにだけ仮に入れます' : ''}`
    : `新しいコースとして下書きを作り直します。確定すると今のコース・スコア・ピン位置と置き換わります${hasPos ? '。地図の位置は仮に入れます' : ''}`;
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
    if (hasPos) head.appendChild(el('th', '', '地図'));
    card.tees.forEach(u => head.appendChild(el('th', '', u.label)));
    t.appendChild(head);
    x.holes.forEach((h, i) => {
      const tr = el('tr');
      tr.append(el('td', 'hn', h.no),
        num(() => h.par, v => { h.par = v; }, `${k}.${i}.par`, `${x.name} ${h.no}番のパー`),
        num(() => h.hdcp, v => { h.hdcp = v; }, `${k}.${i}.hdcp`, `${x.name} ${h.no}番のHDCP`));
      // the position from the card: 仮 (checked on the map after 登録), Tだけ / Gだけ when only one is there
      if (hasPos) {
        const ps = [h.tee, h.green].filter(Boolean), td = el('td', 'pos', !ps.length ? '—' : ps.length < 2 ? (h.tee ? 'Tだけ' : 'Gだけ') : '仮');
        if (ps.some(p => p.check)) td.appendChild(el('small', '', '要確認'));
        td.setAttribute('aria-label', `${x.name} ${h.no}番の地図の位置：${td.textContent}`);
        rc.cells[`${k}.${i}.pos`] = td; tr.appendChild(td);
      }
      card.tees.forEach(u => tr.appendChild(num(() => h.dist[u.id], v => { h.dist[u.id] = v > 0 ? v : null; }, `${k}.${i}.t.${u.id}`, `${x.name} ${h.no}番 ${u.label}の距離`)));
      t.appendChild(tr);
    });
    const sum = el('tr', 'sum');
    sum.append(el('td', '', '計'), rc.cells[`${k}.sum.par`] = el('td'), el('td'));
    if (hasPos) sum.appendChild(el('td'));
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
    const ai = out.nines.some(x => x.holes.some(h => h.src === 'ai' && !h.ok));
    toast(ai ? '下書きに入れました。地図の位置は仮なので、案内で確かめてから「確定して保存」を押してください' : '下書きに入れました。「確定して保存」で保存されます');
  };
  if (rc.mode !== 'new') { go(); return; }
  const placed = d.course.nines.some(x => x.holes.some(h => h.tee || h.green));
  const note = [placed && '下書きで置いたティーとグリーンの位置は消えます', '確定するまで今のコースは残ります。念のため、今のコースを先に書き出しておけます'].filter(Boolean).join('。');
  if (placed || allHoles().some(registered) || roundHasData()) ask('別のコースとして下書きを作り直しますか？', note, '作り直す', go, { go: true, alt: ['先に書き出す', () => $('exportBtn').click()] });
  else go();
};
