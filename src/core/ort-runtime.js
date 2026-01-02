/**
 * Shared ONNX Runtime - Single initialization for all models
 * Eliminates duplicate imports and provides unified backend detection
 *
 * IMPORTANT: SharedArrayBuffer compatibility
 * ------------------------------------------
 * ONNX Runtime Web 1.19.0+ only ships threaded WASM files (ort-wasm-simd-threaded.wasm).
 * Even with numThreads=1, these files require SharedArrayBuffer for their memory model.
 * Firefox (and some other browsers) may block SharedArrayBuffer even when crossOriginIsolated=true
 * if internal about:config settings are disabled.
 *
 * Solution: Use version 1.18.0 for non-SharedArrayBuffer environments, which ships
 * both threaded (ort-wasm-simd-threaded.wasm) and non-threaded (ort-wasm-simd.wasm) variants.
 *
 * References:
 * - https://github.com/microsoft/onnxruntime/issues/25666
 * - https://onnxruntime.ai/docs/tutorials/web/env-flags-and-session-options.html
 */

let ort = null;
let initialized = false;
let backend = null;

// WebGPU bundle - requires SharedArrayBuffer (for WASM fallback)
const ORT_WEBGPU_CDN = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.21.0/dist/ort.webgpu.min.mjs';
// v1.21.0 WASM bundle - only has threaded WASM files, requires SharedArrayBuffer
const ORT_WASM_THREADED_CDN = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.21.0/dist/ort.wasm.min.mjs';
// v1.18.0 WASM bundle - has non-threaded WASM files, NO SharedArrayBuffer required
const ORT_WASM_LEGACY_CDN = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.18.0/dist/ort.min.mjs';
// v1.18.0 WASM path for non-threaded files
const ORT_WASM_LEGACY_PATH = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.18.0/dist/';

/**
 * Check if SharedArrayBuffer is actually usable (not just defined)
 * Firefox may have crossOriginIsolated=true but still block SharedArrayBuffer
 * if about:config settings are disabled.
 */
function isSharedArrayBufferAvailable() {
  try {
    // First check: is SharedArrayBuffer defined and crossOriginIsolated?
    if (typeof SharedArrayBuffer === 'undefined') {
      return false;
    }
    if (typeof crossOriginIsolated !== 'undefined' && !crossOriginIsolated) {
      return false;
    }

    // Second check: can we actually create a shared WebAssembly memory?
    // This is the definitive test - if this fails, threaded WASM will fail
    const testMemory = new WebAssembly.Memory({
      initial: 1,
      maximum: 1,
      shared: true
    });
    return testMemory.buffer instanceof SharedArrayBuffer;
  } catch (e) {
    // If any of this throws, SharedArrayBuffer is not usable
    console.log('[ORT] SharedArrayBuffer test failed:', e.message);
    return false;
  }
}

/**
 * Initialize ONNX Runtime (called once at startup)
 * @returns {Promise<{ort: object, backend: string}>}
 */
export async function init() {
  if (initialized) {
    return { ort, backend };
  }

  console.log('[ORT] Initializing ONNX Runtime...');

  const sabAvailable = isSharedArrayBufferAvailable();
  console.log(`[ORT] SharedArrayBuffer available: ${sabAvailable}`);
  console.log(`[ORT] crossOriginIsolated: ${typeof crossOriginIsolated !== 'undefined' ? crossOriginIsolated : 'undefined'}`);

  try {
    // Detect best backend first to choose the right bundle
    backend = await detectBackend();
    console.log(`[ORT] Detected backend: ${backend}`);

    // Choose appropriate ORT bundle based on SharedArrayBuffer availability
    let cdnUrl;
    let useMultiThread = false;

    if (backend === 'webgpu' && sabAvailable) {
      // WebGPU with SharedArrayBuffer - use latest version
      cdnUrl = ORT_WEBGPU_CDN;
      useMultiThread = true;
      console.log('[ORT] Loading WebGPU bundle (v1.21.0)');
    } else if (sabAvailable) {
      // WASM with SharedArrayBuffer - use latest threaded version
      cdnUrl = ORT_WASM_THREADED_CDN;
      useMultiThread = true;
      backend = 'wasm';
      console.log('[ORT] Loading threaded WASM bundle (v1.21.0)');
    } else {
      // NO SharedArrayBuffer - use legacy version with non-threaded WASM
      cdnUrl = ORT_WASM_LEGACY_CDN;
      useMultiThread = false;
      backend = 'wasm';
      console.log('[ORT] Loading non-threaded WASM bundle (v1.18.0) - SharedArrayBuffer not available');
    }

    ort = await import(cdnUrl);
    console.log('[ORT] ONNX Runtime loaded');

    // Configure WASM settings BEFORE any session is created
    if (!useMultiThread) {
      // Force single-threaded mode with non-threaded WASM files
      ort.env.wasm.numThreads = 1;
      ort.env.wasm.proxy = false;
      // Point to v1.18.0 dist folder which has ort-wasm-simd.wasm (non-threaded)
      ort.env.wasm.wasmPaths = ORT_WASM_LEGACY_PATH;
      console.log('[ORT] Configured for non-threaded WASM (v1.18.0)');
    } else {
      // Multi-threaded mode - let ORT auto-detect thread count
      console.log('[ORT] Using multi-threaded WASM');
    }

    initialized = true;
    return { ort, backend };
  } catch (error) {
    console.error('[ORT] Failed to initialize:', error);
    throw error;
  }
}

/**
 * Detect best available backend
 * @returns {Promise<string>} 'webgpu' | 'wasm'
 */
async function detectBackend() {
  if (!('gpu' in navigator)) {
    return 'wasm';
  }

  try {
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) return 'wasm';

    const device = await adapter.requestDevice();
    device.destroy();
    return 'webgpu';
  } catch {
    return 'wasm';
  }
}

/**
 * Get ONNX Runtime instance
 * @returns {object} ONNX Runtime module
 */
export function getOrt() {
  if (!ort) throw new Error('ORT not initialized. Call init() first.');
  return ort;
}

/**
 * Get current backend
 * @returns {string} Backend name
 */
export function getBackend() {
  return backend;
}

/**
 * Create an inference session with optimal settings
 * @param {string} modelUrl - URL to ONNX model
 * @param {Function} onProgress - Optional progress callback
 * @returns {Promise<InferenceSession>}
 */
export async function createSession(modelUrl, onProgress = null) {
  if (!initialized) await init();

  console.log(`[ORT] Creating session: ${modelUrl}`);
  console.log(`[ORT] Using execution provider: ${backend}`);

  // Only use WebGPU if we have SharedArrayBuffer (needed for fallback)
  const executionProviders = backend === 'webgpu'
    ? ['webgpu', 'wasm']
    : ['wasm'];

  const session = await ort.InferenceSession.create(modelUrl, {
    executionProviders,
    graphOptimizationLevel: 'all'
  });

  onProgress?.(1);
  return session;
}

/**
 * Create a tensor
 * @param {string} type - Data type ('float32', etc)
 * @param {TypedArray} data - Tensor data
 * @param {number[]} dims - Dimensions
 * @returns {Tensor}
 */
export function createTensor(type, data, dims) {
  if (!ort) throw new Error('ORT not initialized');
  return new ort.Tensor(type, data, dims);
}
