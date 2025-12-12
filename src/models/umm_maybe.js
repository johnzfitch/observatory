/**
 * umm_maybe - AI Image Detector (ViT)
 * HuggingFace: umm-maybe/AI-image-detector
 * Accuracy: 94.2% (Precision: 0.938, Recall: 0.978)
 *
 * Note: Designed for artistic images, NOT deepfake photos. Pre-MJ5/SDXL training.
 * Training data from October 2022 excludes Midjourney 5, SDXL, and DALLE-3.
 * Optimized for detecting AI-generated art (VQGAN+CLIP, older models).
 */

import { configureTransformersEnv } from '../config/paths.js';

let classifier = null;
let isLoading = false;

export const MODEL_ID = 'umm_maybe';
export const HF_MODEL = 'umm-maybe/AI-image-detector';
export const DISPLAY_NAME = 'Umm-Maybe AI Detector';
export const ACCURACY = '94.2%';

/**
 * Load the model from local ONNX or HuggingFace
 * @param {Object} options - Loading options
 * @param {string} options.device - Device to use ('webgpu', 'wasm', or 'cpu')
 * @param {boolean} options.useRemote - Use HuggingFace instead of local ONNX
 * @param {Function} options.onProgress - Progress callback
 * @returns {Promise<Object>} The loaded classifier
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
    const modelPath = options.useRemote ? HF_MODEL : MODEL_ID;

    classifier = await pipeline('image-classification', modelPath, {
      device: options.device || 'webgpu',
      progress_callback: options.onProgress,
      local_files_only: !options.useRemote
    });

    return classifier;
  } finally {
    isLoading = false;
  }
}

/**
 * Run inference on an image
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
  // Labels from Python code: "artificial", "ai", "fake" vs "human", "real"
  // The model.config.id2label should match these patterns
  let aiProbability = 0;
  let detectedLabel = null;

  for (const r of results) {
    const label = r.label.toLowerCase();
    if (label.includes('artificial') || label.includes('ai') || label.includes('fake') || label.includes('generated')) {
      aiProbability = r.score;
      detectedLabel = r.label;
      break;
    }
    if (label.includes('human') || label.includes('real') || label.includes('authentic')) {
      aiProbability = 1 - r.score;
      detectedLabel = r.label;
      break;
    }
  }

  // Calculate confidence as distance from decision boundary (0.5)
  const confidence = Math.abs(aiProbability - 0.5) * 2;

  return {
    modelId: MODEL_ID,
    displayName: DISPLAY_NAME,
    aiProbability: Math.round(aiProbability * 1000) / 10, // Percentage with 1 decimal
    rawScore: aiProbability,
    verdict: aiProbability >= 0.5 ? 'AI' : 'REAL',
    confidence: Math.round(confidence * 1000) / 10, // Percentage with 1 decimal
    detectedLabel,
    rawResults: results,

    // Warning about scope and limitations
    warning: 'Optimized for artistic images. Not designed for deepfake photo detection. Pre-MJ5/SDXL training data.'
  };
}

/**
 * Unload the model from memory
 */
export function unload() {
  classifier = null;
}

/**
 * Check if model is currently loaded
 * @returns {boolean} True if loaded
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
    accuracy: ACCURACY,
    architecture: 'ViT (Vision Transformer)',
    precision: '0.938',
    recall: '0.978',
    inputSize: 224,
    category: 'digital_art',
    trainingDate: 'October 2022',
    limitations: [
      'Intended scope: artistic images only',
      'NOT a deepfake photo detector',
      'Training excludes Midjourney 5, SDXL, DALLE-3',
      'General computer imagery (webcams, screenshots) may confuse it',
      'Trained on older models (VQGAN+CLIP era)',
      'Images scoring 90%+ should be reviewed by human expert'
    ]
  };
}
