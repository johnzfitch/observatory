/**
 * watermark.js - Visible watermark scanner for known AI generators
 *
 * Analyzes specific image regions (corners, bottom strip) for high-contrast
 * overlays characteristic of AI generator watermarks.
 *
 * @module forensics/watermark
 */

/**
 * Known watermark pattern registry
 * Each entry defines where to look and how to detect
 */
const WATERMARK_PATTERNS = [
  {
    id: 'gemini',
    generator: 'Google Gemini',
    description: 'Bottom-right "Generated with AI" text',
    regions: [{ anchor: 'bottom-right', width: 220, height: 65 }],
    detect: analyzeTextOverlay,
    minConfidence: 0.55,
  },
  {
    id: 'dalle3_strip',
    generator: 'DALL-E 3',
    description: 'Bottom rainbow gradient strip',
    regions: [{ anchor: 'bottom-strip', height: 20 }],
    detect: analyzeRainbowStrip,
    minConfidence: 0.5,
  },
  {
    id: 'firefly_corner',
    generator: 'Adobe Firefly',
    description: 'CR icon or "Adobe Firefly" text in corners',
    regions: [
      { anchor: 'bottom-right', width: 180, height: 50 },
      { anchor: 'bottom-left', width: 180, height: 50 },
    ],
    detect: analyzeTextOverlay,
    minConfidence: 0.55,
  },
  {
    id: 'generic_corner',
    generator: 'Unknown (watermark detected)',
    description: 'High-contrast text overlay in corner region',
    regions: [
      { anchor: 'bottom-right', width: 200, height: 60 },
      { anchor: 'bottom-left', width: 200, height: 60 },
      { anchor: 'top-right', width: 200, height: 60 },
      { anchor: 'top-left', width: 200, height: 60 },
    ],
    detect: analyzeTextOverlay,
    minConfidence: 0.7, // Higher threshold for generic
  },
];

/**
 * Scan image for visible watermarks
 * @param {Blob} imageBlob - Image as Blob
 * @returns {Promise<{detected: boolean, watermarks: Array}>}
 */
export async function scanWatermarks(imageBlob) {
  const bmp = await createImageBitmap(imageBlob);
  const canvas = new OffscreenCanvas(bmp.width, bmp.height);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(bmp, 0, 0);

  const fullImageData = ctx.getImageData(0, 0, bmp.width, bmp.height);
  const watermarks = [];
  const detectedGenerators = new Set();

  for (const pattern of WATERMARK_PATTERNS) {
    // Skip generic if we already found a specific match
    if (pattern.id === 'generic_corner' && detectedGenerators.size > 0) continue;

    for (const regionDef of pattern.regions) {
      const region = extractRegion(fullImageData, bmp.width, bmp.height, regionDef);
      if (!region) continue;

      const result = pattern.detect(region.data, region.width, region.height);

      if (result.confidence >= pattern.minConfidence) {
        if (!detectedGenerators.has(pattern.generator)) {
          detectedGenerators.add(pattern.generator);
          watermarks.push({
            generator: pattern.generator,
            description: pattern.description,
            confidence: Math.round(result.confidence * 100),
            region: regionDef.anchor,
            details: result.details || '',
          });
        }
        break; // Found in one region, skip remaining regions for this pattern
      }
    }
  }

  bmp.close();

  return {
    detected: watermarks.length > 0,
    watermarks,
  };
}

// ============================================================================
// Region Extraction
// ============================================================================

function extractRegion(imageData, imgWidth, imgHeight, regionDef) {
  let x, y, w, h;

  if (regionDef.anchor === 'bottom-strip') {
    h = Math.min(regionDef.height, imgHeight);
    w = imgWidth;
    x = 0;
    y = imgHeight - h;
  } else {
    w = Math.min(regionDef.width, imgWidth);
    h = Math.min(regionDef.height, imgHeight);

    switch (regionDef.anchor) {
      case 'bottom-right':
        x = imgWidth - w;
        y = imgHeight - h;
        break;
      case 'bottom-left':
        x = 0;
        y = imgHeight - h;
        break;
      case 'top-right':
        x = imgWidth - w;
        y = 0;
        break;
      case 'top-left':
        x = 0;
        y = 0;
        break;
      default:
        return null;
    }
  }

  // Extract pixel data for region
  const data = new Uint8ClampedArray(w * h * 4);
  for (let row = 0; row < h; row++) {
    const srcStart = ((y + row) * imgWidth + x) * 4;
    const dstStart = row * w * 4;
    data.set(imageData.data.subarray(srcStart, srcStart + w * 4), dstStart);
  }

  return { data, width: w, height: h };
}

// ============================================================================
// Detection Algorithms
// ============================================================================

/**
 * Detect high-contrast text overlays in a region
 * Looks for: high edge density, bimodal luminance distribution, sharp transitions
 */
function analyzeTextOverlay(pixels, width, height) {
  const pixelCount = width * height;
  if (pixelCount < 100) return { confidence: 0 };

  // Convert to grayscale
  const gray = new Float32Array(pixelCount);
  for (let i = 0; i < pixelCount; i++) {
    const r = pixels[i * 4];
    const g = pixels[i * 4 + 1];
    const b = pixels[i * 4 + 2];
    gray[i] = 0.299 * r + 0.587 * g + 0.114 * b;
  }

  // 1. Edge density via Sobel-like horizontal/vertical gradients
  let edgeSum = 0;
  let edgeCount = 0;
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = y * width + x;
      const gx = Math.abs(gray[idx + 1] - gray[idx - 1]);
      const gy = Math.abs(gray[idx + width] - gray[idx - width]);
      const magnitude = gx + gy;
      if (magnitude > 30) edgeCount++;
      edgeSum += magnitude;
    }
  }
  const interiorPixels = (width - 2) * (height - 2);
  const edgeDensity = edgeCount / interiorPixels;
  const avgEdgeMag = edgeSum / interiorPixels;

  // 2. Luminance histogram bimodality
  const histogram = new Float32Array(256);
  for (let i = 0; i < pixelCount; i++) {
    histogram[Math.floor(gray[i])]++;
  }
  // Normalize
  for (let i = 0; i < 256; i++) histogram[i] /= pixelCount;

  // Find peaks (simple: split at midpoint, find max in each half)
  let darkPeak = 0, darkPeakVal = 0;
  let lightPeak = 0, lightPeakVal = 0;
  for (let i = 0; i < 128; i++) {
    if (histogram[i] > darkPeakVal) { darkPeakVal = histogram[i]; darkPeak = i; }
  }
  for (let i = 128; i < 256; i++) {
    if (histogram[i] > lightPeakVal) { lightPeakVal = histogram[i]; lightPeak = i; }
  }
  const peakSeparation = (lightPeak - darkPeak) / 255;
  const bimodality = Math.min(darkPeakVal, lightPeakVal) / Math.max(darkPeakVal, lightPeakVal + 0.001);

  // 3. Contrast ratio between extremes
  const sorted = [...gray].sort((a, b) => a - b);
  const p5 = sorted[Math.floor(pixelCount * 0.05)];
  const p95 = sorted[Math.floor(pixelCount * 0.95)];
  const contrastRange = (p95 - p5) / 255;

  // Score: text overlays have moderate-high edges, bimodal luminance, high contrast
  let confidence = 0;

  // Edge density: text regions have 15-50% edge pixels
  if (edgeDensity > 0.1 && edgeDensity < 0.6) {
    confidence += 0.3 * Math.min(edgeDensity / 0.2, 1.0);
  }

  // Bimodal luminance with separated peaks
  if (peakSeparation > 0.3 && bimodality > 0.1) {
    confidence += 0.35 * Math.min(peakSeparation / 0.5, 1.0);
  }

  // High contrast
  if (contrastRange > 0.4) {
    confidence += 0.25 * Math.min(contrastRange / 0.6, 1.0);
  }

  // Average edge magnitude bonus
  if (avgEdgeMag > 15) {
    confidence += 0.1 * Math.min(avgEdgeMag / 40, 1.0);
  }

  return {
    confidence: Math.min(confidence, 1.0),
    details: `edges=${(edgeDensity * 100).toFixed(0)}%, contrast=${(contrastRange * 100).toFixed(0)}%, bimodal=${(bimodality * 100).toFixed(0)}%`,
  };
}

/**
 * Detect rainbow gradient strip (DALL-E 3 style)
 * Looks for: smooth horizontal color transitions across multiple hues
 */
function analyzeRainbowStrip(pixels, width, height) {
  if (width < 100 || height < 5) return { confidence: 0 };

  // Sample middle row of the strip
  const midRow = Math.floor(height / 2);
  const sampleStep = Math.max(1, Math.floor(width / 100));

  // Collect hues along the row
  const hues = [];
  for (let x = 0; x < width; x += sampleStep) {
    const idx = (midRow * width + x) * 4;
    const r = pixels[idx], g = pixels[idx + 1], b = pixels[idx + 2];
    const hue = rgbToHue(r, g, b);
    if (hue >= 0) hues.push(hue);
  }

  if (hues.length < 10) return { confidence: 0 };

  // 1. Hue diversity: how many distinct hue sectors are covered
  const hueSectors = new Set(hues.map(h => Math.floor(h / 60))); // 6 sectors
  const diversity = hueSectors.size / 6;

  // 2. Smoothness: average hue difference between adjacent samples
  let smoothSum = 0;
  for (let i = 1; i < hues.length; i++) {
    let diff = Math.abs(hues[i] - hues[i - 1]);
    if (diff > 180) diff = 360 - diff;
    smoothSum += diff;
  }
  const avgHueDiff = smoothSum / (hues.length - 1);
  // Rainbow should have moderate, consistent hue changes (not random jumps)
  const smoothness = avgHueDiff > 2 && avgHueDiff < 30 ? 1 - (avgHueDiff - 10) / 30 : 0;

  // 3. Saturation consistency (rainbow strips are saturated)
  let satSum = 0;
  for (let x = 0; x < width; x += sampleStep) {
    const idx = (midRow * width + x) * 4;
    const r = pixels[idx], g = pixels[idx + 1], b = pixels[idx + 2];
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    satSum += max > 0 ? (max - min) / max : 0;
  }
  const avgSaturation = satSum / Math.ceil(width / sampleStep);

  let confidence = 0;

  // Need high hue diversity (5+ sectors covered)
  if (diversity >= 0.6) confidence += 0.4 * diversity;

  // Smooth transitions
  if (smoothness > 0) confidence += 0.3 * Math.max(smoothness, 0);

  // Good saturation
  if (avgSaturation > 0.4) confidence += 0.3 * Math.min(avgSaturation, 1.0);

  return {
    confidence: Math.min(confidence, 1.0),
    details: `hues=${hueSectors.size}/6, smoothness=${(smoothness * 100).toFixed(0)}%, saturation=${(avgSaturation * 100).toFixed(0)}%`,
  };
}

// ============================================================================
// Color Utilities
// ============================================================================

function rgbToHue(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;

  if (delta < 0.01) return -1; // achromatic

  let h;
  if (max === r) h = ((g - b) / delta) % 6;
  else if (max === g) h = (b - r) / delta + 2;
  else h = (r - g) / delta + 4;

  h *= 60;
  if (h < 0) h += 360;
  return h;
}
