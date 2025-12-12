# Test Images Required

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

```json
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
```

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
