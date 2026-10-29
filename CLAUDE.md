# golf3d — notes for working on this app

Golf course map (MapLibre + GSI aerial/elevation tiles) with score entry and Firebase competitions.
Plain HTML/CSS/JS, served as-is by GitHub Pages: https://wazawaza-oss.github.io/golf3d/
The user is a Japanese speaker new to Git: answer in plain Japanese, say what was and was not verified.

## Rules
- **Read only the files the change needs** (see the table below). Don't open every file "for context".
- **No build step.** Files are plain classic scripts loaded in order by `index.html`; they share top-level names.
  Top-level code may only use names from *earlier* files (calls inside functions may go anywhere).
  New file → add a `<script>` in `index.html` at the right place **and** to `FILES` in `sw.js`.
- **Bump `VERSION` in `sw.js` on every push** (otherwise phones keep the old files).
- Never rename localStorage keys or change the Firebase data shape without a migration (users' data lives there).
- Firebase rules live in `firebase-rules.json`; after changing them, publish in the console and run `tests/rules.html`.
- Push only when the user asks. No browser `confirm()`: use `ask()` (in-page dialog).
- External APIs (Nominatim, Overpass, msearch.gsi.go.jp): button-press only, one request at a time (Nominatim ≥1 s apart, Overpass ≥10 s),
  and keep the credit "© OpenStreetMap contributors" on the registration screen and guide. GSI tile credit stays in the menu.
- Tee colours and yardages stay on the phone; competitions still get only `{par, tee, green}` (base tee).

## Files (load order) — what to open for which change
| File | Contents | Open it when changing… |
|---|---|---|
| `index.html` | All HTML (sheets, sub-screens, buttons), script order | layout, labels, new buttons |
| `css/style.css` | All styles | looks |
| `js/state.js` | `$`, `el`, `toast`, load/save JSON, course model (nines/holes), state `S`, `N`, `hole()`, `pinLL()` | data model, migration, shared state |
| `js/geo.js` | distance, yards, bearing, tile x/y | distance math |
| `js/tiles.js` | GSI photo/DEM tiles, tile cache, `heights`, `elevAt`, map protocols | tiles, elevation |
| `js/map.js` | the map, markers (`M`, `TM`, `LM`), pin rings, `camera()`, `set3D()` | camera, 3D, markers |
| `js/hud.js` | `refresh()` (redraws everything), crosshair, `centerOn`, distance panel `readout()` | top distance panel, what refresh shows |
| `js/interactions.js` | `placeAt`, measuring marks, hole arrows `goHole`, map buttons (3D/view/me/pin), GPS | taps, pins, GPS, side buttons |
| `js/menu.js` | settings sheet: screen stack `mShow`/`openMenu`, `ask`, nines picker, pin reset, undo bar | settings screens, back button |
| `js/course.js` | jump to another course, export/import backup, wipe | course switching, backup |
| `js/draft.js` | `draftCourse(input)` → tee/green first guess from OSM (Overpass), `osmToDraft` (no network), `applyDraft`. Swap in an AI version here (same input/output) | OSM draft, AI draft |
| `js/search.js` | golf club search: Nominatim, GSI place-name fallback, `regUsePlace` (map + area) | search |
| `js/setup.js` | course registration screens in settings (`mReg`, `mRegNines`, `mRegYard`): draft, nines, tee colours, par/yardage, hole list, 確定 | course registration, tee colours |
| `js/guide.js` | guide panel `#setup`: green → tee per hole, tap / candidates / drag, back/skip/next, camera | the guide |
| `js/score.js` | score page, −/＋ stepper, bottom dock, solo participants sheet | score entry, dock |
| `js/rank.js` | ranking page, everyone's scoreboard (editable cells), JPEG scorecard | ranking, scoreboard, image |
| `js/pages.js` | swipe ranking ← map → score, `goPage` | page swipe |
| `js/share.js` | Firebase: config, `fb()`, competition copy `comp`, score outbox/sync, create/join/connect | sync, offline sending |
| `js/roster.js` | roster/teams/leads, invites + links, `roleKind`/`roleLabel`, role notice, opening a link | teams, leads, links, roles |
| `js/roles.js` | `canEdit`, `me()`, dock switching, `applyRoles` (`data-show`), role badge | who may edit what (screen side) |
| `js/compui.js` | competition screens: create, overview, roster editor, links (LINE/copy/QR), name pick | competition screens |
| `js/offline.js` | save map tiles to the phone, service-worker registration, Safari add-to-home hint | offline save |
| `js/main.js` | start-up (GPS resume, first refresh) | start-up |
| `sw.js` | service worker: app files cache `golf3d-app-<VERSION>` | every push (VERSION), new files |
| `firebase-rules.json` | database rules (the real permission check) | permissions |
| `tests/rules.html` | live allow/deny test of the rules (~80 checks, ~2 min) | after rule changes |
| `tests/course.html` | course conversion, tee estimates, checks, OSM draft with dummy data (no network, fake localStorage) | course model, draft.js |
| `FIREBASE.md` | Japanese guide for the user (console, rules, test page) | Firebase how-to |

## Saved data
localStorage (per browser; Safari and the home-screen app are separate):
| Key | Shape |
|---|---|
| `golf3d.course` | `{v:2, name, center, nines:[{id, name, holes:[{n, par, tee, green, src, ok, yd:{teeId:yards}}×9]}], tees:[{id,name,color}], baseTee, area:{bbox,osm,name}}` — `tee` is the base colour's; older data gets blue/white/red, base white |
| `golf3d.courseDraft` | course registration in progress: `{course, cand:{greens,tees}, fresh, named}`; removed on 確定 / 下書きを捨てる |
| `golf3d.course.v1backup` | the old 18-hole course, kept once when migrated |
| `golf3d.round` | `{pins:{1..18:[lng,lat]}, tees:{1..18:[lng,lat]}, front, back}` (nine ids); `tees` = today's tee moved with ピン＆ティー (this phone only, never sent) |
| `golf3d.prefs` | `{elev, rings, ringsAlpha, device, devAdj, gps, n, setupMin}` (rings: dotted 50Y rings, ringsAlpha 10–100 their strength; device: index in `IPHONES` (js/hud.js) or null = 自動, devAdj: manual px for the bottom edge) |
| `golf3d.score` | solo: `{players:[{id,name}], strokes:{id:[18]}}` |
| `golf3d.offline` | `{sig, at}` of the course whose tiles were saved |
| `golf3d.comp` | this phone's copy of the competition (+ `outbox` of unsent scores) |
| `golf3d.a2hsClosed` | time the add-to-home card was closed (shown again after 20 h; older versions saved `true`) |

Caches: `golf3d-tiles-v1` (map tiles, never cleared by updates), `golf3d-app-<VERSION>` (app files).

Firebase Realtime Database (project golfscoreAPP / golfscoreapp-f2d31, anonymous sign-in):
```
expiry/{cid}            expires (cleanup index; any app deletes past ones)
comps/{cid}/meta        {name, date, owner, created, expires}         org writes
           /course      {club, nines:[{name, holes:[{par, tee, green}]}×2]}   org writes
           /roster/{pid} {name, team}                                   org writes
           /leads/t{n}  pid of team n's lead (one per team)             org writes
           /pins/hNN    [lng, lat]                                      org writes
           /invites/{key} {role: player|org, t}                         org only
           /members/{uid} {role: player|org, key, player?, t}
           /taken/{pid} uid that picked the name
           /scores/{pid}/hNN {v, by, bp, t, fix?}   org: all · lead: own team · player: self
```
Hole keys are `h01`..`h18` (numeric keys would turn into arrays).
