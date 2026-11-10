// Coque de l'appli (HTML, CSS, JS, icônes) servie tout de suite depuis le cache, puis mise à jour en arrière-plan :
// l'écran s'affiche sans attendre le réseau. L'API (données) ne passe jamais par ici : app.js garde lui-même
// le dernier état affiché. Changer VERSION pour forcer le renouvellement du cache.
const VERSION = 'agendix-v2';
const COQUE = ['./', 'style.css', 'app.js', 'manifest.json', 'icons/icon-192.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(COQUE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((noms) => Promise.all(noms.filter((n) => n !== VERSION).map((n) => caches.delete(n))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/calendrier/')) return; // données : toujours le réseau
  e.respondWith(
    caches.open(VERSION).then(async (cache) => {
      const copie = await cache.match(e.request, { ignoreSearch: true });
      const reseau = fetch(e.request)
        .then((res) => {
          if (res.ok) cache.put(e.request, res.clone());
          return res;
        })
        .catch(() => copie || Response.error());
      if (copie) {
        e.waitUntil(reseau);
        return copie;
      }
      return reseau;
    })
  );
});
