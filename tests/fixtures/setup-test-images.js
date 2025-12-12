/**
 * Setup Test Image Directories
 *
 * Creates directory structure and placeholder files for test images.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const imagesDir = path.join(__dirname, '../images');

// Create directories if they don't exist
['ai-generated', 'real', 'edge-cases'].forEach(dir => {
  const dirPath = path.join(imagesDir, dir);
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
});

console.log('Setting up test image directories...');

// Placeholder notice
const placeholderNotice = `# Test Images Required

This directory should contain test images for automated testing.

## How to Add Test Images

### For AI-Generated Images (tests/images/ai-generated/):
Add images created by AI tools:
- midjourney-1.png (Midjourney generated)
- dalle-1.png (DALL-E generated)
- stable-diffusion-1.png (Stable Diffusion generated)

### For Real Images (tests/images/real/):
Add authentic photographs and human-created art:
- photograph-1.png (Real camera photo)
- painting-1.png (Digital painting by human)
- drawing-1.png (Hand-drawn image)

### For Edge Cases (tests/images/edge-cases/):
Add challenging images:
- low-quality.png (Low resolution/compressed)
- grayscale.png (Black and white image)
- partial.png (Partially cropped image)

## Metadata Format

Create metadata.json in each directory:

\`\`\`json
{
  "midjourney-1.png": {
    "groundTruth": "AI",
    "source": "Midjourney v6",
    "category": "digital_art",
    "expectedConfidence": ">70",
    "description": "AI-generated fantasy landscape"
  },
  "photograph-1.png": {
    "groundTruth": "REAL",
    "source": "Canon EOS camera",
    "category": "photograph",
    "expectedConfidence": ">70",
    "description": "Real photograph of nature"
  }
}
\`\`\`

## Finding Test Images

### AI-Generated:
- Generate your own using Midjourney, DALL-E, or Stable Diffusion
- Download from AI art datasets on HuggingFace
- Use AI-generated images from r/StableDiffusion or similar communities

### Real Images:
- Use your own photographs
- Download from Unsplash (unsplash.com) - free stock photos
- Use Creative Commons licensed images from Flickr
- Download from public domain sources like rawpixel.com

## Note

For accurate testing, use actual AI-generated and real images rather than
programmatically generated test images. The models are trained to detect
specific patterns in AI-generated imagery.
`;

fs.writeFileSync(path.join(imagesDir, 'ai-generated', 'README.md'), placeholderNotice);
fs.writeFileSync(path.join(imagesDir, 'real', 'README.md'), placeholderNotice);
fs.writeFileSync(path.join(imagesDir, 'edge-cases', 'README.md'), placeholderNotice);

// Create empty metadata files
const emptyMetadata = {
  "_instructions": "Add metadata for each test image in this directory",
  "_example": {
    "filename.png": {
      "groundTruth": "AI or REAL",
      "source": "Tool or camera used",
      "category": "digital_art, photograph, etc",
      "expectedConfidence": ">70",
      "description": "Brief description"
    }
  }
};

fs.writeFileSync(
  path.join(imagesDir, 'ai-generated', 'metadata.json'),
  JSON.stringify(emptyMetadata, null, 2)
);

fs.writeFileSync(
  path.join(imagesDir, 'real', 'metadata.json'),
  JSON.stringify(emptyMetadata, null, 2)
);

fs.writeFileSync(
  path.join(imagesDir, 'edge-cases', 'metadata.json'),
  JSON.stringify(emptyMetadata, null, 2)
);

console.log('\n✅ Test image directories created!');
console.log('\nPlease add test images to:');
console.log('  📁 tests/images/ai-generated/');
console.log('  📁 tests/images/real/');
console.log('  📁 tests/images/edge-cases/');
console.log('\n📖 See README.md files in each directory for instructions.');
console.log('\nQuick start:');
console.log('  1. Download 2-3 AI-generated images (from Midjourney, DALL-E, etc.)');
console.log('  2. Download 2-3 real photographs (from Unsplash, your camera, etc.)');
console.log('  3. Update metadata.json files with image details');
console.log('  4. Run: npm test');
