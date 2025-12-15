#!/bin/bash
# Download script for 3 new models for Observatory integration

set -e

# Ensure pipx bin is in PATH
export PATH="$HOME/.local/bin:$PATH"

MODELS_DIR="/home/zack/dev/observatory/models"

echo "========================================="
echo "Downloading 3 New Models for Observatory"
echo "========================================="
echo ""

# Model 1: Organika/sdxl-detector (Swin Transformer)
echo "[1/3] Downloading Organika/sdxl-detector..."
mkdir -p "$MODELS_DIR/sdxl_detector"
cd "$MODELS_DIR/sdxl_detector"

# Use huggingface-cli via pipx (already installed)
if command -v huggingface-cli &> /dev/null; then
    HF_CMD="huggingface-cli"
else
    # Use pipx run with the spec pointing to the package
    HF_CMD="pipx run --spec huggingface_hub huggingface-cli"
fi

$HF_CMD download Organika/sdxl-detector --local-dir . --include "*.onnx" "config.json" "preprocessor_config.json"

echo "  ✓ sdxl-detector downloaded"
echo ""

# Model 2: Ateeqq/ai-vs-human-image-detector (SigLIP)
echo "[2/3] Downloading Ateeqq/ai-vs-human-image-detector..."
mkdir -p "$MODELS_DIR/ateeqq"
cd "$MODELS_DIR/ateeqq"

$HF_CMD download Ateeqq/ai-vs-human-image-detector --local-dir . --include "*.onnx" "config.json" "preprocessor_config.json"
echo "  ✓ ateeqq downloaded"
echo ""

# Model 3: Hamzenium/ViT-Deepfake-Classifier (ViT)
echo "[3/3] Downloading Hamzenium/ViT-Deepfake-Classifier..."
mkdir -p "$MODELS_DIR/hamzenium"
cd "$MODELS_DIR/hamzenium"

$HF_CMD download Hamzenium/ViT-Deepfake-Classifier --local-dir . --include "*.onnx" "config.json" "preprocessor_config.json"
echo "  ✓ hamzenium downloaded"
echo ""

echo "========================================="
echo "Download Complete!"
echo "========================================="
echo ""
echo "Downloaded models:"
echo "  - $MODELS_DIR/sdxl_detector/"
echo "  - $MODELS_DIR/ateeqq/"
echo "  - $MODELS_DIR/hamzenium/"
echo ""
echo "Next steps:"
echo "  1. Verify model files with: ls -lh $MODELS_DIR/*/model.onnx"
echo "  2. Continue with model integration"
