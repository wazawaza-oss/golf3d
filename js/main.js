/* golf3d — main: start-up
   Plain scripts loaded in order from index.html (no build step); they share top-level names. */
"use strict";

if (S.prefs.gps) gpsStart();
refresh();
