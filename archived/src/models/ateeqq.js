/**
 * ateeqq - AI vs Human Image Detector (SigLIP)
 *
 * Model: Ateeqq/ai-vs-human-image-detector
 * Architecture: SigLIP (google/siglip-base-patch16-224)
 * Accuracy: 99.23%
 *
 * Training Dataset:
 * - 120,000 images (60k AI + 60k human)
 * - Modern generators: Flux 1.1 Pro, Midjourney v6.1, SD 3.5, GPT-4o
 * - 5 epochs, 0.0799 training loss
 *
 * Labels: "ai", "hum" (human)
 */

// Transformers.js will be loaded from CDN dynamically
import { configureTransformersEnv } from '../config/paths.js';

let classifier = null;
let isLoading = false;

export const MODEL_ID = 'ateeqq';
export const DISPLAY_NAME = 'Ateeqq (Flux/MJ v6/SD3.5)';
export const ACCURACY = '99.23%';
export const ARCHITECTURE = 'SigLIP';

/**
 * Load the model from local ONNX files
 * @param {Object} options - Loading options
 * @param {string} options.device - Device to use ('webgpu', 'wasm', or 'cpu')
 * @param {Function} options.onProgress - Progress callback
 * @returns {Promise} Classifier pipeline
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

    // Configure Transformers.js to use local models
    configureTransformersEnv(env);

    classifier = await pipeline('image-classification', MODEL_ID, {
      device: options.device || 'webgpu',
      progress_callback: options.onProgress
    });

    console.log(`[ateeqq] Model loaded on ${options.device || 'webgpu'}`);
    return classifier;
  } finally {
    isLoading = false;
  }
}

/**
 * Run inference on an image
 * @param {string|HTMLImageElement|HTMLCanvasElement} imageSource - Image to analyze
 * @returns {Promise<Object>} Detection result
 */
export async function predict(imageSource) {
  if (!classifier) await load();

  // Run inference
  const results = await classifier(imageSource);

  // Extract AI probability from results
  // Labels: "ai" and "hum" (human)
  let aiProbability = 0;

  for (const result of results) {
    const label = result.label.toLowerCase();

    // Check for AI label
    if (label === 'ai' || label.includes('ai')) {
      aiProbability = result.score;
      break;
    }

    // Check for human label (invert probability)
    if (label === 'hum' || label === 'human' || label.includes('human')) {
      aiProbability = 1 - result.score;
      break;
    }
  }

  // Calculate confidence (distance from 0.5 threshold, scaled to 0-1)
  const confidence = Math.abs(aiProbability - 0.5) * 2;

  return {
    modelId: MODEL_ID,
    displayName: DISPLAY_NAME,
    architecture: ARCHITECTURE,
    accuracy: ACCURACY,

    // Core prediction
    aiProbability: Math.round(aiProbability * 1000) / 10, // Percentage with 1 decimal
    rawScore: aiProbability,
    verdict: aiProbability >= 0.5 ? 'AI' : 'REAL',
    confidence: Math.round(confidence * 1000) / 10, // Percentage with 1 decimal

    // Debug info
    rawResults: results,
    timestamp: new Date().toISOString()
  };
}

/**
 * Unload the model to free memory
 */
export function unload() {
  if (classifier) {
    classifier = null;
    console.log('[ateeqq] Model unloaded');
  }
}

/**
 * Check if model is currently loaded
 * @returns {boolean}
 */
export function isLoaded() {
  return classifier !== null;
}

/**
 * Get model metadata
 * @returns {Object}
 */
export function getMetadata() {
  return {
    modelId: MODEL_ID,
    displayName: DISPLAY_NAME,
    architecture: ARCHITECTURE,
    accuracy: ACCURACY,
    trainingDetails: {
      images: 120000,
      aiImages: 60000,
      humanImages: 60000,
      epochs: 5,
      trainingLoss: 0.0799
    },
    generators: [
      'Flux 1.1 Pro',
      'Midjourney v6.1',
      'Stable Diffusion 3.5',
      'GPT-4o'
    ],
    labels: ['ai', 'hum']
  };
}
