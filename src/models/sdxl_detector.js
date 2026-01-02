/**
 * sdxl_detector - SDXL Image Detector (Swin Transformer)
 * HuggingFace: Organika/sdxl-detector
 * Accuracy: 98.13%
 *
 * Swin Transformer fine-tuned from umm-maybe AI art detector.
 * Optimized for SDXL-generated images and non-artistic imagery.
 * NOTE: Performance degrades on non-SDXL diffusion models (Midjourney, older Stable Diffusion).
 *
 * Uses direct ONNX Runtime for inference.
 */

import { createSession } from '../core/ort-runtime.js';
import { preprocessImage, softmax, NORMALIZATION } from '../core/preprocessing.js';

let session = null;
let isLoading = false;

export const MODEL_ID = 'sdxl_detector';
export const HF_MODEL = 'Organika/sdxl-detector';
export const DISPLAY_NAME = 'SDXL Detector';
export const ACCURACY = '98.13%';

const MODEL_URL = '/models/sdxl_detector/onnx/model.onnx';

// Label mapping from config.json: 0=artificial, 1=human
const ID2LABEL = {
  0: 'artificial',
  1: 'human'
};

/**
 * Load the model using ONNX Runtime directly
 * @param {Object} options - Loading options
 * @param {Function} options.onProgress - Progress callback
 * @returns {Promise<Object>} The loaded session
 */
export async function load(options = {}) {
  if (session) return session;
  if (isLoading) {
    // Wait for existing load to complete
    while (isLoading) await new Promise(r => setTimeout(r, 100));
    return session;
  }

  isLoading = true;
  try {
    console.log(`[${MODEL_ID}] Loading model from: ${MODEL_URL}`);
    session = await createSession(MODEL_URL, options.onProgress);
    return session;
  } finally {
    isLoading = false;
  }
}

/**
 * Run inference on an image
 * @param {string|HTMLImageElement|HTMLCanvasElement|Blob} imageSource - Image to analyze
 * @returns {Promise<Object>} Prediction results
 */
export async function predict(imageSource) {
  if (!session) await load();

  // Preprocess image with ImageNet normalization (standard for Swin Transformer)
  const tensor = await preprocessImage(imageSource, {
    size: 224,
    normalization: NORMALIZATION.IMAGENET
  });

  const feeds = { pixel_values: tensor };
  const results = await session.run(feeds);

  // Get logits from results
  const logits = results.logits?.data ?? Object.values(results)[0].data;
  const probs = softmax(Array.from(logits));

  // Label order from config.json: 0=artificial, 1=human
  // probs[0] = AI/artificial probability, probs[1] = Human probability
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
    detectedLabel: aiProbability >= 0.5 ? ID2LABEL[0] : ID2LABEL[1],
    rawResults: probs,
    warning: 'Optimized for SDXL-generated images. Performance may degrade on other diffusion models.'
  };
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
    architecture: 'Swin Transformer (fine-tuned from umm-maybe)',
    inputSize: 224,
    parameterCount: '86.8M',
    trainingDataset: 'Wikimedia-SDXL image pairs',
    performance: {
      accuracy: '98.13%',
      f1: '97.33%',
      precision: '99.45%',
      recall: '95.29%',
      auc: '99.80%'
    },
    strengths: [
      'Optimized for SDXL-generated images',
      'High precision (99.45%)',
      'Excellent AUC (99.80%)',
      'Non-artistic imagery focus'
    ],
    limitations: [
      'Degrades on other diffusion models (Midjourney, SD v1)',
      'Significantly underperforms on older models (VQGAN+CLIP)',
      'Non-commercial use only (training data licensing)'
    ]
  };
}
