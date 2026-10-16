// GRIP WARS: the offline cache. After the first visit the game runs without the network.
const CACHE = 'gripwars-7b8e0154df';
const FILES = ["./", "./css/game.css", "./icon.svg", "./index.html", "./js/engine/actor.js", "./js/engine/ai.js", "./js/engine/arena.js", "./js/engine/art.js", "./js/engine/audio.js", "./js/engine/body.js", "./js/engine/career.js", "./js/engine/careerui.js", "./js/engine/careerui2.js", "./js/engine/ceremony.js", "./js/engine/combat.js", "./js/engine/commentary.js", "./js/engine/core.js", "./js/engine/downed.js", "./js/engine/face.js", "./js/engine/fighter.js", "./js/engine/fx.js", "./js/engine/game.js", "./js/engine/gnp.js", "./js/engine/grapple.js", "./js/engine/league.js", "./js/engine/medical.js", "./js/engine/neonfx.js", "./js/engine/ragdoll.js", "./js/engine/replay.js", "./js/engine/roster.js", "./js/engine/ui.js", "./js/engine/voice.js", "./js/engine/watchdog.js", "./js/gw/gw_ai.js", "./js/gw/gw_career.js", "./js/gw/gw_data.js", "./js/gw/gw_drills.js", "./js/gw/gw_fight.js", "./js/gw/gw_ui.js", "./js/judo/career.js", "./js/judo/gi.js", "./js/judo/grips.js", "./js/judo/match.js", "./js/judo/run.js", "./js/judo/throws.js", "./js/judo/ui.js", "./js/judo/venues.js", "./js/vendor/three.min.js", "./manifest.webmanifest"];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(caches.match(e.request).then((r) => r || fetch(e.request)));
});
