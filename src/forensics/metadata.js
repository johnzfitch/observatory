/**
 * metadata.js - EXIF and image metadata extraction with AI signature detection
 *
 * Parses JPEG APP1 (EXIF) and PNG tEXt/iTXt chunks from raw ArrayBuffer.
 * Flags known AI generator signatures in metadata fields.
 *
 * @module forensics/metadata
 */

// Known AI generator signatures to search for in metadata values
const AI_SIGNATURES = [
  { pattern: /adobe\s*firefly/i, generator: 'Adobe Firefly' },
  { pattern: /dall[·\-\s]?e/i, generator: 'DALL-E' },
  { pattern: /midjourney/i, generator: 'Midjourney' },
  { pattern: /stable\s*diffusion/i, generator: 'Stable Diffusion' },
  { pattern: /comfyui/i, generator: 'ComfyUI' },
  { pattern: /automatic1111/i, generator: 'AUTOMATIC1111' },
  { pattern: /invokeai/i, generator: 'InvokeAI' },
  { pattern: /novelai/i, generator: 'NovelAI' },
  { pattern: /leonardo\.ai/i, generator: 'Leonardo.ai' },
  { pattern: /playground\s*ai/i, generator: 'Playground AI' },
  { pattern: /imagen/i, generator: 'Google Imagen' },
  { pattern: /gemini/i, generator: 'Google Gemini' },
  { pattern: /ideogram/i, generator: 'Ideogram' },
  { pattern: /flux/i, generator: 'FLUX' },
];

// EXIF tag IDs we care about
const EXIF_TAGS = {
  0x010F: 'Make',
  0x0110: 'Model',
  0x0131: 'Software',
  0x0132: 'DateTime',
  0x013B: 'Artist',
  0x8298: 'Copyright',
  0x9003: 'DateTimeOriginal',
  0x9004: 'DateTimeDigitized',
  0x927C: 'MakerNote',
  0xA430: 'CameraOwnerName',
  0xA431: 'BodySerialNumber',
  0xA432: 'LensInfo',
  0xA433: 'LensMake',
  0xA434: 'LensModel',
  0xA435: 'LensSerialNumber',
};

/**
 * Extract metadata and detect AI signatures from an image file
 * @param {Blob} imageBlob - Image file as Blob
 * @returns {Promise<{properties: Object, exif: Object, pngText: Object, aiMarkers: Array, c2pa: boolean}>}
 */
export async function extractMetadata(imageBlob) {
  const buffer = await imageBlob.arrayBuffer();
  const bytes = new Uint8Array(buffer);

  const properties = {
    fileSize: imageBlob.size,
    mimeType: imageBlob.type,
    fileSizeFormatted: formatFileSize(imageBlob.size),
  };

  // Get image dimensions via ImageBitmap
  try {
    const bmp = await createImageBitmap(imageBlob);
    properties.width = bmp.width;
    properties.height = bmp.height;
    properties.megapixels = ((bmp.width * bmp.height) / 1e6).toFixed(1);
    bmp.close();
  } catch (_) { /* non-critical */ }

  let exif = {};
  let pngText = {};
  let c2pa = false;

  // Detect format and parse accordingly
  if (isJPEG(bytes)) {
    exif = parseJPEGExif(bytes);
    c2pa = detectC2PA_JPEG(bytes);
  } else if (isPNG(bytes)) {
    pngText = parsePNGTextChunks(bytes);
    c2pa = detectC2PA_PNG(bytes);
  }

  // Scan all metadata values for AI signatures
  const aiMarkers = scanForAISignatures({ ...exif, ...pngText });

  return { properties, exif, pngText, aiMarkers, c2pa };
}

// ============================================================================
// JPEG EXIF Parsing
// ============================================================================

function isJPEG(bytes) {
  return bytes[0] === 0xFF && bytes[1] === 0xD8;
}

function parseJPEGExif(bytes) {
  // Scan for APP1 marker (0xFFE1)
  let offset = 2;
  while (offset < bytes.length - 4) {
    if (bytes[offset] !== 0xFF) break;

    const marker = (bytes[offset] << 8) | bytes[offset + 1];
    const length = (bytes[offset + 2] << 8) | bytes[offset + 3];

    if (marker === 0xFFE1) {
      // Check for "Exif\0\0" header
      if (bytes[offset + 4] === 0x45 && bytes[offset + 5] === 0x78 &&
          bytes[offset + 6] === 0x69 && bytes[offset + 7] === 0x66 &&
          bytes[offset + 8] === 0x00 && bytes[offset + 9] === 0x00) {
        return parseExifData(bytes, offset + 10, length - 8);
      }
    }

    offset += 2 + length;
    if (marker === 0xFFDA) break; // Start of scan data
  }
  return {};
}

function parseExifData(bytes, tiffStart, maxLen) {
  const result = {};
  const view = new DataView(bytes.buffer, bytes.byteOffset + tiffStart, Math.min(maxLen, bytes.length - tiffStart));

  // Byte order
  const byteOrder = view.getUint16(0);
  const le = byteOrder === 0x4949; // II = little-endian

  // Verify TIFF magic
  if (view.getUint16(2, le) !== 0x002A) return result;

  // IFD0 offset
  const ifd0Offset = view.getUint32(4, le);
  parseIFD(view, ifd0Offset, le, result);

  // Check for EXIF sub-IFD pointer (tag 0x8769)
  const exifPointerTag = findTagValue(view, ifd0Offset, le, 0x8769);
  if (exifPointerTag !== null) {
    parseIFD(view, exifPointerTag, le, result);
  }

  return result;
}

function parseIFD(view, offset, le, result) {
  try {
    if (offset + 2 > view.byteLength) return;
    const count = view.getUint16(offset, le);
    for (let i = 0; i < count; i++) {
      const entryOffset = offset + 2 + i * 12;
      if (entryOffset + 12 > view.byteLength) break;

      const tag = view.getUint16(entryOffset, le);
      const tagName = EXIF_TAGS[tag];
      if (!tagName) continue;

      const type = view.getUint16(entryOffset + 2, le);
      const numValues = view.getUint32(entryOffset + 4, le);

      const value = readTagValue(view, entryOffset + 8, type, numValues, le);
      if (value !== null) {
        result[tagName] = value;
      }
    }
  } catch (_) { /* corrupt EXIF is non-fatal */ }
}

function findTagValue(view, ifdOffset, le, targetTag) {
  try {
    const count = view.getUint16(ifdOffset, le);
    for (let i = 0; i < count; i++) {
      const entryOffset = ifdOffset + 2 + i * 12;
      if (entryOffset + 12 > view.byteLength) break;
      const tag = view.getUint16(entryOffset, le);
      if (tag === targetTag) {
        return view.getUint32(entryOffset + 8, le);
      }
    }
  } catch (_) {}
  return null;
}

function readTagValue(view, valueOffset, type, numValues, le) {
  // ASCII string (type 2)
  if (type === 2) {
    const totalBytes = numValues;
    let dataOffset = valueOffset;
    if (totalBytes > 4) {
      dataOffset = view.getUint32(valueOffset, le);
    }
    if (dataOffset + totalBytes > view.byteLength) return null;
    let str = '';
    for (let i = 0; i < totalBytes - 1; i++) {
      const ch = view.getUint8(dataOffset + i);
      if (ch === 0) break;
      str += String.fromCharCode(ch);
    }
    return str.trim();
  }

  // LONG (type 4) - single value
  if (type === 4 && numValues === 1) {
    return view.getUint32(valueOffset, le);
  }

  // SHORT (type 3) - single value
  if (type === 3 && numValues === 1) {
    return view.getUint16(valueOffset, le);
  }

  return null;
}

// ============================================================================
// PNG Text Chunk Parsing
// ============================================================================

function isPNG(bytes) {
  return bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47;
}

function parsePNGTextChunks(bytes) {
  const result = {};
  let offset = 8; // Skip PNG signature

  while (offset + 12 < bytes.length) {
    const length = (bytes[offset] << 24) | (bytes[offset + 1] << 16) |
                   (bytes[offset + 2] << 8) | bytes[offset + 3];
    const typeStr = String.fromCharCode(bytes[offset + 4], bytes[offset + 5],
                                         bytes[offset + 6], bytes[offset + 7]);

    if (typeStr === 'tEXt') {
      const data = bytes.slice(offset + 8, offset + 8 + length);
      const nullIdx = data.indexOf(0);
      if (nullIdx > 0) {
        const key = decodeBytes(data.slice(0, nullIdx));
        const val = decodeBytes(data.slice(nullIdx + 1));
        result[key] = val;
      }
    } else if (typeStr === 'iTXt') {
      const data = bytes.slice(offset + 8, offset + 8 + length);
      const nullIdx = data.indexOf(0);
      if (nullIdx > 0) {
        const key = decodeBytes(data.slice(0, nullIdx));
        // iTXt has: keyword\0 compressionFlag compressionMethod languageTag\0 translatedKeyword\0 text
        let pos = nullIdx + 3; // skip null, compressionFlag, compressionMethod
        // Skip language tag
        while (pos < data.length && data[pos] !== 0) pos++;
        pos++; // skip null
        // Skip translated keyword
        while (pos < data.length && data[pos] !== 0) pos++;
        pos++; // skip null
        const val = decodeBytes(data.slice(pos));
        result[key] = val;
      }
    } else if (typeStr === 'IEND') {
      break;
    }

    offset += 12 + length; // 4 (length) + 4 (type) + data + 4 (CRC)
  }

  return result;
}

function decodeBytes(uint8arr) {
  try {
    return new TextDecoder('utf-8').decode(uint8arr);
  } catch (_) {
    return String.fromCharCode(...uint8arr);
  }
}

// ============================================================================
// C2PA Detection (Content Credentials)
// ============================================================================

function detectC2PA_JPEG(bytes) {
  // C2PA uses JUMBF stored in APP11 (0xFFEB) markers with "urn:uuid" prefix
  // or XMP containing "c2pa" / "stds.adobe.com" references
  let offset = 2;
  while (offset < bytes.length - 4) {
    if (bytes[offset] !== 0xFF) break;
    const marker = (bytes[offset] << 8) | bytes[offset + 1];
    const length = (bytes[offset + 2] << 8) | bytes[offset + 3];

    if (marker === 0xFFEB) {
      // APP11 - check for JUMBF/C2PA
      const chunk = decodeBytes(bytes.slice(offset + 4, offset + 4 + Math.min(length, 64)));
      if (chunk.includes('c2pa') || chunk.includes('jumbf') || chunk.includes('urn:uuid')) {
        return true;
      }
    }

    // Also check XMP in APP1 for c2pa references
    if (marker === 0xFFE1 && length > 30) {
      const header = decodeBytes(bytes.slice(offset + 4, offset + 4 + Math.min(length, 200)));
      if (header.includes('c2pa') || header.includes('C2PA')) {
        return true;
      }
    }

    offset += 2 + length;
    if (marker === 0xFFDA) break;
  }
  return false;
}

function detectC2PA_PNG(bytes) {
  // C2PA in PNG uses caBX chunks or iTXt with c2pa references
  let offset = 8;
  while (offset + 12 < bytes.length) {
    const length = (bytes[offset] << 24) | (bytes[offset + 1] << 16) |
                   (bytes[offset + 2] << 8) | bytes[offset + 3];
    const typeStr = String.fromCharCode(bytes[offset + 4], bytes[offset + 5],
                                         bytes[offset + 6], bytes[offset + 7]);

    if (typeStr === 'caBX' || typeStr === 'caMs') {
      return true;
    }

    if ((typeStr === 'tEXt' || typeStr === 'iTXt') && length > 4) {
      const chunk = decodeBytes(bytes.slice(offset + 8, offset + 8 + Math.min(length, 200)));
      if (chunk.includes('c2pa') || chunk.includes('C2PA')) {
        return true;
      }
    }

    if (typeStr === 'IEND') break;
    offset += 12 + length;
  }
  return false;
}

// ============================================================================
// AI Signature Scanning
// ============================================================================

function scanForAISignatures(allMetadata) {
  const markers = [];
  const seen = new Set();

  for (const [key, value] of Object.entries(allMetadata)) {
    if (typeof value !== 'string') continue;
    for (const sig of AI_SIGNATURES) {
      if (sig.pattern.test(value) && !seen.has(sig.generator)) {
        seen.add(sig.generator);
        markers.push({
          generator: sig.generator,
          field: key,
          value: value.length > 120 ? value.slice(0, 120) + '...' : value,
        });
      }
    }
  }

  return markers;
}

// ============================================================================
// Utilities
// ============================================================================

function formatFileSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
}
