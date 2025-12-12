/**
 * smogy - SMOGY AI Images Detector (Swin Transformer)
 * HuggingFace: Smogy/SMOGY-Ai-images-detector
 * ONNX Version: amrita-detectly/detect-ai-image-v1
 * Accuracy: 98.2%
 *
 * Swin Transformer fine-tuned for 2024 AI image detection.
 * Improved performance on newer generative models (DALL-E, Imagen, etc.)
 */

import { configureTransformersEnv } from '../config/paths.js';

let classifier = null;
let isLoading = false;

export const MODEL_ID = 'smogy';
export const HF_MODEL = 'Smogy/SMOGY-Ai-images-detector';
export const HF_MODEL_ONNX = 'amrita-detectly/detect-ai-image-v1';
export const DISPLAY_NAME = 'SMOGY AI Detector';
export const ACCURACY = '98.2%';

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
  // Labels: 0="artificial", 1="human" (note: reversed from typical!)
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
