/**
 * CachedModelLoader - Load ONNX models with IndexedDB caching and progress tracking
 *
 * Features:
 * - IndexedDB persistent cache (survives browser restarts)
 * - Per-model download progress callbacks
 * - Global progress events via DownloadTracker
 * - Parallel download support
 * - Automatic cache validation
 */

import * as ModelCache from './ModelCache.js';
import * as DownloadTracker from './DownloadTracker.js';

// Track download progress per model
const downloadProgress = new Map();

/**
 * Load an ONNX model with caching
 * @param {string} modelId - Model identifier
 * @param {string} modelPath - URL path to ONNX file
 * @param {Object} options - Options
 * @param {Function} options.onProgress - Progress callback (0-100)
 * @param {Function} options.onCacheHit - Called if loaded from cache
 * @param {Function} options.onDownloadStart - Called when download starts
 * @returns {Promise<ArrayBuffer>} Model data as ArrayBuffer
 */
export async function loadModel(modelId, modelPath, options = {}) {
  const { onProgress, onCacheHit, onDownloadStart } = options;

  // Initialize cache
  await ModelCache.init();

  // Check cache first
  const cached = await ModelCache.get(modelId);
  if (cached) {
    console.log(`[CachedModelLoader] Cache HIT: ${modelId}`);
    DownloadTracker.updateProgress(modelId, 100, 'cached');
    if (onCacheHit) onCacheHit(modelId);
    if (onProgress) onProgress(100);
    return cached;
  }

  console.log(`[CachedModelLoader] Cache MISS: ${modelId} - downloading...`);
  DownloadTracker.updateProgress(modelId, 0, 'downloading');
  if (onDownloadStart) onDownloadStart(modelId);

  // Download with progress tracking
  const data = await downloadWithProgress(modelPath, (progress) => {
    downloadProgress.set(modelId, progress);
    DownloadTracker.updateProgress(modelId, progress, 'downloading');
    if (onProgress) onProgress(progress);
  });

  // Cache the downloaded model
  await ModelCache.put(modelId, data, {
    path: modelPath,
    downloadedAt: Date.now()
  });

  DownloadTracker.updateProgress(modelId, 100, 'ready');
  console.log(`[CachedModelLoader] Cached: ${modelId} (${(data.byteLength / 1024 / 1024).toFixed(1)} MB)`);

  return data;
}

/**
 * Download file with progress tracking
 * @param {string} url - URL to download
 * @param {Function} onProgress - Progress callback (0-100)
 * @returns {Promise<ArrayBuffer>}
 */
async function downloadWithProgress(url, onProgress) {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Failed to download: ${response.status} ${response.statusText}`);
  }

  const contentLength = response.headers.get('content-length');

  // If no content-length, fall back to simple fetch
  if (!contentLength) {
    const data = await response.arrayBuffer();
    onProgress(100);
    return data;
  }

  const total = parseInt(contentLength, 10);
  let loaded = 0;

  const reader = response.body.getReader();
  const chunks = [];

  while (true) {
    const { done, value } = await reader.read();

    if (done) break;

    chunks.push(value);
    loaded += value.length;

    const progress = Math.round((loaded / total) * 100);
    onProgress(progress);
  }

  // Combine chunks into single ArrayBuffer
  const combined = new Uint8Array(loaded);
  let position = 0;
  for (const chunk of chunks) {
    combined.set(chunk, position);
    position += chunk.length;
  }

  return combined.buffer;
}

/**
 * Check if a model is cached
 * @param {string} modelId - Model identifier
 * @returns {Promise<boolean>}
 */
export async function isCached(modelId) {
  await ModelCache.init();
  return ModelCache.has(modelId);
}

/**
 * Get cache status for multiple models
 * @param {string[]} modelIds - Array of model IDs
 * @returns {Promise<Object>} Map of modelId -> cached status
 */
export async function getCacheStatus(modelIds) {
  await ModelCache.init();
  const status = {};
  for (const id of modelIds) {
    status[id] = await ModelCache.has(id);
  }
  return status;
}

/**
 * Preload models into cache
 * @param {Array<{id: string, path: string}>} models - Models to preload
 * @param {Function} onModelProgress - Progress per model (modelId, progress)
 * @param {Function} onOverallProgress - Overall progress (completed, total)
 * @returns {Promise<void>}
 */
export async function preloadModels(models, onModelProgress, onOverallProgress) {
  let completed = 0;

  for (const { id, path } of models) {
    await loadModel(id, path, {
      onProgress: (progress) => {
        if (onModelProgress) onModelProgress(id, progress);
      }
    });

    completed++;
    if (onOverallProgress) {
      onOverallProgress(completed, models.length);
    }
  }
}

/**
 * Get download progress for a model
 * @param {string} modelId - Model identifier
 * @returns {number} Progress 0-100, or -1 if not downloading
 */
export function getDownloadProgress(modelId) {
  return downloadProgress.get(modelId) ?? -1;
}

/**
 * Clear download progress tracking
 * @param {string} modelId - Model identifier
 */
export function clearDownloadProgress(modelId) {
  downloadProgress.delete(modelId);
}

/**
 * Get cache statistics
 * @returns {Promise<Object>}
 */
export async function getCacheStats() {
  return ModelCache.getCacheStats();
}

/**
 * Clear model from cache
 * @param {string} modelId - Model identifier
 */
export async function clearFromCache(modelId) {
  await ModelCache.remove(modelId);
}

/**
 * Clear all cached models
 */
export async function clearAllCache() {
  await ModelCache.clear();
}
