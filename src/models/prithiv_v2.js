/**
 * prithiv_v2 - Deep Fake Detector v2 (ViT)
 *
 * HuggingFace: prithivMLmods/Deep-Fake-Detector-v2-Model
 * ONNX Version: prithivMLmods/Deep-Fake-Detector-v2-Model-ONNX
 * Architecture: ViT-Base (google/vit-base-patch16-224-in21k)
 * Accuracy: 92.1%
 * Precision/Recall: Realism P=0.968 R=0.871, Deepfake P=0.883 R=0.972
 * Labels: "Realism" (real/human) vs "Deepfake" (AI/fake)
 *
 * Uses direct ONNX Runtime for optimal performance.
 */

import { createSession } from '../core/ort-runtime.js';
import { preprocessImage, softmax, NORMALIZATION } from '../core/preprocessing.js';

let session = null;
let lastLoadOptions = {};

export const MODEL_ID = 'prithiv_v2';
export const HF_MODEL = 'prithivMLmods/Deep-Fake-Detector-v2-Model';
export const HF_MODEL_ONNX = 'prithivMLmods/Deep-Fake-Detector-v2-Model-ONNX';
export const DISPLAY_NAME = 'Prithiv Deepfake v2';
export const ACCURACY = '92.1%';
export const CATEGORY = 'digital_art';

const MODEL_URL = '/models/prithiv_v2/onnx/model.onnx';

// Label mapping from config.json: {"0": "Realism", "1": "Deepfake"}
const LABELS = {
  0: 'Realism',
  1: 'Deepfake'
};

/**
 * Load the model using ONNX Runtime directly
 * @param {Object} options - Loading options
 * @param {Function} options.onProgress - Progress callback
 * @returns {Promise<Object>} The loaded session
 */
export async function load(options = {}) {
  if (session) return session;

  lastLoadOptions = options;

  console.log(`[${MODEL_ID}] Loading model from: ${MODEL_URL}`);

  session = await createSession(MODEL_URL, options.onProgress);

  return session;
}

/**
 * Predict whether an image is AI-generated or real
 * @param {string|HTMLImageElement|HTMLCanvasElement|Blob} imageSource - Image to analyze
 * @returns {Promise<Object>} Prediction results
 */
export async function predict(imageSource) {
  if (!session) await load(lastLoadOptions);

  // Preprocess image with ImageNet normalization (standard for ViT models)
  const tensor = await preprocessImage(imageSource, {
    size: 224,
    normalization: NORMALIZATION.IMAGENET
  });

  const feeds = { pixel_values: tensor };
  const results = await session.run(feeds);

  // Get logits from results
  const logits = results.logits?.data ?? Object.values(results)[0].data;
  const probs = softmax(Array.from(logits));

  // Label order from config.json: {"0": "Realism", "1": "Deepfake"}
  // probs[0] = Realism (real) probability, probs[1] = Deepfake (AI) probability
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
    detectedLabel: aiProbability >= 0.5 ? LABELS[1] : LABELS[0],
    rawResults: probs
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
 * @returns {boolean} True if model is loaded
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
    hfModelOnnx: HF_MODEL_ONNX,
    accuracy: ACCURACY,
    category: CATEGORY,
    architecture: 'ViT-Base (google/vit-base-patch16-224-in21k)',
    inputSize: 224,
    parameterCount: '85.8M',
    labels: LABELS,
    performance: {
      accuracy: '92.1%',
      realismPrecision: '96.8%',
      realismRecall: '87.1%',
      deepfakePrecision: '88.3%',
      deepfakeRecall: '97.2%'
    },
    strengths: [
      'High recall for deepfake detection (97.2%)',
      'Well-balanced precision/recall',
      'Standard ViT architecture',
      'Direct ONNX Runtime for optimal performance'
    ],
    limitations: [
      'Lower overall accuracy compared to newer models',
      'May struggle with subtle manipulations',
      'Binary classification only (Realism vs Deepfake)'
    ]
  };
}
