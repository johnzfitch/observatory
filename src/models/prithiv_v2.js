/**
 * prithiv_v2 - Deep Fake Detector v2 (ViT)
 *
 * HuggingFace: prithivMLmods/Deep-Fake-Detector-v2-Model
 * ONNX Version: prithivMLmods/Deep-Fake-Detector-v2-Model-ONNX
 * Architecture: ViT-Base (google/vit-base-patch16-224-in21k)
 * Accuracy: 92.1%
 * Precision/Recall: Realism P=0.968 R=0.871, Deepfake P=0.883 R=0.972
 * Labels: "Realism" (real/human) vs "Deepfake" (AI/fake)
 */

import { configureTransformersEnv } from '../config/paths.js';

let classifier = null;
let isLoading = false;

export const MODEL_ID = 'prithiv_v2';
export const HF_MODEL = 'prithivMLmods/Deep-Fake-Detector-v2-Model';
export const HF_MODEL_ONNX = 'prithivMLmods/Deep-Fake-Detector-v2-Model-ONNX';
export const DISPLAY_NAME = 'Prithiv Deepfake v2';
export const ACCURACY = '92.1%';
export const CATEGORY = 'digital_art';

/**
 * Load the model from local ONNX or HuggingFace Hub
 *
 * @param {Object} options - Loading options
 * @param {boolean} options.useRemote - Use HuggingFace instead of local ONNX
 * @param {string} options.device - Device type ('webgpu' or 'wasm', default: 'webgpu')
 * @param {Function} options.onProgress - Progress callback for downloads
 * @returns {Promise<Object>} Loaded classifier pipeline
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
    const modelPath = options.useRemote ? HF_MODEL_ONNX : MODEL_ID;

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
 * Predict whether an image is AI-generated or real
 *
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

  // prithiv_v2 uses "Realism" (real) vs "Deepfake" (AI) labels
  // We need to extract the AI probability from the results
  let aiProbability = 0;

  for (const r of results) {
    const label = r.label.toLowerCase();

    // Check for AI/fake indicators
    if (label.includes('deepfake') || label.includes('fake') || label.includes('ai')) {
      aiProbability = r.score;
      break;
    }

    // Check for real indicators (invert the score)
    if (label.includes('realism') || label.includes('real') || label.includes('authentic')) {
      aiProbability = 1 - r.score;
      break;
    }
  }

  return {
    modelId: MODEL_ID,
    displayName: DISPLAY_NAME,
    aiProbability: Math.round(aiProbability * 1000) / 10, // Convert to percentage
    rawScore: aiProbability,
    verdict: aiProbability >= 0.5 ? 'AI' : 'REAL',
    confidence: Math.round(Math.abs(aiProbability - 0.5) * 2 * 1000) / 10, // Convert to percentage
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
 * Check if model is currently loaded
 *
 * @returns {boolean} True if model is loaded
 */
export function isLoaded() {
  return classifier !== null;
}
