/* golf3d — interactions: placing tee / green / pin, measuring marks, hole arrows, map buttons, GPS
   Plain scripts loaded in order from index.html (no build step); they share top-level names. */
"use strict";

/* ================= interactions ================= */
/* place the current item (tee / green / pin / test position) at ll */
function placeAt(ll) {
  const h = hole();
  switch (S.mode) {
    case 'setup-tee': h.tee = ll; h.src = 'manual'; h.ok = registered(h); S.mode = 'setup-green'; saveCourse(); break;
    case 'setup-green':
      h.green = ll; h.src = 'manual'; h.ok = registered(h); saveCourse();
      // on to the next hole of the same nine; the nine's 9th hole ends this registration
      if (S.su.n < NINE) { S.su.n++; const nx = hole(); S.mode = registered(nx) ? null : nx.tee ? 'setup-green' : 'setup-tee'; }
      else { S.mode = null; toast(`${nineOf(S.su.nine).name}の${NINE}ホールの登録が終わりました`); closeSetup(); }
      break;
    case 'pin':  // the organizer's pin is handed out to everyone in the competition
      S.round.pins[N] = ll; saveRound(); S.mode = null;
      if (comp && comp.role === 'org') { compSetPin(N, ll); toast(`${N}番のピンを全員に配りました`); } else toast(`${N}番のピンを置きました`);
      break;
    case 'me': S.me = { ll, acc: null, src: 'sim' }; S.mode = null; break;
    default: return;
  }
  refresh();
  if (!S.mode) camBack();
}
/* placing the pin or a test position zooms in on the spot; afterwards (placed or cancelled)
   the map goes back to the view it had before */
let camSave = null;
const camKeep = () => { camSave = { center: map.getCenter(), zoom: map.getZoom(), bearing: map.getBearing(), pitch: map.getPitch() }; };
function camBack() { if (camSave) { map.easeTo(Object.assign(camSave, { duration: 600 })); camSave = null; } }
$('sPlace').onclick = $('bannerPlace').onclick = () => placeAt(crossLL());
/* measuring marks. 1st tap: a mark, distance to the pin. 2nd tap: a second mark — closer to the pin than
   the first, it splits that leg; farther out, the path now starts there. A 3rd tap starts over.
   Marks clear themselves after a few idle seconds and the display goes back to your position. */
let tapT = null;
// the measured path: the marks farthest-first, then the pin. With one mark it starts from your position
// (when known); with two the marks alone are the path, so there is no line from you
const tapFromMe = () => !!(S.me && S.tap && S.tap.length === 1);
const tapPath = pin => S.tap && pin ? (tapFromMe() ? [S.me.ll] : []).concat(S.tap.slice().sort((a, b) => yards(b, pin) - yards(a, pin)), [pin]) : null;
const tapLine = () => { const p = tapPath(pinLL()); return p && { type: 'Feature', properties: { kind: 'tap' }, geometry: { type: 'LineString', coordinates: p } }; };
function tapIdle() {
  clearTimeout(tapT);
  tapT = setTimeout(() => { S.tap = null; refresh(); }, S.tap && S.tap.length > 1 ? 10000 : 5000);
}
// while dragging, drag events come faster than the screen redraws: do the work at most once per frame,
// and leave the elevation lookups for when the finger lifts
let tapRaf = 0;
function tapDraw(dragging) {
  if (dragging) { if (!tapRaf) tapRaf = requestAnimationFrame(() => { tapRaf = 0; tapPaint(true); }); return; }
  tapPaint(false);
}
function tapPaint(dragging) {
  const path = tapPath(pinLL());
  TM.forEach((m, i) => place(m, S.tap && S.tap[i]));
  LM.forEach((m, i) => {  // a label on every leg once there are two or more
    const on = path && path.length >= 3 && i < path.length - 1, e = m.getElement();
    if (on) { const t = `${Math.round(yards(path[i], path[i + 1]))}Y`; if (e.textContent !== t) e.textContent = t; }
    place(m, on ? lerpLL(path[i], path[i + 1], .5) : null);
  });
  if (dragging && mapReady) { const p = tapLine(); map.getSource('lines').setData(fc(p ? [p] : [])); readout(true); }
}
const tapClear = () => { clearTimeout(tapT); S.tap = null; refresh(); };
$('tapReset').onclick = tapClear;
M.me.getElement().addEventListener('click', e => { e.stopPropagation(); if (S.tap) tapClear(); });
map.on('click', e => {
  if (e.originalEvent && e.originalEvent.target.closest && e.originalEvent.target.closest('.mk.tap, .mk.me')) return;
  const ll = [e.lngLat.lng, e.lngLat.lat];
  // while placing, a tap only brings that spot under the crosshair; the button does the placing
  if (isPlacing()) { centerOn(ll); return; }
  S.tap = S.tap && S.tap.length === 1 ? [S.tap[0], ll] : [ll];
  refresh(); tapIdle();
  const dot = TM[S.tap.length - 1].getElement().firstChild;  // replay the pop on the new mark
  dot.style.animation = 'none'; void dot.offsetWidth; dot.style.animation = '';
});
function goHole(n) {
  // while registering, ‹ › move through the nine being registered (1–9); otherwise through the round (1–18)
  if (inSetup()) S.su.n = ((n - 1 + NINE) % NINE) + 1;
  else N = ((n - 1 + ROUND) % ROUND) + 1;
  S.tap = null; savePrefs();
  if (S.mode === 'pin') S.mode = null;
  camSave = null;  // the new hole gets its own view
  if (inSetup()) { const h = hole(); S.mode = registered(h) ? null : h.tee ? 'setup-green' : 'setup-tee'; }
  refresh();
  if (!(S.mode && S.mode.startsWith('setup'))) camera(S.view);
}
$('prevHole').onclick = () => goHole(holeNo() - 1);
$('nextHole').onclick = () => goHole(holeNo() + 1);
$('bannerCancel').onclick = () => { S.mode = null; refresh(); camBack(); };  // pin / test position (setup has its own controls)

$('b3d').onclick = () => { if (!mapReady) return; set3D(!S.is3D); refresh(); };
$('bView').onclick = () => {
  S.view = { tee: 'top', top: 'green', green: 'tee' }[S.view];
  if (!registered(hole())) toast('このホールはまだ登録されていません'); else camera(S.view);
  refresh();
};
$('bMe').onclick = () => {
  if (!S.me) { toast('現在地がありません。GPSをオンにしてください'); return; }
  const pin = pinLL();
  if (!pin) { map.easeTo({ center: S.me.ll, zoom: Math.max(map.getZoom(), 17), duration: 700 }); return; }
  // fit you and the pin between the panels, turned so the pin is straight ahead (up the screen)
  const top = document.querySelector('.hud').getBoundingClientRect().bottom, low = $('dock').hidden ? innerHeight : $('dock').getBoundingClientRect().top;
  const cam = map.cameraForBounds([S.me.ll, pin].reduce((b, p) => b.extend(p), new maplibregl.LngLatBounds(S.me.ll, S.me.ll)), {
    bearing: bearing(S.me.ll, pin), maxZoom: 18,
    padding: { top: top + 66, bottom: innerHeight - low + 36, left: 48, right: 90 }  // top: room for the flag; right: the button column
  });
  if (cam) map.easeTo(Object.assign(cam, { pitch: map.getPitch(), duration: 800 }));
};
$('bPin').onclick = () => {
  if (!hole().green) { toast('先にこのホールを登録してください'); return; }
  S.mode = S.mode === 'pin' ? null : 'pin'; S.tap = null;
  refresh();
  if (S.mode === 'pin') { camKeep(); centerOn(S.round.pins[N] || hole().green, { zoom: Math.max(map.getZoom(), 18.3), duration: 700 }); }
  else camBack();
};

/* GPS */
async function wakeOn() { try { if ('wakeLock' in navigator) S.wake = await navigator.wakeLock.request('screen'); } catch (e) {} }
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && S.watch) wakeOn(); });
function gpsStart() {
  if (!('geolocation' in navigator)) { toast('この端末では位置情報を使えません'); return; }
  S.watch = navigator.geolocation.watchPosition(p => {
    S.me = { ll: [p.coords.longitude, p.coords.latitude], acc: p.coords.accuracy, src: 'gps' };
    refresh();
  }, err => {
    toast(err.code === 1 ? '位置情報が許可されていません。ブラウザの設定で許可してください' : '現在地を取得できませんでした。空の見える場所でお試しください');
    if (err.code === 1) gpsStop();
  }, { enableHighAccuracy: true, maximumAge: 3000, timeout: 20000 });
  S.prefs.gps = true; savePrefs(); wakeOn(); refresh();
}
function gpsStop() {
  if (S.watch != null) navigator.geolocation.clearWatch(S.watch);
  S.watch = null; if (S.me && S.me.src === 'gps') S.me = null;
  try { S.wake && S.wake.release(); } catch (e) {} S.wake = null;
  S.prefs.gps = false; savePrefs(); refresh();
}
$('bGps').onclick = () => S.watch != null ? gpsStop() : gpsStart();

