/**
 * spectrum.js - Frequency spectrum analysis via 2D FFT
 *
 * Computes the 2D Fourier transform of the image to reveal frequency
 * distribution patterns. AI-generated images tend to have flatter
 * spectra (unnatural frequency distribution), while real photos
 * follow a natural 1/f power spectral decay.
 *
 * Self-contained radix-2 Cooley-Tukey FFT implementation.
 *
 * @module forensics/spectrum
 */

const SPECTRUM_SIZE = 256; // Power-of-2 for FFT

/**
 * Run frequency spectrum analysis
 * @param {Blob} imageBlob - Source image
 * @returns {Promise<{spectrumImageData: ImageData, width: number, height: number, features: Object, interpretation: string}>}
 */
export async function analyzeSpectrum(imageBlob) {
  const bmp = await createImageBitmap(imageBlob);

  // Resize to SPECTRUM_SIZE x SPECTRUM_SIZE and convert to grayscale
  const canvas = new OffscreenCanvas(SPECTRUM_SIZE, SPECTRUM_SIZE);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(bmp, 0, 0, SPECTRUM_SIZE, SPECTRUM_SIZE);
  bmp.close();

  const imageData = ctx.getImageData(0, 0, SPECTRUM_SIZE, SPECTRUM_SIZE);
  const gray = new Float64Array(SPECTRUM_SIZE * SPECTRUM_SIZE);

  for (let i = 0; i < gray.length; i++) {
    const idx = i * 4;
    gray[i] = 0.299 * imageData.data[idx] +
              0.587 * imageData.data[idx + 1] +
              0.114 * imageData.data[idx + 2];
  }

  // Apply Hann window to reduce spectral leakage
  applyHannWindow2D(gray, SPECTRUM_SIZE);

  // 2D FFT: transform rows, then columns
  const real = new Float64Array(gray);
  const imag = new Float64Array(gray.length);

  // Row-wise FFT
  for (let y = 0; y < SPECTRUM_SIZE; y++) {
    const offset = y * SPECTRUM_SIZE;
    const rowReal = real.subarray(offset, offset + SPECTRUM_SIZE);
    const rowImag = imag.subarray(offset, offset + SPECTRUM_SIZE);
    fft(rowReal, rowImag);
  }

  // Column-wise FFT (need to extract/insert columns)
  const colReal = new Float64Array(SPECTRUM_SIZE);
  const colImag = new Float64Array(SPECTRUM_SIZE);
  for (let x = 0; x < SPECTRUM_SIZE; x++) {
    for (let y = 0; y < SPECTRUM_SIZE; y++) {
      colReal[y] = real[y * SPECTRUM_SIZE + x];
      colImag[y] = imag[y * SPECTRUM_SIZE + x];
    }
    fft(colReal, colImag);
    for (let y = 0; y < SPECTRUM_SIZE; y++) {
      real[y * SPECTRUM_SIZE + x] = colReal[y];
      imag[y * SPECTRUM_SIZE + x] = colImag[y];
    }
  }

  // Compute log-magnitude spectrum
  const magnitude = new Float64Array(gray.length);
  let maxMag = -Infinity;
  for (let i = 0; i < gray.length; i++) {
    magnitude[i] = Math.log(1 + Math.sqrt(real[i] * real[i] + imag[i] * imag[i]));
    if (magnitude[i] > maxMag) maxMag = magnitude[i];
  }

  // FFT shift (swap quadrants so DC is centered)
  fftShift(magnitude, SPECTRUM_SIZE);

  // Normalize and create visualization
  const spectrumImageData = new ImageData(SPECTRUM_SIZE, SPECTRUM_SIZE);
  for (let i = 0; i < magnitude.length; i++) {
    const v = Math.round((magnitude[i] / maxMag) * 255);
    const idx = i * 4;
    // Cool color map: black → blue → cyan → white
    if (v < 85) {
      spectrumImageData.data[idx] = 0;
      spectrumImageData.data[idx + 1] = 0;
      spectrumImageData.data[idx + 2] = Math.round(v * 3);
    } else if (v < 170) {
      const t = (v - 85) / 85;
      spectrumImageData.data[idx] = 0;
      spectrumImageData.data[idx + 1] = Math.round(t * 255);
      spectrumImageData.data[idx + 2] = 255;
    } else {
      const t = (v - 170) / 85;
      spectrumImageData.data[idx] = Math.round(t * 255);
      spectrumImageData.data[idx + 1] = 255;
      spectrumImageData.data[idx + 2] = 255;
    }
    spectrumImageData.data[idx + 3] = 255;
  }

  // Extract frequency features
  const features = extractFeatures(magnitude, SPECTRUM_SIZE, maxMag);
  const interpretation = interpretSpectrum(features);

  return {
    spectrumImageData,
    width: SPECTRUM_SIZE,
    height: SPECTRUM_SIZE,
    features,
    interpretation,
  };
}

// ============================================================================
// Radix-2 Cooley-Tukey FFT (in-place)
// ============================================================================

function fft(real, imag) {
  const n = real.length;
  if (n <= 1) return;

  // Bit-reversal permutation
  let j = 0;
  for (let i = 0; i < n - 1; i++) {
    if (i < j) {
      [real[i], real[j]] = [real[j], real[i]];
      [imag[i], imag[j]] = [imag[j], imag[i]];
    }
    let k = n >> 1;
    while (k <= j) {
      j -= k;
      k >>= 1;
    }
    j += k;
  }

  // Butterfly computation
  for (let len = 2; len <= n; len <<= 1) {
    const halfLen = len >> 1;
    const angle = -2 * Math.PI / len;
    const wReal = Math.cos(angle);
    const wImag = Math.sin(angle);

    for (let i = 0; i < n; i += len) {
      let curReal = 1;
      let curImag = 0;

      for (let k = 0; k < halfLen; k++) {
        const evenIdx = i + k;
        const oddIdx = i + k + halfLen;

        const tReal = curReal * real[oddIdx] - curImag * imag[oddIdx];
        const tImag = curReal * imag[oddIdx] + curImag * real[oddIdx];

        real[oddIdx] = real[evenIdx] - tReal;
        imag[oddIdx] = imag[evenIdx] - tImag;
        real[evenIdx] += tReal;
        imag[evenIdx] += tImag;

        const newCurReal = curReal * wReal - curImag * wImag;
        curImag = curReal * wImag + curImag * wReal;
        curReal = newCurReal;
      }
    }
  }
}

// ============================================================================
// FFT Utilities
// ============================================================================

function fftShift(data, size) {
  const half = size >> 1;
  const temp = new Float64Array(data.length);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const srcIdx = y * size + x;
      const dstX = (x + half) % size;
      const dstY = (y + half) % size;
      temp[dstY * size + dstX] = data[srcIdx];
    }
  }

  data.set(temp);
}

function applyHannWindow2D(data, size) {
  for (let y = 0; y < size; y++) {
    const wy = 0.5 * (1 - Math.cos(2 * Math.PI * y / (size - 1)));
    for (let x = 0; x < size; x++) {
      const wx = 0.5 * (1 - Math.cos(2 * Math.PI * x / (size - 1)));
      data[y * size + x] *= wx * wy;
    }
  }
}

// ============================================================================
// Feature Extraction
// ============================================================================

function extractFeatures(magnitude, size, maxMag) {
  const center = size >> 1;
  const maxRadius = center;

  // Radial average (for 1/f analysis)
  const radialBins = maxRadius;
  const radialSum = new Float64Array(radialBins);
  const radialCount = new Float64Array(radialBins);

  let totalEnergy = 0;
  let lowFreqEnergy = 0;
  let highFreqEnergy = 0;
  const lowFreqRadius = maxRadius * 0.2;
  const highFreqRadius = maxRadius * 0.6;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x - center;
      const dy = y - center;
      const r = Math.sqrt(dx * dx + dy * dy);
      const bin = Math.floor(r);
      const val = magnitude[y * size + x];

      if (bin < radialBins) {
        radialSum[bin] += val;
        radialCount[bin]++;
      }

      totalEnergy += val;
      if (r < lowFreqRadius) lowFreqEnergy += val;
      if (r > highFreqRadius) highFreqEnergy += val;
    }
  }

  // Radial average
  const radialAvg = new Float64Array(radialBins);
  for (let i = 0; i < radialBins; i++) {
    radialAvg[i] = radialCount[i] > 0 ? radialSum[i] / radialCount[i] : 0;
  }

  // Spectral flatness: geometric mean / arithmetic mean of radial averages
  // Higher = flatter spectrum (more AI-like)
  let logSum = 0;
  let arithSum = 0;
  let validBins = 0;
  for (let i = 1; i < radialBins; i++) { // Skip DC
    if (radialAvg[i] > 0) {
      logSum += Math.log(radialAvg[i]);
      arithSum += radialAvg[i];
      validBins++;
    }
  }
  const spectralFlatness = validBins > 0
    ? Math.exp(logSum / validBins) / (arithSum / validBins)
    : 0;

  // Energy concentration: ratio of low-freq to total energy
  const energyConcentration = totalEnergy > 0 ? lowFreqEnergy / totalEnergy : 0;

  // High-frequency ratio
  const highFreqRatio = totalEnergy > 0 ? highFreqEnergy / totalEnergy : 0;

  // 1/f slope: linear regression of log(radialAvg) vs log(frequency)
  // Real images should have slope ~ -1 to -2
  let sumX = 0, sumY = 0, sumXX = 0, sumXY = 0;
  let slopeN = 0;
  for (let i = 2; i < Math.min(radialBins, maxRadius); i++) {
    if (radialAvg[i] > 0) {
      const logF = Math.log(i);
      const logP = Math.log(radialAvg[i]);
      sumX += logF;
      sumY += logP;
      sumXX += logF * logF;
      sumXY += logF * logP;
      slopeN++;
    }
  }
  const slope = slopeN > 2
    ? (slopeN * sumXY - sumX * sumY) / (slopeN * sumXX - sumX * sumX)
    : 0;

  // Periodic spike detection: count radial bins that are >3 stddev above their neighbors
  let spikeCount = 0;
  for (let i = 3; i < radialBins - 3; i++) {
    const localMean = (radialAvg[i - 2] + radialAvg[i - 1] + radialAvg[i + 1] + radialAvg[i + 2]) / 4;
    const localVar = [i - 2, i - 1, i + 1, i + 2].reduce((s, j) =>
      s + (radialAvg[j] - localMean) ** 2, 0) / 4;
    const localStd = Math.sqrt(localVar);
    if (localStd > 0 && (radialAvg[i] - localMean) / localStd > 3) {
      spikeCount++;
    }
  }

  return {
    spectralFlatness: parseFloat(spectralFlatness.toFixed(4)),
    energyConcentration: parseFloat(energyConcentration.toFixed(4)),
    highFreqRatio: parseFloat(highFreqRatio.toFixed(4)),
    spectralSlope: parseFloat(slope.toFixed(3)),
    periodicSpikes: spikeCount,
  };
}

// ============================================================================
// Interpretation
// ============================================================================

function interpretSpectrum(features) {
  const signals = [];

  // Spectral flatness
  if (features.spectralFlatness > 0.6) {
    signals.push('High spectral flatness (' + features.spectralFlatness.toFixed(2) + ') - unnatural frequency distribution, typical of AI generation');
  } else if (features.spectralFlatness < 0.3) {
    signals.push('Low spectral flatness (' + features.spectralFlatness.toFixed(2) + ') - natural 1/f-like frequency decay, consistent with real photography');
  } else {
    signals.push('Moderate spectral flatness (' + features.spectralFlatness.toFixed(2) + ') - ambiguous frequency distribution');
  }

  // Spectral slope
  if (features.spectralSlope < -1.5) {
    signals.push('Strong frequency decay (slope=' + features.spectralSlope.toFixed(2) + ') - characteristic of natural images');
  } else if (features.spectralSlope > -0.5) {
    signals.push('Weak frequency decay (slope=' + features.spectralSlope.toFixed(2) + ') - flatter than expected for natural images');
  }

  // Energy concentration
  if (features.energyConcentration > 0.5) {
    signals.push('High low-frequency energy concentration (' + (features.energyConcentration * 100).toFixed(0) + '%) - natural content');
  }

  // Periodic spikes
  if (features.periodicSpikes > 3) {
    signals.push(features.periodicSpikes + ' periodic spikes detected - may indicate GAN artifacts or processing patterns');
  }

  if (signals.length === 0) {
    signals.push('Frequency spectrum does not show strong indicators');
  }

  return signals.join('. ') + '.';
}
