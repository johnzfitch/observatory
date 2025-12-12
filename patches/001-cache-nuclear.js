/**
 * Emergency Cache Nuclear Clear
 * 
 * This script MUST be loaded BEFORE any other scripts in index.html.
 * It detects corrupted caches and forces a complete reset.
 * 
 * Usage: Add to index.html as the FIRST script tag:
 * <script src="/patches/001-cache-nuclear.js"></script>
 */

(async function emergencyCacheClear() {
  'use strict';
  
  // Version string - change this to force a new cache clear
  const REQUIRED_VERSION = '2024-12-09-nuclear-v1';
  const STORAGE_KEY = 'cache-nuclear-clear';
  
  // Check if we've already cleared for this version
  const cleared = localStorage.getItem(STORAGE_KEY);
  
  if (cleared === REQUIRED_VERSION) {
    console.log('[CacheNuclear] Already cleared for version:', REQUIRED_VERSION);
    return;
  }
  
  console.log('[CacheNuclear] Initiating nuclear cache clear...');
  console.log('[CacheNuclear] Previous version:', cleared || 'none');
  console.log('[CacheNuclear] Target version:', REQUIRED_VERSION);
  
  try {
    // Step 1: Unregister all Service Workers
    if ('serviceWorker' in navigator) {
      console.log('[CacheNuclear] Unregistering Service Workers...');
      const registrations = await navigator.serviceWorker.getRegistrations();
      
      for (const reg of registrations) {
        console.log('[CacheNuclear] Unregistering:', reg.scope);
        await reg.unregister();
      }
      
      console.log('[CacheNuclear] Unregistered', registrations.length, 'Service Workers');
    }
    
    // Step 2: Delete all Cache Storage entries
    if ('caches' in window) {
      console.log('[CacheNuclear] Clearing Cache Storage...');
      const cacheNames = await caches.keys();
      
      for (const name of cacheNames) {
        console.log('[CacheNuclear] Deleting cache:', name);
        await caches.delete(name);
      }
      
      console.log('[CacheNuclear] Deleted', cacheNames.length, 'caches');
    }
    
    // Step 3: Clear IndexedDB (Transformers.js/ONNX cache)
    if ('indexedDB' in window) {
      console.log('[CacheNuclear] Clearing IndexedDB...');
      
      // Try to get database list (not supported in all browsers)
      if (indexedDB.databases) {
        const dbs = await indexedDB.databases();
        
        for (const db of dbs) {
          console.log('[CacheNuclear] Deleting IndexedDB:', db.name);
          indexedDB.deleteDatabase(db.name);
        }
        
        console.log('[CacheNuclear] Deleted', dbs.length, 'IndexedDB databases');
      } else {
        // Fallback: try known database names
        const knownDbs = [
          'transformers-cache',
          'onnxruntime',
          'model-cache',
          'keyval-store'
        ];
        
        for (const name of knownDbs) {
          console.log('[CacheNuclear] Attempting to delete IndexedDB:', name);
          indexedDB.deleteDatabase(name);
        }
      }
    }
    
    // Step 4: Clear sessionStorage (just in case)
    try {
      sessionStorage.clear();
      console.log('[CacheNuclear] Cleared sessionStorage');
    } catch (e) {
      console.warn('[CacheNuclear] Could not clear sessionStorage:', e.message);
    }
    
    // Step 5: Mark as cleared for this version
    localStorage.setItem(STORAGE_KEY, REQUIRED_VERSION);
    console.log('[CacheNuclear] Cache clear complete. Reloading...');
    
    // Step 6: Hard reload to get fresh resources
    // Use a small delay to ensure all async operations complete
    setTimeout(() => {
      window.location.reload(true);
    }, 100);
    
  } catch (error) {
    console.error('[CacheNuclear] Error during cache clear:', error);
    
    // Still mark as attempted to avoid infinite loop
    localStorage.setItem(STORAGE_KEY, REQUIRED_VERSION + '-error');
    
    // Show user-friendly error
    const errorDiv = document.createElement('div');
    errorDiv.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      padding: 20px;
      background: #ff4444;
      color: white;
      font-family: monospace;
      z-index: 99999;
    `;
    errorDiv.textContent = 'Cache clear failed. Please try: Ctrl+Shift+R (hard refresh) or clear browser data manually.';
    document.body?.appendChild(errorDiv);
  }
})();
