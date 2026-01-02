/**
 * smogy - SMOGY AI Images Detector (Swin Transformer)
 * HuggingFace: Smogy/SMOGY-Ai-images-detector
 * ONNX Version: amrita-detectly/detect-ai-image-v1
 * Accuracy: 98.2%
 *
 * Swin Transformer fine-tuned for 2024 AI image detection.
 * Improved performance on newer generative models (DALL-E, Imagen, etc.)
 *
 * Uses direct ONNX Runtime for inference.
 */

import { createSession, createTensor } from '../core/ort-runtime.js';
import { preprocessImage, softmax, NORMALIZATION } from '../core/preprocessing.js';

let session = null;
let lastLoadOptions = {};

export const MODEL_ID = 'smogy';
export const HF_MODEL = 'Smogy/SMOGY-Ai-images-detector';
export const HF_MODEL_ONNX = 'amrita-detectly/detect-ai-image-v1';
export const DISPLAY_NAME = 'SMOGY AI Detector';
export const ACCURACY = '98.2%';

const MODEL_URL = '/models/smogy/onnx/model.onnx';

/**
 * Load the model using ONNX Runtime directly
 * @param {Object} options - Loading options
 * @param {Function} options.onProgress - Progress callback
 * @returns {Promise<void>}
 */
export async function load(options = {}) {
  if (session) return session;

  lastLoadOptions = options;

  console.log(`[smogy] Loading model from: ${MODEL_URL}`);

  session = await createSession(MODEL_URL, options.onProgress);

  return session;
}

/**
 * Run inference on an image
 * @param {string|HTMLImageElement|HTMLCanvasElement|Blob} imageSource - Image to analyze
 * @returns {Promise<Object>} Prediction results
 */
export async function predict(imageSource) {
  if (!session) await load(lastLoadOptions);

  // Preprocess with ImageNet normalization (standard for Swin Transformer)
  const tensor = await preprocessImage(imageSource, {
    size: 224,
    normalization: NORMALIZATION.IMAGENET
  });

  const feeds = { pixel_values: tensor };
  const results = await session.run(feeds);

  // Get logits from results
  const logits = results.logits?.data ?? Object.values(results)[0].data;
  const probs = softmax(Array.from(logits));

  // Label order from config.json: {"0": "artificial", "1": "human"}
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
    detectedLabel: aiProbability >= 0.5 ? 'artificial' : 'human',
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
    hfModelONNX: HF_MODEL_ONNX,
    accuracy: ACCURACY,
    architecture: 'Swin Transformer (microsoft/swin-base-patch4-window7-224)',
    inputSize: 224,
    parameterCount: '86.8M',
    trainingDataset: 'Fine-tuned from Organika/sdxl-detector',
    performance: {
      overall: '98.18%',
      dalle: '90.76%',
      imagen: '75.63%'
    },
    notes: [
      'Fine-tuned for 2024 AI generation models',
      'Improved performance on DALL-E, Imagen, and modern generators',
      'ONNX quantized version available for faster inference',
      'Non-commercial use only due to training data licensing'
    ]
  };
}
