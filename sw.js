// Wersja cache'u - PODNOŚ ją (v1 -> v2 -> v3...) przy każdej większej aktualizacji, żeby stare
// wpisy w cache'u zostały jawnie skasowane w evencie "activate" (patrz niżej). Samo Network First
// już samo w sobie zapewnia świeże pliki przy każdym ładowaniu online - ta wersja to dodatkowa
// siatka bezpieczeństwa, np. gdyby trzeba było wymusić czystkę po zmianie listy PRECACHE_URLS.
const CACHE_VERSION = 'v8';
const CACHE_NAME = `redaktor-safi-${CACHE_VERSION}`;

// Kluczowe pliki statyczne cache'owane przy instalacji - aplikacja ma z nich korzystać
// OFFLINE, gdy sieć akurat zawiedzie (patrz strategia "fetch" niżej).
const PRECACHE_URLS = [
    './',
    './index.html',
    './social-media.html',
    './style.css',
    './manifest.json',
    './js/app.js',
    './js/social.js',
    './js/photoDb.js',
    './js/compressor.js',
    './js/gemini.js',
    './js/gutenberg.js',
    './js/i18n.js',
    './js/imageWorker.js',
    './assets/logo-192.png',
    './assets/logo-512.png'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => cache.addAll(PRECACHE_URLS))
            // Nowy Service Worker przejmuje kontrolę OD RAZU, bez czekania aż użytkownik
            // zamknie wszystkie karty z aplikacją - kluczowe dla "natychmiastowej" aktualizacji.
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys()
            .then((keys) => Promise.all(
                keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
            ))
            .then(() => self.clients.claim())
    );
});

// Strategia "Network First": przy KAŻDYM żądaniu najpierw próbujemy pobrać świeżą wersję
// z sieci (i od razu aktualizujemy nią cache) - dzięki temu zmiany wypchnięte na Netlify
// są widoczne natychmiast przy pierwszym online'owym wczytaniu strony, bez czekania na
// wygaśnięcie jakiegokolwiek cache'u. Do cache'u sięgamy TYLKO, gdy sieć faktycznie zawiedzie
// (np. brak internetu) - wtedy aplikacja i tak działa z ostatnią znaną, dobrą wersją.
self.addEventListener('fetch', (event) => {
    if (event.request.method !== 'GET') return; // np. POST do Cloudflare Workera - nigdy nie cache'ować

    event.respondWith(
        fetch(event.request)
            .then((networkResponse) => {
                const responseClone = networkResponse.clone();
                caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseClone));
                return networkResponse;
            })
            .catch(() =>
                caches.match(event.request).then((cachedResponse) =>
                    cachedResponse || caches.match('./index.html')
                )
            )
    );
});
