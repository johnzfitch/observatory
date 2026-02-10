/**
 * Minimal Service Worker - Simplified caching
 * Models cached in IndexedDB (onnx-init.js), not here
 */

const CACHE_VERSION = 'v2.5.0'; // January 2026: ONNX Runtime 1.21.0, WebGPU enhancements
const CACHE_NAME = `observatory-${CACHE_VERSION}`;

const ESSENTIAL_ASSETS = [
  '/',
  '/index.html',
  '/src/core/ort-runtime.js',
  '/src/core/preprocessing.js',
  '/src/ui/styles.css',
  '/fonts/fonts.css'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(ESSENTIAL_ASSETS).catch(() => {}))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k.startsWith('observatory-') && k !== CACHE_NAME)
            .concat(keys.filter(k => k.startsWith('deepfake-detector-')))
            .map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // Skip ONNX models - handled by IndexedDB
  if (url.pathname.endsWith('.onnx') || url.pathname.endsWith('.bin')) return;

  // Skip model JS files - let browser fetch directly
  if (url.pathname.includes('/models/') && url.pathname.endsWith('.js')) return;

  // Skip external CDN requests
  if (url.origin !== location.origin) return;

  event.respondWith(
    fetch(event.request)
      .then(response => {
        // Don't cache model JS files - always fetch fresh to get latest fixes
        const shouldCache = response.ok &&
                           !url.pathname.includes('/models/') &&
                           !url.pathname.endsWith('.js');

        if (shouldCache) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});
