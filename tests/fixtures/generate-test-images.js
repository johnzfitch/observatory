/**
 * Generate Simple Test Images
 *
 * This script generates basic test images for use in automated tests.
 * For production testing, you should use real AI-generated and real images.
 */

import { createCanvas } from 'canvas';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const imagesDir = path.join(__dirname, '../images');

/**
 * Create a simple test image with text
 */
function createTestImage(text, filename, category) {
  const canvas = createCanvas(512, 512);
  const ctx = canvas.getContext('2d');

  // Background
  ctx.fillStyle = '#2a2a2a';
  ctx.fillRect(0, 0, 512, 512);

  // Add some visual noise
  for (let i = 0; i < 1000; i++) {
    ctx.fillStyle = `rgba(${Math.random() * 255}, ${Math.random() * 255}, ${Math.random() * 255}, 0.3)`;
    ctx.fillRect(Math.random() * 512, Math.random() * 512, 5, 5);
  }

  // Text
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 48px Arial';
  ctx.textAlign = 'center';
  ctx.fillText(text, 256, 256);

  // Save
  const buffer = canvas.toBuffer('image/png');
  const filepath = path.join(imagesDir, category, filename);
  fs.writeFileSync(filepath, buffer);

  console.log(`Created: ${filepath}`);
}

// Create directories if they don't exist
['ai-generated', 'real', 'edge-cases'].forEach(dir => {
  const dirPath = path.join(imagesDir, dir);
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
});

console.log('Generating test images...');

// For now, create placeholder notice files
const placeholderNotice = `# Test Images Required

This directory should contain test images for automated testing.

## How to Add Test Images

### AI-Generated Images:
Add images created by AI tools (Midjourney, DALL-E, Stable Diffusion, etc.)
- midjourney-1.png
- dalle-1.png
- stable-diffusion-1.png

### Real Images:
Add authentic photographs and human-created art
- photograph-1.png
- painting-1.png
- drawing-1.png

### Edge Cases:
Add challenging images
- low-quality.png
- grayscale.png
- partial.png

## Metadata

Create metadata.json in each directory:

\`\`\`json
{
  "midjourney-1.png": {
    "groundTruth": "AI",
    "source": "Midjourney v6",
    "category": "digital_art",
    "expectedConfidence": ">70",
    "description": "AI-generated fantasy landscape"
  }
}
\`\`\`

## Note

For accurate testing, use real images rather than programmatically generated ones.
You can find test images from:
- AI image datasets on HuggingFace
- Your own AI-generated images
- Stock photo sites (for real images)
- Creative Commons licensed images
`;

fs.writeFileSync(path.join(imagesDir, 'ai-generated', 'README.md'), placeholderNotice);
fs.writeFileSync(path.join(imagesDir, 'real', 'README.md'), placeholderNotice);
fs.writeFileSync(path.join(imagesDir, 'edge-cases', 'README.md'), placeholderNotice);

// Create empty metadata files
const emptyMetadata = {};

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

console.log('\nTest image directories created!');
console.log('Please add actual test images to:');
console.log('  - tests/images/ai-generated/');
console.log('  - tests/images/real/');
console.log('  - tests/images/edge-cases/');
console.log('\nSee README.md files in each directory for instructions.');
