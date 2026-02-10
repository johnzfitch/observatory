/**
 * Shared ONNX Runtime - Single initialization for all models
 * Eliminates duplicate imports and provides unified backend detection
 *
 * Version: 1.21.0 (January 2026 upgrade)
 * Features:
 * - Enhanced WebGPU detection with GPU limit validation for ML workloads
 * - WASM-SIMD fallback for browsers without WebGPU
 * - SharedArrayBuffer detection for multi-threaded WASM
 *
 * WebGPU Browser Support (January 2026):
 * - Chrome/Edge 113+: Full support (Windows, macOS, ChromeOS, Android 12+)
 * - Firefox 141+: Windows, macOS ARM64 (145+)
 * - Safari 26: Full support (macOS Tahoe, iOS 26, iPadOS 26)
 *
 * References:
 * - https://onnxruntime.ai/docs/tutorials/web/ep-webgpu.html
 * - https://github.com/gpuweb/gpuweb/wiki/Implementation-Status
 */

let ort = null;
let initialized = false;
let backend = null;
let gpuInfo = null;

// Local ONNX Runtime bundles (avoid CORS issues with CDN imports)
// Upgraded to 1.21.0 for better WebGPU support (January 2026)
const ORT_VERSION = '1.21.0';
const ORT_LOCAL_PATH = `/vendor/onnxruntime-${ORT_VERSION}/ort.webgpu.min.js`;
const ORT_WASM_LOCAL_PATH = `/vendor/onnxruntime-${ORT_VERSION}/`;

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
    // Detect best backend with GPU validation
    const detection = await detectBackend();
    backend = detection.backend;
    gpuInfo = detection.gpuInfo;

    console.log(`[ORT] Detected backend: ${backend}`);
    if (gpuInfo) {
      console.log(`[ORT] GPU: ${gpuInfo.vendor} ${gpuInfo.architecture} (${gpuInfo.device})`);
      if (gpuInfo.features) {
        console.log(`[ORT] GPU Features: float32-filterable=${gpuInfo.features.float32Filterable}, shader-f16=${gpuInfo.features.shaderF16}`);
      }
    }
    console.log(`[ORT] WASM SIMD: ${detection.simd}`);

    // Use local ONNX Runtime bundle (v1.21.0) - avoids CORS issues
    console.log(`[ORT] Loading local ONNX Runtime bundle (v${ORT_VERSION})`);

    // Import using script tag since dynamic import has CORS issues on localhost
    const hasInferenceSession = typeof window.ort !== 'undefined' &&
      typeof window.ort.InferenceSession !== 'undefined';
    if (!hasInferenceSession) {
      if (window.ort && !window.ort.InferenceSession) {
        delete window.ort;
      }
      await new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = ORT_LOCAL_PATH;
        script.onload = () => {
          // Give it a moment for the global to be set
          setTimeout(() => {
            if (window.ort?.InferenceSession) {
              resolve();
            } else {
              reject(new Error('ONNX Runtime failed to load'));
            }
          }, 100);
        };
        script.onerror = () => reject(new Error('Failed to load ONNX Runtime script'));
        document.head.appendChild(script);
      });
    }

    ort = window.ort;
    console.log('[ORT] ONNX Runtime loaded');
    console.log('[ORT] Available properties:', Object.keys(ort));
    console.log('[ORT] InferenceSession available:', !!ort.InferenceSession);

    // Apply configuration from onnx-init.js if available
    const config = window.__ONNX_RUNTIME_CONFIG__ || {};

    // Configure WASM settings BEFORE any session is created
    // CRITICAL: Respect mobile memory limits - config.isLowMemory is set by onnx-init.js
    const useMultiThread = sabAvailable && !config.isLowMemory && !config.isIOS;
    ort.env.wasm.numThreads = useMultiThread ? 4 : (config.wasm?.numThreads || 1);
    ort.env.wasm.proxy = config.wasm?.proxy ?? false;
    ort.env.wasm.simd = config.wasm?.simd ?? true;
    ort.env.wasm.wasmPaths = ORT_WASM_LOCAL_PATH;

    // Set log level from config
    if (config.logLevel) {
      ort.env.logLevel = config.logLevel;
    }

    console.log(`[ORT] Configured WASM: threads=${ort.env.wasm.numThreads}, simd=${ort.env.wasm.simd}, path=${ORT_WASM_LOCAL_PATH}`);

    initialized = true;
    return { ort, backend };
  } catch (error) {
    console.error('[ORT] Failed to initialize:', error);
    throw error;
  }
}

/**
 * Detect WASM SIMD support
 * @returns {boolean} True if WASM SIMD is supported
 */
function detectWasmSimd() {
  try {
    // WASM SIMD feature detection using a minimal test module
    const simdTest = new Uint8Array([
      0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0,
      10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11
    ]);
    new WebAssembly.Module(simdTest);
    return true;
  } catch {
    return false;
  }
}

/**
 * Minimum GPU limits required for ML workloads
 * Based on model sizes: ateeqq=57MB, prithiv_v2=50MB, smogy=55MB
 * Plus overhead for intermediate tensors and activations
 */
const ML_GPU_LIMITS = {
  maxStorageBufferBindingSize: 134217728,  // 128MB - model weights + activations
  maxBufferSize: 268435456,                 // 256MB - intermediate tensors
  maxComputeWorkgroupSizeX: 256             // Convolution kernel requirements
};

/**
 * Detect best available backend with GPU limit validation for ML workloads
 * @returns {Promise<{backend: string, gpuInfo: object|null, simd: boolean}>}
 */
async function detectBackend() {
  const simd = detectWasmSimd();

  if (!('gpu' in navigator)) {
    console.log('[ORT] navigator.gpu not available');
    return { backend: 'wasm', gpuInfo: null, simd };
  }

  try {
    // Request adapter with high-performance preference for ML
    const adapter = await navigator.gpu.requestAdapter({
      powerPreference: 'high-performance'
    });

    if (!adapter) {
      console.warn('[ORT] No WebGPU adapter found');
      return { backend: 'wasm', gpuInfo: null, simd };
    }

    // Collect GPU info for debugging
    const info = {
      vendor: adapter.info?.vendor || 'Unknown',
      architecture: adapter.info?.architecture || 'Unknown',
      device: adapter.info?.device || 'Unknown',
      description: adapter.info?.description || 'Unknown'
    };

    // Validate GPU limits for ML workloads
    const limits = adapter.limits;
    const meetsLimits =
      limits.maxStorageBufferBindingSize >= ML_GPU_LIMITS.maxStorageBufferBindingSize &&
      limits.maxBufferSize >= ML_GPU_LIMITS.maxBufferSize &&
      limits.maxComputeWorkgroupSizeX >= ML_GPU_LIMITS.maxComputeWorkgroupSizeX;

    if (!meetsLimits) {
      console.warn('[ORT] GPU limits insufficient for ML workloads:', {
        maxStorageBufferBindingSize: `${limits.maxStorageBufferBindingSize} (need ${ML_GPU_LIMITS.maxStorageBufferBindingSize})`,
        maxBufferSize: `${limits.maxBufferSize} (need ${ML_GPU_LIMITS.maxBufferSize})`,
        maxComputeWorkgroupSizeX: `${limits.maxComputeWorkgroupSizeX} (need ${ML_GPU_LIMITS.maxComputeWorkgroupSizeX})`
      });
      return { backend: 'wasm', gpuInfo: info, simd };
    }

    // Check optional features
    const hasFloat32Filterable = adapter.features.has('float32-filterable');
    const hasShaderF16 = adapter.features.has('shader-f16');
    info.features = { float32Filterable: hasFloat32Filterable, shaderF16: hasShaderF16 };

    // Try to request device with required limits
    const device = await adapter.requestDevice({
      requiredFeatures: hasFloat32Filterable ? ['float32-filterable'] : [],
      requiredLimits: {
        maxStorageBufferBindingSize: ML_GPU_LIMITS.maxStorageBufferBindingSize,
        maxBufferSize: ML_GPU_LIMITS.maxBufferSize
      }
    });

    device.destroy();

    console.log('[ORT] WebGPU available:', info);
    return { backend: 'webgpu', gpuInfo: info, simd };
  } catch (error) {
    console.warn('[ORT] WebGPU detection failed:', error.message);
    return { backend: 'wasm', gpuInfo: null, simd };
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
 * Get GPU info (if WebGPU was detected)
 * @returns {object|null} GPU information or null
 */
export function getGpuInfo() {
  return gpuInfo;
}

/**
 * Build execution provider chain based on detected backend
 * @returns {string[]} Array of execution providers in priority order
 */
function buildExecutionProviderChain() {
  const chain = [];

  if (backend === 'webgpu') {
    chain.push('webgpu');
  }

  // WASM is always available as fallback
  chain.push('wasm');

  return chain;
}

/**
 * Create an inference session with optimal settings and retry logic
 * @param {string} modelUrl - URL to ONNX model
 * @param {Function} onProgress - Optional progress callback
 * @returns {Promise<InferenceSession>}
 */
export async function createSession(modelUrl, onProgress = null) {
  if (!initialized) await init();

  // Import retry utilities (lazy load to avoid circular deps)
  const { retryWithBackoff, isRetryableError } = await import('./retry-utils.js');

  console.log(`[ORT] Creating session: ${modelUrl}`);
  console.log(`[ORT] Using execution provider: ${backend}`);

  const executionProviders = buildExecutionProviderChain();
  console.log(`[ORT] EP chain: ${executionProviders.join(' → ')}`);

  return retryWithBackoff(
    async () => {
      const session = await ort.InferenceSession.create(modelUrl, {
        executionProviders,
        graphOptimizationLevel: 'all',
        executionMode: 'sequential',
        enableMemPattern: true,
        enableCpuMemArena: true
      });

      onProgress?.(1);
      return session;
    },
    {
      maxRetries: 2,
      initialDelay: 1000,
      shouldRetry: (error) => {
        const retryable = isRetryableError(error);
        console.log(`[ORT] Session creation error (retryable=${retryable}):`, error.message);
        return retryable;
      },
      onRetry: ({ attempt, maxRetries, delay, error }) => {
        console.warn(`[ORT] Session creation retry ${attempt}/${maxRetries}, waiting ${delay}ms:`, error.message);
        onProgress?.(0.5); // Signal partial progress
      }
    }
  );
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
