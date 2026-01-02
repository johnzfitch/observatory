/**
 * hamzenium - ViT Deepfake Classifier
 * HuggingFace: Hamzenium/ViT-Deepfake-Classifier
 * Accuracy: 96.56%
 *
 * Vision Transformer (ViT) fine-tuned on OpenForensics dataset.
 * Designed for real vs fake (deepfake) detection.
 * Trained on 16,000 images with 96.56% test accuracy.
 *
 * Uses direct ONNX Runtime for inference.
 */

import { createSession, createTensor } from '../core/ort-runtime.js';
import { preprocessImage, softmax, NORMALIZATION } from '../core/preprocessing.js';

let session = null;
let isLoading = false;

export const MODEL_ID = 'hamzenium';
export const HF_MODEL = 'Hamzenium/ViT-Deepfake-Classifier';
export const DISPLAY_NAME = 'Hamzenium ViT Deepfake';
export const ACCURACY = '96.56%';

const MODEL_URL = '/models/hamzenium/onnx/model.onnx';

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
    console.log(`[${MODEL_ID}] Model loaded successfully`);
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

  // Preprocess image with ImageNet normalization (standard for ViT)
  const tensor = await preprocessImage(imageSource, {
    size: 224,
    normalization: NORMALIZATION.IMAGENET
  });

  // Run inference
  const feeds = { pixel_values: tensor };
  const results = await session.run(feeds);

  // Get logits from results
  const logits = results.logits?.data ?? Object.values(results)[0].data;
  const probs = softmax(Array.from(logits));

  // Label order from config.json: {"0": "real", "1": "fake"}
  // probs[0] = real probability, probs[1] = fake/AI probability
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
    detectedLabel: aiProbability >= 0.5 ? 'fake' : 'real',
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
    architecture: 'ViT (google/vit-base-patch16-224-in21k, Direct ONNX Runtime)',
    inputSize: 224,
    parameterCount: '85.8M',
    trainingDataset: 'OpenForensics (16,000 training, 2,000 validation, 2,000 test)',
    performance: {
      validationAccuracy: '96.22%',
      testAccuracy: '96.56%',
      f1: '96.22%',
      precision: '96.30%',
      recall: '96.22%'
    },
    trainingDetails: {
      batchSize: 24,
      epochs: 10,
      learningRate: '3e-5',
      optimizer: 'AdamW',
      duration: '~14 minutes (Tesla T4)'
    },
    strengths: [
      'High accuracy and precision',
      'Balanced precision/recall',
      'MIT license (fully open)',
      'Trained on OpenForensics dataset'
    ],
    limitations: [
      'Dataset bias - limited to OpenForensics',
      'May not detect all deepfake techniques',
      'Performance degrades on unseen manipulation methods',
      'Not tested against adversarial attacks',
      'Requires human oversight for high-stakes decisions'
    ]
  };
}
