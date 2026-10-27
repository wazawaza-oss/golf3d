/* golf3d — share: round sharing over Firebase Realtime Database
   Plain scripts loaded in order from index.html (no build step); they share top-level names. */
"use strict";

/* ================= round sharing (Firebase Realtime Database) =================
   rooms/{CODE}/members/{uid} = { players: [{ id, name, strokes[ROUND = 18] (0 = empty) }], t }
   Each phone writes only its own node: players[0] is the owner, the rest are people without a phone
   typed in on that phone. The SDK loads only once a round is joined, so solo/offline use never needs it. */
// Firebase web app config: public by design; access is limited by the database rules (firebase-rules.json)
const FB_CONFIG = {
  apiKey: 'AIzaSyD4ZvWQsx_0xXq7KJL4V123kdl8L3N2xPM',
  authDomain: 'golfscoreapp-f2d31.firebaseapp.com',
  databaseURL: 'https://golfscoreapp-f2d31-default-rtdb.asia-southeast1.firebasedatabase.app',
  projectId: 'golfscoreapp-f2d31',
  appId: '1:513780302035:web:155d3e482323ebebf2d426'
};
const FB_SDK = 'https://www.gstatic.com/firebasejs/12.4.0/';
const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789', CODE_RE = /^[A-Z2-9]{5}$/;
let room = loadJSON('golf3d.room');  // { code, uid, members } — members are cached for offline viewing
if (!room || !CODE_RE.test(room.code) || !room.uid) room = null;
let roomLive = false, roomOff = null, fbP = null, pushT = null;
const saveRoom = () => saveJSON('golf3d.room', room);
const newCode = () => Array.from(crypto.getRandomValues(new Uint8Array(5)), b => CODE_CHARS[b % CODE_CHARS.length]).join('');
const withTimeout = (p, ms) => Promise.race([p, new Promise((_, no) => setTimeout(() => no(new Error('timeout')), ms))]);
function fb() {
  if (!FB_CONFIG) return Promise.reject(new Error('nocfg'));
  return fbP || (fbP = (async () => {
    const [A, Au, D] = await Promise.all(['app', 'auth', 'database'].map(m => import(`${FB_SDK}firebase-${m}.js`)));
    const app = A.initializeApp(FB_CONFIG), auth = Au.getAuth(app);
    await auth.authStateReady();  // anonymous sign-in is kept on the phone, so the same uid comes back
    if (!auth.currentUser) await Au.signInAnonymously(auth);
    return { D, db: D.getDatabase(app), uid: auth.currentUser.uid };
  })().catch(e => { fbP = null; throw e; }));
}
const memberRef = (f, code) => f.D.ref(f.db, `rooms/${code}/members/${f.uid}`);
const myNode = () => ({
  players: S.score.players.slice(0, 8).map(p => ({ id: p.id, name: (p.name || '').slice(0, 12), strokes: strokesOf(p).map(v => v || 0) })),
  t: Date.now()
});
let roomDirty = false;  // scores changed since you last left the score page
function roomPush() {
  if (!room) return;
  roomDirty = true;
  clearTimeout(pushT);
  pushT = setTimeout(() => fb().then(f => room && f.D.set(memberRef(f, room.code), myNode()).catch(() => {})).catch(() => {}), 250);
}
// leaving the score page sends your card right away (entries are also sent as you type)
function roomSendNow() {
  if (!room) return;
  clearTimeout(pushT);
  fb().then(f => room && f.D.set(memberRef(f, room.code), myNode())).catch(() => {});
  if (roomDirty) toast(roomLive ? 'スコアを共有しました' : '電波が戻ったらスコアを共有します');
  roomDirty = false;
}
// opening the ranking fetches everyone's latest scores (on top of the live updates)
function roomPull() {
  if (!room) return;
  const code = room.code;
  fb().then(f => f.D.get(f.D.ref(f.db, `rooms/${code}/members`))).then(snap => {
    if (!room || room.code !== code) return;
    room.members = snap.val() || {}; saveRoom(); roomRefresh();
  }).catch(() => {});
}
// everyone in the round: this phone's players first, then the other phones' players
function allPlayers() {
  const list = S.score.players.slice();
  if (room) Object.entries(room.members || {}).forEach(([uid, m]) => {
    if (uid === room.uid || !m || !m.players) return;
    Object.values(m.players).forEach((p, i) => p && list.push({
      id: `${uid}:${p.id || i}`, name: String(p.name || ''), remote: true,
      strokes: Array.from({ length: ROUND }, (_, h) => +(p.strokes || {})[h] || null)
    }));
  });
  return list;
}
function roomRefresh() {
  if (S.page === 'rank') renderRank();
  if (!$('share').hidden) renderShare();
}
async function roomConnect() {
  if (!room || roomOff) return;
  let f; try { f = await fb(); } catch (e) { return; }  // offline: cached scores stay on screen, retried when back online
  if (!room || roomOff) return;
  const code = room.code, D = f.D;
  const u1 = D.onValue(D.ref(f.db, `rooms/${code}/members`), snap => {
    if (!room || room.code !== code) return;
    room.members = snap.val() || {}; saveRoom(); roomRefresh();
  }, () => {});
  const u2 = D.onValue(D.ref(f.db, '.info/connected'), snap => {
    roomLive = !!snap.val();
    if (roomLive) roomPush();  // resend everything entered while offline
    roomRefresh();
  });
  roomOff = () => { u1(); u2(); roomOff = null; roomLive = false; };
}
async function roomEnter(code) {
  const msg = $('rmMsg'), name = $('rmName').value.trim();
  msg.textContent = '';
  if (!name) { msg.textContent = '名前を入れてください。'; $('rmName').focus(); return; }
  me().name = name; saveJSON('golf3d.score', S.score);
  if (!FB_CONFIG) { msg.textContent = '共有の設定がまだ済んでいません。'; return; }
  $('rmCreate').disabled = $('rmJoin').disabled = true; msg.textContent = '接続中…';
  try {
    const f = await withTimeout(fb(), 15000), D = f.D, created = c => D.ref(f.db, `rooms/${c}/created`);
    if (!code) {
      // a code already in use is refused by the rules; try a few fresh ones
      for (let k = 0; k < 4 && !code; k++) {
        const c = newCode();
        try { await withTimeout(D.set(created(c), Date.now()), 10000); code = c; } catch (e) { if (e.message === 'timeout') throw e; }
      }
      if (!code) throw new Error('create');
    } else if (!(await withTimeout(D.get(created(code)), 10000)).exists()) throw new Error('nf');
    room = { code, uid: f.uid, members: {} }; saveRoom();
    await withTimeout(D.set(memberRef(f, code), myNode()), 10000);
    msg.textContent = '';
    roomConnect(); renderShare();
    toast(`ラウンド ${code} に入りました`);
  } catch (e) {
    if (!room) msg.textContent = e.message === 'nf' ? 'そのコードのラウンドが見つかりません。' : '接続できませんでした。電波を確認して、もう一度お試しください。';
    else msg.textContent = '';
    renderShare();
  }
  $('rmCreate').disabled = $('rmJoin').disabled = false;
}
function renderShare() {
  $('rmOut').hidden = !!room; $('rmIn').hidden = !room;
  if (!room) { if (!$('rmName').value) $('rmName').value = me().name === '自分' ? '' : me().name; return; }
  $('rmCode').textContent = room.code;
  const st = $('rmStat');
  st.textContent = roomLive ? '● つながっています' : '○ オフライン（電波が戻ったら送ります）';
  st.classList.toggle('ok', roomLive);
  $('rmMembers').textContent = allPlayers().map(p => p === me() ? `${p.name}（あなた）` : p.name || '名前なし').join('、');
}
$('goShare').onclick = () => { $('rmMsg').textContent = ''; renderShare(); openSheet('share'); };
$('rmClose').onclick = () => $('share').hidden = true;
$('rmCreate').onclick = () => roomEnter(null);
$('rmJoin').onclick = () => {
  const c = $('rmCodeIn').value.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!CODE_RE.test(c)) { $('rmMsg').textContent = 'コードは英数字5文字です。'; return; }
  roomEnter(c);
};
$('rmShareLink').onclick = async () => {
  const url = `${location.origin}${location.pathname}?r=${room.code}`;
  try { if (navigator.share) { await navigator.share({ title: 'ゴルフのスコア共有', text: `ラウンドのコード：${room.code}`, url }); return; } }
  catch (e) { if (e.name === 'AbortError') return; }
  try { await navigator.clipboard.writeText(url); toast('リンクをコピーしました'); } catch (e) { toast(url); }
};
let rmLeaveArm = null;
$('rmLeave').onclick = () => {
  if (!rmLeaveArm) { $('rmLeave').textContent = 'もう一度押すと抜けます'; rmLeaveArm = setTimeout(() => { rmLeaveArm = null; $('rmLeave').textContent = 'ラウンドから抜ける'; }, 3500); return; }
  clearTimeout(rmLeaveArm); rmLeaveArm = null; $('rmLeave').textContent = 'ラウンドから抜ける';
  const code = room.code;
  if (roomOff) roomOff();
  room = null; saveRoom(); renderShare(); roomRefresh();
  fb().then(f => f.D.remove(memberRef(f, code))).catch(() => {});  // your own scores stay on this phone
};
addEventListener('online', roomConnect);
roomConnect();
// opened from a shared link (?r=CODE): show the join form with the code filled in
(() => {
  const c = (new URLSearchParams(location.search).get('r') || '').toUpperCase();
  if (!c) return;
  history.replaceState(null, '', location.pathname + location.hash);
  if (!CODE_RE.test(c) || (room && room.code === c)) return;
  renderShare(); openSheet('share');
  if (room) $('rmMsg').textContent = `別のラウンド（${c}）に入るには、いまのラウンドから抜けてください。`;
  else { $('rmCodeIn').value = c; if (!$('rmName').value) $('rmName').focus(); }
})();

