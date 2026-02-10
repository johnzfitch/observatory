/**
 * ela.js - Error Level Analysis for AI-generated image detection
 *
 * Recompresses the image at a known quality level, then computes per-pixel
 * differences to reveal editing artifacts and compression inconsistencies.
 *
 * AI-generated images tend to show uniform low error (never been through
 * lossy compression). Real photos show natural variance. Edited regions
 * show high error at boundaries.
 *
 * @module forensics/ela
 */

const ELA_QUALITY = 0.95;
const ELA_AMPLIFICATION = 15;

/**
 * Run Error Level Analysis on an image
 * @param {Blob} imageBlob - Source image
 * @returns {Promise<{heatmapImageData: ImageData, stats: Object, interpretation: string}>}
 */
export async function runELA(imageBlob) {
  // Decode original image
  const originalBmp = await createImageBitmap(imageBlob);
  const width = originalBmp.width;
  const height = originalBmp.height;

  // Draw original to canvas to get pixel data
  const origCanvas = new OffscreenCanvas(width, height);
  const origCtx = origCanvas.getContext('2d');
  origCtx.drawImage(originalBmp, 0, 0);
  const origPixels = origCtx.getImageData(0, 0, width, height);
  originalBmp.close();

  // Recompress as JPEG
  const recompressedBlob = await origCanvas.convertToBlob({
    type: 'image/jpeg',
    quality: ELA_QUALITY,
  });

  // Decode recompressed
  const recompBmp = await createImageBitmap(recompressedBlob);
  const recompCanvas = new OffscreenCanvas(width, height);
  const recompCtx = recompCanvas.getContext('2d');
  recompCtx.drawImage(recompBmp, 0, 0);
  const recompPixels = recompCtx.getImageData(0, 0, width, height);
  recompBmp.close();

  // Compute per-pixel difference, amplified
  const pixelCount = width * height;
  const heatmapData = new ImageData(width, height);
  const errors = new Float32Array(pixelCount);

  for (let i = 0; i < pixelCount; i++) {
    const idx = i * 4;
    const dr = Math.abs(origPixels.data[idx] - recompPixels.data[idx]);
    const dg = Math.abs(origPixels.data[idx + 1] - recompPixels.data[idx + 1]);
    const db = Math.abs(origPixels.data[idx + 2] - recompPixels.data[idx + 2]);

    // Average error for this pixel
    const error = (dr + dg + db) / 3;
    errors[i] = error;

    // Amplified difference for heatmap (clamped to 255)
    const amplified = Math.min(error * ELA_AMPLIFICATION, 255);

    // Color map: low error = dark blue, medium = yellow, high = red/white
    const t = amplified / 255;
    if (t < 0.33) {
      heatmapData.data[idx] = 0;
      heatmapData.data[idx + 1] = Math.round(t * 3 * 100);
      heatmapData.data[idx + 2] = Math.round(t * 3 * 255);
    } else if (t < 0.66) {
      const t2 = (t - 0.33) * 3;
      heatmapData.data[idx] = Math.round(t2 * 255);
      heatmapData.data[idx + 1] = Math.round(200 + t2 * 55);
      heatmapData.data[idx + 2] = Math.round(255 * (1 - t2));
    } else {
      const t3 = (t - 0.66) * 3;
      heatmapData.data[idx] = 255;
      heatmapData.data[idx + 1] = Math.round(255 * (1 - t3 * 0.7));
      heatmapData.data[idx + 2] = Math.round(t3 * 200);
    }
    heatmapData.data[idx + 3] = 255;
  }

  // Compute statistics
  const stats = computeStats(errors, pixelCount, width, height);
  const interpretation = interpretELA(stats);

  return { heatmapImageData: heatmapData, width, height, stats, interpretation };
}

// ============================================================================
// Statistics
// ============================================================================

function computeStats(errors, pixelCount, width, height) {
  // Mean
  let sum = 0;
  for (let i = 0; i < pixelCount; i++) sum += errors[i];
  const mean = sum / pixelCount;

  // Standard deviation
  let varianceSum = 0;
  for (let i = 0; i < pixelCount; i++) {
    const diff = errors[i] - mean;
    varianceSum += diff * diff;
  }
  const stdDev = Math.sqrt(varianceSum / pixelCount);

  // Min/Max
  let min = Infinity, max = -Infinity;
  for (let i = 0; i < pixelCount; i++) {
    if (errors[i] < min) min = errors[i];
    if (errors[i] > max) max = errors[i];
  }

  // Entropy (Shannon entropy of error histogram)
  const histBins = 64;
  const histogram = new Float32Array(histBins);
  for (let i = 0; i < pixelCount; i++) {
    const bin = Math.min(Math.floor(errors[i] / (max + 0.001) * histBins), histBins - 1);
    histogram[bin]++;
  }
  let entropy = 0;
  for (let i = 0; i < histBins; i++) {
    const p = histogram[i] / pixelCount;
    if (p > 0) entropy -= p * Math.log2(p);
  }

  // Spatial uniformity: compare error variance in quadrants
  const quadrantMeans = getQuadrantMeans(errors, width, height);
  const qMean = quadrantMeans.reduce((a, b) => a + b, 0) / 4;
  let qVar = 0;
  for (const q of quadrantMeans) qVar += (q - qMean) ** 2;
  const spatialUniformity = 1 - Math.min(Math.sqrt(qVar / 4) / (mean + 0.001), 1);

  return {
    mean: parseFloat(mean.toFixed(2)),
    stdDev: parseFloat(stdDev.toFixed(2)),
    min: parseFloat(min.toFixed(2)),
    max: parseFloat(max.toFixed(2)),
    entropy: parseFloat(entropy.toFixed(3)),
    spatialUniformity: parseFloat(spatialUniformity.toFixed(3)),
    coefficientOfVariation: mean > 0 ? parseFloat((stdDev / mean).toFixed(3)) : 0,
  };
}

function getQuadrantMeans(errors, width, height) {
  const midX = Math.floor(width / 2);
  const midY = Math.floor(height / 2);
  const quads = [0, 0, 0, 0];
  const counts = [0, 0, 0, 0];

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      const q = (y < midY ? 0 : 2) + (x < midX ? 0 : 1);
      quads[q] += errors[idx];
      counts[q]++;
    }
  }

  return quads.map((sum, i) => counts[i] > 0 ? sum / counts[i] : 0);
}

// ============================================================================
// Interpretation
// ============================================================================

function interpretELA(stats) {
  const signals = [];

  // Low mean error + high uniformity = likely AI or pristine PNG
  if (stats.mean < 2 && stats.spatialUniformity > 0.85) {
    signals.push('Uniform low error across the image - consistent with AI generation or uncompressed source');
  }

  // High mean error + natural variance = real photo (previously JPEG compressed)
  if (stats.mean > 4 && stats.coefficientOfVariation > 0.5 && stats.coefficientOfVariation < 2.0) {
    signals.push('Natural error variance pattern - consistent with authentic photography');
  }

  // Very high local variance = edited regions
  if (stats.spatialUniformity < 0.6 && stats.stdDev > 3) {
    signals.push('Inconsistent error levels across regions - may indicate splicing or heavy editing');
  }

  // High entropy = diverse error distribution
  if (stats.entropy > 4.5) {
    signals.push('High error entropy - complex compression history');
  } else if (stats.entropy < 2.0) {
    signals.push('Low error entropy - minimal compression artifacts');
  }

  if (signals.length === 0) {
    signals.push('Error distribution does not show strong indicators in either direction');
  }

  return signals.join('. ') + '.';
}
