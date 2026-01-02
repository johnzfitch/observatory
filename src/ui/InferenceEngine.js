/**
 * InferenceEngine.js - Core inference orchestration for deepfake detection
 *
 * Orchestrates multi-model inference with:
 * - WebGPU/WASM/CPU backend detection and fallback
 * - Parallel and sequential execution modes
 * - Ensemble voting and result aggregation
 * - Progressive result streaming
 * - Robust error handling per model
 * - Abort/timeout support
 *
 * @module InferenceEngine
 */

// Inline concurrency limiter (replaces p-limit for browser compatibility)
function createPLimit(concurrency) {
  const queue = [];
  let activeCount = 0;

  const next = () => {
    activeCount--;
    if (queue.length > 0) {
      queue.shift()();
    }
  };

  const run = async (fn) => {
    return new Promise((resolve, reject) => {
      const execute = async () => {
        activeCount++;
        try {
          const result = await fn();
          resolve(result);
        } catch (error) {
          reject(error);
        } finally {
          next();
        }
      };

      if (activeCount < concurrency) {
        execute();
      } else {
        queue.push(execute);
      }
    });
  };

  return run;
}

// Model priority order (fastest first for immediate UX feedback)
const MODEL_PRIORITY = [
  'ateeqq',        // ~32ms (Q4)
  'hamzenium',     // ~39ms (Q4)
  'dima806_ai_real', // ~46ms
  'prithiv_v2',    // ~56ms
  'sdxl_detector', // ~47ms (but Swin = variable)
  'smogy'          // ~83ms - slowest
];

/**
 * @typedef {Object} ModelResult
 * @property {string} modelId - Model identifier
 * @property {number} aiProbability - Probability image is AI-generated (0-100)
 * @property {string} verdict - Classification verdict
 * @property {number} confidence - Confidence in verdict (0-100)
 * @property {number} time - Inference time in milliseconds
 * @property {boolean} success - Whether inference succeeded
 * @property {string} [error] - Error message if failed
 * @property {Object} [metadata] - Additional model metadata
 */

/**
 * @typedef {Object} AggregatedResult
 * @property {string} verdict - Final ensemble verdict
 * @property {number} confidence - Ensemble confidence (0-100)
 * @property {number} aiProbability - Ensemble AI probability (0-100)
 * @property {Object} votes - Vote breakdown {ai, real, unsure}
 * @property {ModelResult[]} modelResults - Individual model results
 * @property {Object} timing - Execution timing statistics
 * @property {string[]} [errors] - Models that failed
 */

/**
 * @typedef {Object} InferenceOptions
 * @property {boolean} parallel - Run models in parallel (default: true)
 * @property {number} maxConcurrency - Max parallel models (default: 4)
 * @property {number} timeout - Per-model timeout in ms (default: 30000)
 * @property {Function} [onModelStart] - Callback when model starts
 * @property {Function} [onModelComplete] - Callback when model completes
 * @property {Function} [onProgress] - Progress callback
 * @property {Function} [onPartialVerdict] - Callback for preliminary verdict (2+ models agree)
 * @property {AbortSignal} [abortSignal] - Abort controller signal
 */

// Backend types
const BACKEND_WEBGPU = 'webgpu';
const BACKEND_WASM = 'wasm';
const BACKEND_CPU = 'cpu';

// Verdict thresholds
const VERDICT_THRESHOLDS = {
  AI_GENERATED: 0.70,      // >= 70% AI probability
  LIKELY_AI: 0.55,         // >= 55% AI probability
  INCONCLUSIVE: 0.45,      // 45-55% range
  LIKELY_REAL: 0.30,       // >= 30% (but < 45%)
  HUMAN_CREATED: 0.0       // < 30%
};

// Engine state
let engineState = {
  initialized: false,
  backend: null,
  webgpuAvailable: false,
  currentInference: null,
  abortController: null
};

/**
 * Initialize the inference engine and detect available backend
 * @returns {Promise<string>} Backend type ('webgpu' | 'wasm' | 'cpu')
 */
export async function init() {
  if (engineState.initialized) {
    return engineState.backend;
  }

  console.log('[InferenceEngine] Initializing...');

  // Detect WebGPU
  engineState.webgpuAvailable = await detectWebGPU();

  if (engineState.webgpuAvailable) {
    engineState.backend = BACKEND_WEBGPU;
    console.log('[InferenceEngine] WebGPU available - using GPU acceleration');
  } else if (typeof WebAssembly !== 'undefined') {
    engineState.backend = BACKEND_WASM;
    console.log('[InferenceEngine] WebGPU not available - falling back to WASM');
  } else {
    engineState.backend = BACKEND_CPU;
    console.warn('[InferenceEngine] WebGPU and WASM unavailable - using CPU fallback');
  }

  engineState.initialized = true;
  return engineState.backend;
}

/**
 * Detect WebGPU availability
 * @returns {Promise<boolean>}
 */
async function detectWebGPU() {
  if (!('gpu' in navigator)) {
    return false;
  }

  try {
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) {
      return false;
    }

    // Test device creation
    const device = await adapter.requestDevice();
    device.destroy();

    return true;
  } catch (error) {
    console.warn('[InferenceEngine] WebGPU detection failed:', error);
    return false;
  }
}

/**
 * Get current backend type
 * @returns {string|null} Backend type or null if not initialized
 */
export function getBackend() {
  return engineState.backend;
}

/**
 * Check if WebGPU is available
 * @returns {boolean}
 */
export function isWebGPUAvailable() {
  return engineState.webgpuAvailable;
}

/**
 * Get current engine status
 * @returns {Object} Status information
 */
export function getStatus() {
  return {
    initialized: engineState.initialized,
    backend: engineState.backend,
    webgpuAvailable: engineState.webgpuAvailable,
    inferenceActive: engineState.currentInference !== null
  };
}

/**
 * Run inference across multiple models
 * @param {HTMLImageElement|HTMLCanvasElement|Blob} imageSource - Image to analyze
 * @param {string[]} modelIds - Array of model IDs to run
 * @param {InferenceOptions} [options={}] - Inference options
 * @returns {Promise<AggregatedResult>} Aggregated results
 */
export async function runInference(imageSource, modelIds, options = {}) {
  if (!engineState.initialized) {
    await init();
  }

  // Default options
  const opts = {
    parallel: true,
    maxConcurrency: 4,
    timeout: 30000,
    onModelStart: null,
    onModelComplete: null,
    onProgress: null,
    abortSignal: null,
    ...options
  };

  // Create abort controller for this inference
  engineState.abortController = new AbortController();
  const signal = opts.abortSignal || engineState.abortController.signal;

  const startTime = performance.now();

  try {
    // Track inference state
    engineState.currentInference = {
      imageSource,
      modelIds,
      startTime,
      completed: 0,
      total: modelIds.length
    };

    // Run models
    let results;
    if (opts.parallel) {
      results = await runModelsParallel(imageSource, modelIds, opts, signal);
    } else {
      results = await runModelsSequential(imageSource, modelIds, opts, signal);
    }

    // Filter successful results
    const successfulResults = results.filter(r => r.success);
    const failedModels = results.filter(r => !r.success).map(r => r.modelId);

    if (successfulResults.length === 0) {
      throw new Error('All models failed - no results to aggregate');
    }

    // Aggregate results
    const aggregated = aggregateResults(successfulResults);

    // Add timing and error info
    const totalTime = performance.now() - startTime;
    aggregated.totalTime = Math.round(totalTime);  // Flat property for ResultsPanel
    aggregated.timing = {
      total: Math.round(totalTime),
      average: Math.round(totalTime / modelIds.length),
      parallel: opts.parallel
    };

    if (failedModels.length > 0) {
      aggregated.errors = failedModels;
    }

    return aggregated;

  } catch (error) {
    if (signal.aborted) {
      throw new Error('Inference aborted by user');
    }
    throw error;
  } finally {
    engineState.currentInference = null;
    engineState.abortController = null;
  }
}

/**
 * Calculate preliminary verdict from partial results
 * Shows early verdict if 2+ models agree with >75% confidence
 *
 * IMPORTANT: Handle "Split Vote" edge case
 * If 2 say "Real" and 1 says "Fake", do NOT show preliminary - wait for heavy models
 */
function calculatePartialVerdict(completedResults) {
  const validResults = completedResults.filter(r => r?.success && r?.aiProbability != null);
  if (validResults.length < 2) return null; // Need at least 2 models

  const aiVotes = validResults.filter(r => r.aiProbability > 65).length;
  const realVotes = validResults.filter(r => r.aiProbability < 35).length;
  const unsureVotes = validResults.length - aiVotes - realVotes;
  const avgConfidence = validResults.reduce((sum, r) => sum + r.confidence, 0) / validResults.length;

  // CRITICAL: Only show preliminary if UNANIMOUS agreement
  // Split votes (e.g., 2 Real + 1 AI) should NOT show preliminary
  const isUnanimous = (aiVotes === validResults.length) || (realVotes === validResults.length);

  if (!isUnanimous) {
    return null; // Split vote - wait for more models
  }

  // Only show early verdict if strong confidence AND unanimous
  if (avgConfidence > 75) {
    return {
      preliminary: true,
      verdict: aiVotes > 0 ? 'LIKELY_AI' : 'LIKELY_REAL',
      confidence: Math.round(avgConfidence),
      modelsComplete: validResults.length,
      modelsTotal: 6,
      message: `Preliminary result based on ${validResults.length}/6 models`
    };
  }
  return null;
}

/**
 * Run models in parallel with concurrency limit
 * @private
 */
async function runModelsParallel(imageSource, modelIds, opts, signal) {
  // Sort by priority (fastest first)
  const sortedIds = [...modelIds].sort((a, b) => {
    const aIndex = MODEL_PRIORITY.indexOf(a);
    const bIndex = MODEL_PRIORITY.indexOf(b);

    // Models not in priority list go to end
    if (aIndex === -1 && bIndex === -1) return 0;
    if (aIndex === -1) return 1;
    if (bIndex === -1) return -1;

    return aIndex - bIndex;
  });

  const results = [];
  const limit = createPLimit(opts.maxConcurrency);

  // Create promises for all models with concurrency control
  const promises = sortedIds.map((modelId) =>
    limit(async () => {
      // Check abort signal
      if (signal.aborted) {
        throw new Error('Inference aborted');
      }

      if (opts.onModelStart) {
        opts.onModelStart(modelId);
      }

      try {
        const result = await runSingleModelWithTimeout(imageSource, modelId, opts, signal);
        results.push(result);

        // Update progress
        if (engineState.currentInference) {
          engineState.currentInference.completed++;
        }

        // Callbacks
        if (opts.onModelComplete) {
          opts.onModelComplete(result);
        }
        if (opts.onProgress && engineState.currentInference) {
          const { completed, total } = engineState.currentInference;
          opts.onProgress({
            completed,
            total,
            percent: Math.round((completed / total) * 100)
          });
        }

        // Check for early/partial verdict
        if (opts.onPartialVerdict) {
          const partial = calculatePartialVerdict(results);
          if (partial) opts.onPartialVerdict(partial);
        }

        return result;
      } catch (error) {
        const errorResult = {
          modelId,
          success: false,
          error: error.message,
          inferenceTime: 0,
          aiProbability: 50,
          verdict: 'ERROR',
          confidence: 0
        };
        results.push(errorResult);

        if (opts.onModelComplete) {
          opts.onModelComplete(errorResult);
        }

        return errorResult;
      }
    })
  );

  // Wait for all to complete
  await Promise.all(promises);

  return results;
}

/**
 * Run models sequentially
 * @private
 */
async function runModelsSequential(imageSource, modelIds, opts, signal) {
  const results = [];

  for (const modelId of modelIds) {
    // Check abort signal
    if (signal.aborted) {
      throw new Error('Inference aborted');
    }

    if (opts.onModelStart) {
      opts.onModelStart(modelId);
    }

    try {
      const result = await runSingleModelWithTimeout(imageSource, modelId, opts, signal);
      results.push(result);

      // Update progress
      if (engineState.currentInference) {
        engineState.currentInference.completed++;
      }

      if (opts.onModelComplete) {
        opts.onModelComplete(result);
      }
      if (opts.onProgress && engineState.currentInference) {
        const { completed, total } = engineState.currentInference;
        opts.onProgress({
          completed,
          total,
          percent: Math.round((completed / total) * 100)
        });
      }

      // Check for early/partial verdict
      if (opts.onPartialVerdict) {
        const partial = calculatePartialVerdict(results);
        if (partial) opts.onPartialVerdict(partial);
      }
    } catch (error) {
      const errorResult = {
        modelId,
        success: false,
        error: error.message,
        inferenceTime: 0,
        aiProbability: 50,
        verdict: 'ERROR',
        confidence: 0
      };
      results.push(errorResult);

      if (opts.onModelComplete) {
        opts.onModelComplete(errorResult);
      }
    }
  }

  return results;
}

/**
 * Run single model with timeout
 * @private
 */
async function runSingleModelWithTimeout(imageSource, modelId, opts, signal) {
  return Promise.race([
    runSingleModel(imageSource, modelId, opts, signal),
    createTimeout(opts.timeout, modelId)
  ]);
}

/**
 * Create timeout promise
 * @private
 */
function createTimeout(ms, modelId) {
  return new Promise((_, reject) => {
    setTimeout(() => {
      reject(new Error(`Model ${modelId} timed out after ${ms}ms`));
    }, ms);
  });
}

/**
 * Run inference on a single model
 * @param {HTMLImageElement|HTMLCanvasElement|Blob} imageSource - Image to analyze
 * @param {string} modelId - Model ID
 * @param {AbortSignal} [signal] - Abort signal
 * @returns {Promise<ModelResult>}
 */
/**
 * Cache for loaded model modules to avoid re-importing
 * @private
 */
const loadedModelModules = new Map();

export async function runSingleModel(imageSource, modelId, opts = {}, signal = null) {
  const startTime = performance.now();

  console.log(`[InferenceEngine] Starting inference for model: ${modelId}`);

  try {
    // Check abort
    if (signal?.aborted) {
      throw new Error('Aborted');
    }

    // Validate modelId to prevent path traversal attacks
    if (!/^[a-z0-9_-]+$/i.test(modelId)) {
      throw new Error(`Invalid model ID format: ${modelId}`);
    }
    console.log(`[InferenceEngine]   Model ID validated: ${modelId}`);

    // Load model module (cached after first load)
    let modelModule = loadedModelModules.get(modelId);
    if (!modelModule) {
      console.log(`[InferenceEngine]   Loading model module: ../models/${modelId}.js`);
      modelModule = await import(`../models/${modelId}.js`);
      loadedModelModules.set(modelId, modelModule);
      console.log(`[InferenceEngine]   Model module loaded and cached`);
    } else {
      console.log(`[InferenceEngine]   Using cached model module`);
    }

    // Ensure model is loaded
    console.log(`[InferenceEngine]   Checking if model is loaded...`);
    console.log(`[InferenceEngine]     - modelModule.isLoaded exists:`, !!modelModule.isLoaded);
    console.log(`[InferenceEngine]     - modelModule.isLoaded():`, modelModule.isLoaded ? modelModule.isLoaded() : 'N/A');

    if (!modelModule.isLoaded || !modelModule.isLoaded()) {
      const device = engineState.backend === 'webgpu' ? 'webgpu' : 'wasm';
      console.log(`[InferenceEngine]   Model not loaded, loading with device: ${device}`);
      console.log(`[InferenceEngine]   Calling modelModule.load({ device: "${device}" })...`);

      // Get useRemote from global opts if available (defaults to undefined, letting model choose)
      const loadOptions = {
        device: device
      };

      // Pass useRemote option if explicitly set
      if (opts && opts.useRemote !== undefined) {
        loadOptions.useRemote = opts.useRemote;
        console.log(`[InferenceEngine]   useRemote: ${opts.useRemote}`);
      }

      await modelModule.load(loadOptions);

      console.log(`[InferenceEngine]   Model loaded successfully`);
      console.log(`[InferenceEngine]     - isLoaded() now returns:`, modelModule.isLoaded());
    } else {
      console.log(`[InferenceEngine]   Model already loaded`);
    }

    // Check abort before prediction
    if (signal?.aborted) {
      throw new Error('Aborted');
    }

    // Run prediction
    console.log(`[InferenceEngine]   Running prediction...`);
    const result = await modelModule.predict(imageSource);
    console.log(`[InferenceEngine]   Prediction complete:`, {
      aiProbability: result.aiProbability,
      verdict: result.verdict,
      confidence: result.confidence
    });
    console.log(`[InferenceEngine]   [DEBUG] Full result for ${modelId}:`, result);

    const time = performance.now() - startTime;

    // Normalize result format - models return aiProbability as percentage (0-100)
    const aiProbability = result.aiProbability ?? result.rawScore * 100 ?? 50;
    const verdict = result.verdict ?? determineVerdict(aiProbability / 100);
    const confidence = result.confidence ?? Math.round(Math.max(aiProbability, 100 - aiProbability));

    return {
      modelId,
      displayName: result.displayName || modelId,
      aiProbability: Math.round(aiProbability * 10) / 10,
      verdict,
      confidence,
      inferenceTime: Math.round(time),
      success: true,
      metadata: {
        backend: engineState.backend,
        category: result.category,
        likelySource: result.likelySource,
        sourcePredictions: result.sourcePredictions
      }
    };
  } catch (error) {
    console.error(`[InferenceEngine] Model ${modelId} failed:`, error);
    console.error(`[InferenceEngine]   Error name: ${error.name}`);
    console.error(`[InferenceEngine]   Error message: ${error.message}`);
    if (error.stack) {
      console.error(`[InferenceEngine]   Stack trace:`, error.stack);
    }

    const time = performance.now() - startTime;
    return {
      modelId,
      success: false,
      error: error.message,
      inferenceTime: Math.round(time),
      aiProbability: 50,
      verdict: 'ERROR',
      confidence: 0
    };
  }
}

/**
 * Prepare image data for inference
 * @private
 */
async function prepareImageData(imageSource) {
  // Create canvas to extract pixel data
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  let image;

  if (imageSource instanceof Blob) {
    // Convert Blob to Image
    const url = URL.createObjectURL(imageSource);
    try {
      image = await loadImage(url);
    } finally {
      URL.revokeObjectURL(url);
    }
  } else if (imageSource instanceof HTMLImageElement) {
    image = imageSource;
  } else if (imageSource instanceof HTMLCanvasElement) {
    return imageSource.getContext('2d').getImageData(
      0, 0, imageSource.width, imageSource.height
    );
  } else {
    throw new Error('Unsupported image source type');
  }

  // Resize to model input size (typically 224x224 or 299x299)
  canvas.width = 224;
  canvas.height = 224;
  ctx.drawImage(image, 0, 0, 224, 224);

  return ctx.getImageData(0, 0, 224, 224);
}

/**
 * Load image from URL
 * @private
 */
function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

/**
 * Aggregate results from multiple models using ensemble voting
 * @param {ModelResult[]} results - Individual model results
 * @returns {AggregatedResult}
 */
export function aggregateResults(results) {
  if (!results || results.length === 0) {
    throw new Error('No results to aggregate');
  }

  // Filter successful results
  const validResults = results.filter(r => r.success);

  if (validResults.length === 0) {
    throw new Error('No valid results to aggregate');
  }

  // Calculate weighted average (equal weights for now, can add model-specific weights)
  const totalProb = validResults.reduce((sum, r) => sum + r.aiProbability, 0);
  const avgProb = totalProb / validResults.length;

  // Count votes based on thresholds
  const votes = {
    ai: 0,      // > 65% probability
    real: 0,    // < 35% probability
    unsure: 0   // 35-65% range
  };

  validResults.forEach(r => {
    const prob = r.aiProbability / 100;
    if (prob > 0.65) {
      votes.ai++;
    } else if (prob < 0.35) {
      votes.real++;
    } else {
      votes.unsure++;
    }
  });

  // Determine final verdict from ensemble
  const ensembleProb = avgProb / 100;
  const verdict = determineVerdict(ensembleProb);

  // Calculate confidence as distance from 50% (maximum uncertainty)
  const confidence = Math.round(Math.abs(avgProb - 50) * 2);

  // Build result breakdown
  const breakdown = validResults.map(r => ({
    model: r.modelId,
    probability: r.aiProbability,
    verdict: r.verdict,
    time: r.time
  }));

  return {
    verdict,
    confidence,
    aiProbability: Math.round(avgProb * 10) / 10,
    votes,
    modelResults: validResults,
    breakdown,
    summary: {
      modelsUsed: validResults.length,
      consensus: calculateConsensus(votes),
      avgInferenceTime: Math.round(
        validResults.reduce((sum, r) => sum + r.time, 0) / validResults.length
      )
    }
  };
}

/**
 * Determine verdict from probability
 * @private
 */
function determineVerdict(probability) {
  if (probability >= VERDICT_THRESHOLDS.AI_GENERATED) {
    return 'AI_GENERATED';
  } else if (probability >= VERDICT_THRESHOLDS.LIKELY_AI) {
    return 'LIKELY_AI';
  } else if (probability >= VERDICT_THRESHOLDS.INCONCLUSIVE) {
    return 'INCONCLUSIVE';
  } else if (probability >= VERDICT_THRESHOLDS.LIKELY_REAL) {
    return 'LIKELY_REAL';
  } else {
    return 'HUMAN_CREATED';
  }
}

/**
 * Calculate consensus strength
 * @private
 */
function calculateConsensus(votes) {
  const total = votes.ai + votes.real + votes.unsure;
  const max = Math.max(votes.ai, votes.real, votes.unsure);
  const consensusPercent = Math.round((max / total) * 100);

  if (consensusPercent >= 80) {
    return 'STRONG';
  } else if (consensusPercent >= 60) {
    return 'MODERATE';
  } else {
    return 'WEAK';
  }
}

/**
 * Abort current inference
 */
export function abortInference() {
  if (engineState.abortController) {
    console.log('[InferenceEngine] Aborting inference...');
    engineState.abortController.abort();
    engineState.currentInference = null;
    engineState.abortController = null;
  }
}

/**
 * Format verdict for display
 * @param {string} verdict - Verdict code
 * @returns {string} Human-readable verdict
 */
export function formatVerdict(verdict) {
  const verdictMap = {
    'AI_GENERATED': 'AI Generated',
    'LIKELY_AI': 'Likely AI',
    'INCONCLUSIVE': 'Inconclusive',
    'LIKELY_REAL': 'Likely Real',
    'HUMAN_CREATED': 'Human Created',
    'ERROR': 'Error'
  };

  return verdictMap[verdict] || verdict;
}

/**
 * Get verdict color class
 * @param {string} verdict - Verdict code
 * @returns {string} CSS class suffix
 */
export function getVerdictColor(verdict) {
  const colorMap = {
    'AI_GENERATED': 'danger',
    'LIKELY_AI': 'warning',
    'INCONCLUSIVE': 'info',
    'LIKELY_REAL': 'success-light',
    'HUMAN_CREATED': 'success',
    'ERROR': 'danger'
  };

  return colorMap[verdict] || 'info';
}

/**
 * Export engine state for debugging
 * @returns {Object} Current state snapshot
 */
export function exportState() {
  return {
    ...engineState,
    timestamp: new Date().toISOString()
  };
}

// Auto-initialize on module load
if (typeof window !== 'undefined') {
  // Initialize asynchronously without blocking
  init().catch(error => {
    console.error('[InferenceEngine] Auto-initialization failed:', error);
  });
}
