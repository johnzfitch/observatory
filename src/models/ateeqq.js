/**
 * ateeqq - AI vs Human Image Detector (SigLIP)
 * HuggingFace: Ateeqq/ai-vs-human-image-detector
 * Accuracy: 99.23%
 *
 * Uses direct ONNX Runtime (bypasses transformers.js which doesn't support SigLIP)
 * SigLIP architecture fine-tuned for detecting modern AI-generated images.
 * Trained on 120,000 images (60k AI, 60k human).
 */

let session = null;
let ort = null;
let lastLoadOptions = {}; // Store last load options for predict() fallback

export const MODEL_ID = 'ateeqq';
export const HF_MODEL = 'Ateeqq/ai-vs-human-image-detector';
export const DISPLAY_NAME = 'Ateeqq AI vs Human';
export const ACCURACY = '99.23%';

/**
 * Load the model using ONNX Runtime directly
 * @param {Object} options - Loading options
 * @param {Function} options.onProgress - Progress callback
 * @param {boolean} options.useRemote - Use HuggingFace CDN (default: true)
 * @returns {Promise<void>}
 */
export async function load(options = {}) {
  if (session) return session;

  // Store options for potential reload in predict()
  lastLoadOptions = options;

  // Dynamic import of ONNX Runtime
  if (!ort) {
    ort = await import('https://cdn.jsdelivr.net/npm/onnxruntime-web@1.21.0/dist/ort.webgpu.min.mjs');
  }

  // Determine model URL - prefer HuggingFace CDN, fallback to local
  const HF_ONNX_URL = `https://huggingface.co/${HF_MODEL}/resolve/main/onnx/model.onnx`;
  const LOCAL_URL = '/models/ateeqq/onnx/model.onnx';
  const modelUrl = options.useRemote !== false ? HF_ONNX_URL : LOCAL_URL;

  console.log(`[ateeqq] Loading model from: ${modelUrl}`);

  session = await ort.InferenceSession.create(
    modelUrl,
    {
      executionProviders: ['webgpu', 'wasm'],
      graphOptimizationLevel: 'all'
    }
  );

  options.onProgress?.(1);
  return session;
}

/**
 * Run inference on an image
 * @param {string|HTMLImageElement|HTMLCanvasElement|Blob} imageSource - Image to analyze
 * @returns {Promise<Object>} Prediction results
 */
export async function predict(imageSource) {
  if (!session) await load(lastLoadOptions);

  const tensor = await preprocessImage(imageSource);
  const feeds = { pixel_values: tensor };
  const results = await session.run(feeds);

  // Get logits from results
  const logits = results.logits?.data ?? Object.values(results)[0].data;
  const probs = softmax(Array.from(logits));

  // Label order from config.json: {"0": "ai", "1": "hum"}
  // probs[0] = AI probability, probs[1] = Human probability
  const aiProbability = probs[0];

  // Calculate confidence as distance from decision boundary (0.5)
  const confidence = Math.abs(aiProbability - 0.5) * 2;

  return {
    modelId: MODEL_ID,
    displayName: DISPLAY_NAME,
    aiProbability: Math.round(aiProbability * 1000) / 10, // Percentage with 1 decimal
    rawScore: aiProbability,
    verdict: aiProbability >= 0.5 ? 'AI' : 'REAL',
    confidence: Math.round(confidence * 1000) / 10, // Percentage with 1 decimal
    detectedLabel: aiProbability >= 0.5 ? 'ai' : 'hum',
    rawResults: probs
  };
}

/**
 * Preprocess image for SigLIP model
 * @param {*} imageSource - Image source
 * @returns {Promise<ort.Tensor>} Preprocessed tensor
 */
async function preprocessImage(imageSource) {
  const img = await loadImage(imageSource);
  const canvas = new OffscreenCanvas(224, 224);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, 224, 224);

  const imageData = ctx.getImageData(0, 0, 224, 224);
  const { data } = imageData;

  // SigLIP normalization: (pixel / 255 - 0.5) / 0.5 = pixel / 127.5 - 1
  const float32Data = new Float32Array(1 * 3 * 224 * 224);

  // Convert RGBA HWC to RGB NCHW
  for (let y = 0; y < 224; y++) {
    for (let x = 0; x < 224; x++) {
      const srcIdx = (y * 224 + x) * 4;
      const r = data[srcIdx] / 127.5 - 1;
      const g = data[srcIdx + 1] / 127.5 - 1;
      const b = data[srcIdx + 2] / 127.5 - 1;

      const pixelIdx = y * 224 + x;
      float32Data[0 * 224 * 224 + pixelIdx] = r;  // R channel
      float32Data[1 * 224 * 224 + pixelIdx] = g;  // G channel
      float32Data[2 * 224 * 224 + pixelIdx] = b;  // B channel
    }
  }

  return new ort.Tensor('float32', float32Data, [1, 3, 224, 224]);
}

/**
 * Load image from various sources
 * @param {*} source - Image source
 * @returns {Promise<ImageBitmap|HTMLImageElement>}
 */
async function loadImage(source) {
  if (source instanceof ImageBitmap) return source;
  if (source instanceof HTMLImageElement) return source;
  if (source instanceof Blob) return createImageBitmap(source);
  if (typeof source === 'string') {
    // Handle data URLs
    if (source.startsWith('data:')) {
      const response = await fetch(source);
      const blob = await response.blob();
      return createImageBitmap(blob);
    }
    // Handle regular URLs
    const response = await fetch(source);
    const blob = await response.blob();
    return createImageBitmap(blob);
  }
  throw new Error('Unsupported image source');
}

/**
 * Softmax function
 * @param {number[]} arr - Input array
 * @returns {number[]} Softmax probabilities
 */
function softmax(arr) {
  const max = Math.max(...arr);
  const exps = arr.map(x => Math.exp(x - max));
  const sum = exps.reduce((a, b) => a + b);
  return exps.map(x => x / sum);
}

/**
 * Unload the model from memory
 */
export function unload() {
  session = null;
}

/**
 * Check if model is currently loaded
 * @returns {boolean} True if loaded
 */
export function isLoaded() {
  return session !== null;
}

/**
 * Get model metadata
 * @returns {Object} Model information
 */
export function getInfo() {
  return {
    modelId: MODEL_ID,
    displayName: DISPLAY_NAME,
    hfModel: HF_MODEL,
    accuracy: ACCURACY,
    architecture: 'SigLIP (Direct ONNX Runtime)',
    inputSize: 224,
    parameterCount: '92.9M',
    trainingDataset: '120,000 images (60k AI, 60k human)',
    performance: {
      evalAccuracy: '99.23%',
      testAccuracy: '99.23%',
      f1Macro: '99.23%',
      f1Weighted: '99.23%'
    },
    detectedModels: [
      'Midjourney v6.1',
      'Flux 1.1 Pro',
      'Stable Diffusion 3.5',
      'GPT-4o',
      'Other trending generation models'
    ],
    strengths: [
      'Highest accuracy of all models (99.23%)',
      'Trained on modern AI generators (2024)',
      'Large training dataset (120k images)',
      'Excellent F1 scores across all metrics'
    ],
    limitations: [
      'May degrade on unseen manipulation methods',
      'Optimized for specific high-quality generators',
      'Binary classification only (AI vs Human)'
    ]
  };
}
