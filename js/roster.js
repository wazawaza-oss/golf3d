/* golf3d — roster: names and teams, invite links, this phone's role notice, opening a link (needs js/share.js)
   Plain scripts loaded in order from index.html (no build step); they share top-level names. */
"use strict";

/* ---------- names, roster, invites ---------- */
// code: the carry-over code from Safari (comp.moveFrom), to take back the name chosen there (the rules check it)
async function compPick(pid, code) {
  const f = await withTimeout(fb(), 15000), u = { [`taken/${pid}`]: comp.uid, [`members/${comp.uid}/player`]: pid };
  if (code) u[`members/${comp.uid}/move`] = code;
  await withTimeout(f.D.update(f.D.ref(f.db, `comps/${comp.cid}`), u), 15000);
  comp.player = pid; (comp.taken = comp.taken || {})[pid] = comp.uid; saveComp();
}
// the organizer undoes a wrong choice: the name is free again and that phone is asked to choose
async function compRelease(pid) {
  const uid = (comp.taken || {})[pid]; if (!uid) return;
  const f = await fb(), u = { [`taken/${pid}`]: null }; u[`members/${uid}/player`] = null;
  await f.D.update(f.D.ref(f.db, `comps/${comp.cid}`), u);
}
function compRosterSet(pid, r) {
  comp.roster = Object.assign({}, comp.roster, { [pid]: r }); saveComp();
  fb().then(f => f.D.set(f.D.ref(f.db, cp('roster/' + pid)), r)).catch(() => toast('保存できませんでした。電波を確認してください'));
}
const saveFail = () => toast('保存できませんでした。電波を確認してください');
const compUpdate = u => fb().then(f => f.D.update(f.D.ref(f.db, `comps/${comp.cid}`), u)).catch(saveFail);
function compRosterDel(pid) {
  const r = comp.roster[pid], u = { [`roster/${pid}`]: null, [`scores/${pid}`]: null, [`taken/${pid}`]: null };
  if (r && leadOf(r.team) === pid) { u[`leads/t${r.team}`] = null; delete comp.leads['t' + r.team]; }
  delete comp.roster[pid]; if (comp.scores) delete comp.scores[pid]; saveComp();
  compUpdate(u);
}
// moving someone to another team (an old team lead mark from before 2026-11 is cleared with it; leads no longer mean anything)
function compMoveTeam(pid, team) {
  const r = comp.roster[pid]; if (!r || +r.team === team) return;
  const u = { [`roster/${pid}`]: { name: r.name, team } };
  if (leadOf(r.team) === pid) { u[`leads/t${r.team}`] = null; delete comp.leads['t' + r.team]; }
  comp.roster = Object.assign({}, comp.roster, { [pid]: { name: r.name, team } }); saveComp();
  compUpdate(u);
}
// one key per link: everyone shares the players' one, and one hands the organizer role to another phone
async function ensureInvite(role) {
  const hit = Object.entries(comp.invites || {}).find(([, v]) => v.role === role);
  if (hit) return hit[0];
  const key = rid(22), v = { role, t: Date.now() };
  const f = await withTimeout(fb(), 15000); await withTimeout(f.D.set(f.D.ref(f.db, cp('invites/' + key)), v), 15000);
  (comp.invites = comp.invites || {})[key] = v; saveComp();
  return key;
}
// openExternalBrowser=1: LINE opens the link straight in Safari / Chrome instead of its own browser, whose storage is
// separate (a name chosen inside LINE was not there when the same person later opened the app in the browser)
const linkFor = (key, role) => `${location.origin}${location.pathname}?c=${comp.cid}&k=${key}&r=${role}&openExternalBrowser=1`;

/* ---------- this phone's role, and a short notice when it changes ---------- */
const roleKind = () => !comp ? 'solo' : comp.role === 'org' ? 'org' : 'player';
const roleLabel = () => ROLE_NAME[roleKind()] || '';
function roleNotice() {
  if (!comp || !comp.meta || !comp.roster) return;
  const k = roleKind(), t = myTeam(), now = `${k}:${t || ''}`, was = comp.seen;
  if (now === was) return;
  comp.seen = now; saveComp();
  if (!was) return;  // the first look after joining: nothing has changed yet
  const [wk, wt] = was.split(':');
  const msg = k === 'org' ? (wk === 'org' ? '' : '主催者になりました')
    : t && wt && String(t) !== wt ? `${t}組に移りました（${t}組の人のスコアを入力できます）` : '';
  if (msg) toast(msg);
}

/* ---------- opening a link ---------- */
(() => {
  const q = new URLSearchParams(location.search), c = q.get('c');
  if (!c) return;
  const k = q.get('k') || '', r = q.get('r'), ua = navigator.userAgent;
  // a link sent before 2026-11-28 (no openExternalBrowser) opened inside LINE: ask LINE once to hand it to the browser
  if (/ Line\//.test(ua) && !q.has('openExternalBrowser')) { q.set('openExternalBrowser', '1'); location.replace(`${location.pathname}?${q}${location.hash}`); return; }
  // inside an in-app browser the link stays in the address, so its "open in browser" carries it to Safari / Chrome
  const inApp = / Line\/|FBAN|FBAV|Instagram/.test(ua);
  if (!inApp) history.replaceState(null, '', location.pathname + location.hash);
  if (!/^[A-Za-z0-9]{10}$/.test(c) || !/^[A-Za-z0-9]{22}$/.test(k) || !ROLE_NAME[r]) { toast('このリンクは正しくありません'); return; }
  // the home-screen app opens at the address it was added from every time: that link counts once (js/share.js)
  const home = isHomeApp(), used = () => { if (home && !linkUsed().includes(k)) saveJSON('golf3d.linkUsed', linkUsed().concat(k).slice(-20)); };
  if (home && linkUsed().includes(k)) return;
  // added to the home screen from Safari (keepHomeLink): u = Safari's sign-in, mv = its carry-over code, so the name
  // chosen there can be chosen again here
  const u = q.get('u'), mv = q.get('mv');
  const from = home && r === 'player' && /^[A-Za-z0-9]{10,64}$/.test(u || '') && /^[A-Za-z0-9]{22}$/.test(mv || '') ? { u, code: mv } : null;
  const carry = () => { if (from && comp && comp.cid === c && !comp.player) { comp.moveFrom = from; saveComp(); } };
  if (comp && comp.cid === c && comp.key === k) { carry(); used(); return; }  // already in with this link
  const go = () => compJoin(c, k, r)
    .then(() => { carry(); used(); toast(r === 'org' ? 'コンペに主催者として参加しました' : from ? 'コンペに参加しました。Safariで選んだ名前を選び直してください' : 'コンペに参加しました'); keepHomeLink(); })
    .catch(e => { if (denied(e)) used(); toast(denied(e) ? 'このリンクは使えません（期限切れか、無効になっています）' : '接続できませんでした。電波のある所でもう一度リンクを開いてください'); });
  const join = () => comp ? ask('別のコンペに参加しますか？', `今のコンペ「${(comp.meta && comp.meta.name) || ''}」からは抜けます`, '参加する', () => { compLeave(); go(); }) : go();
  if (inApp) ask(`${/iPhone|iPad|iPod/.test(ua) ? 'Safari' : 'ブラウザ'}で開いてください`,
    `ここ（${/ Line\//.test(ua) ? 'LINE' : 'アプリ'}の中の画面）で参加すると、あとでブラウザやホーム画面から開いたときに別の人になり、選んだ名前が使えません。\n右上（または右下）の「…」から「${/iPhone|iPad|iPod/.test(ua) ? 'Safari' : 'ブラウザ'}で開く」を選んでください`,
    'このまま参加する', join, { go: true });
  else join();
})();
// iPhone Safari, in a competition as a player: the address carries the players' link, this phone's uid and a
// carry-over code (comp.move, also kept in the database at members/<uid>/move). An app added to the home screen from
// here opens at that address (the manifest has no start_url) — iPhone gives that app storage of its own, so it is a
// new sign-in — joins with the link and may choose again the name taken by this uid, showing the same code (the
// rules check it). No sign-in in the address. Not for the organizer, whose address might be copied to players; the
// organizer's link moves that role to another phone or app.
async function keepHomeLink() {
  const ua = navigator.userAgent;
  if (!comp || comp.role !== 'player' || isHomeApp() || / Line\/|FBAN|FBAV|Instagram/.test(ua)) return;
  if (!(/iPhone|iPad|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1))) return;
  if (!comp.move) { comp.move = rid(22); saveComp(); }
  const q = new URLSearchParams({ c: comp.cid, k: comp.key, r: 'player', u: comp.uid, mv: comp.move });
  history.replaceState(null, '', `${location.pathname}?${q}${location.hash}`);
  try { const f = await withTimeout(fb(), 15000); await f.D.update(f.D.ref(f.db, cp(`members/${comp.uid}`)), { move: comp.move }); } catch (e) {}
}
compConnect();
keepHomeLink();
