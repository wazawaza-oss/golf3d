/* golf3d — roles: who may do what, and showing only what fits the role
   solo (no competition: everything, as before) · org (organizer: everything, everyone's scores)
   cart (cart representative: scores of their own team) · player (their own chosen name only)
   The database rules enforce the same limits on the server; these only shape the screens.
   Plain scripts loaded in order from index.html (no build step); they share top-level names. */
"use strict";

const roleKind = () => comp ? comp.role : 'solo';
function canEdit(pid) {
  if (!comp || comp.role === 'org') return true;
  if (comp.role === 'cart') { const r = (comp.roster || {})[pid]; return !!r && +r.team === +comp.team; }
  return pid === comp.player;
}
// whose score the dock enters: you (solo), your chosen name (player), or the person picked in the dock (cart / organizer)
function me() {
  if (!comp) return S.score.players[0];
  const list = allPlayers(), mine = list.filter(p => canEdit(p.id));
  const id = comp.role === 'player' ? comp.player : comp.dock;
  return list.find(p => p.id === id && canEdit(p.id)) || (comp.role === 'player' ? null : mine[0]) || null;
}
const myId = () => { const p = me(); return p ? p.id : null; };  // highlighted row in the ranking
// cart / organizer: tapping the name in the dock moves to the next person they may enter for
function dockNext() {
  if (!comp || comp.role === 'player') return;
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
// a small label under the distance panel: which competition, and as whom
function renderBadge() {
  const b = $('roleBadge'); b.hidden = !comp; if (!comp) return;
  const who = comp.role === 'cart' ? `${ROLE_NAME.cart} ${comp.team}組` : comp.role === 'player' ? `${ROLE_NAME.player}${me() ? ' ' + me().name : ''}` : ROLE_NAME.org;
  b.textContent = `${who}${comp.meta && comp.meta.name ? ' ・ ' + comp.meta.name : ''}${compLive ? '' : ' ・ オフライン'}`;
  b.classList.toggle('off', !compLive);
}
