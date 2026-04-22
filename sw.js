const CACHE_NAME = 'aventuriers-v1';
const ASSETS_TO_CACHE = [
    './',
    './index.html',
    './game.js',
    './manifest.json'
];

// Installation du Service Worker et mise en cache des fichiers
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => {
            return cache.addAll(ASSETS_TO_CACHE);
        })
    );
});

// Intercepte les requêtes pour servir le cache si possible
self.addEventListener('fetch', event => {
    event.respondWith(
        caches.match(event.request).then(response => {
            return response || fetch(event.request);
        })
    );
});