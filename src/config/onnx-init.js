/**
 * ONNX Runtime Pre-Initialization + IndexedDB Model Cache
 *
 * CRITICAL: This script MUST be loaded BEFORE transformers.js or any ONNX imports.
 * It sets up:
 * 1. Global ONNX Runtime environment configuration
 * 2. IndexedDB-backed fetch override for large model caching
 *
 * The IndexedDB cache avoids Cache API size limits (~50-500MB) and provides
 * persistent storage for models (660MB+).
 *
 * Usage: Add to index.html BEFORE module scripts:
 * <script src="/src/config/onnx-init.js"></script>
 * <script type="module">
 *   // Now safe to import transformers.js
 * </script>
 */

(function initONNXEnvironment() {
  'use strict';

  console.log('[ONNX-Init] Pre-configuring ONNX Runtime environment...');

  // ========================================
  // iOS/Mobile Detection (Critical for memory management)
  // ========================================
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
                (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isMobile = isIOS || /Android/i.test(navigator.userAgent);
  const isLowMemory = isMobile || navigator.deviceMemory < 4;

  if (isIOS) {
    console.log('[ONNX-Init] iOS detected - applying memory-safe settings');
  } else if (isMobile) {
    console.log('[ONNX-Init] Mobile device detected - applying memory-safe settings');
  }

  // ========================================
  // IndexedDB Model Cache (runs before fetch override)
  // ========================================

  const IDB_NAME = 'deepfake-detector-models';
  const IDB_VERSION = 1;
  const IDB_STORE = 'models';

  // Patterns for model files to cache in IndexedDB
  const MODEL_PATTERNS = [
    /\.onnx$/i,
    /\.bin$/i,
    /\.pb$/i
  ];

  // Store original fetch before overriding
  const originalFetch = window.fetch.bind(window);

  // IndexedDB promise (lazy initialized)
  let dbPromise = null;

  function openModelDB() {
    if (dbPromise) return dbPromise;

    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(IDB_NAME, IDB_VERSION);

      request.onerror = () => {
        console.error('[ModelCache] IndexedDB open failed:', request.error);
        reject(request.error);
      };

      request.onsuccess = () => {
        console.log('[ModelCache] IndexedDB ready');
        resolve(request.result);
      };

      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains(IDB_STORE)) {
          db.createObjectStore(IDB_STORE, { keyPath: 'url' });
          console.log('[ModelCache] Created IndexedDB store');
        }
      };
    });

    return dbPromise;
  }

  async function getFromCache(url) {
    try {
      const db = await openModelDB();
      return new Promise((resolve) => {
        const tx = db.transaction(IDB_STORE, 'readonly');
        const store = tx.objectStore(IDB_STORE);
        const request = store.get(url);
        request.onsuccess = () => resolve(request.result?.data || null);
        request.onerror = () => resolve(null);
      });
    } catch {
      return null;
    }
  }

  async function saveToCache(url, data) {
    try {
      const db = await openModelDB();
      return new Promise((resolve) => {
        const tx = db.transaction(IDB_STORE, 'readwrite');
        const store = tx.objectStore(IDB_STORE);
        store.put({ url, data, size: data.byteLength, timestamp: Date.now() });
        tx.oncomplete = () => {
          console.log(`[ModelCache] Cached: ${url} (${(data.byteLength / 1024 / 1024).toFixed(1)}MB)`);
          resolve();
        };
        tx.onerror = () => resolve();
      });
    } catch (e) {
      console.warn('[ModelCache] Cache save failed:', e);
    }
  }

  function shouldCacheInIDB(url) {
    try {
      const pathname = new URL(url, window.location.origin).pathname;
      return MODEL_PATTERNS.some(p => p.test(pathname));
    } catch {
      return false;
    }
  }

  // Override fetch to use IndexedDB for model files
  window.fetch = async function(input, init = {}) {
    const url = typeof input === 'string' ? input : input.url;

    // Only intercept GET requests for model files
    if ((init.method && init.method !== 'GET') || !shouldCacheInIDB(url)) {
      return originalFetch(input, init);
    }

    console.log(`[ModelCache] Intercepted: ${url}`);

    try {
      // Check IndexedDB first
      const cached = await getFromCache(url);
      if (cached) {
        console.log(`[ModelCache] HIT: ${url}`);
        // Track usage even on cache hit (for pre-warming accuracy)
        if (window.__ModelCache__?.markUsed) {
          window.__ModelCache__.markUsed(url);
        }
        return new Response(cached, {
          status: 200,
          headers: {
            'Content-Type': 'application/octet-stream',
            'Content-Length': cached.byteLength.toString(),
            'X-Cache': 'HIT-IndexedDB'
          }
        });
      }

      console.log(`[ModelCache] MISS: ${url} - fetching from network`);
      const response = await originalFetch(input, init);

      if (response.ok) {
        // Clone and cache
        const clone = response.clone();
        clone.arrayBuffer().then(data => {
          saveToCache(url, data);
          // Track that this model was used (for smart pre-warming)
          if (window.__ModelCache__?.markUsed) {
            window.__ModelCache__.markUsed(url);
          }
        }).catch(() => {});
      }

      return response;
    } catch (error) {
      console.error('[ModelCache] Error:', error);
      return originalFetch(input, init);
    }
  };

  console.log('[ModelCache] IndexedDB fetch override installed');

  // Expose cache utilities
  window.__ModelCache__ = {
    getStats: async function() {
      try {
        const db = await openModelDB();
        return new Promise((resolve) => {
          const tx = db.transaction(IDB_STORE, 'readonly');
          const store = tx.objectStore(IDB_STORE);
          const request = store.getAll();
          request.onsuccess = () => {
            const entries = request.result || [];
            const total = entries.reduce((s, e) => s + (e.size || 0), 0);
            resolve({
              count: entries.length,
              totalMB: (total / 1024 / 1024).toFixed(1),
              entries: entries.map(e => ({
                url: e.url,
                sizeMB: (e.size / 1024 / 1024).toFixed(1),
                cached: new Date(e.timestamp).toLocaleString()
              }))
            });
          };
          request.onerror = () => resolve({ count: 0, totalMB: '0', entries: [] });
        });
      } catch {
        return { count: 0, totalMB: '0', entries: [] };
      }
    },
    clear: async function() {
      try {
        const db = await openModelDB();
        return new Promise((resolve) => {
          const tx = db.transaction(IDB_STORE, 'readwrite');
          tx.objectStore(IDB_STORE).clear();
          tx.oncomplete = () => {
            console.log('[ModelCache] Cache cleared');
            resolve(true);
          };
          tx.onerror = () => resolve(false);
        });
      } catch {
        return false;
      }
    }
  };
  
  // ========================================
  // ONNX Runtime Web Configuration
  // ========================================

  // CRITICAL FIX: Do NOT pre-create window.ort here!
  // ort-runtime.js checks for typeof window.ort === 'undefined' to decide whether
  // to load the actual ONNX Runtime library. If we pre-create it here, the library
  // never loads and InferenceSession is never available.
  //
  // Instead, we'll set up a configuration object that ort-runtime.js can use AFTER
  // loading the actual ONNX Runtime library.
  window.__ONNX_RUNTIME_CONFIG__ = {
    wasm: {
      // CRITICAL: Keep threads at 1 on mobile to avoid memory explosion
      // Each thread gets its own WASM instance memory
      numThreads: isLowMemory ? 1 : 4,
      simd: true,
      proxy: false
    },
    logLevel: 'error',  // Suppress ONNX Runtime warnings
    // Expose detection flags for other modules
    isIOS: isIOS,
    isMobile: isMobile,
    isLowMemory: isLowMemory
  };
  // WASM files should be in /vendor/ alongside transformers.js.
  // ort-runtime.js applies this config after loading the runtime.
  
  // ========================================
  // Transformers.js Compatibility
  // ========================================
  
  // Pre-configure the env object that Transformers.js will use
  // This ensures our WASM paths are respected
  window.__TRANSFORMERS_ENV_PRESET__ = {
    // Use local models only (no HuggingFace downloads)
    allowLocalModels: true,
    allowRemoteModels: false,
    
    // Local model path
    localModelPath: '/models/',
    
    // Use browser cache for models
    useBrowserCache: true,
    
    // ONNX backend configuration
    // NOTE: Do NOT set wasmPaths - let Transformers.js use its bundled runtime
    // WASM files are in /vendor/ alongside transformers.js
    backends: {
      onnx: {
        wasm: {
          numThreads: 1,
          simd: true,
          proxy: false
        }
      }
    }
  };
  
  // ========================================
  // WebGPU Availability Check (Non-blocking)
  // ========================================
  
  // Store WebGPU availability for later use
  window.__WEBGPU_AVAILABLE__ = false;
  window.__WEBGPU_CHECKED__ = false;
  
  // Async check that doesn't block page load
  (async function checkWebGPU() {
    try {
      if (!('gpu' in navigator)) {
        console.log('[ONNX-Init] WebGPU API not available');
        return;
      }
      
      const adapter = await navigator.gpu.requestAdapter();
      if (!adapter) {
        console.log('[ONNX-Init] No WebGPU adapter found');
        return;
      }
      
      // On mobile, just check adapter exists (avoid device allocation)
      if (isLowMemory) {
        window.__WEBGPU_AVAILABLE__ = true;
        console.log('[ONNX-Init] WebGPU adapter found (skipping device test on mobile)');
      } else {
        // On desktop, verify full support by creating a device
        const device = await adapter.requestDevice();
        if (device) {
          window.__WEBGPU_AVAILABLE__ = true;
          console.log('[ONNX-Init] WebGPU is available');
          device.destroy(); // Clean up test device
        }
      }
      
    } catch (e) {
      console.log('[ONNX-Init] WebGPU check failed:', e.message);
    } finally {
      window.__WEBGPU_CHECKED__ = true;
    }
  })();
  
  // ========================================
  // Debug Logging
  // ========================================

  console.log('[ONNX-Init] Configuration complete:');
  console.log('  WASM files location: /vendor/ (alongside transformers.js)');
  console.log('  Threads (pending):', window.__ONNX_RUNTIME_CONFIG__.wasm.numThreads);
  console.log('  SIMD (pending):', window.__ONNX_RUNTIME_CONFIG__.wasm.simd);
  console.log('  Local models:', window.__TRANSFORMERS_ENV_PRESET__.localModelPath);
  console.log('  Note: window.ort will be loaded by ort-runtime.js');
  
  // ========================================
  // Verification Helper
  // ========================================
  
  // Expose a verification function for debugging
  window.__verifyONNXInit__ = async function() {
    const results = {
      ortEnvExists: !!window.ort?.env,
      wasmFilesInVendor: {},
      transformersPreset: !!window.__TRANSFORMERS_ENV_PRESET__,
      webgpuAvailable: window.__WEBGPU_AVAILABLE__
    };

    // Check if WASM files are accessible in /vendor/onnxruntime-1.21.0/
    const wasmFiles = [
      'ort-wasm-simd-threaded.jsep.wasm',  // WebGPU/JSEP backend
      'ort-wasm-simd-threaded.wasm'         // WASM fallback
    ];

    for (const file of wasmFiles) {
      try {
        const response = await fetch('/vendor/onnxruntime-1.21.0/' + file, { method: 'HEAD' });
        results.wasmFilesInVendor[file] = response.ok;
      } catch (e) {
        results.wasmFilesInVendor[file] = false;
      }
    }
    
    console.table(results);
    return results;
  };
  
  console.log('[ONNX-Init] Run window.__verifyONNXInit__() to verify configuration');

  // ========================================
  // Model Pre-Warming (Background Download)
  // ========================================

  // Default model URLs to pre-warm (can be overridden via SW message)
  const DEFAULT_MODEL_URLS = [
    '/models/ateeqq/onnx/model.onnx',
    '/models/dima806_ai_real/onnx/model.onnx',
    '/models/prithiv_v2/onnx/model.onnx',
    '/models/smogy/onnx/model.onnx'
  ];

  // Add prewarm function to __ModelCache__
  window.__ModelCache__.prewarm = async function(urls = DEFAULT_MODEL_URLS, onProgress = null) {
    console.log('[ModelCache] Starting background pre-warm of', urls.length, 'models...');

    const results = [];
    let completed = 0;

    for (const url of urls) {
      try {
        // Check if already cached
        const cached = await getFromCache(url);
        if (cached) {
          console.log('[ModelCache] Already cached:', url);
          results.push({ url, status: 'cached', size: cached.byteLength });
        } else {
          // Fetch and cache
          console.log('[ModelCache] Pre-fetching:', url);
          const response = await originalFetch(url);
          if (response.ok) {
            const data = await response.arrayBuffer();
            await saveToCache(url, data);
            results.push({ url, status: 'fetched', size: data.byteLength });
          } else {
            results.push({ url, status: 'error', error: response.statusText });
          }
        }
      } catch (e) {
        console.error('[ModelCache] Pre-warm failed:', url, e);
        results.push({ url, status: 'error', error: e.message });
      }

      completed++;
      if (onProgress) {
        onProgress({
          completed,
          total: urls.length,
          percent: Math.round((completed / urls.length) * 100),
          current: url,
          results
        });
      }
    }

    const cached = results.filter(r => r.status === 'cached').length;
    const fetched = results.filter(r => r.status === 'fetched').length;
    const errors = results.filter(r => r.status === 'error').length;
    const totalSize = results.reduce((s, r) => s + (r.size || 0), 0);

    console.log(`[ModelCache] Pre-warm complete: ${cached} cached, ${fetched} fetched, ${errors} errors, ${(totalSize / 1024 / 1024).toFixed(1)}MB total`);

    return results;
  };

  // Track which models the user has actually used
  window.__ModelCache__.markUsed = function(url) {
    try {
      const used = JSON.parse(localStorage.getItem('deepfake-models-used') || '[]');
      if (!used.includes(url)) {
        used.push(url);
        localStorage.setItem('deepfake-models-used', JSON.stringify(used));
      }
    } catch (e) {
      console.warn('[ModelCache] Failed to track model usage:', e);
    }
  };

  window.__ModelCache__.getUsedModels = function() {
    try {
      return JSON.parse(localStorage.getItem('deepfake-models-used') || '[]');
    } catch {
      return [];
    }
  };

  // Smart pre-warm: only fetch models the user has previously used
  // Respects metered connections and only runs when idle
  // CRITICAL: Skip on mobile/iOS to prevent memory crashes
  if ('requestIdleCallback' in window && !isLowMemory) {
    requestIdleCallback(() => {
      const usedModels = window.__ModelCache__.getUsedModels();

      // Skip if no models used yet (first-time visitor)
      if (usedModels.length === 0) {
        console.log('[ModelCache] No models used yet, skipping pre-warm');
        return;
      }

      // Skip on metered (mobile data) connections
      if (navigator.connection?.saveData || navigator.connection?.type === 'cellular') {
        console.log('[ModelCache] Metered connection detected, skipping pre-warm');
        return;
      }

      console.log('[ModelCache] Scheduling background pre-warm for', usedModels.length, 'previously used models...');
      setTimeout(() => {
        window.__ModelCache__.prewarm(usedModels).catch(e => {
          console.warn('[ModelCache] Background pre-warm failed:', e);
        });
      }, 5000); // Wait 5s to avoid competing with page load
    }, { timeout: 15000 });
  } else if (isLowMemory) {
    console.log('[ModelCache] Low-memory device detected, skipping background pre-warm');
  }

})();
