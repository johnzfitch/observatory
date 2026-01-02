/**
 * ateeqq - AI vs Human Image Detector (SigLIP)
 * HuggingFace: Ateeqq/ai-vs-human-image-detector
 * Accuracy: 99.23%
 */

import { createSession } from '../core/ort-runtime.js';
import { preprocessImage, softmax, NORMALIZATION } from '../core/preprocessing.js';

let session = null;
let loadingPromise = null;

export const MODEL_ID = 'ateeqq';
export const HF_MODEL = 'Ateeqq/ai-vs-human-image-detector';
export const DISPLAY_NAME = 'Ateeqq AI vs Human';
export const ACCURACY = '99.23%';

// SigLIP uses different normalization than ImageNet
const SIGLIP_NORM = NORMALIZATION.SIGLIP;

const MODEL_URL = '/models/ateeqq/onnx/model.onnx';

export async function load(options = {}) {
  if (session) return session;
  if (loadingPromise) return loadingPromise;

  console.log(`[${MODEL_ID}] Loading model from: ${MODEL_URL}`);
  loadingPromise = createSession(MODEL_URL, options.onProgress)
    .then(s => { session = s; return s; })
    .finally(() => { loadingPromise = null; });

  return loadingPromise;
}

export async function predict(imageSource) {
  if (!session) await load();

  const tensor = await preprocessImage(imageSource, {
    size: 224,
    normalization: SIGLIP_NORM
  });

  const results = await session.run({ pixel_values: tensor });
  const logits = results.logits?.data ?? Object.values(results)[0].data;
  const probs = softmax(Array.from(logits));

  // Label order: {"0": "ai", "1": "hum"}
  const aiProbability = probs[0];
  const confidence = Math.abs(aiProbability - 0.5) * 2;

  return {
    modelId: MODEL_ID,
    displayName: DISPLAY_NAME,
    aiProbability: Math.round(aiProbability * 1000) / 10,
    rawScore: aiProbability,
    verdict: aiProbability >= 0.5 ? 'AI' : 'REAL',
    confidence: Math.round(confidence * 1000) / 10,
    detectedLabel: aiProbability >= 0.5 ? 'ai' : 'hum',
    rawResults: probs
  };
}

export function unload() {
  if (session) {
    session.release();
    session = null;
  }
}
export function isLoaded() { return session !== null; }

export function getInfo() {
  return {
    modelId: MODEL_ID,
    displayName: DISPLAY_NAME,
    accuracy: ACCURACY,
    architecture: 'SigLIP',
    inputSize: 224,
    trainedOn: ['Midjourney v6.1', 'Flux 1.1 Pro', 'SD 3.5', 'GPT-4o']
  };
}
