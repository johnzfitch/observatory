/**
 * Centralized path configuration for model loading
 *
 * This module handles path resolution for both local development
 * and remote deployment scenarios (e.g., NixOS server).
 *
 * Transformers.js Path Resolution:
 * - When allowLocalModels=true, it uses: localModelPath + modelId
 * - Default localModelPath is '/models/'
 * - We set localModelPath to our models directory
 * - Model IDs should be just the folder name (e.g., 'dima806_ai_real')
 */

/**
 * Get the base path for local models
 * Works with both file:// and http:// protocols
 * @returns {string} Base path ending with /
 */
export function getModelsBasePath() {
  // For deployment flexibility, use relative path from document root
  // This works whether served from /, /app/, /deepfake-detector/, etc.
  return '/models/';
}

/**
 * Configure Transformers.js environment for local model loading
 * @param {Object} env - Transformers.js env object
 */
export function configureTransformersEnv(env) {
  console.log('[paths.js] [CONFIG] Configuring Transformers.js environment...');

  // Enable local model loading
  env.allowLocalModels = true;
  console.log('[paths.js]   [OK] allowLocalModels = true');

  // Use browser cache for downloaded models
  env.useBrowserCache = true;
  console.log('[paths.js]   [OK] useBrowserCache = true');

  // Set the local model path - Transformers.js will append model ID to this
  env.localModelPath = getModelsBasePath();
  console.log('[paths.js]   [OK] localModelPath =', env.localModelPath);

  // Disable remote model fetching - we have local ONNX files
  // Prevents HuggingFace fallback which causes 404 errors for our models
  env.allowRemoteModels = false;
  console.log('[paths.js]   [OK] allowRemoteModels = false');

  // NOTE: We do NOT configure WASM paths - let transformers.js use its bundled ONNX Runtime
  // The transformers.js library has ONNX Runtime compiled in, and overriding wasmPaths
  // causes version mismatches that result in "can't access property 'buffer'" errors
  console.log('[paths.js] [INFO]  WASM paths NOT configured - using transformers.js bundled ONNX Runtime');
  console.log('[paths.js]   env.backends available:', !!env.backends);
  console.log('[paths.js]   env.backends.onnx available:', !!env.backends?.onnx);
  console.log('[paths.js]   env.backends.onnx.wasm available:', !!env.backends?.onnx?.wasm);

  if (env.backends?.onnx?.wasm?.wasmPaths) {
    console.log('[paths.js]   Current WASM paths:', env.backends.onnx.wasm.wasmPaths);
  }

  console.log('[paths.js] [END] Configuration complete. Final env state:', {
    allowLocalModels: env.allowLocalModels,
    localModelPath: env.localModelPath,
    allowRemoteModels: env.allowRemoteModels,
    wasmPaths: env.backends?.onnx?.wasm?.wasmPaths || 'NOT SET'
  });
}

/**
 * Model path configuration
 * Each model ID maps to its folder name under /models/
 */
export const MODEL_PATHS = {
  // Art Detectors (Transformers.js pipeline)
  dima806_ai_real: 'dima806_ai_real',
  smogy: 'smogy',
  haywood: 'haywood',
  umm_maybe: 'umm_maybe',
  prithiv_v2: 'prithiv_v2',
  yaya_detector: 'yaya_detector',
  ateeqq: 'ateeqq',

  // Photo Detectors (raw ONNX)
  cnn_detection: 'cnn_detection',
  npr: 'npr',
  mesonet: 'mesonet',
  xception: 'xception',
  capsulenet: 'capsulenet',
  dspfwa: 'dspfwa',
  va: 'va',
  upconv: 'upconv',
  trufor: 'trufor',
  ucf: 'ucf',
  spsl: 'spsl'
};
