/**
 * dima806_ai_real - AI vs Real Image Detection (ViT)
 * HuggingFace: dima806/ai_vs_real_image_detection
 * Accuracy: 98.2%
 *
 * Note: Model trained ~2 years ago. Creator notes significant concept drift
 * due to advances in AI generation. Consider lowering confidence thresholds
 * or retraining with modern datasets for production use.
 *
 * Uses direct ONNX Runtime with shared preprocessing.
 */

import { createSession } from '../core/ort-runtime.js';
import { preprocessImage, softmax, NORMALIZATION } from '../core/preprocessing.js';

let session = null;
let loadingPromise = null;

export const MODEL_ID = 'dima806_ai_real';
export const HF_MODEL = 'dima806/ai_vs_real_image_detection';
export const DISPLAY_NAME = 'Dima806 AI vs Real';
export const ACCURACY = '98.2%';

const MODEL_URL = '/models/dima806_ai_real/onnx/model.onnx';

export async function load(options = {}) {
  if (session) return session;
  if (loadingPromise) return loadingPromise;

  console.log(`[${MODEL_ID}] Loading model from: ${MODEL_URL}`);
  loadingPromise = createSession(MODEL_URL, options.onProgress)
    .then(s => { session = s; return s; })
    .finally(() => { loadingPromise = null; });

  return loadingPromise;
}

/**
 * Run inference on an image
 * @param {string|HTMLImageElement|HTMLCanvasElement|Blob} imageSource - Image to analyze
 * @returns {Promise<Object>} Prediction results
 */
export async function predict(imageSource) {
  if (!session) await load();

  // ViT uses ImageNet normalization
  const tensor = await preprocessImage(imageSource, {
    size: 224,
    normalization: NORMALIZATION.IMAGENET
  });

  const feeds = { pixel_values: tensor };
  const results = await session.run(feeds);

  // Get logits from results
  const logits = results.logits?.data ?? Object.values(results)[0].data;
  const probs = softmax(Array.from(logits));

  // Label order from config.json: {"0": "REAL", "1": "FAKE"}
  // probs[0] = REAL probability, probs[1] = FAKE/AI probability
  const aiProbability = probs[1];

  // Calculate confidence as distance from decision boundary (0.5)
  const confidence = Math.abs(aiProbability - 0.5) * 2;

  return {
    modelId: MODEL_ID,
    displayName: DISPLAY_NAME,
    aiProbability: Math.round(aiProbability * 1000) / 10, // Percentage with 1 decimal
    rawScore: aiProbability,
    verdict: aiProbability >= 0.5 ? 'AI' : 'REAL',
    confidence: Math.round(confidence * 1000) / 10, // Percentage with 1 decimal
    detectedLabel: aiProbability >= 0.5 ? 'FAKE' : 'REAL',
    rawResults: probs,

    // Warning about model age and concept drift
    warning: 'Model trained ~2 years ago. May underperform on modern AI-generated images.'
  };
}

/**
 * Unload the model from memory
 */
export function unload() {
  if (session) {
    session.release();
    session = null;
  }
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
    architecture: 'ViT (google/vit-base-patch16-224-in21k) - Direct ONNX Runtime',
    inputSize: 224,
    parameterCount: '85.8M',
    trainingDataset: 'CIFAKE',
    limitations: [
      'Trained ~2 years ago',
      'Concept drift from modern AI generation techniques',
      'Creator recommends retraining with current datasets',
      'Consider lowering confidence thresholds (0.5 -> 0.1)'
    ]
  };
}
