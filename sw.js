const CACHE_NAME = 'aventuriers-v4';
const ASSETS_TO_CACHE = [
    './',
    './index.html',
    './style.css',
    './data.js',
    './ui.js',
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

// Nettoyage des anciens caches lors de la mise à jour
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cache => {
                    if (cache !== CACHE_NAME) return caches.delete(cache);
                })
            );
        })
    );
});

// Intercepte les requêtes pour servir le cache si possible
// STRATÉGIE : Network First (Réseau d'abord, Cache en secours)
self.addEventListener('fetch', event => {
    event.respondWith(
        fetch(event.request).catch(() => {
            return caches.match(event.request);
        })
    );
});