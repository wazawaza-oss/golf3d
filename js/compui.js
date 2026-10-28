/* golf3d — compui: competition screens inside settings
   create · overview (everyone) · organizer: names and teams, links (LINE / copy / QR) · player: choosing your name
   Plain scripts loaded in order from index.html (no build step); they share top-level names. */
"use strict";

Object.assign(M_TITLE, { mCompNew: 'コンペを作る', mComp: 'コンペ', mRoster: '参加者と組', mLinks: 'リンクを送る', mPick: '名前を選ぶ' });
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const compEnded = () => comp && comp.meta && comp.meta.expires < Date.now();
const offlineMsg = '接続できませんでした。電波のある所でもう一度お試しください';

// the 「コンペ」 row on the main settings list
function renderCompRow() {
  const t = $('cpRowT'); t.textContent = '';
  if (!comp) { t.append('コンペを作る', el('small', '', '参加者にリンクを送って、全員のスコアを集めます')); $('cpRowV').textContent = ''; return; }
  t.append((comp.meta && comp.meta.name) || 'コンペ', el('small', '', comp.meta && comp.meta.date ? comp.meta.date.replace(/-/g, '/') : ''));
  $('cpRowV').textContent = comp.role === 'cart' ? `${ROLE_NAME.cart} ${comp.team}組` : ROLE_NAME[comp.role];
}
$('goComp').onclick = () => {
  if (comp) { renderComp(); mShow('mComp'); return; }
  if (!$('cpName').value) $('cpName').value = `${S.course.name || ''}コンペ`.slice(0, 40);
  $('cpDate').value = $('cpDate').value || today();
  mShow('mCompNew');
};
$('cpCreate').onclick = async () => {
  const name = $('cpName').value.trim();
  if (!name) { toast('コンペ名を入れてください'); $('cpName').focus(); return; }
  $('cpCreate').disabled = true; toast('作成中…');
  try {
    await compCreate(name.slice(0, 40), $('cpDate').value || today());
    renderMenu(); renderComp(); mShow('mComp'); toast(`「${name}」を作りました。次は参加者と組を入れてください`);
  } catch (e) { toast(offlineMsg); }
  $('cpCreate').disabled = false;
};

/* overview: everyone sees it; the organizer also gets the settings below it */
function renderComp() {
  if (!comp) return;
  const m = comp.meta || {}, pl = comp.player && (comp.roster || {})[comp.player];
  $('cpTitle').textContent = m.name || 'コンペ';
  $('cpDateV').textContent = (m.date || '').replace(/-/g, '/');
  $('cpRoleV').textContent = comp.role === 'cart' ? `${ROLE_NAME.cart}（${comp.team}組）` : comp.role === 'player' ? `${ROLE_NAME.player}${pl ? '（' + pl.name + '）' : ''}` : ROLE_NAME.org;
  $('cpCourseV').textContent = comp.course ? `${comp.course.club}（${playNines().map(x => x.name).join('・')}）` : '未設定';
  $('cpLiveV').textContent = compLive ? '● つながっています' : '○ オフライン（入力は電波が戻ったら送ります）';
  if (document.activeElement !== $('cpNameE')) $('cpNameE').value = m.name || '';
  if (document.activeElement !== $('cpDateE')) $('cpDateE').value = m.date || '';
  $('cpNineV').textContent = localNines().map(x => x.name).join(' → ');
  $('cpRosterV').textContent = `${rosterList().length}人・${teams().length}組`;
  $('cpNote').textContent = compEnded() ? 'このコンペは期限を過ぎたので、見るだけになっています。' : comp.role === 'org' ? '主催者が配ったコース・パー・ピン位置で、全員の順位を計算します。' : '';
  $('cpLeave').textContent = 'このコンペから抜ける';
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
$('cpLeave').onclick = () => ask(`「${(comp.meta && comp.meta.name) || 'コンペ'}」から抜けますか？`,
  comp.role === 'org' ? '主催者が抜けると、このスマホではコンペを管理できなくなります（主催者の引き継ぎ用リンクを開けば戻れます）' : 'もう一度リンクを開けば、また参加できます',
  '抜ける', () => { compLeave(); mShow('mMain'); renderMenu(); toast('コンペから抜けました'); });

/* organizer: names and teams */
function renderRoster() {
  const box = $('rosterList'); if (box.contains(document.activeElement)) return;  // don't redraw under the keyboard
  box.textContent = '';
  const list = rosterList(), maxTeam = Math.max(1, ...list.map(r => r.team)) + 1;
  teams().forEach(t => {
    box.appendChild(el('div', 'grp-t', `${t}組`));
    const g = el('div', 'grp');
    list.filter(r => r.team === t).forEach(r => {
      const row = el('div', 'mrow rrow'), inp = el('input'), sel = el('select');
      inp.type = 'text'; inp.value = r.name; inp.maxLength = 12; inp.setAttribute('aria-label', '名前');
      inp.onchange = () => { const v = inp.value.trim(); if (v) compRosterSet(r.id, { name: v.slice(0, 12), team: r.team }); else inp.value = r.name; };
      for (let k = 1; k <= Math.max(maxTeam, r.team); k++) { const o = el('option', '', `${k}組`); o.value = k; sel.appendChild(o); }
      sel.value = r.team; sel.setAttribute('aria-label', '組');
      sel.onchange = () => { compRosterSet(r.id, { name: r.name, team: +sel.value }); renderRoster(); };
      row.append(inp, sel);
      if ((comp.taken || {})[r.id]) {
        const rel = el('button', 'tag', '解除'); rel.setAttribute('aria-label', `${r.name}は選択済み。選択を解除する`);
        rel.onclick = () => ask(`「${r.name}」の選択を解除しますか？`, '選んだ人のスマホに、名前の選び直しを出します', '解除する', () => compRelease(r.id).catch(() => toast(offlineMsg)));
        row.appendChild(rel);
      }
      const del = el('button', 'x', '✕'); del.setAttribute('aria-label', `${r.name}を名簿から外す`);
      del.onclick = () => ask(`「${r.name}」を名簿から外しますか？`, 'この人のスコアも消えます', '外す', () => { compRosterDel(r.id); renderRoster(); });
      row.appendChild(del);
      g.appendChild(row);
    });
    box.appendChild(g);
  });
  if (!list.length) box.appendChild(el('p', 'grp-f', 'まだ誰もいません。「＋ 参加者を追加」から入れてください。'));
}
$('rosterAdd').onclick = () => {
  const list = rosterList(), last = list.length ? list[list.length - 1].team : 1;
  const team = list.filter(r => r.team === last).length >= 4 ? last + 1 : last;  // 4 to a cart, then the next team
  const pid = 'p' + rid(8);
  compRosterSet(pid, { name: `参加者${list.length + 1}`, team });
  renderRoster();
  const ins = $('rosterList').querySelectorAll('input'), i = [...ins].find(x => x.closest('.rrow') && x.value === `参加者${list.length + 1}`);
  if (i) { i.focus(); i.select(); }
};

/* organizer: links — LINE (share sheet), copy, QR */
const QR_LIB = 'https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js';
let qrP = null;
const loadQr = () => qrP || (qrP = new Promise((ok, no) => { const s = document.createElement('script'); s.src = QR_LIB; s.onload = ok; s.onerror = () => { qrP = null; no(); }; document.head.appendChild(s); }));
function renderLinks() {
  const box = $('linkList'); box.textContent = '';
  const items = [{ label: '参加者用（全員共通）', role: 'player', note: '開いた人は名簿から自分の名前を選び、自分のスコアだけ入力できます' }]
    .concat(teams().map(t => ({ label: `カート代表用（${t}組）`, role: 'cart', team: t, note: `${t}組の全員のスコアを入力できます` })))
    .concat([{ label: '主催者の引き継ぎ用', role: 'org', note: '開いたスマホも主催者になります。スマホを替えるときや、手伝ってもらうときに使います' }]);
  items.forEach(it => {
    box.appendChild(el('div', 'grp-t', it.label));
    const g = el('div', 'grp'), row = el('div', 'mrow lbtns');
    const mk = (txt, fn) => { const b = el('button', '', txt); b.onclick = async () => {
      let url; try { url = linkFor(await ensureInvite(it.role, it.team), it.role, it.team); } catch (e) { toast(offlineMsg); return; }
      fn(url);
    }; return b; };
    row.append(
      mk('LINEで送る', async url => { try { if (navigator.share) { await navigator.share({ title: comp.meta.name, text: `${comp.meta.name}（${it.label}）`, url }); return; } } catch (e) { if (e.name === 'AbortError') return; } copyText(url); }),
      mk('コピー', url => copyText(url)),
      mk('QRコード', url => showQr(it.label, url)));
    g.append(row, el('p', 'lnote', it.note));
    box.appendChild(g);
  });
  if (!teams().length) box.appendChild(el('p', 'grp-f', 'カート代表用のリンクは、「参加者と組」で組を入れると出ます。'));
}
async function copyText(s) { try { await navigator.clipboard.writeText(s); toast('リンクをコピーしました'); } catch (e) { toast(s); } }
async function showQr(label, url) {
  try { await loadQr(); } catch (e) { toast(offlineMsg); return; }
  const q = qrcode(0, 'M'); q.addData(url); q.make();
  $('qrT').textContent = label; $('qrBox').innerHTML = q.createSvgTag({ cellSize: 5, margin: 2, scalable: true });
  $('qr').hidden = false;
}
$('qrClose').onclick = () => $('qr').hidden = true;

/* player: choosing your own name from the roster */
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
        try { await compPick(r.id); $('menu').hidden = true; refresh(); toast(`「${r.name}」で参加しました`); }
        catch (e) { toast(denied(e) ? 'その名前は選べません（ほかの人が選んだか、期限切れです）' : offlineMsg); }
      };
      g.appendChild(b);
    });
    box.appendChild(g);
  });
  if (!rosterList().length) box.appendChild(el('p', 'grp-f', '主催者がまだ名簿を作っていません。少し待ってから開き直してください。'));
}
function openPick() { openSheet('menu'); renderMenu(); renderPick(); mShow('mPick'); }

// keep whichever competition screen is open in step with the server
function renderCompScreens() {
  if (!$('mComp').hidden) renderComp();
  if (!$('mRoster').hidden) renderRoster();
  if (!$('mPick').hidden && comp) renderPick();
  if (!$('mNine').hidden) renderNinePick();
}
