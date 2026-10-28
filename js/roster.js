/* golf3d — roster: names, teams and leads, invite links, this phone's role notice, opening a link (needs js/share.js)
   Plain scripts loaded in order from index.html (no build step); they share top-level names. */
"use strict";

/* ---------- names, roster, invites ---------- */
async function compPick(pid) {
  const f = await withTimeout(fb(), 15000);
  await withTimeout(f.D.update(f.D.ref(f.db, `comps/${comp.cid}`), { [`taken/${pid}`]: comp.uid, [`members/${comp.uid}/player`]: pid }), 15000);
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
// moving someone to another team: if they led their old team, that team has no lead until the organizer picks one
function compMoveTeam(pid, team) {
  const r = comp.roster[pid]; if (!r || +r.team === team) return;
  const u = { [`roster/${pid}`]: { name: r.name, team } };
  if (leadOf(r.team) === pid) { u[`leads/t${r.team}`] = null; delete comp.leads['t' + r.team]; }
  comp.roster = Object.assign({}, comp.roster, { [pid]: { name: r.name, team } }); saveComp();
  compUpdate(u);
}
// one lead per team: naming a new one replaces the old; pid null leaves the team without a lead
function compSetLead(team, pid) {
  comp.leads = Object.assign({}, comp.leads, { ['t' + team]: pid }); if (!pid) delete comp.leads['t' + team];
  saveComp(); compUpdate({ [`leads/t${team}`]: pid });
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
const linkFor = (key, role) => `${location.origin}${location.pathname}?c=${comp.cid}&k=${key}&r=${role}`;

/* ---------- this phone's role, and a short notice when it changes ---------- */
const roleKind = () => !comp ? 'solo' : comp.role === 'org' ? 'org' : compLeadTeam() ? 'lead' : 'player';
const roleLabel = () => { const k = roleKind(); return k === 'lead' ? `${compLeadTeam()}組の代表` : ROLE_NAME[k] || ''; };
function roleNotice() {
  if (!comp || !comp.meta || !comp.roster) return;
  const k = roleKind(), t = myTeam(), now = `${k}:${t || ''}`, was = comp.seen;
  if (now === was) return;
  comp.seen = now; saveComp();
  if (!was) return;  // the first look after joining: nothing has changed yet
  const [wk, wt] = was.split(':');
  const msg = k === 'org' ? '主催者になりました'
    : k === 'lead' ? `${t}組のカート代表になりました`
    : wk === 'lead' ? `カート代表から外れました${t && String(t) !== wt ? `（${t}組に移りました）` : ''}`
    : t && wt && String(t) !== wt ? `${t}組に移りました` : '';
  if (msg) toast(msg);
}

/* ---------- opening a link ---------- */
(() => {
  const q = new URLSearchParams(location.search), c = q.get('c');
  if (!c) return;
  const k = q.get('k') || '', r = q.get('r');
  history.replaceState(null, '', location.pathname + location.hash);
  if (!/^[A-Za-z0-9]{10}$/.test(c) || !/^[A-Za-z0-9]{22}$/.test(k) || !ROLE_NAME[r]) { toast('このリンクは正しくありません'); return; }
  if (comp && comp.cid === c && comp.key === k) return;  // already in with this link
  const go = () => compJoin(c, k, r)
    .then(() => toast(r === 'org' ? 'コンペに主催者として参加しました' : 'コンペに参加しました'))
    .catch(e => toast(denied(e) ? 'このリンクは使えません（期限切れか、無効になっています）' : '接続できませんでした。電波のある所でもう一度リンクを開いてください'));
  if (comp) ask('別のコンペに参加しますか？', `今のコンペ「${(comp.meta && comp.meta.name) || ''}」からは抜けます`, '参加する', () => { compLeave(); go(); });
  else go();
})();
compConnect();
