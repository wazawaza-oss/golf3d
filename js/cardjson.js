/* golf3d — cardjson: a score card turned into JSON by an outside AI (schemaVersion 1) → par, HDCP and yardages of the course.
   No network and no screen here (the screen is js/import.js), so tests/course.html can run it.
     readCard(text)      → { card, errors }   card: { name, unit, url, tees: [{ id, label }], nines: [{ name, holes: [{ no, par, hdcp, dist }×9], totals }], notes }
     cardIssues(card)    → { cells: Set of cell keys, list: [messages], light: [messages] }   (warnings: the import can still go on)
     cardTeeMap(card, c) → { cardTeeId: course tee id | 'new' }   first guess, changed on the screen
     applyCard(c, card, teeMap, mode) → the course with the card's values ('over': same golf club, positions kept; 'new': another golf club)
   Plain scripts loaded in order from index.html (no build step); they share top-level names. */
"use strict";

const CARD_DIST = { 3: [70, 260], 4: [250, 520], 5: [400, 650] };  // yards
const cardNum = v => typeof v === 'number' && isFinite(v) ? v : null;
const cardText = v => typeof v === 'string' && v.trim() ? v.trim() : null;

function readCard(text) {
  const errors = [];
  let j;
  try { j = JSON.parse(String(text).trim().replace(/^```(?:json)?\s*|\s*```$/g, '')); } catch (e) { return { card: null, errors: ['JSONとして読めませんでした（貼り付けが途中で切れていないか確かめてください）'] }; }
  if (!j || typeof j !== 'object') return { card: null, errors: ['JSONの形が違います'] };
  if (j.schemaVersion !== 1) return { card: null, errors: [`schemaVersion ${j.schemaVersion === undefined ? 'がありません' : `${j.schemaVersion} には対応していません`}（1 だけ読めます）`] };
  const c = j.course && typeof j.course === 'object' ? j.course : {};
  const tees = [];
  (Array.isArray(c.tees) ? c.tees : []).forEach(t => {
    const id = t && cardText(String(t.id || ''));
    if (id && !tees.some(x => x.id === id)) tees.push({ id, label: cardText(t.label) || id });
  });
  if (!tees.length) errors.push('ティー（tees）がありません');
  const ids = tees.map(t => t.id);
  if (!Array.isArray(c.nines) || !c.nines.length) errors.push('ナイン（nines）がありません');
  const nines = (Array.isArray(c.nines) ? c.nines : []).map((x, k) => {
    x = x || {};
    const name = (cardText(x.name) || `ナイン${k + 1}`).slice(0, 12);
    const raw = Array.isArray(x.holes) ? x.holes : [];
    if (raw.length !== NINE) errors.push(`「${name}」のホールが${raw.length}件です（9件必要です）`);
    // in the order of their numbers when they are 1–9 each once, else as listed
    const nos = raw.map(h => h && h.no);
    const byNo = nos.slice().sort((a, b) => a - b).every((v, i) => v === i + 1);
    const list = byNo ? raw.slice().sort((a, b) => a.no - b.no) : raw;
    const holes = list.map((h, i) => {
      h = h || {};
      const dist = {};
      ids.forEach(id => { dist[id] = null; });
      Object.keys(h.dist && typeof h.dist === 'object' ? h.dist : {}).forEach(id => {
        if (!ids.includes(id)) errors.push(`「${name}」${i + 1}番の距離に、ティーにないid「${id}」があります`);
        else dist[id] = cardNum(h.dist[id]);
      });
      return { no: i + 1, par: cardNum(h.par), hdcp: cardNum(h.hdcp), dist };
    });
    const t = x.printedTotals && typeof x.printedTotals === 'object' ? x.printedTotals : null;
    const totals = t ? { par: cardNum(t.par), dist: {} } : null;
    if (totals && t.dist && typeof t.dist === 'object') ids.forEach(id => { totals.dist[id] = cardNum(t.dist[id]); });
    return { name, holes, totals, byNo };
  });
  if (errors.length) return { card: null, errors: [...new Set(errors)] };
  return { card: {
    name: cardText(c.name) ? cardText(c.name).slice(0, 40) : null, unit: c.unit === 'meter' ? 'meter' : 'yard',
    url: cardText(c.sourceUrl), tees, nines,
    notes: (Array.isArray(j.warnings) ? j.warnings : []).map(cardText).filter(Boolean)
  }, errors };
}

// cell keys: `${nine}.${hole}.par` / `.hdcp` / `.t.${teeId}`, totals `${nine}.sum.par` / `${nine}.sum.${teeId}`
function cardIssues(card) {
  const cells = new Set(), list = [], light = [];
  const unit = card.unit === 'meter' ? 'm' : 'Y';
  let blanks = 0;
  card.nines.forEach((x, k) => {
    if (!x.byNo) list.push(`「${x.name}」のホール番号が1〜9になっていません（並んでいる順に読みました）`);
    x.holes.forEach((h, i) => {
      const at = `${x.name} ${h.no}番`;
      if (![3, 4, 5].includes(h.par)) { cells.add(`${k}.${i}.par`); list.push(`${at}：パーが${h.par === null ? '空欄' : ` ${h.par}`}です`); }
      card.tees.forEach(t => {
        const v = h.dist[t.id];
        if (v === null) { cells.add(`${k}.${i}.t.${t.id}`); blanks++; return; }
        const r = card.unit === 'yard' && CARD_DIST[h.par];
        if (r && (v < r[0] || v > r[1])) { cells.add(`${k}.${i}.t.${t.id}`); list.push(`${at} ${t.label}：${v}Yはパー${h.par}の目安（${r[0]}〜${r[1]}Y）の外です`); }
      });
    });
    const par = x.holes.reduce((a, h) => a + (h.par || 0), 0);
    if (x.holes.every(h => h.par !== null) && (par < 34 || par > 38)) { cells.add(`${k}.sum.par`); list.push(`「${x.name}」のパー合計が${par}です（ふつうは34〜38）`); }
    if (x.totals) {
      if (x.totals.par !== null && x.totals.par !== par) { cells.add(`${k}.sum.par`); list.push(`「${x.name}」のパー合計${par}が、カードの合計${x.totals.par}と違います`); }
      card.tees.forEach(t => {
        const p = x.totals.dist[t.id], s = x.holes.reduce((a, h) => a + (h.dist[t.id] || 0), 0);
        if (p != null && p !== s) { cells.add(`${k}.sum.${t.id}`); list.push(`「${x.name}」${t.label}の合計${s}${unit}が、カードの合計${p}${unit}と違います`); }
      });
    }
  });
  if (blanks) list.push(`距離が空欄のマスが${blanks}か所あります（空欄は登録しません）`);
  card.notes.forEach(n => list.push(`AIのメモ：${n}`));
  if (!card.url) light.push('出典のURLがありません（スコアカードの写真から作ったときは、このままで大丈夫です）');
  return { cells, list, light };
}

/* a tee's colour from its label (バック → blue, レギュラー → white, レディース → red, …) */
const TEE_GUESS = [
  [/黒|ブラック|black|チャンピオン|champ/i, 'black', '#222222'], [/金|ゴールド|gold|シニア|senior/i, 'gold', '#c9a227'],
  [/青|ブルー|blue|バック|back/i, 'blue', '#1f5fd1'], [/白|ホワイト|white|レギュラー|regular/i, 'white', '#ffffff'],
  [/赤|レッド|red|レディ|lady|ladies/i, 'red', '#d93025'], [/緑|グリーン|green/i, 'green', '#2e9e44'], [/黄|イエロー|yellow|フロント|front/i, 'yellow', '#e8c21a']
];
const teeGuess = label => TEE_GUESS.find(g => g[0].test(label)) || null;
// the same name, else the guessed colour among the course's colours (each colour once), else a new colour
function cardTeeMap(card, c) {
  const map = {}, used = new Set();
  card.tees.forEach(t => {
    const g = teeGuess(t.label);
    const hit = c.tees.find(x => !used.has(x.id) && x.name === t.label)
      || (g && c.tees.find(x => !used.has(x.id) && (x.id === g[1] || x.color.toLowerCase() === g[2] || g[0].test(x.name))));
    map[t.id] = hit ? hit.id : 'new';
    if (hit) used.add(hit.id);
  });
  return map;
}

/* the card's values into a copy of the course c (the draft); positions are never touched.
   over: nines matched by name, else in order among the ones left; unknown nines are added, the others stay as they are;
         a blank value on the card keeps the course's value.
   new:  the card's nines only (no positions), the colours it uses; the base colour is レギュラー / 白 or the middle one. */
function applyCard(c, card, teeMap, mode) {
  const out = JSON.parse(JSON.stringify(c));
  const toYd = v => Math.round(card.unit === 'meter' ? v / YD : v);
  const tees = mode === 'new' ? [] : out.tees, ids = {};
  card.tees.forEach(t => {
    const id = teeMap[t.id];
    const have = id !== 'new' && c.tees.find(x => x.id === id);
    if (have) { ids[t.id] = have.id; if (!tees.some(x => x.id === have.id)) tees.push(Object.assign({}, have)); return; }
    const g = teeGuess(t.label), nid = newId('t');
    tees.push({ id: nid, name: t.label.slice(0, 8), color: g ? g[2] : '#888888' }); ids[t.id] = nid;
  });
  out.tees = tees;
  const fill = (h, ch) => {
    if ([3, 4, 5, 6].includes(ch.par)) h.par = ch.par;
    if (cleanHdcp(ch.hdcp) !== null) h.hdcp = ch.hdcp;
    card.tees.forEach(t => { const v = ch.dist[t.id]; if (v > 0 && toYd(v) < 1000) h.yd[ids[t.id]] = toYd(v); });
  };
  if (mode === 'new') {
    out.nines = card.nines.map(x => { const n = blankNine(x.name); n.holes.forEach((h, i) => fill(h, x.holes[i])); return n; });
    const reg = card.tees.find(t => /白|ホワイト|white|レギュラー|regular/i.test(t.label)) || card.tees[Math.floor((card.tees.length - 1) / 2)];
    out.baseTee = ids[reg.id];
    if (card.name) out.name = card.name;
    return out;
  }
  const left = out.nines.slice(), take = n => { left.splice(left.indexOf(n), 1); return n; };
  const named = card.nines.map(x => { const n = left.find(y => y.name === x.name); return n ? take(n) : null; });
  card.nines.forEach((x, k) => {
    let n = named[k] || (left.length ? take(left[0]) : null);
    if (!n) { n = blankNine(x.name); out.nines.push(n); }
    n.name = x.name;
    n.holes.forEach((h, i) => { if (!h.yd) h.yd = {}; fill(h, x.holes[i]); });
  });
  if (!out.tees.some(t => t.id === out.baseTee)) out.baseTee = out.tees[0].id;
  return out;
}
