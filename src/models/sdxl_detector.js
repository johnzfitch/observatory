/**
 * sdxl_detector - SDXL Image Detector (Swin Transformer)
 * HuggingFace: Organika/sdxl-detector
 * Accuracy: 98.13%
 *
 * Swin Transformer fine-tuned from umm-maybe AI art detector.
 * Optimized for SDXL-generated images and non-artistic imagery.
 * NOTE: Performance degrades on non-SDXL diffusion models (Midjourney, older Stable Diffusion).
 */

import { configureTransformersEnv } from '../config/paths.js';

let classifier = null;
let isLoading = false;

export const MODEL_ID = 'sdxl_detector';
export const HF_MODEL = 'Organika/sdxl-detector';
export const DISPLAY_NAME = 'SDXL Detector';
export const ACCURACY = '98.13%';

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
    const { pipeline, env } = await import('https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1');

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
  // Labels: 0="artificial", 1="human" (same as smogy/umm_maybe)
  // Look for "artificial", "ai", "fake" vs "human", "real"
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

  // Fallback: if labels are numeric like "0"/"1"
  // Based on config.json: 0=artificial, 1=human
  if (aiProbability === 0 && results.length >= 2) {
    const firstLabel = results[0].label.toLowerCase();
    if (firstLabel === '0' || firstLabel === 'artificial') {
      aiProbability = results[0].score;
      detectedLabel = results[0].label;
    } else if (firstLabel === '1' || firstLabel === 'human') {
      aiProbability = 1 - results[0].score;
      detectedLabel = results[0].label;
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
    warning: 'Optimized for SDXL-generated images. Performance may degrade on other diffusion models.'
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
