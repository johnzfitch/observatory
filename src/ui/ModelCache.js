/**
 * ModelCache - IndexedDB-based caching layer for ONNX models
 * Provides persistent storage for downloaded model files with LRU eviction
 *
 * Storage schema:
 * - Database: 'observatory-models'
 * - ObjectStore: 'models' with keyPath: 'id'
 * - Index: 'cachedAt' for LRU eviction strategy
 */

const DB_NAME = 'observatory-models';
const STORE_NAME = 'models';
const INDEX_NAME = 'cachedAt';
const MAX_CACHE_SIZE = 2 * 1024 * 1024 * 1024; // 2GB in bytes
const QUOTA_CHECK_INTERVAL = 60 * 1000; // Check quota every 60s

let db = null;
let isInitialized = false;
let lastQuotaCheck = 0;

/**
 * Initialize IndexedDB for model caching
 * Creates database and object store if they don't exist
 * @returns {Promise<void>}
 */
export async function init() {
  return new Promise((resolve, reject) => {
    if (isInitialized && db) {
      resolve();
      return;
    }

    // Check if IndexedDB is available
    if (!('indexedDB' in globalThis)) {
      console.warn('ModelCache: IndexedDB not available in this environment');
      isInitialized = true; // Mark as initialized but db will be null
      resolve();
      return;
    }

    const request = indexedDB.open(DB_NAME, 1);

    request.onerror = () => {
      console.error('ModelCache: Failed to open IndexedDB', request.error);
      reject(request.error);
    };

    request.onsuccess = () => {
      db = request.result;
      isInitialized = true;
      resolve();
    };

    request.onupgradeneeded = (event) => {
      const database = event.target.result;

      // Create object store if it doesn't exist
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        const store = database.createObjectStore(STORE_NAME, { keyPath: 'id' });
        // Create index on cachedAt for LRU eviction
        store.createIndex(INDEX_NAME, 'cachedAt', { unique: false });
      }
    };
  });
}

/**
 * Check if a model is cached
 * @param {string} modelId - The model identifier
 * @returns {Promise<boolean>} True if model exists in cache
 */
export async function has(modelId) {
  if (!db) await init();
  if (!db) return false; // IndexedDB unavailable

  try {
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(modelId);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(!!request.result);
    });
  } catch (error) {
    console.error(`ModelCache: Error checking model ${modelId}`, error);
    return false;
  }
}

/**
 * Get cached model data
 * @param {string} modelId - The model identifier
 * @returns {Promise<ArrayBuffer|null>} Model ArrayBuffer or null if not cached
 */
export async function get(modelId) {
  if (!db) await init();
  if (!db) return null; // IndexedDB unavailable

  try {
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(modelId);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const result = request.result;
        if (!result) {
          resolve(null);
          return;
        }
        // Update cachedAt timestamp on access (for LRU)
        _updateCacheTimestamp(modelId);
        resolve(result.data || null);
      };
    });
  } catch (error) {
    console.error(`ModelCache: Error retrieving model ${modelId}`, error);
    return null;
  }
}

/**
 * Cache a model file
 * Automatically evicts oldest models if cache exceeds size limit
 * @param {string} modelId - The model identifier
 * @param {ArrayBuffer} data - Model file bytes
 * @param {Object} metadata - Optional metadata (version, etc.)
 * @returns {Promise<void>}
 */
export async function put(modelId, data, metadata = {}) {
  if (!db) await init();
  if (!db) return; // IndexedDB unavailable

  try {
    // Calculate size if not provided
    const size = data.byteLength || 0;

    // Check if we need to evict models
    const now = Date.now();
    if (now - lastQuotaCheck > QUOTA_CHECK_INTERVAL) {
      await _evictIfNeeded(size);
      lastQuotaCheck = now;
    }

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);

      const record = {
        id: modelId,
        data: data,
        size: size,
        cachedAt: Date.now(),
        version: metadata.version || '1.0.0',
        ...metadata
      };

      const request = store.put(record);

      request.onerror = () => {
        console.error(`ModelCache: Error caching model ${modelId}`, request.error);
        reject(request.error);
      };

      request.onsuccess = () => {
        resolve();
      };
    });
  } catch (error) {
    console.error(`ModelCache: Error storing model ${modelId}`, error);
    // Continue without caching - don't fail the entire operation
  }
}

/**
 * Remove a cached model
 * @param {string} modelId - The model identifier
 * @returns {Promise<void>}
 */
export async function remove(modelId) {
  if (!db) await init();
  if (!db) return; // IndexedDB unavailable

  try {
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.delete(modelId);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  } catch (error) {
    console.error(`ModelCache: Error removing model ${modelId}`, error);
  }
}

/**
 * Clear all cached models
 * @returns {Promise<void>}
 */
export async function clear() {
  if (!db) await init();
  if (!db) return; // IndexedDB unavailable

  try {
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.clear();

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  } catch (error) {
    console.error('ModelCache: Error clearing cache', error);
  }
}

/**
 * Get metadata for a cached model
 * @param {string} modelId - The model identifier
 * @returns {Promise<Object|null>} Model metadata or null if not cached
 */
export async function getMetadata(modelId) {
  if (!db) await init();
  if (!db) return null; // IndexedDB unavailable

  try {
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(modelId);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const result = request.result;
        if (!result) {
          resolve(null);
          return;
        }

        // Return metadata without the actual model data
        const { data, ...metadata } = result;
        resolve(metadata);
      };
    });
  } catch (error) {
    console.error(`ModelCache: Error getting metadata for ${modelId}`, error);
    return null;
  }
}

/**
 * Get cache statistics
 * @returns {Promise<Object>} Cache statistics including total size and model count
 */
export async function getCacheStats() {
  if (!db) await init();
  if (!db) {
    return {
      totalSize: 0,
      modelCount: 0,
      maxSize: MAX_CACHE_SIZE,
      percentageUsed: 0,
      models: []
    };
  }

  try {
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.getAll();

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const records = request.result;
        const totalSize = records.reduce((sum, record) => sum + (record.size || 0), 0);
        const percentageUsed = Math.round((totalSize / MAX_CACHE_SIZE) * 100);

        const models = records.map(record => ({
          id: record.id,
          size: record.size,
          cachedAt: record.cachedAt,
          version: record.version,
          lastAccessed: record.cachedAt
        }));

        resolve({
          totalSize: totalSize,
          modelCount: records.length,
          maxSize: MAX_CACHE_SIZE,
          percentageUsed: percentageUsed,
          models: models
        });
      };
    });
  } catch (error) {
    console.error('ModelCache: Error getting cache stats', error);
    return {
      totalSize: 0,
      modelCount: 0,
      maxSize: MAX_CACHE_SIZE,
      percentageUsed: 0,
      models: []
    };
  }
}

/**
 * Internal: Update the cached timestamp for LRU tracking
 * @private
 * @param {string} modelId - The model identifier
 * @returns {Promise<void>}
 */
async function _updateCacheTimestamp(modelId) {
  if (!db) return;

  try {
    return new Promise((resolve) => {
      const transaction = db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const getRequest = store.get(modelId);

      getRequest.onsuccess = () => {
        const record = getRequest.result;
        if (record) {
          record.cachedAt = Date.now();
          const putRequest = store.put(record);
          putRequest.onsuccess = () => resolve();
          putRequest.onerror = () => resolve(); // Fail silently
        } else {
          resolve();
        }
      };

      getRequest.onerror = () => resolve(); // Fail silently
    });
  } catch {
    // Silently fail on timestamp update
  }
}

/**
 * Internal: Check cache size and evict oldest models if needed
 * Uses LRU (Least Recently Used) eviction strategy
 * @private
 * @param {number} incomingSize - Size of model about to be cached
 * @returns {Promise<void>}
 */
async function _evictIfNeeded(incomingSize) {
  if (!db) return;

  try {
    const stats = await getCacheStats();
    const projectedSize = stats.totalSize + incomingSize;

    if (projectedSize > MAX_CACHE_SIZE) {
      const targetSize = Math.floor(MAX_CACHE_SIZE * 0.75); // Evict to 75% capacity
      let currentSize = stats.totalSize;
      let toEvict = [];

      // Sort models by cachedAt (oldest first) - LRU strategy
      const sortedModels = stats.models.sort((a, b) => a.cachedAt - b.cachedAt);

      for (const model of sortedModels) {
        if (currentSize <= targetSize) break;
        toEvict.push(model.id);
        currentSize -= model.size;
      }

      // Delete evicted models
      for (const modelId of toEvict) {
        await remove(modelId);
      }

      console.log(`ModelCache: Evicted ${toEvict.length} models to free space`);
    }
  } catch (error) {
    console.error('ModelCache: Error during cache eviction', error);
    // Continue without evicting - don't fail the entire operation
  }
}

/**
 * Export cache size configuration for testing/adjustment
 */
export const config = {
  DB_NAME,
  STORE_NAME,
  INDEX_NAME,
  MAX_CACHE_SIZE,
  QUOTA_CHECK_INTERVAL
};

/**
 * Test hook: Close the database connection
 * @private
 */
export function _closeDatabase() {
  if (db) {
    db.close();
    db = null;
    isInitialized = false;
  }
}
