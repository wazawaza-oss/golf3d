/* golf3d — compui: competition screens inside settings
   create · overview (everyone) · organizer: names, teams and leads, links (LINE / copy / QR) · choosing your name
   Plain scripts loaded in order from index.html (no build step); they share top-level names. */
"use strict";

Object.assign(M_TITLE, { mCompNew: 'コンペを作る', mComp: 'コンペ', mRoster: '参加者と組', mLinks: 'リンクを送る', mPick: '名前を選ぶ' });
Object.assign(M_RENDER, { mCompNew: () => renderCompNew(), mComp: () => renderComp(), mRoster: () => renderRoster(), mLinks: () => renderLinks(), mPick: () => comp && renderPick() });
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const compEnded = () => comp && comp.meta && comp.meta.expires < Date.now();
const offlineMsg = '接続できませんでした。電波のある所でもう一度お試しください';

// the 「コンペ」 row on the main settings list
function renderCompRow() {
  const t = $('cpRowT'); t.textContent = '';
  if (!comp) { t.append('コンペを作る', el('small', '', '参加者にリンクを送って、全員のスコアを集めます')); $('cpRowV').textContent = ''; return; }
  t.append((comp.meta && comp.meta.name) || 'コンペ', el('small', '', comp.meta && comp.meta.date ? comp.meta.date.replace(/-/g, '/') : ''));
  $('cpRowV').textContent = roleLabel();
}
$('goComp').onclick = () => {
  if (comp) { renderComp(); mShow('mComp'); return; }
  renderCompNew();
  if (!$('cpName').value && S.course.name && S.course.name !== UNNAMED) $('cpName').value = `${S.course.name}コンペ`.slice(0, 40);  // else the placeholder (例：秋の月例会)
  $('cpDate').value = $('cpDate').value || today();
  mShow('mCompNew');
};
// the 18 holes that would be handed out, and how many of them have both tee and green
const compRegCount = () => { const hs = localNines().flatMap(x => x.holes); return { n: hs.filter(registered).length, all: hs.length }; };
function renderCompNew() {
  $('cpNewNineV').textContent = localNines().map(x => x.name).join(' → ');
  const r = compRegCount();
  $('cpNeedReg').hidden = r.n > 0;
  $('cpNeedRegT').textContent = `先にコースを登録してください（今は ${r.n} / ${r.all}ホール）。コースがないと距離も順位も出せません。`;
  $('cpCreate').disabled = r.n === 0;
}
$('cpNewNine').onclick = () => { renderNinePick(); mShow('mNine'); };
$('cpGoReg').onclick = () => openSetup();
$('cpCreate').onclick = () => {
  const name = $('cpName').value.trim(), r = compRegCount();
  if (!name) { toast('コンペ名を入れてください'); $('cpName').focus(); return; }
  if (!r.n) return;
  const sure = () => ask('作成します。よろしいですか？',
    `コンペ名：${name.slice(0, 40)}\n日付：${($('cpDate').value || today()).replace(/-/g, '/')}\n回るコース：${localNines().map(x => x.name).join(' → ')}\n作ったコンペは${COMP_DAYS}日間使えて、そのあと自動で消えます（途中で消すことはできません）`,
    '作成する', compCreateRun, { go: true });
  if (r.n < r.all) ask('コースが一部しか登録されていません。先に登録しますか？',
    `登録済みは ${r.n} / ${r.all}ホールです。登録していないホールは、参加者の地図に距離が出ません`,
    '登録へ進む', () => openSetup(), { go: true, alt: ['このまま作成', sure] });
  else sure();
};
async function compCreateRun() {
  const name = $('cpName').value.trim();
  $('cpCreate').disabled = true; toast('作成中…');
  try {
    await compCreate(name.slice(0, 40), $('cpDate').value || today());
    renderMenu(); renderComp(); mShow('mComp', true); toast(`「${name}」を作りました。次は参加者と組を入れてください`);
  } catch (e) { toast(offlineMsg); }
  $('cpCreate').disabled = false;
};

/* overview: everyone sees it; the organizer also gets the settings below it */
function renderComp() {
  if (!comp) return;
  const m = comp.meta || {}, pl = comp.player && (comp.roster || {})[comp.player];
  $('cpTitle').textContent = m.name || 'コンペ';
  $('cpDateV').textContent = (m.date || '').replace(/-/g, '/');
  $('cpRoleV').textContent = `${roleLabel()}${pl ? '（' + pl.name + '）' : ''}`;
  $('cpMyNameV').textContent = pl ? pl.name : '選ばない';
  $('cpCourseV').textContent = comp.course ? `${comp.course.club}（${playNines().map(x => x.name).join('・')}）` : '未設定';
  $('cpLiveV').textContent = compLive ? '● つながっています' : '○ オフライン（入力は電波が戻ったら送ります）';
  if (document.activeElement !== $('cpNameE')) $('cpNameE').value = m.name || '';
  if (document.activeElement !== $('cpDateE')) $('cpDateE').value = m.date || '';
  $('cpNineV').textContent = localNines().map(x => x.name).join(' → ');
  $('cpRosterV').textContent = `${rosterList().length}人・${teams().length}組`;
  $('cpNote').textContent = compEnded() ? 'このコンペは期限を過ぎたので、見るだけになっています。' : comp.role === 'org' ? '主催者が配ったコース・パー・ピン位置で、全員の順位を計算します。' : '';
  $('cpLeave').textContent = 'このコンペから抜ける';
  $('cpLeaveNote').textContent = 'このスマホをコンペから外します。コンペ自体と、ほかの人のスコアは消えません。' +
    (comp.role === 'org' ? '主催者に戻るには「主催者用リンク」が必要です。' : 'もう一度リンクを開けば、また参加できます。');
}
const setMeta = patch => {
  const meta = Object.assign({}, comp.meta, patch); comp.meta = meta; saveComp();
  fb().then(f => f.D.set(f.D.ref(f.db, cp('meta')), meta)).catch(() => toast(offlineMsg));
};
$('cpNameE').onchange = () => { const v = $('cpNameE').value.trim(); if (v) setMeta({ name: v.slice(0, 40) }); };
$('cpDateE').onchange = () => { if ($('cpDateE').value) setMeta({ date: $('cpDateE').value }); };
$('cpNine').onclick = () => { renderNinePick(); mShow('mNine'); };
$('cpRoster').onclick = () => { renderRoster(); mShow('mRoster'); };
$('cpLinks').onclick = () => { renderLinks(); mShow('mLinks'); };
$('cpMyName').onclick = () => { renderPick(); mShow('mPick'); };  // the organizer may also play under a roster name
$('cpLeave').onclick = () => ask(`「${(comp.meta && comp.meta.name) || 'コンペ'}」から抜けますか？`,
  comp.role === 'org' ? '主催者が抜けると、このスマホではコンペを管理できなくなります（主催者用リンクを開けば戻れます）' : 'もう一度リンクを開けば、また参加できます',
  '抜ける', () => { compLeave(); mShow('mMain'); renderMenu(); toast('コンペから抜けました'); });

/* organizer: names, teams and each team's lead (changes reach everyone at once, also mid-round) */
const rosterExtra = new Set();  // teams added (or emptied) on this screen that nobody is in yet
function rosterTeams() {
  const ts = [...new Set(teams().concat([...rosterExtra]))].sort((a, b) => a - b);
  return ts.length ? ts : [1];
}
function renderRoster() {
  const box = $('rosterList'); if (box.contains(document.activeElement) && document.activeElement.tagName === 'INPUT') return;  // don't redraw under the keyboard
  box.textContent = '';
  const list = rosterList(), shown = rosterTeams(), taken = comp.taken || {};
  shown.forEach(t => {
    const lead = list.find(r => r.id === leadOf(t));
    box.appendChild(el('div', 'grp-t', `${t}組${lead ? ` ・ 代表 ${lead.name}` : ''}`));
    const g = el('div', 'grp'), people = list.filter(r => r.team === t);
    people.forEach(r => {
      const row = el('div', 'mrow rrow'), l1 = el('div', 'r1'), l2 = el('div', 'r2');
      const inp = el('input'), sel = el('select'), on = leadOf(t) === r.id;
      inp.type = 'text'; inp.value = r.name; inp.maxLength = 12; inp.setAttribute('aria-label', '名前');
      nameLimit(inp);
      inp.onchange = () => {  // an empty box goes back to the name it had; a second "山田" becomes 山田（2）
        if (!inp.value.trim()) { inp.value = r.name; toast('名前は空にできません'); return; }
        const v = inp.value = cleanName(inp.value, list.filter(x => x.id !== r.id).map(x => x.name), r.name);
        compRosterSet(r.id, { name: v, team: r.team });
      };
      const del = el('button', 'x', '✕'); del.setAttribute('aria-label', `${r.name}を名簿から外す`);
      del.onclick = () => ask(`「${r.name}」を名簿から外しますか？`, 'この人のスコアも消えます', '外す', () => { compRosterDel(r.id); renderRoster(); });
      l1.append(inp, del);
      shown.forEach(k => { const o = el('option', '', `${k}組`); o.value = k; sel.appendChild(o); });
      sel.value = r.team; sel.setAttribute('aria-label', '組');
      sel.onchange = () => {
        if (people.length === 1) rosterExtra.add(t);  // the team being emptied stays on screen until it is deleted
        rosterExtra.delete(+sel.value); compMoveTeam(r.id, +sel.value); renderRoster();
      };
      const lb = el('button', 'lead' + (on ? ' on' : ''), on ? '★ 代表' : '代表にする');
      lb.setAttribute('aria-pressed', on);
      lb.onclick = () => { compSetLead(t, on ? null : r.id); renderRoster(); toast(on ? `${t}組の代表を外しました` : `${r.name}さんを${t}組の代表にしました`); };
      l2.append(sel, lb);
      if (taken[r.id]) {
        const rel = el('button', 'tag', '参加中・解除'); rel.setAttribute('aria-label', `${r.name}は名前を選び済み。選択を解除する`);
        rel.onclick = () => ask(`「${r.name}」の選択を解除しますか？`, '選んだ人のスマホに、名前の選び直しを出します', '解除する', () => compRelease(r.id).catch(() => toast(offlineMsg)));
        l2.appendChild(rel);
      } else l2.appendChild(el('span', 'st', '未参加'));
      row.append(l1, l2);
      g.appendChild(row);
    });
    const add = el('button', 'mrow add', '＋ この組に追加'); add.onclick = () => rosterAddTo(t);
    g.appendChild(add);
    if (!people.length && shown.length > 1) {
      const rm = el('button', 'mrow danger', 'この組を消す'); rm.onclick = () => { rosterExtra.delete(t); renderRoster(); };
      g.appendChild(rm);
    }
    box.appendChild(g);
  });
}
function rosterAddTo(team) {
  let n = rosterList().length + 1; const pid = 'p' + rid(8);
  while (rosterList().some(r => r.name === `参加者${n}`)) n++;
  rosterExtra.delete(team);
  compRosterSet(pid, { name: `参加者${n}`, team });
  renderRoster();
  const i = [...$('rosterList').querySelectorAll('.rrow input')].find(x => x.value === `参加者${n}`);
  if (i) { i.focus(); i.select(); }
}
$('rosterAdd').onclick = () => { rosterExtra.add(Math.max(0, ...rosterTeams()) + 1); renderRoster(); };

/* organizer: links — LINE (share sheet), copy, QR */
const QR_LIB = 'https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js';
let qrP = null;
const loadQr = () => qrP || (qrP = new Promise((ok, no) => { const s = document.createElement('script'); s.src = QR_LIB; s.onload = ok; s.onerror = () => { qrP = null; no(); }; document.head.appendChild(s); }));
function renderLinks() {
  const box = $('linkList'); box.textContent = '';
  [{ head: '参加者に送る', label: '参加者用リンク', role: 'player', note: '参加者全員に、この同じリンクを送ります。開いた人は名簿から自分の名前を選びます' },
   { head: '主催者を交代する・手伝ってもらう', label: '主催者用リンク', role: 'org', note: '渡した相手が主催者になり、名簿・コース・全員のスコアを変えられます。参加者には送らないでください。自分のスマホを替えるときや、主催者を手伝ってもらうときだけ使います' }].forEach(it => {
    const t = el('div', 'grp-t' + (it.role === 'org' ? ' lorg' : ''), it.head);
    if (it.role === 'org') t.prepend(el('span', 'danger-tag', '注意'));
    box.appendChild(t);
    const g = el('div', 'grp' + (it.role === 'org' ? ' lorg' : '')), row = el('div', 'mrow lbtns');
    const mk = (txt, fn) => { const b = el('button', '', txt); b.onclick = () => {
      const go = async () => { let url; try { url = linkFor(await ensureInvite(it.role), it.role); } catch (e) { toast(offlineMsg); return; } fn(url); };
      if (it.role === 'org') ask('主催者用リンクを出しますか？', '渡した相手が主催者になります（名簿・コース・全員のスコアを変えられます）。参加者に送るのは「参加者用リンク」です', '主催者用を出す', go);
      else go();
    }; return b; };
    row.append(
      mk('LINEで送る', async url => { try { if (navigator.share) { await navigator.share({ title: comp.meta.name, text: `${comp.meta.name}（${it.label}）`, url }); return; } } catch (e) { if (e.name === 'AbortError') return; } copyText(url); }),
      mk('コピー', url => copyText(url)),
      mk('QRコード', url => showQr(it.label, url)));
    g.append(row, el('p', 'lnote', it.note));
    box.appendChild(g);
  });
}
async function copyText(s) { try { await navigator.clipboard.writeText(s); toast('リンクをコピーしました'); } catch (e) { toast(s); } }
async function showQr(label, url) {
  try { await loadQr(); } catch (e) { toast(offlineMsg); return; }
  const q = qrcode(0, 'M'); q.addData(url); q.make();
  $('qrT').textContent = label; $('qrBox').innerHTML = q.createSvgTag({ cellSize: 5, margin: 2, scalable: true });
  $('qr').hidden = false;
}
$('qrClose').onclick = () => $('qr').hidden = true;

/* choosing your own name from the roster (players must; the organizer may, to play too) */
function renderPick() {
  const box = $('pickList'); box.textContent = '';
  const taken = comp.taken || {};
  teams().forEach(t => {
    box.appendChild(el('div', 'grp-t', `${t}組`));
    const g = el('div', 'grp');
    rosterList().filter(r => r.team === t).forEach(r => {
      const mine = r.id === comp.player, other = taken[r.id] && taken[r.id] !== comp.uid;
      const b = el('button', 'mrow'); b.disabled = other || !!comp.player;
      b.append(el('span', 'mtx', r.name), el('span', 'mval', mine ? 'あなた' : other ? '選択済み' : ''));
      b.onclick = async () => {
        try {
          await compPick(r.id); refresh();
          const lt = compLeadTeam(); toast(`「${r.name}」で参加しました${lt ? `（${lt}組のカート代表）` : ''}`);
          if (comp.role === 'org') $('mBack').click(); else $('menu').hidden = true;  // the organizer came from the competition screen
        }
        catch (e) { toast(denied(e) ? 'その名前は選べません（ほかの人が選んだか、期限切れです）' : offlineMsg); }
      };
      g.appendChild(b);
    });
    box.appendChild(g);
  });
  if (!rosterList().length) box.appendChild(el('p', 'grp-f', '主催者がまだ名簿を作っていません。少し待ってから開き直してください。'));
}
function openPick() { openSheet('menu'); renderMenu(); renderPick(); mShow('mMain'); mShow('mPick'); }

// keep whichever competition screen is open in step with the server
function renderCompScreens() {
  if (!$('mComp').hidden) renderComp();
  if (!$('mRoster').hidden) renderRoster();
  if (!$('mPick').hidden && comp) renderPick();
  if (!$('mNine').hidden) renderNinePick();
}
