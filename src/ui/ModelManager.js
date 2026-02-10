/**
 * ModelManager.js - Model registry and lifecycle manager
 * Manages loading, unloading, and inference for deepfake detection models
 *
 * Features:
 * - Dynamic model registration and loading
 * - Progress tracking for individual and batch operations
 * - Memory management and warnings
 * - Error handling and recovery
 * - Status tracking (unloaded|loading|ready|error)
 */

/**
 * Active models for full-image AI generation detection
 * Detects if entire image is AI-generated (SD, MJ, DALL-E, Flux, GANs)
 */
const MODEL_CATEGORIES = {
  FULL_IMAGE_DETECTORS: [
    { id: 'ateeqq', displayName: 'Ateeqq AI vs Human', accuracy: '99.23%', architecture: 'ViT-B/16', estimatedMemory: 500, trainedOn: 'Midjourney 6.1, Flux 1.1, DALL-E 3, Stable Diffusion 3.5, GPT-4o, Ideogram 2.0' },
    // Dima806: Disabled - ~2 years old, concept drift, replaced by Ateeqq
    { id: 'dima806_ai_real', displayName: 'Dima806 AI vs Real', accuracy: '98.2%', architecture: 'ViT-Base', estimatedMemory: 450, trainedOn: 'SD/MJ/DALL-E', disabled: true },
    // Prithiv: Disabled - low confidence, overlaps with other models
    { id: 'prithiv_v2', displayName: 'Prithiv Deepfake v2', accuracy: '92.1%', architecture: 'ResNet-50', estimatedMemory: 520, trainedOn: 'Stable Diffusion 2.1, DALL-E 2, Midjourney 5', disabled: true },
    // SMOGY: Disabled - fails on ChatGPT/DALL-E 3 images (only trained on older generators)
    { id: 'smogy', displayName: 'SMOGY AI Detector', accuracy: '98.2%', architecture: 'Swin Transformer', estimatedMemory: 480, trainedOn: 'Stable Diffusion 1.5, Stable Diffusion 2.1, DALL-E 2, Midjourney 5.2', disabled: true }
  ],
  FACE_MANIPULATION_DETECTORS: []
};

/**
 * Detect iOS device (strict memory limits)
 */
const isIOSDevice = () => {
  if (typeof navigator === 'undefined') return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
};

/**
 * Memory threshold - iOS has stricter limits (~1GB vs 2GB desktop)
 */
const MEMORY_THRESHOLD_MB = isIOSDevice() ? 1024 : 2048;

/**
 * Default batch loading concurrency
 */
const DEFAULT_CONCURRENCY = 2;

/**
 * Model status enumeration
 */
const ModelStatus = {
  UNLOADED: 'unloaded',
  LOADING: 'loading',
  READY: 'ready',
  ERROR: 'error'
};

/**
 * Model registry - stores all registered models with their metadata
 * @type {Map<string, {id: string, displayName: string, accuracy: string, estimatedMemory: number, category: string}>}
 */
const MODELS = new Map();

/**
 * Loaded models state - tracks loaded module instances and status
 * @type {Map<string, {module: object, status: string, error: Error|null, loadedAt: number}>}
 */
const loadedModels = new Map();

/**
 * Model status cache
 * @type {Map<string, string>}
 */
const modelStatus = new Map();

/**
 * Track used memory (MB)
 */
let usedMemoryMB = 0;

/**
 * Initialize the model registry with all available models
 */
function initializeModelRegistry() {
  // Register FULL_IMAGE_DETECTORS
  MODEL_CATEGORIES.FULL_IMAGE_DETECTORS.forEach(model => {
    const modelWithCategory = { ...model, category: 'FULL_IMAGE_DETECTORS' };
    MODELS.set(model.id, modelWithCategory);
    modelStatus.set(model.id, ModelStatus.UNLOADED);
  });

  // Register FACE_MANIPULATION_DETECTORS
  MODEL_CATEGORIES.FACE_MANIPULATION_DETECTORS.forEach(model => {
    const modelWithCategory = { ...model, category: 'FACE_MANIPULATION_DETECTORS' };
    MODELS.set(model.id, modelWithCategory);
    modelStatus.set(model.id, ModelStatus.UNLOADED);
  });
}

/**
 * Register a model dynamically
 * @param {string} modelId - Unique model identifier
 * @param {string} moduleUrl - Path to model module (relative to models/)
 * @returns {Promise<void>}
 */
export async function registerModel(modelId, moduleUrl) {
  if (MODELS.has(modelId)) {
    throw new Error(`Model "${modelId}" is already registered`);
  }

  // Verify the model module can be imported (lazy check)
  try {
    const testImport = await import(moduleUrl);
    if (!testImport.load || !testImport.predict || !testImport.unload) {
      throw new Error('Model module missing required exports: load, predict, unload');
    }
  } catch (error) {
    throw new Error(`Failed to register model "${modelId}": ${error.message}`);
  }

  MODELS.set(modelId, {
    id: modelId,
    displayName: modelId,
    accuracy: '',
    estimatedMemory: 400,
    category: 'CUSTOM'
  });

  modelStatus.set(modelId, ModelStatus.UNLOADED);
}

/**
 * Load a single model
 * @param {string} modelId - Model identifier
 * @param {Object} options - Load options
 * @param {Function} options.onProgress - Progress callback (0-100)
 * @param {Function} options.onStatusChange - Status change callback
 * @param {boolean} options.force - Force reload if already loaded
 * @returns {Promise<Object>} Loaded module
 */
export async function loadModel(modelId, options = {}) {
  const {
    onProgress = () => {},
    onStatusChange = () => {},
    force = false
  } = options;

  // Validate model exists
  if (!MODELS.has(modelId)) {
    throw new Error(`Model "${modelId}" not found in registry`);
  }

  // Check if already loaded
  const currentStatus = modelStatus.get(modelId);
  if (currentStatus === ModelStatus.READY && !force) {
    onProgress({ modelId, percent: 100, loaded: 1, total: 1 });
    return loadedModels.get(modelId).module;
  }

  if (currentStatus === ModelStatus.LOADING) {
    throw new Error(`Model "${modelId}" is already loading`);
  }

  try {
    // Update status
    modelStatus.set(modelId, ModelStatus.LOADING);
    onStatusChange({ modelId, status: ModelStatus.LOADING });

    // Check connection quality for user feedback
    const connection = navigator.connection;
    if (connection) {
      const effectiveType = connection.effectiveType;
      if (effectiveType === 'slow-2g' || effectiveType === '2g') {
        console.warn(`[ModelManager] Slow connection detected: ${effectiveType}`);
        onStatusChange({ modelId, status: 'loading-slow', connectionType: effectiveType });
      }
    }

    // Simulate progress updates during load
    onProgress({ modelId, percent: 10, loaded: 0.1, total: 1 });

    // Validate modelId to prevent path traversal attacks
    if (!/^[a-z0-9_-]+$/i.test(modelId)) {
      throw new Error(`Invalid model ID format: ${modelId}`);
    }

    // Dynamically import the model module
    const module = await import(`../models/${modelId}.js`);

    onProgress({ modelId, percent: 30, loaded: 0.3, total: 1 });

    // Call the model's load function
    await module.load();

    onProgress({ modelId, percent: 90, loaded: 0.9, total: 1 });

    // Update memory tracking
    const modelInfo = MODELS.get(modelId);
    usedMemoryMB += modelInfo.estimatedMemory;

    // Warn if memory exceeds threshold
    if (usedMemoryMB > MEMORY_THRESHOLD_MB) {
      console.warn(
        `Memory usage (${usedMemoryMB}MB) exceeds threshold (${MEMORY_THRESHOLD_MB}MB). ` +
        `Consider unloading unused models.`
      );
    }

    // iOS-specific memory warning at lower threshold
    if (isIOSDevice() && usedMemoryMB > 800) {
      console.warn(`[ModelManager] iOS memory usage high: ${usedMemoryMB}MB. Risk of page crash.`);
    }

    // Store loaded module
    loadedModels.set(modelId, {
      module,
      status: ModelStatus.READY,
      error: null,
      loadedAt: Date.now()
    });

    // Update status
    modelStatus.set(modelId, ModelStatus.READY);
    onStatusChange({ modelId, status: ModelStatus.READY });

    onProgress({ modelId, percent: 100, loaded: 1, total: 1 });

    return module;
  } catch (error) {
    // Update status
    modelStatus.set(modelId, ModelStatus.ERROR);
    loadedModels.set(modelId, {
      module: null,
      status: ModelStatus.ERROR,
      error,
      loadedAt: Date.now()
    });

    onStatusChange({ modelId, status: ModelStatus.ERROR, error: error.message });
    throw new Error(`Failed to load model "${modelId}": ${error.message}`);
  }
}

/**
 * Load multiple models in parallel with configurable concurrency
 * @param {string[]} modelIds - Array of model identifiers
 * @param {Object} options - Load options
 * @param {number} options.concurrency - Max parallel loads (default: 2)
 * @param {Function} options.onProgress - Progress callback (overall 0-100)
 * @param {Function} options.onModelProgress - Per-model progress callback
 * @param {Function} options.onStatusChange - Status change callback
 * @param {boolean} options.force - Force reload if already loaded
 * @returns {Promise<Object[]>} Array of loaded modules
 */
export async function loadModels(modelIds, options = {}) {
  const {
    concurrency = DEFAULT_CONCURRENCY,
    onProgress = () => {},
    onModelProgress = () => {},
    onStatusChange = () => {},
    force = false
  } = options;

  if (!Array.isArray(modelIds) || modelIds.length === 0) {
    throw new Error('modelIds must be a non-empty array');
  }

  const results = [];
  let completed = 0;
  const total = modelIds.length;

  /**
   * Worker queue for concurrent loading
   */
  const queue = [...modelIds];
  const inProgress = new Set();

  /**
   * Process next model in queue
   */
  const processNext = async () => {
    if (queue.length === 0 && inProgress.size === 0) {
      return; // All done
    }

    if (queue.length === 0) {
      return; // Wait for in-progress to complete
    }

    if (inProgress.size >= concurrency) {
      return; // At concurrency limit
    }

    const modelId = queue.shift();
    inProgress.add(modelId);

    try {
      const module = await loadModel(modelId, {
        onProgress: (progress) => {
          onModelProgress({ ...progress, modelId });
        },
        onStatusChange: (change) => {
          onStatusChange(change);
        },
        force
      });

      results.push({ modelId, module, success: true });
    } catch (error) {
      results.push({ modelId, module: null, success: false, error });
    } finally {
      inProgress.delete(modelId);
      completed++;

      // Update overall progress
      const percent = Math.round((completed / total) * 100);
      onProgress({ percent, completed, total });

      // Process next items in queue
      if (queue.length > 0) {
        await processNext();
      }
    }
  };

  // Start workers
  const workers = Array(Math.min(concurrency, modelIds.length))
    .fill(null)
    .map(() => processNext());

  // Wait for all workers to complete
  await Promise.all(workers);

  // Re-run processNext until queue is empty
  while (queue.length > 0 || inProgress.size > 0) {
    await new Promise(resolve => setTimeout(resolve, 50));
  }

  return results;
}

/**
 * Unload a single model and free memory
 * @param {string} modelId - Model identifier
 * @returns {void}
 */
export function unloadModel(modelId) {
  if (!MODELS.has(modelId)) {
    throw new Error(`Model "${modelId}" not found in registry`);
  }

  const loaded = loadedModels.get(modelId);
  if (!loaded || !loaded.module) {
    return; // Already unloaded
  }

  try {
    // Call model's unload function
    if (loaded.module.unload) {
      loaded.module.unload();
    }

    // Update memory tracking
    const modelInfo = MODELS.get(modelId);
    usedMemoryMB = Math.max(0, usedMemoryMB - modelInfo.estimatedMemory);

    // Remove from loaded models
    loadedModels.delete(modelId);
    modelStatus.set(modelId, ModelStatus.UNLOADED);
  } catch (error) {
    console.error(`Error unloading model "${modelId}":`, error);
  }
}

/**
 * Unload all loaded models and free memory
 * @returns {void}
 */
export function unloadAll() {
  const modelIds = Array.from(loadedModels.keys());
  modelIds.forEach(modelId => unloadModel(modelId));
  usedMemoryMB = 0;
}

/**
 * Get list of currently loaded models
 * @returns {string[]} Array of loaded model IDs
 */
export function getLoadedModels() {
  return Array.from(loadedModels.values())
    .filter(item => item.status === ModelStatus.READY)
    .map(item => Array.from(loadedModels.entries())
      .find(([, value]) => value === item)?.[0])
    .filter(Boolean);
}

/**
 * Get model metadata
 * @param {string} modelId - Model identifier
 * @returns {Object} Model metadata or null
 */
export function getModelInfo(modelId) {
  return MODELS.get(modelId) || null;
}

/**
 * Check if a model is loaded
 * @param {string} modelId - Model identifier
 * @returns {boolean} True if loaded and ready
 */
export function isModelLoaded(modelId) {
  const status = modelStatus.get(modelId);
  return status === ModelStatus.READY;
}

/**
 * Get current status of a model
 * @param {string} modelId - Model identifier
 * @returns {string} Status: 'unloaded'|'loading'|'ready'|'error'
 */
export function getModelStatus(modelId) {
  return modelStatus.get(modelId) || ModelStatus.UNLOADED;
}

/**
 * Check if all specified models are loaded and ready
 * @param {string[]} modelIds - Array of model IDs to check
 * @returns {boolean} True if all models are ready
 */
export function areModelsReady(modelIds) {
  return modelIds.every(id => isModelLoaded(id));
}

/**
 * Get loading progress for multiple models
 * @param {string[]} modelIds - Array of model IDs to check
 * @returns {{ready: number, loading: number, total: number, allReady: boolean}}
 */
export function getModelsLoadingProgress(modelIds) {
  let ready = 0;
  let loading = 0;

  for (const id of modelIds) {
    const status = getModelStatus(id);
    if (status === ModelStatus.READY) ready++;
    else if (status === ModelStatus.LOADING) loading++;
  }

  return {
    ready,
    loading,
    total: modelIds.length,
    allReady: ready === modelIds.length
  };
}

/**
 * Run inference on an image using a loaded model
 * @param {string} modelId - Model identifier
 * @param {HTMLImageElement|HTMLCanvasElement|string|Blob} imageSource - Image input
 * @returns {Promise<Object>} Inference results
 */
export async function predict(modelId, imageSource) {
  if (!MODELS.has(modelId)) {
    throw new Error(`Model "${modelId}" not found in registry`);
  }

  const status = modelStatus.get(modelId);
  if (status !== ModelStatus.READY) {
    throw new Error(`Model "${modelId}" is not loaded. Current status: ${status}`);
  }

  const loaded = loadedModels.get(modelId);
  if (!loaded || !loaded.module) {
    throw new Error(`Model "${modelId}" module not found`);
  }

  try {
    // Call model's predict function
    const results = await loaded.module.predict(imageSource);
    return {
      modelId,
      results,
      timestamp: Date.now(),
      success: true
    };
  } catch (error) {
    throw new Error(`Inference failed for model "${modelId}": ${error.message}`);
  }
}

/**
 * Get memory usage statistics
 * @returns {Object} Memory stats
 */
export function getMemoryStats() {
  return {
    usedMB: usedMemoryMB,
    thresholdMB: MEMORY_THRESHOLD_MB,
    percentUsed: Math.round((usedMemoryMB / MEMORY_THRESHOLD_MB) * 100),
    loadedCount: getLoadedModels().length,
    totalCount: MODELS.size
  };
}

/**
 * Get status report for all models
 * @returns {Object} Status report
 */
export function getStatusReport() {
  const report = {
    timestamp: Date.now(),
    memory: getMemoryStats(),
    models: {}
  };

  MODELS.forEach((modelInfo, modelId) => {
    const status = modelStatus.get(modelId);
    const loaded = loadedModels.get(modelId);

    report.models[modelId] = {
      displayName: modelInfo.displayName,
      category: modelInfo.category,
      status,
      accuracy: modelInfo.accuracy,
      estimatedMemory: modelInfo.estimatedMemory,
      loadedAt: loaded?.loadedAt || null,
      error: loaded?.error?.message || null
    };
  });

  return report;
}

/**
 * Export model categories for UI
 */
export function getModelCategories() {
  return MODEL_CATEGORIES;
}

/**
 * Get models by category name
 * @param {string} category - 'FULL_IMAGE_DETECTORS' or 'FACE_MANIPULATION_DETECTORS'
 * @returns {Array} Array of model objects for that category
 */
export function getModelsByCategory(category) {
  return MODEL_CATEGORIES[category] || [];
}

/**
 * Load only selected models (lazy loading strategy)
 * Skips models already loaded to avoid re-downloading
 *
 * @param {string[]} selectedModelIds - Array of model IDs to load
 * @param {Object} options - Load options
 * @param {Function} options.onProgress - Per-model progress callback
 * @param {Function} options.onOverallProgress - Overall progress callback (0-100)
 * @param {Function} options.onStatusChange - Status change callback
 * @param {number} options.concurrency - Concurrent loads (default: 2)
 * @returns {Promise<Object[]>} Results for each model
 */
export async function loadSelectedModels(selectedModelIds, options = {}) {
  const {
    onProgress = () => {},
    onOverallProgress = () => {},
    onStatusChange = () => {},
    concurrency = DEFAULT_CONCURRENCY
  } = options;

  if (!Array.isArray(selectedModelIds) || selectedModelIds.length === 0) {
    console.warn('[ModelManager] No models selected for loading');
    return [];
  }

  console.log('[ModelManager] Loading selected models:', selectedModelIds);

  // Filter out already-loaded models
  const modelsToLoad = selectedModelIds.filter(modelId => {
    const status = modelStatus.get(modelId);
    if (status === ModelStatus.READY) {
      console.log(`[ModelManager] Model ${modelId} already loaded, skipping`);
      onProgress({
        modelId,
        percent: 100,
        cached: true,
        alreadyLoaded: true
      });
      return false;
    }
    return true;
  });

  // If all models already loaded, return immediately
  if (modelsToLoad.length === 0) {
    console.log('[ModelManager] All selected models already loaded');
    onOverallProgress({ percent: 100, completed: selectedModelIds.length, total: selectedModelIds.length });
    return selectedModelIds.map(modelId => ({
      modelId,
      success: true,
      cached: true
    }));
  }

  // Load remaining models with progress tracking
  const results = await loadModels(modelsToLoad, {
    concurrency,
    onProgress: (progress) => {
      onOverallProgress(progress);
    },
    onModelProgress: (progress) => {
      onProgress({
        ...progress,
        cached: false // Only newly-loaded models report progress
      });
    },
    onStatusChange
  });

  return results;
}

/**
 * Check cache size using Service Worker
 * @returns {Promise<Object>} Cache statistics
 */
export async function getCacheStats() {
  return new Promise((resolve, reject) => {
    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
      const messageChannel = new MessageChannel();
      messageChannel.port1.onmessage = (event) => {
        if (event.data.type === 'CACHE_STATS') {
          resolve(event.data.stats);
        } else if (event.data.type === 'ERROR') {
          reject(new Error(event.data.message));
        }
      };

      navigator.serviceWorker.controller.postMessage(
        { type: 'GET_CACHE_STATS' },
        [messageChannel.port2]
      );

      // Timeout after 5 seconds
      setTimeout(() => {
        reject(new Error('Cache stats request timeout'));
      }, 5000);
    } else {
      reject(new Error('Service Worker not available'));
    }
  });
}

/**
 * Clear model cache
 * @param {string} modelId - Optional: specific model to clear
 * @returns {Promise<Object>} Clear result
 */
export async function clearModelCache(modelId = null) {
  return new Promise((resolve, reject) => {
    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
      const messageChannel = new MessageChannel();
      messageChannel.port1.onmessage = (event) => {
        if (event.data.type === 'CACHE_CLEARED') {
          resolve(event.data);
        } else if (event.data.type === 'ERROR') {
          reject(new Error(event.data.message));
        }
      };

      navigator.serviceWorker.controller.postMessage(
        { type: 'CLEAR_MODEL_CACHE', payload: { modelId } },
        [messageChannel.port2]
      );

      setTimeout(() => {
        reject(new Error('Cache clear request timeout'));
      }, 5000);
    } else {
      reject(new Error('Service Worker not available'));
    }
  });
}

/**
 * Export all public APIs
 */
export {
  MODELS,
  ModelStatus,
  MODEL_CATEGORIES,
  MEMORY_THRESHOLD_MB,
  DEFAULT_CONCURRENCY
};

// Initialize registry on module load
initializeModelRegistry();
