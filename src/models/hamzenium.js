/**
 * hamzenium - ViT Deepfake Classifier
 * HuggingFace: Hamzenium/ViT-Deepfake-Classifier
 * Accuracy: 96.56%
 *
 * Vision Transformer (ViT) fine-tuned on OpenForensics dataset.
 * Designed for real vs fake (deepfake) detection.
 * Trained on 16,000 images with 96.56% test accuracy.
 */

import { configureTransformersEnv } from '../config/paths.js';

let classifier = null;
let isLoading = false;

export const MODEL_ID = 'hamzenium';
export const HF_MODEL = 'Hamzenium/ViT-Deepfake-Classifier';
export const DISPLAY_NAME = 'Hamzenium ViT Deepfake';
export const ACCURACY = '96.56%';

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
  // Labels: 0="real", 1="fake"
  // Look for "fake", "deepfake" vs "real", "realism"
  let aiProbability = 0;
  let detectedLabel = null;

  for (const r of results) {
    const label = r.label.toLowerCase();
    if (label.includes('fake') || label.includes('deepfake') || label.includes('ai') || label.includes('artificial')) {
      aiProbability = r.score;
      detectedLabel = r.label;
      break;
    }
    if (label.includes('real') || label.includes('realism') || label.includes('human')) {
      aiProbability = 1 - r.score;
      detectedLabel = r.label;
      break;
    }
  }

  // Fallback: if labels are numeric like "0"/"1"
  // Based on config.json: 0=real, 1=fake
  if (aiProbability === 0 && results.length >= 2) {
    const firstLabel = results[0].label.toLowerCase();
    if (firstLabel === '0' || firstLabel === 'real') {
      aiProbability = 1 - results[0].score;
      detectedLabel = results[0].label;
    } else if (firstLabel === '1' || firstLabel === 'fake') {
      aiProbability = results[0].score;
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
    accuracy: ACCURACY,
    architecture: 'ViT (google/vit-base-patch16-224-in21k)',
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
