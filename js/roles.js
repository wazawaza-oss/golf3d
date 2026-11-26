/* golf3d — roles: who may do what, and showing only what fits the role
   solo (no competition: everything, as before) · org (organizer: everything, everyone's scores)
   player (once a name is chosen: their own score and the scores of everyone in the same team, i.e. the same cart;
   until 2026-11 only a team lead the organizer picked could enter for the cart — that role is gone)
   roleKind() / roleLabel() live in js/roster.js, next to the roster they are read from.
   The database rules enforce the same limits on the server; these only shape the screens.
   Plain scripts loaded in order from index.html (no build step); they share top-level names. */
"use strict";

function canEdit(pid) {
  if (!comp || comp.role === 'org') return true;
  if (!comp.player || (comp.taken || {})[comp.player] !== comp.uid) return false;  // no name chosen (or released)
  if (pid === comp.player) return true;
  const t = myTeam(), r = (comp.roster || {})[pid];
  return !!t && !!r && (+r.team || 1) === t;
}
// whose score the dock enters: you (solo), or the person picked in the dock (your own name until you tap it, then the
// others in your cart in turn; the organizer: anyone)
function me() {
  if (!comp) return S.score.players[0];
  const mine = allPlayers().filter(p => canEdit(p.id)), id = comp.dock || comp.player;
  return mine.find(p => p.id === id) || mine.find(p => p.id === comp.player) || (comp.role === 'org' ? mine[0] : null) || null;
}
// more than one person whose score this phone may enter (the dock shows ▸ and tapping the name moves on)
const dockMany = () => !!comp && allPlayers().filter(p => canEdit(p.id)).length > 1;
// the highlighted row in the ranking: your own name (in a competition only once you picked one; not the dock's person)
const myId = () => { if (comp) return comp.player || null; const p = me(); return p ? p.id : null; };
// tapping the name in the dock moves to the next person this phone may enter for (the cart, or for the organizer everyone)
function dockNext() {
  if (!comp) return;
  const mine = allPlayers().filter(p => canEdit(p.id)); if (mine.length < 2) return;
  const cur = me(), k = mine.findIndex(p => cur && p.id === cur.id);
  comp.dock = mine[(k + 1) % mine.length].id; saveComp(); renderDock();
}
// a score change goes to this phone (solo) or to the competition
function setStroke(p, i, v) {
  if (comp) { compSetScore(p.id, i, v); return; }
  strokesOf(p)[i] = v; saveScore();
}
// rows marked data-show="solo org" etc. appear only for those roles
function applyRoles() {
  document.querySelectorAll('[data-show]').forEach(e => { e.hidden = !e.dataset.show.split(' ').includes(roleKind()); });
}
// in a competition: a short notice when the connection comes or goes (no label on the map: it hid the distance).
// Not in the first seconds after opening, while it is still connecting; still offline after them is said once.
const NET_GRACE = 6000;  // ms after opening
let netWas = null;
setTimeout(() => { if (typeof comp !== 'undefined' && comp) netNotice(); }, NET_GRACE + 100);
function netNotice() {
  if (!comp) { netWas = null; return; }
  if (performance.now() <= NET_GRACE) return;
  const on = !!compLive;
  if (netWas === null ? on : on === netWas) { netWas = on; return; }
  netWas = on;
  const wait = Object.keys(comp.outbox || {}).length;
  toast(on ? 'オンラインになりました' : `オフラインになりました${wait ? `（未送信${wait}件）` : ''}`, 2000);
}
