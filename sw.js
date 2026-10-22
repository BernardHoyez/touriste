// Service worker "brise-cache" — touriste
// À CHAQUE livraison qui touche un fichier statique : incrémenter le suffixe -vN.
const CACHE_NAME = 'touriste-cache-v1';

// Fichiers de l'application : network-first (jamais de page obsolète quand il y a du réseau)
const APP_ASSETS = [
  './',
  './index.html',
  './style.css',
  './core.js',
  './app.js',
  './manifest.json'
];

// Assets rarement modifiés : cache-first
const STATIC_ASSETS = [
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png',
  './vendor/leaflet/leaflet.js',
  './vendor/leaflet/leaflet.css',
  './vendor/leaflet/images/layers.png',
  './vendor/leaflet/images/layers-2x.png'
];

const PRECACHE_ASSETS = APP_ASSETS.concat(STATIC_ASSETS);
const APP_URLS = new Set(APP_ASSETS.map((a) => new URL(a, self.location).href));
const TILE_HOSTS = ['tile.openstreetmap.org', 'data.geopf.fr'];
const MAX_TILES = 600;

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      // cache:'reload' : on contourne le cache HTTP du navigateur / de GitHub Pages
      cache.addAll(PRECACHE_ASSETS.map((u) => new Request(u, { cache: 'reload' })))
    )
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
      self.clients.claim(),
      caches.keys().then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
      )
    ])
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'GET_VERSION' && event.source) {
    event.source.postMessage({ type: 'VERSION', cache: CACHE_NAME });
  }
});

async function trimTiles(cache) {
  const keys = (await cache.keys()).filter((r) => TILE_HOSTS.includes(new URL(r.url).hostname));
  for (let i = 0; i < keys.length - MAX_TILES; i++) await cache.delete(keys[i]);
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  // Tuiles de carte : cache-first, volume plafonné
  if (TILE_HOSTS.includes(url.hostname)) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          if (response && (response.ok || response.type === 'opaque')) {
            const clone = response.clone();
            event.waitUntil(
              caches.open(CACHE_NAME).then((cache) => cache.put(request, clone).then(() => trimTiles(cache)))
            );
          }
          return response;
        });
      })
    );
    return;
  }

  if (url.origin !== self.location.origin) return;

  // Application : network-first, retombée sur le cache hors ligne
  if (request.mode === 'navigate' || APP_URLS.has(url.origin + url.pathname)) {
    event.respondWith(
      fetch(request, { cache: 'no-cache' })
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.put(request, clone)));
          }
          return response;
        })
        .catch(() =>
          caches.match(request, { ignoreSearch: true }).then((c) => c || caches.match('./index.html'))
        )
    );
    return;
  }

  // Assets vendorisés, icônes : cache-first
  event.respondWith(
    caches.match(request).then((cached) => cached || fetch(request))
  );
});
