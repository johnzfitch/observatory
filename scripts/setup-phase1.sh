#!/bin/bash
# ========================================
# Phase 1 Setup Script
# look.definitelynot.ai - Emergency Fixes
# ========================================

set -e

echo "🔧 Phase 1 Setup Script"
echo "========================"
echo ""

# ----------------------------------------
# Configuration
# ----------------------------------------

PROJECT_DIR="${PROJECT_DIR:-/home/zack/dev/deepfake-detector/web-gpu}"
ONNX_VERSION="1.17.0"
VENDOR_DIR="$PROJECT_DIR/vendor/onnxruntime-$ONNX_VERSION"

# ----------------------------------------
# Step 1: Create directories
# ----------------------------------------

echo "📁 Creating directories..."
mkdir -p "$VENDOR_DIR"
mkdir -p "$PROJECT_DIR/patches"
mkdir -p "$PROJECT_DIR/test"

# ----------------------------------------
# Step 2: Download ONNX Runtime Web files
# ----------------------------------------

echo ""
echo "📥 Downloading ONNX Runtime Web $ONNX_VERSION..."
echo "   (This may take a minute - files are ~20MB total)"

cd "$VENDOR_DIR"

# Main JS files
echo "   Downloading ort.min.js..."
curl -sL -o ort.min.js "https://cdn.jsdelivr.net/npm/onnxruntime-web@$ONNX_VERSION/dist/ort.min.js"

echo "   Downloading ort.wasm.min.js..."
curl -sL -o ort.wasm.min.js "https://cdn.jsdelivr.net/npm/onnxruntime-web@$ONNX_VERSION/dist/ort.wasm.min.js"

# WASM files
echo "   Downloading ort-wasm.wasm..."
curl -sL -o ort-wasm.wasm "https://cdn.jsdelivr.net/npm/onnxruntime-web@$ONNX_VERSION/dist/ort-wasm.wasm"

echo "   Downloading ort-wasm-simd.wasm..."
curl -sL -o ort-wasm-simd.wasm "https://cdn.jsdelivr.net/npm/onnxruntime-web@$ONNX_VERSION/dist/ort-wasm-simd.wasm"

echo "   Downloading ort-wasm-threaded.wasm..."
curl -sL -o ort-wasm-threaded.wasm "https://cdn.jsdelivr.net/npm/onnxruntime-web@$ONNX_VERSION/dist/ort-wasm-threaded.wasm"

echo "   Downloading ort-wasm-simd-threaded.wasm..."
curl -sL -o ort-wasm-simd-threaded.wasm "https://cdn.jsdelivr.net/npm/onnxruntime-web@$ONNX_VERSION/dist/ort-wasm-simd-threaded.wasm"

# ----------------------------------------
# Step 3: Verify downloads
# ----------------------------------------

echo ""
echo "✅ Verifying downloads..."

for file in ort.min.js ort-wasm.wasm ort-wasm-simd.wasm; do
    if [ -f "$file" ]; then
        size=$(ls -lh "$file" | awk '{print $5}')
        echo "   ✓ $file ($size)"
    else
        echo "   ✗ MISSING: $file"
        exit 1
    fi
done

# ----------------------------------------
# Step 4: Show file sizes
# ----------------------------------------

echo ""
echo "📊 Downloaded files:"
ls -lh "$VENDOR_DIR"

# ----------------------------------------
# Step 5: Create symlink for easier path
# ----------------------------------------

echo ""
echo "🔗 Creating symlink for compatibility..."
cd "$PROJECT_DIR/vendor"
rm -f onnxruntime  # Remove old symlink if exists
ln -sf "onnxruntime-$ONNX_VERSION" onnxruntime
echo "   vendor/onnxruntime -> onnxruntime-$ONNX_VERSION"

# ----------------------------------------
# Step 6: Reminder about index.html changes
# ----------------------------------------

echo ""
echo "========================================="
echo "📋 MANUAL STEPS REQUIRED"
echo "========================================="
echo ""
echo "1. Add cache nuclear script to index.html (FIRST script):"
echo "   <script src=\"/patches/001-cache-nuclear.js\"></script>"
echo ""
echo "2. Add ONNX init script (BEFORE module scripts):"
echo "   <script src=\"/src/config/onnx-init.js\"></script>"
echo ""
echo "3. Update paths.js to use new WASM path:"
echo "   wasmPaths: '/vendor/onnxruntime-$ONNX_VERSION/'"
echo ""
echo "4. Deploy to server:"
echo "   rsync -avz --exclude=node_modules --exclude=.git . adept:/var/www/definitelynot.ai/look/"
echo ""
echo "5. Fix permissions:"
echo "   ssh adept 'sudo chown -R caddy:caddy /var/www/definitelynot.ai/look'"
echo ""
echo "6. Test:"
echo "   https://look.definitelynot.ai/test/verify-phase1.html"
echo ""
echo "========================================="
echo "✅ Setup complete!"
echo "========================================="
