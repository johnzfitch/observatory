#!/usr/bin/env python3
"""Convert AI detector models to ONNX for transformers.js WebGPU delivery."""

import subprocess
import sys
import os

# Models to convert (source_repo, output_name)
MODELS = [
    ("Ateeqq/ai-vs-human-image-detector", "ateeqq"),
    ("Organika/sdxl-detector", "sdxl_detector"),
    ("Hamzenium/ViT-Deepfake-Classifier", "hamzenium"),
]

# Already converted (existing in project)
EXISTING_ONNX = [
    "dima806_ai_real",
    "smogy",
    "prithiv_v2"
]

OUTPUT_DIR = "/home/zack/dev/observatory/models"

def install_deps():
    """Install required dependencies."""
    print("Installing dependencies...")
    subprocess.run([
        sys.executable, "-m", "pip", "install",
        "optimum[exporters,onnxruntime]",
        "transformers",
        "torch",
        "Pillow",
        "--user", "-q"
    ], check=True)
    print("✓ Dependencies installed\n")

def convert_model(source_repo, output_name):
    """Convert a single model to ONNX."""
    print(f"\n{'='*60}")
    print(f"Converting: {source_repo}")
    print(f"Output: {output_name}")
    print('='*60)

    output_path = os.path.join(OUTPUT_DIR, output_name, "onnx")

    # Export to ONNX with opset 14 (compatible with transformers.js)
    print(f"\n[1/2] Exporting to ONNX...")
    result = subprocess.run([
        sys.executable, "-m", "optimum.exporters.onnx",
        "--model", source_repo,
        "--task", "image-classification",
        "--opset", "14",
        output_path
    ])

    if result.returncode != 0:
        print(f"❌ Failed to export {source_repo}")
        return False

    print(f"✓ ONNX export complete: {output_path}")

    # Note: Skipping quantization for now - transformers.js has issues with quantized models
    # Can add back later with: optimum-cli onnxruntime quantize

    return True

def main():
    print("="*60)
    print("ONNX Model Conversion for Observatory")
    print("="*60)

    # Check if optimum is already installed
    try:
        import optimum
        print("✓ optimum already installed\n")
    except ImportError:
        install_deps()

    success_count = 0
    fail_count = 0

    for source_repo, output_name in MODELS:
        try:
            if convert_model(source_repo, output_name):
                success_count += 1
            else:
                fail_count += 1
        except Exception as e:
            print(f"❌ Failed to convert {source_repo}: {e}")
            fail_count += 1

    print("\n" + "="*60)
    print("Conversion Summary")
    print("="*60)
    print(f"✓ Successful: {success_count}")
    print(f"❌ Failed: {fail_count}")
    print(f"⊙ Already converted: {len(EXISTING_ONNX)} (dima806, smogy, prithiv_v2)")
    print(f"\nTotal models: {success_count + len(EXISTING_ONNX)}")

    if success_count > 0:
        print("\n✓ ONNX models ready for transformers.js!")
        print(f"Location: {OUTPUT_DIR}/*/onnx/model.onnx")

if __name__ == "__main__":
    main()
