/**
 * Haywood AI Image Detector (SwinV2)
 *
 * Model: haywoodsloan/ai-image-detector-deploy
 * ONNX Version: LPX55/detection-model-1-ONNX
 * Architecture: SwinV2 (microsoft/swinv2-base-patch4-window12-192-22k)
 * Accuracy: 98.2% (F1: 0.988, AUC: 0.995)
 *
 * Label Mapping:
 *   0: "artificial" (AI-generated)
 *   1: "real" (authentic)
 *
 * Preprocessing:
 *   - Resize: 256x256
 *   - Normalize: ImageNet mean/std
 *   - Mean: [0.485, 0.456, 0.406]
 *   - Std: [0.229, 0.224, 0.225]
 */

import { configureTransformersEnv } from '../config/paths.js';

let classifier = null;
let isLoading = false;

export const MODEL_ID = 'haywood';
export const HF_MODEL = 'haywoodsloan/ai-image-detector-deploy';
export const HF_MODEL_ONNX = 'LPX55/detection-model-1-ONNX';
export const DISPLAY_NAME = 'Haywood SwinV2';
export const ACCURACY = '98.2%';

/**
 * Load the Haywood detector model from local ONNX or HuggingFace
 * @param {Object} options - Loading options
 * @param {string} options.device - Device to use ('webgpu', 'wasm', 'cpu')
 * @param {Function} options.onProgress - Progress callback
 * @param {boolean} options.useRemote - Use HuggingFace instead of local ONNX
 * @returns {Promise<Object>} The loaded classifier pipeline
 */
export async function load(options = {}) {
  if (classifier) return classifier;
  if (isLoading) {
    // Wait for existing load to complete
    while (isLoading) await new Promise(r => setTimeout(r, 100));
    return classifier;
  }

  isLoading = true;
  try {
    const { pipeline, env } = await import('https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.1.2');

    // Configure Transformers.js for local model loading
    configureTransformersEnv(env);

    // Model ID is just the folder name - Transformers.js prepends localModelPath
    const modelPath = options.useRemote ? HF_MODEL_ONNX : MODEL_ID;

    classifier = await pipeline('image-classification', modelPath, {
      device: options.device || 'webgpu',
      progress_callback: options.onProgress,
      local_files_only: !options.useRemote
    });

    return classifier;
  } catch (error) {
    // Fallback to remote if local fails
    if (!options.useRemote) {
      console.warn('Local ONNX failed, trying HuggingFace...');
      return load({ ...options, useRemote: true });
    }
    throw error;
  } finally {
    isLoading = false;
  }
}

/**
 * Predict if an image is AI-generated
 * @param {string|HTMLImageElement|HTMLCanvasElement} imageSource - Image to analyze
 * @returns {Promise<Object>} Prediction results
 */
export async function predict(imageSource) {
  if (!classifier) await load();

  // Convert Blob to data URL if needed (transformers.js CDN version requires this)
  let processedImage = imageSource;
  if (imageSource instanceof Blob) {
    processedImage = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(imageSource);
    });
  }

  const results = await classifier(processedImage);

  // Map results to standard format
  // Label 0 = "artificial", Label 1 = "real"
  let aiProbability = 0;
  let detectedLabel = '';

  for (const r of results) {
    const label = r.label.toLowerCase();

    // Check for AI/artificial/fake/generated labels
    if (label.includes('artificial') || label.includes('ai') || label.includes('fake') || label.includes('generated')) {
      aiProbability = r.score;
      detectedLabel = r.label;
      break;
    }

    // Check for real/human/authentic labels (invert probability)
    if (label.includes('real') || label.includes('human') || label.includes('authentic')) {
      aiProbability = 1 - r.score;
      detectedLabel = r.label;
      break;
    }
  }

  return {
    modelId: MODEL_ID,
    displayName: DISPLAY_NAME,
    aiProbability: Math.round(aiProbability * 1000) / 10, // Percentage with 1 decimal
    rawScore: aiProbability,
    verdict: aiProbability >= 0.5 ? 'AI' : 'REAL',
    confidence: Math.abs(aiProbability - 0.5) * 2, // 0-1 scale
    detectedLabel,
    rawResults: results
  };
}

/**
 * Unload the model from memory
 */
export function unload() {
  classifier = null;
}

/**
 * Check if the model is loaded
 * @returns {boolean} True if model is loaded
 */
export function isLoaded() {
  return classifier !== null;
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
    architecture: 'SwinV2',
    parameters: '0.2B',
    f1Score: 0.988,
    auc: 0.995,
    inputSize: '256x256',
    labels: {
      0: 'artificial',
      1: 'real'
    },
    preprocessing: {
      resize: '256x256',
      normalize: 'ImageNet',
      mean: [0.485, 0.456, 0.406],
      std: [0.229, 0.224, 0.225]
    }
  };
}
