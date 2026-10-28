/* golf3d — share: competitions on Firebase Realtime Database, with three roles (organizer / team lead / player)
   Plain scripts loaded in order from index.html (no build step); they share top-level names.

   comps/{cid}
     meta            { name, date, owner, created, expires }          members read · organizer writes
     course          { club, nines: [{ name, holes: [{ par, tee, green }] } × 2] }   (the organizer's two nines)
     roster/{pid}    { name, team }                                    members read · organizer writes
     leads/t{team}   pid of that team's lead (one per team)              members read · organizer writes
     pins/{hNN}      [lng, lat]  pins handed out by the organizer
     invites/{key}   { role: player | org }                            organizer only (others never see keys)
     members/{uid}   { role: player | org, key, player?, t }           the phone itself and the organizer
     taken/{pid}     uid of the phone that chose that name
     scores/{pid}/{hNN}  { v, by, bp, t, fix? }   newest write wins; who (phone, name) and when are kept;
                     fix: someone else changed a value already there (shown as a small mark)
   expiry/{cid}      expires; any app may delete competitions past it
   Links carry ?c=<cid>&k=<invite key>&r=player|org; everyone joins as a player and picks their name; the organizer's
   roster decides teams and leads. The database rules check the key and the roster, so editing a link gains nothing.
   Nothing here loads until a competition is created or joined: solo and offline use never need Firebase. */
"use strict";

// Firebase web app config: public by design; access is limited by the database rules (firebase-rules.json)
const FB_CONFIG = {
  apiKey: 'AIzaSyD4ZvWQsx_0xXq7KJL4V123kdl8L3N2xPM',
  authDomain: 'golfscoreapp-f2d31.firebaseapp.com',
  databaseURL: 'https://golfscoreapp-f2d31-default-rtdb.asia-southeast1.firebasedatabase.app',
  projectId: 'golfscoreapp-f2d31',
  appId: '1:513780302035:web:155d3e482323ebebf2d426'
};
const FB_SDK = 'https://www.gstatic.com/firebasejs/12.4.0/';
const COMP_DAYS = 7;  // a competition can be changed for a week; after that any app may delete it
const ROLE_NAME = { org: '主催者', player: '参加者' };  // what a link makes you; a team lead is a player the organizer marked
const B62 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
const rid = n => Array.from(crypto.getRandomValues(new Uint8Array(n)), b => B62[b % 62]).join('');
const hk = i => 'h' + String(i + 1).padStart(2, '0');  // hole index 0..17 → 'h01'..'h18' (plain 1..18 keys would become an array)
const withTimeout = (p, ms) => Promise.race([p, new Promise((_, no) => setTimeout(() => no(new Error('timeout')), ms))]);
let fbP = null;
function fb() {
  return fbP || (fbP = (async () => {
    const [A, Au, D] = await Promise.all(['app', 'auth', 'database'].map(m => import(`${FB_SDK}firebase-${m}.js`)));
    const app = A.initializeApp(FB_CONFIG), auth = Au.getAuth(app);
    await auth.authStateReady();  // anonymous sign-in is kept on the phone, so the same uid comes back
    if (!auth.currentUser) await Au.signInAnonymously(auth);
    return { D, db: D.getDatabase(app), uid: auth.currentUser.uid };
  })().catch(e => { fbP = null; throw e; }));
}
const denied = e => /permission/i.test(String(e && (e.code || e.message)));

// this phone's copy of the competition (kept for offline use): { cid, uid, key, role, team, player, meta, course,
// roster, scores, pins, taken, invites, outbox (entries not yet sent), dock (whose score the dock enters) }
let comp = loadJSON('golf3d.comp');
if (!comp || !comp.cid || !ROLE_NAME[comp.role]) comp = null;
let compLive = false, compOff = null;
const saveComp = () => saveJSON('golf3d.comp', comp);
const cp = p => `comps/${comp.cid}/${p}`;

/* ---------- what the rest of the app reads ---------- */
// the organizer's two nines (as handed out) stand in for this phone's course during a competition
let cnMemo = null, cnFrom;
function compNines() {
  if (!comp || !comp.course || !comp.course.nines) return null;
  if (cnFrom !== comp.course) {
    cnFrom = comp.course;
    const ns = Object.values(comp.course.nines);
    cnMemo = [0, 1].map(k => {
      const x = ns[k] || ns[0] || {}, hs = Object.values(x.holes || {});
      return { id: 'c' + k, name: String(x.name || (k ? 'IN' : 'OUT')), holes: Array.from({ length: NINE }, (_, i) => {
        const h = hs[i] || {};
        return { n: i + 1, par: +h.par || 4, tee: h.tee ? [+h.tee[0], +h.tee[1]] : null, green: h.green ? [+h.green[0], +h.green[1]] : null, src: 'manual', ok: true };
      }) };
    });
  }
  return cnMemo;
}
const compPin = n => { const p = comp && comp.pins && comp.pins[hk(n - 1)]; return p ? [+p[0], +p[1]] : null; };
const rosterList = () => Object.entries((comp && comp.roster) || {}).map(([id, r]) => ({ id, name: String(r.name || ''), team: +r.team || 1 }))
  .sort((a, b) => a.team - b.team || a.name.localeCompare(b.name, 'ja'));
const compStrokes = pid => { const s = ((comp && comp.scores) || {})[pid] || {}; return Array.from({ length: ROUND }, (_, i) => (s[hk(i)] && +s[hk(i)].v) || null); };
// who changed someone's score (the small mark on that cell): { who, t }, or null
function compFix(pid, i) {
  const e = (((comp && comp.scores) || {})[pid] || {})[hk(i)];
  if (!e || !e.fix || e.bp === pid) return null;
  const r = (comp.roster || {})[e.bp];
  return { who: r ? `${r.name}さん` : ROLE_NAME.org, t: e.t };
}
// teams and leads, as the organizer set them in the roster
const leadOf = t => ((comp && comp.leads) || {})['t' + t] || null;
const myTeam = () => { const r = comp && comp.player && (comp.roster || {})[comp.player]; return r ? +r.team || 1 : null; };
// the team this phone leads: its chosen name is that team's lead (and the name really is this phone's)
function compLeadTeam() {
  const t = myTeam();
  return t && leadOf(t) === comp.player && (comp.taken || {})[comp.player] === comp.uid ? t : null;
}
// everyone in the round: the competition's roster, or this phone's own players when solo
function allPlayers() {
  if (!comp) return S.score.players;
  return rosterList().map(r => Object.assign(r, { remote: true, strokes: compStrokes(r.id) }));
}
const teams = () => [...new Set(rosterList().map(r => r.team))].sort((a, b) => a - b);

/* ---------- writing scores (offline-safe) ---------- */
// entries go to an outbox on the phone first and are sent when connected; a newer value on the server wins
// a score as stored: the value, this phone, the name it writes as (its chosen name, or 'org'), when, and
// fix when it changes a value someone else had already put there
const scoreRec = e => Object.assign({ v: e.v, by: comp.uid, bp: e.bp || comp.player || 'org', t: e.t }, e.fix ? { fix: true } : {});
function compSetScore(pid, i, v) {
  if (!canEdit(pid)) return;
  const t = Date.now(), k = hk(i), bp = comp.player || 'org';
  comp.scores = comp.scores || {};
  // a correction: replacing a value someone else entered (stepping your own entry with -/+ is not); it stays marked while you adjust it
  const prev = (comp.scores[pid] || {})[k];
  const fix = v != null && bp !== pid && !!prev && prev.v != null && (prev.bp !== bp ? +prev.v !== v : !!prev.fix);
  const e = { v: v == null ? null : v, t, bp, fix };
  comp.scores[pid] = Object.assign({}, comp.scores[pid], { [k]: v == null ? null : scoreRec(e) });
  (comp.outbox = comp.outbox || {})[`${pid}/${k}`] = e;
  saveComp(); compSend();
}
function overlayOutbox() {  // keep unsent entries on screen when the server's copy arrives
  Object.entries(comp.outbox || {}).forEach(([path, e]) => {
    const [pid, k] = path.split('/');
    comp.scores[pid] = Object.assign({}, comp.scores[pid], { [k]: e.v == null ? null : scoreRec(e) });
  });
}
let sending = false;
async function compSend() {
  if (!comp || sending || !Object.keys(comp.outbox || {}).length) return;
  let f; try { f = await fb(); } catch (e) { return; }
  if (!compLive) return;  // the SDK would only hold it in memory; it stays in the outbox until connected
  sending = true;
  try {
    for (const [path, e] of Object.entries(comp.outbox)) {
      const r = f.D.ref(f.db, cp('scores/' + path));
      try {
        const cur = (await withTimeout(f.D.get(r), 10000)).val();
        if (!cur || !cur.t || cur.t <= e.t) await withTimeout(f.D.set(r, e.v == null ? null : scoreRec(e)), 10000);
        delete comp.outbox[path];
      } catch (err) { if (denied(err)) delete comp.outbox[path]; else break; }
    }
  } finally { sending = false; if (comp) saveComp(); }
}
// pins placed by the organizer are handed out to everyone
function compSetPin(n, ll) {
  if (!comp || comp.role !== 'org') return;
  (comp.pins = comp.pins || {})[hk(n - 1)] = ll; saveComp();
  fb().then(f => f.D.set(f.D.ref(f.db, cp('pins/' + hk(n - 1))), ll)).catch(() => {});
}
// the organizer's current front / back nine become everyone's course (tee, green, par)
async function compPublishCourse() {
  if (!comp || comp.role !== 'org') return;
  const course = { club: (S.course.name || 'コース').slice(0, 40), nines: localNines().map(x => ({
    name: (x.name || 'ナイン').slice(0, 12), holes: x.holes.map(h => Object.assign({ par: h.par }, h.tee ? { tee: h.tee } : {}, h.green ? { green: h.green } : {}))
  })) };
  comp.course = course; saveComp();
  const f = await fb(); await withTimeout(f.D.set(f.D.ref(f.db, cp('course')), course), 15000);
}
// a new set of nines makes the old scores and handed-out pins meaningless: the organizer clears them
async function compClearRound() {
  comp.scores = {}; comp.pins = {}; comp.outbox = {}; saveComp();
  const f = await fb(); await f.D.update(f.D.ref(f.db, `comps/${comp.cid}`), { scores: null, pins: null });
}

/* ---------- create, join, connect, leave ---------- */
const blankComp = (cid, uid, key, role) => ({ cid, uid, key, role, player: null, meta: null, course: null,
  roster: {}, leads: {}, scores: {}, pins: {}, taken: {}, invites: {}, outbox: {}, dock: null, seen: null });
async function compCreate(name, date) {
  const f = await withTimeout(fb(), 15000), cid = rid(10), now = Date.now(), exp = now + COMP_DAYS * 864e5;
  const meta = { name, date, owner: f.uid, created: now, expires: exp };
  await withTimeout(f.D.update(f.D.ref(f.db), {
    [`comps/${cid}/meta`]: meta,
    [`comps/${cid}/members/${f.uid}`]: { role: 'org', key: 'owner', t: now },
    [`expiry/${cid}`]: exp
  }), 15000);
  comp = blankComp(cid, f.uid, 'owner', 'org'); comp.meta = meta; saveComp();
  await compPublishCourse();
  compConnect();
}
async function compJoin(cid, key, role) {
  const f = await withTimeout(fb(), 15000);
  await withTimeout(f.D.update(f.D.ref(f.db, `comps/${cid}/members/${f.uid}`), { role, key, t: Date.now() }), 15000);  // keeps a name chosen earlier
  comp = blankComp(cid, f.uid, key, role); saveComp();
  compConnect();
}
async function compConnect() {
  if (!comp || compOff) return;
  let f; try { f = await fb(); } catch (e) { return; }  // offline: the copy on the phone stays on screen; retried when back online
  if (!comp || compOff) return;
  const cid = comp.cid, D = f.D;
  const on = (p, fn) => D.onValue(D.ref(f.db, `comps/${cid}/${p}`), s => {
    if (!comp || comp.cid !== cid) return;
    fn(s.val()); saveComp(); compRefresh();
  }, () => {});
  const offs = [
    on('meta', v => { if (v) comp.meta = v; }),
    on('course', v => { comp.course = v; }),
    on('roster', v => { comp.roster = v || {}; }),
    on('leads', v => { comp.leads = v || {}; }),
    on('pins', v => { comp.pins = v || {}; }),
    on('taken', v => { comp.taken = v || {}; }),
    on('scores', v => { comp.scores = v || {}; overlayOutbox(); }),
    on(`members/${comp.uid}`, v => { if (v && ROLE_NAME[v.role]) { comp.role = v.role; comp.player = v.player || null; } })
  ];
  if (comp.role === 'org') offs.push(on('invites', v => { comp.invites = v || {}; }));
  offs.push(D.onValue(D.ref(f.db, '.info/connected'), s => { compLive = !!s.val(); if (compLive) compSend(); compRefresh(); }));
  compOff = () => { offs.forEach(u => u()); compOff = null; compLive = false; };
  pruneExpired(f);
}
// competitions past their date are deleted by whichever app notices first (the rules allow only that)
async function pruneExpired(f) {
  try {
    const all = (await withTimeout(f.D.get(f.D.ref(f.db, 'expiry')), 10000)).val() || {}, now = Date.now(), u = {};
    Object.entries(all).forEach(([id, t]) => { if (t < now) { u[`comps/${id}`] = null; u[`expiry/${id}`] = null; } });
    if (Object.keys(u).length) await f.D.update(f.D.ref(f.db), u);
  } catch (e) {}
}
function compLeave() {
  if (compOff) compOff();
  comp = null; saveComp(); compRefresh();
}
// screens that show competition data follow every change from the server
function compRefresh() {
  refresh();
  if (S.page === 'rank') renderRank();
  if (S.page === 'score') renderScore();
  if (!$('menu').hidden) { renderMenu(); renderCompScreens(); }
  roleNotice();
  // a player who has not chosen a name yet (or whose choice the organizer released) is asked first
  if (comp && comp.role === 'player' && !comp.player && comp.roster && Object.keys(comp.roster).length && $('menu').hidden) openPick();
}
addEventListener('online', () => { compConnect(); compSend(); });

