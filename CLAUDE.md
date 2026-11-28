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
- External APIs (Nominatim, msearch.gsi.go.jp): button-press only, one request at a time (Nominatim ≥1 s apart),
  and keep the credit "© OpenStreetMap contributors" on the registration screen and guide. GSI tile credit stays in the menu.
- Tee colours and yardages stay on the phone; competitions still get only `{par, tee, green}` (base tee).

## Files (load order) — what to open for which change
| File | Contents | Open it when changing… |
|---|---|---|
| `index.html` | All HTML (sheets, sub-screens, buttons), script order | layout, labels, new buttons |
| `css/style.css` | All styles (the score & ranking pages have their own paper-scorecard block at the end, scoped to #pScore / #pRank) | looks |
| `js/state.js` | `$`, `el`, `toast`, load/save JSON, course model (nines/holes), state `S`, `N`, `hole()`, `pinLL()`, saved course list `keepCourse` / `loadLib` | data model, migration, shared state |
| `js/geo.js` | distance, yards, bearing, tile x/y | distance math |
| `js/tiles.js` | GSI photo/DEM tiles, tile cache, `heights`, `elevAt`, map protocols | tiles, elevation |
| `js/map.js` | the map, markers (`M`, `TM`, `LM`), pin rings, `camera()`, `set3D()`; a finger starting at the bottom edge (iPhone home swipe) is kept from the map, and touchcancel / leaving mid-touch puts the view back | camera, 3D, markers |
| `js/hud.js` | `refresh()` (redraws everything), crosshair, `centerOn`, distance panel `readout()` | top distance panel, what refresh shows |
| `js/interactions.js` | `placeAt`, the hole being played (`playNo`, `onPlay`, `followPlay`, `setPlay`: GPS distance only there), measuring marks, hole arrows `goHole`, map buttons (3D/view/me/pin), GPS | taps, pins, GPS, side buttons |
| `js/menu.js` | settings sheet: screen stack `mShow`/`openMenu`, `ask`, nines picker, pin reset, undo bar | settings screens, back button |
| `js/scene.js` | the hole on screen in colour and the rest faded to grey: a wide capsule tee → green (`holeCaps`, r = 60 m + 12 % of the length, plus circles round the green, tee and pin; a hole-shaped version from the photo was tried in 2026-11-25/26 and dropped — it greyed parts of the hole's own fairway). Done on each photo / design tile in its protocol, `tileOut`; when the hole changes the tiles on screen are reloaded in place with MapLibre's private `sourceCaches[id].reload()` — setTiles dropped them all, a blank flash. 3D trees found once per round in the z17 photo (fill-extrusion layer `trees`, only in 3D; green by the hole on screen, grey elsewhere, from each tree's `hs` hole list); `sceneSync` from `refresh` | fading, trees |
| `js/view.js` | 表示の設定: every display setting on one screen; while open the sheet covers only the lower part (`#menu.peek`, `body.peek` hides the panels) so changes show on the real map above, with a bar for hole / 2D・3D / view / map size; `camera()` aims into the visible part via `viewPeekBox()` (3D uses map padding) | display settings screen |
| `js/look.js` | pin / marks / lines part of 表示の設定 (`renderLook`): pin colour/shape, mark colour/shape, line colour/dash/width (`S.prefs.look`), `applyLook` / `lookPaint` | map marker / line looks |
| `js/art.js` | マップのデザイン picker in 表示の設定 (`renderArt`) + the course picture as map tiles over the photo (raster source `art` via protocol `golfart://`, under the lines) for courses in `ART_COURSES` (now only ムーンレイク鶴舞, tiles in `art/moonlake-tsurumai/<design>/z/x/y.webp`, made by the 3D project's `tools/export-app-art.mjs`); `artSync` (called by `refresh`), `artSaveList` (offline save); after re-making a design's tiles bump its `ver` (tile cache keeps files by address) | map designs, a new course's picture |
| `js/course.js` | course list (`renderLib`: earlier courses, tap to switch), export/import backup, wipe | course switching, backup |
| `js/cardjson.js` | score card JSON (schemaVersion 1, made by an outside AI): `readCard`, `cardIssues` (warnings), `cardTeeMap`, `applyCard` (上書き / 別のコース; tee/green positions → holes with none, src ai, ok false). No network, no screen | card import rules, mapping |
| `js/search.js` | golf club search: Nominatim, GSI place-name fallback, `regUsePlace` (map + area) | search |
| `js/setup.js` | course registration screens in settings (`mReg`, `mRegNines`, `mRegYard`): draft, nines, tee colours, par/yardage, hole list, 確定 | course registration, tee colours |
| `js/import.js` | スコアカードから取り込む screen (`mRegCard`): 4 steps + `cardPrompt()` (the request copied for the user's own AI, matching readCard), paste / file, preview with editable cells, tee colour choice → into the draft | card import screen |
| `js/guide.js` | guide panel `#setup`: green → tee per hole, tap / drag, back/skip/next, camera | the guide |
| `js/score.js` | score page, −/＋ stepper, bottom dock, solo participants sheet; `scoreMark` = ◯ birdie / □ bogey marks on score cells | score entry, dock |
| `js/rank.js` | ranking page, everyone's scoreboard (editable cells), JPEG scorecard | ranking, scoreboard, image |
| `js/pages.js` | swipe ranking ← map → score, `goPage` | page swipe |
| `js/share.js` | Firebase: config, `fb()`, competition copy `comp`, score outbox/sync, create/join/connect | sync, offline sending |
| `js/roster.js` | roster/teams, invites + links (player/org links carry `openExternalBrowser=1` so LINE opens Safari/Chrome; inside an in-app browser the link stays in the address and a notice asks to open the browser), `roleKind`/`roleLabel` (org / player; the team lead role was dropped 2026-11), role notice, opening a link | teams, links, roles |
| `js/roles.js` | `canEdit` (organizer: all; a player with a chosen name: everyone in the same team = cart), `me()`, dock switching (`dockMany`), `applyRoles` (`data-show`), online/offline notice `netNotice` (competitions; the role badge was dropped 2026-11-27) | who may edit what (screen side) |
| `js/compui.js` | competition screens: create, overview, roster editor, links (LINE/copy/QR), name pick | competition screens |
| `js/offline.js` | save map tiles to the phone, service-worker registration, Safari add-to-home hint | offline save |
| `js/main.js` | start-up (GPS resume, first refresh) | start-up |
| `sw.js` | service worker: app files cache `golf3d-app-<VERSION>` | every push (VERSION), new files |
| `firebase-rules.json` | database rules (the real permission check) | permissions |
| `tests/rules.html` | live allow/deny test of the rules (~80 checks, ~2 min) | after rule changes |
| `tests/course.html` | course conversion, tee estimates, checks, score card import with dummy data (no network, fake localStorage) | course model, cardjson.js |
| `tests/round.html` | simulated phones for a live round test: `window.sim` (phone / join / pick / score / offline / board), each its own anonymous user, writing as share.js does | competition flow, sending scores |
| `FIREBASE.md` | Japanese guide for the user (console, rules, test page) | Firebase how-to |

## Saved data
localStorage (per browser; Safari and the home-screen app are separate):
| Key | Shape |
|---|---|
| `golf3d.course` | `{v:2, name, center, nines:[{id, name, holes:[{n, par, hdcp, tee, green, src, ok, yd:{teeId:yards}}×9]}], tees:[{id,name,color}], baseTee, area:{bbox,osm,name}}` — `tee` is the base colour's; older data gets blue/white/red, base white; `hdcp` 1–18 or null (older data: null; phone only, not sent to competitions) |
| `golf3d.courseDraft` | course registration in progress: `{course, fresh, named}` (older drafts also had `cand`, ignored); removed on 確定 / 下書きを捨てる |
| `golf3d.course.v1backup` | the old 18-hole course, kept once when migrated |
| `golf3d.round` | `{pins:{1..18:[lng,lat]}, tees:{1..18:[lng,lat]}, front, back, play, green}` (nine ids; play = the hole being played 1–18, green = its green was reached; js/interactions.js `followPlay`); `tees` = today's tee moved with 今日のピン位置 (ピン／ティー) (this phone only, never sent) |
| `golf3d.prefs` | `{elev, rings, ringsAlpha, device, devAdj, gps, n, setupMin, seen, obLater, swipeHint, view, is3D, look, art, exag, trees, fade, treeSize, treeHeight}` (trees / fade: 3Dで木を表示 / ほかのホールを薄く, missing = on, false = off — js/scene.js; treeSize / treeHeight: 木の大きさ / 木の高さ 0.5–2, missing = 1 — js/scene.js `treeK()`; exag: 3Dの高低差 0.5–2, missing = 1, look only, never distances — js/map.js `exag()`; art: マップのデザイン aerial|flat|navi|pixel|off, missing = aerial; look: only the design choices that differ from the default, js/look.js `LOOK_DEF`; rings: dotted 50Y rings, ringsAlpha 10–100 their strength; device: index in `IPHONES` (js/hud.js) or null = 自動, devAdj: manual px for the bottom edge; seen: time of the first visit (add-to-home card waits for the second); obLater: time 「あとで」 was pressed on the course registration card (hidden for 7 days); swipeHint: the swipe tip on 順位表 / スコア表 was shown; view: tee|top|green and is3D, restored on reload) |
| `golf3d.score` | solo: `{players:[{id,name}], strokes:{id:[18]}}` |
| `golf3d.offline` | `{sig, at}` of the course whose tiles were saved |
| `golf3d.comp` | this phone's copy of the competition (+ `outbox` of unsent scores) |
| `golf3d.a2hsClosed` | time the add-to-home card was closed (shown again after 20 h; older versions saved `true`) |
| `golf3d.courses` | courses used on this phone, last used first: `[{name, at, course}]` (one per name, max 30; only courses with a placed hole). Updated by every `saveCourse()`; shown on 別のコースに切り替え |

Caches: `golf3d-tiles-v1` (map tiles, never cleared by updates), `golf3d-app-<VERSION>` (app files).

Firebase Realtime Database (project golfscoreAPP / golfscoreapp-f2d31, anonymous sign-in):
```
expiry/{cid}            expires (cleanup index; any app deletes past ones)
comps/{cid}/meta        {name, date, owner, created, expires}         org writes
           /course      {club, nines:[{name, holes:[{par, tee, green}]}×2]}   org writes
           /roster/{pid} {name, team}                                   org writes
           /leads/t{n}  old team leads (before 2026-11), no longer written or read for permissions   org writes
           /pins/hNN    [lng, lat]                                      org writes
           /invites/{key} {role: player|org, t}                         org only
           /members/{uid} {role: player|org, key, player?, t}
           /taken/{pid} uid that picked the name
           /scores/{pid}/hNN {v, by, bp, t, fix?}   org: all · player (name chosen): everyone in the same team
```
Hole keys are `h01`..`h18` (numeric keys would turn into arrays).
