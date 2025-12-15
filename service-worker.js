/**
 * Service Worker - Intelligent Caching & Lazy Loading Strategy
 *
 * Cache Strategy:
 * 1. Essential Assets: Cache immediately on install (HTML, JS, CSS, fonts)
 * 2. Models: Cache on-demand with progress tracking (ONNX/weights files)
 * 3. Network-first for HTML: Always fetch latest page
 * 4. Cache-first for assets: Serve cached, fallback to network
 *
 * Benefits:
 * - Eliminates 1GB+ re-downloads on page refresh
 * - Lazy loads only selected models
 * - Persistent storage across sessions
 * - Offline capability for cached models
 */

// STABLE VERSIONING: Only bump when breaking changes require cache invalidation
// Models use IndexedDB (onnx-init.js) so they persist across SW updates
const CACHE_VERSION = 'v2.3.0';  // Transformers.js 3.8.1 + 3 new models (sdxl_detector, ateeqq, hamzenium)
const CACHE_NAME = `deepfake-detector-${CACHE_VERSION}`;
const MODEL_CACHE_NAME = `deepfake-detector-models-${CACHE_VERSION}`;
const RUNTIME_CACHE_NAME = `deepfake-detector-runtime-${CACHE_VERSION}`;

/**
 * Model URLs for pre-warming (optional background download)
 * These are cached in IndexedDB by onnx-init.js, not the SW Cache API
 */
const MODEL_URLS = [
  '/models/ateeqq/model.onnx',
  '/models/dima806_ai_real/onnx/model.onnx',
  '/models/hamzenium/model.onnx',
  '/models/prithiv_v2/onnx/model.onnx',
  '/models/sdxl_detector/model.onnx',
  '/models/smogy/onnx/model.onnx'
];

/**
 * Essential assets to cache immediately on install
 * These are small critical files needed for the app to function
 */
const ESSENTIAL_ASSETS = [
  '/',
  '/index.html',
  '/patches/001-cache-nuclear.js',
  '/src/config/onnx-init.js',
  '/src/config/paths.js',
  '/src/ui/ModelManager.js',
  '/src/ui/InferenceEngine.js',
  '/src/ui/ProgressTracker.js',
  '/src/ui/StateManager.js',
  '/src/ui/DownloadTracker.js',
  '/src/ui/styles.css',
  '/fonts/fonts.css'
];

/**
 * Vendor assets - ONNX runtime WASM files
 * Note: transformers.js is loaded from CDN (jsdelivr)
 */
const VENDOR_ASSETS = [
  '/vendor/ort-wasm.wasm',
  '/vendor/ort-wasm-simd.wasm',
  '/vendor/ort-wasm-threaded.wasm',
  '/vendor/ort-wasm-simd-threaded.wasm'
];

/**
 * Install event: Cache essential assets only
 * This runs once when service worker is first registered
 */
self.addEventListener('install', (event) => {
  console.log('[SW] Install: Caching essential assets');

  event.waitUntil(
    Promise.all([
      // Cache essential assets
      caches.open(CACHE_NAME).then(cache => {
        console.log(`[SW] Created cache: ${CACHE_NAME}`);
        return cache.addAll(ESSENTIAL_ASSETS).catch(err => {
          console.warn('[SW] Some essential assets failed to cache:', err);
          // Continue even if some assets fail to cache
          return Promise.all(
            ESSENTIAL_ASSETS.map(url =>
              cache.add(url).catch(() => {
                console.warn(`[SW] Failed to cache: ${url}`);
              })
            )
          );
        });
      }),

      // Cache vendor assets separately
      caches.open(RUNTIME_CACHE_NAME).then(cache => {
        console.log(`[SW] Created cache: ${RUNTIME_CACHE_NAME}`);
        return Promise.all(
          VENDOR_ASSETS.map(url =>
            cache.add(url).catch(() => {
              console.warn(`[SW] Failed to cache vendor asset: ${url}`);
            })
          )
        );
      }),

      // Create model cache database
      caches.open(MODEL_CACHE_NAME).then(cache => {
        console.log(`[SW] Created cache: ${MODEL_CACHE_NAME}`);
        return Promise.resolve();
      })
    ])
  );

  // Take control immediately
  self.skipWaiting();
});

/**
 * Activate event: Clean up old cache versions
 *
 * IMPORTANT: Models are now stored in IndexedDB (onnx-init.js), not the SW Cache API.
 * This means:
 * - Model data persists across SW updates
 * - Only clear old SW caches (assets, runtime), not model data
 * - IndexedDB model cache is managed separately by __ModelCache__
 */
self.addEventListener('activate', (event) => {
  console.log('[SW] Activate: Cleaning up old caches (IndexedDB model cache preserved)');

  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames
          .filter(name => {
            // Only delete old SW caches, NOT the current version
            const isOldDeepfake = name.startsWith('deepfake-detector-') &&
                                  !name.includes(CACHE_VERSION);
            const isOldModels = name.startsWith('deepfake-models-') &&
                               !name.includes(CACHE_VERSION);
            return isOldDeepfake || isOldModels;
          })
          .map(name => {
            console.log(`[SW] Deleting old cache: ${name}`);
            return caches.delete(name);
          })
      );
    })
  );

  // Take control of all pages
  self.clients.claim();
});

/**
 * Fetch event: Intelligent routing and caching
 */
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  const path = url.pathname;

  // Skip non-GET requests
  if (event.request.method !== 'GET') {
    return;
  }

  // Skip non-HTTP(S) requests
  if (!url.protocol.startsWith('http')) {
    return;
  }

  // IMPORTANT: Do NOT cache model files in Service Worker
  // onnx-init.js handles model caching via IndexedDB to avoid conflicts
  // Let model requests pass through to onnx-init.js fetch override
  if (path.includes('/models/') && (path.endsWith('.onnx') || path.endsWith('.bin') || path.endsWith('.pb'))) {
    // Don't intercept - let onnx-init.js handle it
    return;
  }

  // Model configuration and metadata files
  if (path.includes('/models/') && (path.endsWith('.json') || path.endsWith('.txt'))) {
    event.respondWith(handleConfigRequest(event.request));
    return;
  }

  // HTML files: Network-first (always get latest)
  if (event.request.mode === 'navigate' || path.endsWith('.html')) {
    event.respondWith(handleNavigateRequest(event.request));
    return;
  }

  // Vendor files: Cache-first, then network
  if (path.includes('/vendor/')) {
    event.respondWith(handleVendorRequest(event.request));
    return;
  }

  // JS/CSS/Font files: Cache-first, then network
  if (path.endsWith('.js') || path.endsWith('.css') || path.includes('/fonts/')) {
    event.respondWith(handleAssetRequest(event.request));
    return;
  }

  // Default: Network-first for everything else
  event.respondWith(handleDefaultRequest(event.request));
});

/**
 * Handle model file requests (ONNX, bin, pb)
 * Strategy: Cache-first for large files (avoid re-downloading)
 *
 * @param {Request} request
 * @returns {Promise<Response>}
 */
async function handleModelRequest(request) {
  const path = new URL(request.url).pathname;

  try {
    // Check model cache first
    const cached = await caches.match(request);
    if (cached) {
      console.log(`[SW] Cache HIT (model): ${path}`);
      return cached;
    }

    console.log(`[SW] Cache MISS (model): ${path} - Downloading...`);

    // Fetch from network
    const response = await fetch(request);

    if (!response.ok) {
      console.warn(`[SW] Failed to fetch model: ${path} (${response.status})`);
      return response;
    }

    // Cache the response
    const cache = await caches.open(MODEL_CACHE_NAME);
    const responseClone = response.clone();

    cache.put(request, responseClone).catch(err => {
      console.warn(`[SW] Failed to cache model: ${path}`, err);
    });

    return response;
  } catch (error) {
    console.error(`[SW] Model request failed: ${path}`, error);

    // Try to return cached version even if fetch failed
    const cached = await caches.match(request);
    if (cached) {
      console.log(`[SW] Returning stale cache for offline: ${path}`);
      return cached;
    }

    return new Response('Model download failed', { status: 503 });
  }
}

/**
 * Handle model config requests (JSON, TXT)
 * Strategy: Cache with network update
 *
 * @param {Request} request
 * @returns {Promise<Response>}
 */
async function handleConfigRequest(request) {
  const path = new URL(request.url).pathname;

  try {
    // Try network first for latest config
    const response = await fetch(request);
    if (response.ok) {
      // Cache the updated config
      const cache = await caches.open(RUNTIME_CACHE_NAME);
      cache.put(request, response.clone()).catch(err => {
        console.warn(`[SW] Failed to cache config: ${path}`, err);
      });
      return response;
    }
  } catch (error) {
    console.log(`[SW] Network failed for config: ${path}, trying cache`);
  }

  // Fallback to cache
  const cached = await caches.match(request);
  if (cached) {
    console.log(`[SW] Using cached config: ${path}`);
    return cached;
  }

  return new Response('Config not found', { status: 404 });
}

/**
 * Handle navigation requests (page loads)
 * Strategy: Network-first (always get latest page)
 *
 * @param {Request} request
 * @returns {Promise<Response>}
 */
async function handleNavigateRequest(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      // Cache the page
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone()).catch(err => {
        console.warn('[SW] Failed to cache page', err);
      });
      return response;
    }
    return response;
  } catch (error) {
    console.log('[SW] Network failed for navigation, trying cache');

    // Fallback to cached page
    const cached = await caches.match(request);
    if (cached) {
      return cached;
    }

    // Last resort: return cached index.html
    return caches.match('/index.html')
      .then(response => response || new Response('Page not found', { status: 404 }));
  }
}

/**
 * Handle vendor requests (transformers.js, ONNX runtime)
 * Strategy: Cache-first
 *
 * @param {Request} request
 * @returns {Promise<Response>}
 */
async function handleVendorRequest(request) {
  const path = new URL(request.url).pathname;

  // Check cache first
  const cached = await caches.match(request);
  if (cached) {
    console.log(`[SW] Cache HIT (vendor): ${path}`);
    return cached;
  }

  try {
    console.log(`[SW] Cache MISS (vendor): ${path}`);
    const response = await fetch(request);

    if (response.ok) {
      // Cache it
      const cache = await caches.open(RUNTIME_CACHE_NAME);
      cache.put(request, response.clone()).catch(err => {
        console.warn(`[SW] Failed to cache vendor: ${path}`, err);
      });
    }

    return response;
  } catch (error) {
    console.error(`[SW] Vendor request failed: ${path}`, error);

    // Try stale cache for offline
    const cached = await caches.match(request);
    return cached || new Response('Vendor asset not found', { status: 404 });
  }
}

/**
 * Handle asset requests (JS, CSS, fonts)
 * Strategy: Cache-first
 *
 * @param {Request} request
 * @returns {Promise<Response>}
 */
async function handleAssetRequest(request) {
  const path = new URL(request.url).pathname;

  // Check cache first
  const cached = await caches.match(request);
  if (cached) {
    console.log(`[SW] Cache HIT (asset): ${path}`);
    return cached;
  }

  try {
    console.log(`[SW] Cache MISS (asset): ${path}`);
    const response = await fetch(request);

    if (response.ok) {
      // Cache it
      const cache = await caches.open(RUNTIME_CACHE_NAME);
      cache.put(request, response.clone()).catch(err => {
        console.warn(`[SW] Failed to cache asset: ${path}`, err);
      });
    }

    return response;
  } catch (error) {
    console.error(`[SW] Asset request failed: ${path}`, error);

    // Try cache as fallback
    const cached = await caches.match(request);
    return cached || new Response('Asset not found', { status: 404 });
  }
}

/**
 * Handle default requests
 * Strategy: Network-first
 *
 * @param {Request} request
 * @returns {Promise<Response>}
 */
async function handleDefaultRequest(request) {
  try {
    return await fetch(request);
  } catch (error) {
    console.warn('[SW] Default request failed:', error);

    // Try cache as fallback
    const cached = await caches.match(request);
    if (cached) {
      return cached;
    }

    return new Response('Request failed', { status: 503 });
  }
}

/**
 * Message handler for cache management and communication
 * Allows pages to communicate with the service worker
 */
self.addEventListener('message', (event) => {
  const { type, payload } = event.data;

  switch (type) {
    case 'SKIP_WAITING':
      console.log('[SW] Received SKIP_WAITING message');
      self.skipWaiting();
      break;

    case 'GET_CACHE_SIZE':
      handleGetCacheSize(event);
      break;

    case 'CLEAR_MODEL_CACHE':
      handleClearModelCache(event, payload?.modelId);
      break;

    case 'CLEAR_ALL_CACHES':
      handleClearAllCaches(event);
      break;

    case 'GET_CACHE_STATS':
      handleGetCacheStats(event);
      break;

    case 'GET_MODEL_URLS':
      // Return the list of model URLs for pre-warming
      event.ports[0].postMessage({
        type: 'MODEL_URLS',
        urls: MODEL_URLS
      });
      break;

    case 'PREWARM_STATUS':
      // Log pre-warm status from main thread
      console.log('[SW] Pre-warm status:', payload);
      break;

    default:
      console.log('[SW] Unknown message type:', type);
  }
});

/**
 * Get total cache size in bytes
 */
async function handleGetCacheSize(event) {
  try {
    const cacheNames = await caches.keys();
    let totalSize = 0;

    for (const cacheName of cacheNames) {
      const cache = await caches.open(cacheName);
      const requests = await cache.keys();

      for (const request of requests) {
        const response = await cache.match(request);
        if (response) {
          const blob = await response.blob();
          totalSize += blob.size;
        }
      }
    }

    event.ports[0].postMessage({
      type: 'CACHE_SIZE',
      size: totalSize,
      sizeMB: (totalSize / 1024 / 1024).toFixed(2)
    });
  } catch (error) {
    console.error('[SW] Error getting cache size:', error);
    event.ports[0].postMessage({
      type: 'ERROR',
      message: error.message
    });
  }
}

/**
 * Clear specific model cache
 */
async function handleClearModelCache(event, modelId) {
  try {
    const cache = await caches.open(MODEL_CACHE_NAME);
    const requests = await cache.keys();

    const cleared = [];
    for (const request of requests) {
      if (!modelId || request.url.includes(modelId)) {
        await cache.delete(request);
        cleared.push(request.url);
      }
    }

    event.ports[0].postMessage({
      type: 'CACHE_CLEARED',
      modelId,
      cleared
    });
  } catch (error) {
    console.error('[SW] Error clearing model cache:', error);
    event.ports[0].postMessage({
      type: 'ERROR',
      message: error.message
    });
  }
}

/**
 * Clear all caches
 */
async function handleClearAllCaches(event) {
  try {
    const cacheNames = await caches.keys();
    await Promise.all(
      cacheNames
        .filter(name => name.startsWith('deepfake-detector'))
        .map(name => caches.delete(name))
    );

    event.ports[0].postMessage({
      type: 'ALL_CACHES_CLEARED',
      count: cacheNames.length
    });
  } catch (error) {
    console.error('[SW] Error clearing all caches:', error);
    event.ports[0].postMessage({
      type: 'ERROR',
      message: error.message
    });
  }
}

/**
 * Get cache statistics
 */
async function handleGetCacheStats(event) {
  try {
    const stats = {
      caches: {},
      totalSize: 0,
      totalSizeMB: 0
    };

    const cacheNames = await caches.keys();
    for (const cacheName of cacheNames) {
      if (!cacheName.startsWith('deepfake-detector')) continue;

      const cache = await caches.open(cacheName);
      const requests = await cache.keys();
      let cacheSize = 0;

      const entries = [];
      for (const request of requests) {
        const response = await cache.match(request);
        if (response) {
          const blob = await response.blob();
          cacheSize += blob.size;
          entries.push({
            url: request.url,
            size: blob.size,
            sizeMB: (blob.size / 1024 / 1024).toFixed(3)
          });
        }
      }

      stats.caches[cacheName] = {
        size: cacheSize,
        sizeMB: (cacheSize / 1024 / 1024).toFixed(2),
        entries: entries.length,
        details: entries
      };

      stats.totalSize += cacheSize;
    }

    stats.totalSizeMB = (stats.totalSize / 1024 / 1024).toFixed(2);

    event.ports[0].postMessage({
      type: 'CACHE_STATS',
      stats
    });
  } catch (error) {
    console.error('[SW] Error getting cache stats:', error);
    event.ports[0].postMessage({
      type: 'ERROR',
      message: error.message
    });
  }
}

console.log('[SW] Service Worker loaded and ready');
