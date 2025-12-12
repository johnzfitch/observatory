/**
 * DownloadTracker - Global tracker for model download progress
 * Models emit progress events, UI subscribes to updates
 */

const listeners = new Map();
const progress = new Map();

/**
 * Update download progress for a model
 * @param {string} modelId - Model identifier
 * @param {number} percent - Progress 0-100
 * @param {string} status - Status: 'downloading', 'cached', 'loading', 'ready', 'error'
 */
export function updateProgress(modelId, percent, status = 'downloading') {
  progress.set(modelId, { percent, status, timestamp: Date.now() });

  // Notify listeners
  const modelListeners = listeners.get(modelId) || [];
  modelListeners.forEach(callback => {
    try {
      callback(percent, status);
    } catch (e) {
      console.error('DownloadTracker listener error:', e);
    }
  });

  // Also notify global listeners
  const globalListeners = listeners.get('*') || [];
  globalListeners.forEach(callback => {
    try {
      callback(modelId, percent, status);
    } catch (e) {
      console.error('DownloadTracker global listener error:', e);
    }
  });
}

/**
 * Subscribe to progress updates for a specific model
 * @param {string} modelId - Model identifier (or '*' for all)
 * @param {Function} callback - Callback(percent, status) or Callback(modelId, percent, status) for '*'
 * @returns {Function} Unsubscribe function
 */
export function subscribe(modelId, callback) {
  if (!listeners.has(modelId)) {
    listeners.set(modelId, []);
  }
  listeners.get(modelId).push(callback);

  // Return unsubscribe function
  return () => {
    const arr = listeners.get(modelId);
    const idx = arr.indexOf(callback);
    if (idx >= 0) arr.splice(idx, 1);
  };
}

/**
 * Get current progress for a model
 * @param {string} modelId - Model identifier
 * @returns {Object|null} { percent, status, timestamp } or null
 */
export function getProgress(modelId) {
  return progress.get(modelId) || null;
}

/**
 * Clear progress for a model
 * @param {string} modelId - Model identifier
 */
export function clearProgress(modelId) {
  progress.delete(modelId);
}

/**
 * Clear all progress tracking
 */
export function clearAll() {
  progress.clear();
}

// Make it available globally for easy access from models
if (typeof window !== 'undefined') {
  window.__downloadTracker = { updateProgress, subscribe, getProgress, clearProgress, clearAll };
}
