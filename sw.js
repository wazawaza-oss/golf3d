/* golf3d service worker: keeps the app itself (page, CSS, JS, icons, MapLibre) on the phone so it opens with no signal.
   Bump VERSION with every release: the new worker stores the new files and deletes the old set, so no stale mix remains.
   Map tiles live in their own cache (golf3d-tiles-v1, filled by 端末に保存) and are never touched here;
   GSI tiles and Firebase go straight to the network. */
const VERSION = '2026-10-28.9';
const APP = 'golf3d-app-' + VERSION;
const FILES = [
  './', 'index.html', 'css/style.css',
  'js/state.js', 'js/geo.js', 'js/tiles.js', 'js/map.js', 'js/hud.js', 'js/interactions.js', 'js/menu.js', 'js/course.js', 'js/setup.js', 'js/score.js', 'js/rank.js', 'js/pages.js', 'js/share.js', 'js/roster.js', 'js/roles.js', 'js/compui.js', 'js/offline.js', 'js/main.js',
  'manifest.webmanifest', 'icons/icon-180.png', 'icons/icon-192.png', 'icons/icon-512.png',
  'https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js',
  'https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.css',
  'https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js'  // QR codes for competition links
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(APP).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k.startsWith('golf3d-app-') && k !== APP).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const ours = url.origin === location.origin || url.href.startsWith('https://unpkg.com/maplibre-gl@') || url.href.startsWith('https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/');
  if (!ours) return;  // map tiles, Firebase, fonts: network as usual
  const page = req.mode === 'navigate';
  if (page && !/\/(index\.html)?$/.test(url.pathname)) return;  // other pages here (tests/rules.html) come from the network
  // opening the app (also links like ?c=…&k=…) always gets the stored page
  const key = page ? new URL('index.html', self.registration.scope).href : req;
  e.respondWith(caches.open(APP)
    .then(c => c.match(key, { ignoreSearch: true }))
    .then(hit => hit || fetch(req)));
});
