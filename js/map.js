/* golf3d — map: the MapLibre map, markers, pin rings, camera presets per hole, 3D terrain
   Plain scripts loaded in order from index.html (no build step); they share top-level names. */
"use strict";

/* ================= map ================= */
const map = new maplibregl.Map({
  container: 'map',
  center: S.course.center || DEFAULT_CENTER, zoom: 16, maxZoom: 19.5, maxPitch: 80,
  attributionControl: false,
  style: {
    version: 8,
    sources: {
      photo: { type: 'raster', tiles: ['gsiphoto://{z}/{x}/{y}'], tileSize: 256, minzoom: 2, maxzoom: 18,
        attribution: '<a href="https://maps.gsi.go.jp/development/ichiran.html" target="_blank" rel="noopener">地理院タイル</a>' },
      dem: { type: 'raster-dem', tiles: ['gsidem://{z}/{x}/{y}'], tileSize: 256, minzoom: 2, maxzoom: 15, encoding: 'mapbox' }
    },
    layers: [
      { id: 'bg', type: 'background', paint: { 'background-color': '#cfd8c8' } },
      { id: 'photo', type: 'raster', source: 'photo', paint: { 'raster-fade-duration': 0 } }
    ]
  }
});
// "地図を読み込み中…" until the first view is drawn (or 20 s at most, e.g. with no signal and nothing saved)
const mapLoaded = () => $('mapLoading').hidden = true;
map.once('idle', mapLoaded); setTimeout(mapLoaded, 20000);
// no attribution badge on the map; the GSI credit is shown in the menu sheet instead
map.touchZoomRotate.enableRotation();

const mkEl = (cls, html) => { const d = document.createElement('div'); d.className = 'mk ' + cls; if (html) d.textContent = html; return d; };
const M = {
  tee: new maplibregl.Marker({ element: mkEl('tee', 'T') }),
  gc: new maplibregl.Marker({ element: mkEl('gc') }),
  pin: new maplibregl.Marker({ element: Object.assign(mkEl('pin'), { innerHTML:
    '<svg width="54" height="50" viewBox="0 0 54 50" aria-hidden="true">' +
    '<path d="M27 48V3" stroke="#fff" stroke-width="6" stroke-linecap="round"/><path d="M27 48V3" stroke="#0a1322" stroke-width="2.5" stroke-linecap="round"/>' +
    '<path d="M28 3L51 13L28 23Z" fill="none" stroke="rgba(0,0,0,.6)" stroke-width="6" stroke-linejoin="round"/>' +
    '<path d="M28 3L51 13L28 23Z" fill="#ff2bd6" stroke="#fff" stroke-width="3" stroke-linejoin="round"/></svg>' }), anchor: 'bottom' }),
  me: new maplibregl.Marker({ element: mkEl('me') }),
};
// measuring marks (yellow diamonds): up to two, both draggable in 2D and 3D; S.tap holds their positions in tap order
const TM = [0, 1].map(i => {
  const m = new maplibregl.Marker({ element: Object.assign(mkEl('tap'), { innerHTML: '<span class="dot"></span>' }), draggable: true });
  m.on('dragstart', () => clearTimeout(tapT));  // no auto-clear while a finger is on it
  m.on('drag', () => { if (!S.tap || !S.tap[i]) return; const p = m.getLngLat(); S.tap[i] = [p.lng, p.lat]; tapDraw(true); });
  m.on('dragend', () => { cancelAnimationFrame(tapRaf); tapRaf = 0; refresh(); tapIdle(); });  // full redraw with elevation
  m.getElement().addEventListener('click', e => { e.stopPropagation(); tapIdle(); });  // touching a mark keeps it up
  return m;
});
// leg distances shown on the map when there are two marks
const LM = [0, 1, 2].map(() => new maplibregl.Marker({ element: mkEl('leg'), anchor: 'left', offset: [12, 0] }));
let numMarkers = [];
function place(m, ll) { if (ll) { m.setLngLat(ll); if (!m._shown) { m.addTo(map); m._shown = true; } } else if (m._shown) { m.remove(); m._shown = false; } }

const fc = f => ({ type: 'FeatureCollection', features: f });
const ln = (a, b, kind) => ({ type: 'Feature', properties: { kind }, geometry: { type: 'LineString', coordinates: [a, b] } });
/* faint ripple rings around the pin every 50Y; drawn as map lines so they drape over the 3D terrain */
function rings(pin, maxY) {
  const out = [], cos = Math.cos(rad(pin[1]));
  for (let r = 50; r <= maxY; r += 50) {
    const m = r * YD, pts = [];
    for (let i = 0; i <= 96; i++) {
      const a = i / 96 * 2 * Math.PI;
      pts.push([pin[0] + deg(m * Math.sin(a) / (6371008.8 * cos)), pin[1] + deg(m * Math.cos(a) / 6371008.8)]);
    }
    out.push({ type: 'Feature', properties: { r }, geometry: { type: 'LineString', coordinates: pts } });
  }
  return out;
}
// S.prefs.ringsAlpha (10–100 %) is the inner ring's opacity; outer rings fade to a third of it
const ringsOpacity = () => { const a = Math.min(100, Math.max(10, +S.prefs.ringsAlpha || 50)) / 100; return ['interpolate', ['linear'], ['get', 'r'], 50, a, 400, a * .35]; };
const ringsPaint = () => { if (mapReady) map.setPaintProperty('rings', 'line-opacity', ringsOpacity()); };
let mapReady = false;
map.on('load', () => {
  map.addSource('rings', { type: 'geojson', data: fc([]) });
  // dotted (no glow: it would fill in the gaps); how strong is the user's choice (settings › 距離の輪の濃さ)
  map.addLayer({ id: 'rings', type: 'line', source: 'rings', layout: { 'line-cap': 'round' },
    paint: { 'line-color': '#ffffff', 'line-width': ['case', ['==', ['%', ['get', 'r'], 100], 0], 1.2, .9], 'line-dasharray': [1, 3], 'line-opacity': ringsOpacity() } });
  map.addSource('lines', { type: 'geojson', data: fc([]) });
  map.addLayer({ id: 'lines-dash', type: 'line', source: 'lines', filter: ['in', ['get', 'kind'], ['literal', ['hole', 'setup']]],
    layout: { 'line-cap': 'round' }, paint: { 'line-color': '#ffffff', 'line-width': 2, 'line-opacity': .8, 'line-dasharray': [2, 2] } });
  // measured path (only after you tap the map): white casing under a dashed fluorescent lime line
  map.addLayer({ id: 'lines-case', type: 'line', source: 'lines', filter: ['in', ['get', 'kind'], ['literal', ['tap']]],
    layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#ffffff', 'line-width': 5.5, 'line-opacity': .5 } });
  map.addLayer({ id: 'lines-tap', type: 'line', source: 'lines', filter: ['==', ['get', 'kind'], 'tap'],
    layout: { 'line-join': 'round' }, paint: { 'line-color': '#ffd84d', 'line-width': 3, 'line-dasharray': [2, 1.6] } });
  mapReady = true;
  refresh();
  if (registered(hole())) { if (S.prefs.is3D) { set3D(true); refresh(); } else camera(S.view, 0); }  // as left last time
  else if (obDue() && !comp) $('onboard').hidden = false;  // a competition's player gets the course from the organizer
});

/* camera presets per hole */
let camTok = 0;
map.on('movestart', e => { if (e.originalEvent) camTok++; });  // user gesture cancels a pending re-aim
function camera(view, duration = 900, settle = true) {
  const h = hole(); if (!registered(h) || inSetup()) return;  // the guide aims the map itself (js/guide.js)
  const t = roundTee();  // today's tee, if moved
  const len = Math.max(60, distM(t, h.green)), brg = bearing(t, h.green);
  const el = map.getContainer(), H = el.clientHeight || 700;
  const lat = (t[1] + h.green[1]) / 2;
  const base = Math.log2(156543.03 * Math.cos(rad(lat)) * (H * .5) / len);
  const pitch3 = S.is3D;
  // flat views: tee to green fits between the distance panel and the bottom buttons, centred in that band
  // (+ 44: room for the flag drawn above the pin)
  const top = document.querySelector('.hud').getBoundingClientRect().bottom + 44, low = $('dock').hidden ? innerHeight : $('dock').getBoundingClientRect().top;
  const band = Math.max(200, low - top), flat = Math.log2(78271.5 * Math.cos(rad(lat)) * band * .86 / len), mid = [0, Math.round((top + low) / 2 - H / 2)];
  let opt;
  if (view === 'top') opt = { center: lerpLL(t, h.green, .5), bearing: brg, pitch: 0, zoom: flat, offset: mid };
  else if (!pitch3) opt = { center: lerpLL(t, h.green, .5), bearing: view === 'green' ? (brg + 180) % 360 : brg, pitch: 0, zoom: flat, offset: mid };
  else if (view === 'green') opt = { center: lerpLL(t, h.green, .45), bearing: (brg + 180) % 360, pitch: 62, zoom: base + .35 };
  else opt = { center: lerpLL(t, h.green, .6), bearing: brg, pitch: 62, zoom: base + .35 };
  map.easeTo(Object.assign(opt, { duration: matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : duration }));
  // in 3D the ground height under the new view is known only after its elevation tiles load;
  // aim again once they have, otherwise the camera can end up inside the hillside (looks hugely zoomed in)
  if (S.is3D && settle) { const tok = ++camTok; map.once('idle', () => { if (S.is3D && tok === camTok) camera(view, 400, false); }); }
}
/* turn terrain on/off; the camera moves only after the elevation tiles are in, so its height is right */
function set3D(on) {
  S.is3D = on; camTok++;
  map.setTerrain(on ? { source: 'dem', exaggeration: 1 } : null);
  const aim = () => {
    if (S.is3D !== on) return;
    if (registered(hole()) && !(S.mode && S.mode.startsWith('setup'))) camera(S.view, 900, false);
    else map.easeTo({ pitch: on ? 60 : 0, duration: 700 });
  };
  if (on) map.once('idle', aim); else aim();
}

