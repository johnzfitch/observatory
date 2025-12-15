/**
 * dima806_ai_real - AI vs Real Image Detection (ViT)
 * HuggingFace: dima806/ai_vs_real_image_detection
 * Accuracy: 98.2%
 *
 * Note: Model trained ~2 years ago. Creator notes significant concept drift
 * due to advances in AI generation. Consider lowering confidence thresholds
 * or retraining with modern datasets for production use.
 */

import { configureTransformersEnv } from '../config/paths.js';

let classifier = null;
let isLoading = false;

export const MODEL_ID = 'dima806_ai_real';
export const HF_MODEL = 'dima806/ai_vs_real_image_detection';
export const DISPLAY_NAME = 'Dima806 AI vs Real';
export const ACCURACY = '98.2%';

/**
 * Load the model from local ONNX files
 * @param {Object} options - Loading options
 * @param {string} options.device - Device to use ('webgpu', 'wasm', or 'cpu')
 * @param {Function} options.onProgress - Progress callback
 * @param {boolean} options.useRemote - Fall back to HuggingFace if local fails
 * @returns {Promise<Object>} The loaded classifier
 */
export async function load(options = {}) {
  console.log(`[${MODEL_ID}] [LOAD] load() called with options:`, options);

  if (classifier) {
    console.log(`[${MODEL_ID}]   [OK] Model already loaded, returning cached classifier`);
    return classifier;
  }

  if (isLoading) {
    console.log(`[${MODEL_ID}]   ⏳ Model is currently loading, waiting...`);
    // Wait for existing load to complete
    while (isLoading) await new Promise(r => setTimeout(r, 100));
    console.log(`[${MODEL_ID}]   [OK] Wait complete, returning classifier`);
    return classifier;
  }

  console.log(`[${MODEL_ID}] [START] Starting model load process...`);
  isLoading = true;

  try {
    console.log(`[${MODEL_ID}]   [LOAD] Importing transformers.js from CDN`);
    const { pipeline, env } = await import('https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1');
    console.log(`[${MODEL_ID}]   [OK] Transformers.js imported successfully`);
    console.log(`[${MODEL_ID}]     - pipeline function available:`, !!pipeline);
    console.log(`[${MODEL_ID}]     - env object available:`, !!env);

    // Configure Transformers.js for local model loading
    console.log(`[${MODEL_ID}]   [CONFIG]  Configuring transformers.js environment...`);
    configureTransformersEnv(env);
    console.log(`[${MODEL_ID}]   [OK] Environment configured`);

    // Model ID is just the folder name - Transformers.js prepends localModelPath
    const modelPath = options.useRemote ? HF_MODEL : MODEL_ID;
    const device = options.device || 'webgpu';
    const localFilesOnly = !options.useRemote;

    console.log(`[${MODEL_ID}]   [CONFIG] Pipeline configuration:`);
    console.log(`[${MODEL_ID}]     - task: image-classification`);
    console.log(`[${MODEL_ID}]     - modelPath: ${modelPath}`);
    console.log(`[${MODEL_ID}]     - device: ${device}`);
    console.log(`[${MODEL_ID}]     - local_files_only: ${localFilesOnly}`);

    console.log(`[${MODEL_ID}]   [BUILD] Creating pipeline...`);
    classifier = await pipeline('image-classification', modelPath, {
      device: device,
      progress_callback: options.onProgress,
      local_files_only: localFilesOnly
    });

    console.log(`[${MODEL_ID}]   [SUCCESS] Pipeline created successfully!`);
    console.log(`[${MODEL_ID}]     - classifier type:`, typeof classifier);
    console.log(`[${MODEL_ID}]     - classifier is callable:`, typeof classifier === 'function');

    return classifier;
  } catch (error) {
    console.error(`[${MODEL_ID}]   [ERROR] Model load FAILED:`, error);
    console.error(`[${MODEL_ID}]     - Error name:`, error.name);
    console.error(`[${MODEL_ID}]     - Error message:`, error.message);
    console.error(`[${MODEL_ID}]     - Error stack:`, error.stack);
    throw error;
  } finally {
    isLoading = false;
    console.log(`[${MODEL_ID}]   [END] Load process complete (isLoading = false)`);
  }
}

/**
 * Run inference on an image
 * @param {string|HTMLImageElement|HTMLCanvasElement} imageSource - Image to analyze
 * @returns {Promise<Object>} Prediction results
 */
export async function predict(imageSource) {
  console.log(`[${MODEL_ID}] [RUN] predict() called`);
  console.log(`[${MODEL_ID}]   - imageSource type:`, imageSource.constructor.name);

  if (!classifier) {
    console.log(`[${MODEL_ID}]   [WARN]  Classifier not loaded, loading now...`);
    await load();
  }

  // Convert Blob to data URL if needed (transformers.js CDN version requires this)
  let processedImage = imageSource;
  if (imageSource instanceof Blob) {
    console.log(`[${MODEL_ID}]   🔄 Converting Blob to data URL...`);
    processedImage = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(imageSource);
    });
    console.log(`[${MODEL_ID}]   [OK] Data URL created`);
  }

  console.log(`[${MODEL_ID}]   [EXEC] Running classifier...`);
  const results = await classifier(processedImage);
  console.log(`[${MODEL_ID}]   [OK] Classifier returned results:`, results);

  // Map results to standard format
  // Labels from Python code: "ai", "fake", "generated" vs "real"
  // The model.config.id2label should match these patterns
  let aiProbability = 0;
  let detectedLabel = null;

  for (const r of results) {
    const label = r.label.toLowerCase();
    if (label.includes('ai') || label.includes('fake') || label.includes('generated') || label.includes('artificial')) {
      aiProbability = r.score;
      detectedLabel = r.label;
      break;
    }
    if (label.includes('real') || label.includes('human') || label.includes('authentic')) {
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

    // Warning about model age and concept drift
    warning: 'Model trained ~2 years ago. May underperform on modern AI-generated images.'
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
    trainingDataset: 'CIFAKE',
    limitations: [
      'Trained ~2 years ago',
      'Concept drift from modern AI generation techniques',
      'Creator recommends retraining with current datasets',
      'Consider lowering confidence thresholds (0.5 → 0.1)'
    ]
  };
}
