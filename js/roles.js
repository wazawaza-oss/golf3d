/* golf3d — roles: who may do what, and showing only what fits the role
   solo (no competition: everything, as before) · org (organizer: everything, everyone's scores)
   lead (the player the organizer made their team's lead: scores of their own team) · player (their own chosen name only)
   roleKind() / roleLabel() live in js/roster.js, next to the roster they are read from.
   The database rules enforce the same limits on the server; these only shape the screens.
   Plain scripts loaded in order from index.html (no build step); they share top-level names. */
"use strict";

function canEdit(pid) {
  if (!comp || comp.role === 'org') return true;
  if (!comp.player || (comp.taken || {})[comp.player] !== comp.uid) return false;  // no name chosen (or released)
  if (pid === comp.player) return true;
  const t = compLeadTeam(), r = (comp.roster || {})[pid];
  return !!t && !!r && +r.team === t;
}
// whose score the dock enters: you (solo), your chosen name (player), or the person picked in the dock (lead / organizer)
function me() {
  if (!comp) return S.score.players[0];
  const list = allPlayers(), mine = list.filter(p => canEdit(p.id)), kind = roleKind();
  const id = kind === 'player' ? comp.player : comp.dock || comp.player;
  return mine.find(p => p.id === id) || (kind === 'player' ? null : mine.find(p => p.id === comp.player) || mine[0]) || null;
}
// the highlighted row in the ranking: your own name (in a competition only once you picked one; not the dock's person)
const myId = () => { if (comp) return comp.player || null; const p = me(); return p ? p.id : null; };
// lead / organizer: tapping the name in the dock moves to the next person they may enter for
function dockNext() {
  if (!comp || roleKind() === 'player') return;
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
// a small label under the distance panel: as whom, and which competition
function renderBadge() {
  const b = $('roleBadge'); b.hidden = !comp; if (!comp) return;
  const r = comp.player && (comp.roster || {})[comp.player];
  b.textContent = `${roleLabel()}${r ? ' ' + r.name : ''}${comp.meta && comp.meta.name ? ' ・ ' + comp.meta.name : ''}${compLive ? '' : ' ・ オフライン'}`;
  b.classList.toggle('off', !compLive);
}
