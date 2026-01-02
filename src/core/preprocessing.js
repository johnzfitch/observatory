/**
 * Shared Image Preprocessing - Reusable across all models
 * Processes image once, creates tensors for each model's normalization
 */

import { createTensor } from './ort-runtime.js';

// Standard normalization presets
export const NORMALIZATION = {
  // ImageNet standard (most ViT models)
  IMAGENET: {
    mean: [0.485, 0.456, 0.406],
    std: [0.229, 0.224, 0.225]
  },
  // SigLIP normalization (Ateeqq model)
  SIGLIP: {
    mean: [0.5, 0.5, 0.5],
    std: [0.5, 0.5, 0.5]
  },
  // No normalization (raw 0-1)
  NONE: {
    mean: [0, 0, 0],
    std: [1, 1, 1]
  }
};

/**
 * Load image from various sources into ImageBitmap
 * @param {string|Blob|HTMLImageElement|ImageBitmap} source
 * @returns {Promise<ImageBitmap>}
 */
export async function loadImage(source) {
  if (source instanceof ImageBitmap) return source;
  if (source instanceof HTMLImageElement) {
    return createImageBitmap(source);
  }
  if (source instanceof Blob) {
    return createImageBitmap(source);
  }
  if (typeof source === 'string') {
    const response = await fetch(source);
    const blob = await response.blob();
    return createImageBitmap(blob);
  }
  throw new Error('Unsupported image source type');
}

/**
 * Preprocess image to ONNX tensor
 * @param {ImageBitmap|HTMLImageElement|Blob|string} imageSource
 * @param {Object} options
 * @param {number} options.size - Target size (default 224)
 * @param {Object} options.normalization - {mean, std} arrays
 * @returns {Promise<Tensor>} NCHW float32 tensor
 */
export async function preprocessImage(imageSource, options = {}) {
  const {
    size = 224,
    normalization = NORMALIZATION.IMAGENET
  } = options;

  const img = await loadImage(imageSource);

  // Resize to target dimensions
  const canvas = new OffscreenCanvas(size, size);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, size, size);

  const imageData = ctx.getImageData(0, 0, size, size);
  const { data } = imageData;

  // Convert RGBA HWC to RGB NCHW with normalization
  const float32Data = new Float32Array(1 * 3 * size * size);
  const { mean, std } = normalization;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const srcIdx = (y * size + x) * 4;
      const pixelIdx = y * size + x;

      // Normalize: (pixel/255 - mean) / std
      const r = (data[srcIdx] / 255 - mean[0]) / std[0];
      const g = (data[srcIdx + 1] / 255 - mean[1]) / std[1];
      const b = (data[srcIdx + 2] / 255 - mean[2]) / std[2];

      float32Data[0 * size * size + pixelIdx] = r;
      float32Data[1 * size * size + pixelIdx] = g;
      float32Data[2 * size * size + pixelIdx] = b;
    }
  }

  return createTensor('float32', float32Data, [1, 3, size, size]);
}

/**
 * Batch preprocess for multiple normalizations
 * Useful when running same image through multiple models
 * @param {ImageBitmap} imageBitmap - Already loaded image
 * @param {Object[]} configs - Array of {normalization, size}
 * @returns {Promise<Map<string, Tensor>>}
 */
export async function batchPreprocess(imageBitmap, configs) {
  const results = new Map();

  for (const config of configs) {
    const key = `${config.size}_${config.normalization.mean.join(',')}`;
    if (!results.has(key)) {
      results.set(key, await preprocessImage(imageBitmap, config));
    }
  }

  return results;
}

/**
 * Softmax function
 * @param {number[]} arr
 * @returns {number[]}
 */
export function softmax(arr) {
  const max = Math.max(...arr);
  const exps = arr.map(x => Math.exp(x - max));
  const sum = exps.reduce((a, b) => a + b);
  return exps.map(x => x / sum);
}
