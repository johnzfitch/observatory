#!/usr/bin/env python3
"""
Model Quantization Script - Convert FP32 ONNX models to INT8

Reduces model sizes by ~75% (164MB -> ~41MB) with minimal accuracy loss.
Uses ONNX Runtime's dynamic quantization which works well for vision models.

Usage:
    python scripts/quantize-models.py                    # Quantize all models
    python scripts/quantize-models.py dima806_ai_real   # Quantize specific model
    python scripts/quantize-models.py --verify          # Verify quantized models

Requirements:
    pip install onnx onnxruntime
"""

import os
import sys
import argparse
from pathlib import Path

try:
    import onnx
    from onnxruntime.quantization import quantize_dynamic, QuantType
    from onnxruntime.quantization.shape_inference import quant_pre_process
except ImportError:
    print("Error: Required packages not installed.")
    print("Run: pip install onnx onnxruntime")
    sys.exit(1)


# Model directories relative to project root
MODELS_DIR = Path(__file__).parent.parent / "models"

# Models to quantize
MODELS = [
    "dima806_ai_real",
    "smogy",
    "umm_maybe",
    "prithiv_v2"
]


def get_model_paths(model_name: str) -> tuple[Path, Path]:
    """Get input and output paths for a model."""
    model_dir = MODELS_DIR / model_name

    # Check for model.onnx in root or onnx subdirectory
    input_path = model_dir / "model.onnx"
    if not input_path.exists():
        input_path = model_dir / "onnx" / "model.onnx"

    output_path = model_dir / "model_int8.onnx"

    return input_path, output_path


def get_model_size(path: Path) -> float:
    """Get model size in MB."""
    if path.exists():
        return path.stat().st_size / (1024 * 1024)
    return 0


def quantize_model(model_name: str, force: bool = False) -> bool:
    """
    Quantize a single model from FP32 to INT8.

    Args:
        model_name: Name of the model directory
        force: Overwrite existing quantized model

    Returns:
        True if successful, False otherwise
    """
    input_path, output_path = get_model_paths(model_name)

    if not input_path.exists():
        print(f"  [ERROR] Model not found: {input_path}")
        return False

    if output_path.exists() and not force:
        print(f"  [SKIP] Already quantized: {output_path}")
        return True

    input_size = get_model_size(input_path)
    print(f"  [INFO] Input: {input_path} ({input_size:.1f}MB)")

    try:
        # Preprocess model for quantization (shape inference)
        print(f"  [STEP] Preprocessing model...")
        preprocessed_path = input_path.parent / "model_preprocessed.onnx"

        try:
            quant_pre_process(
                str(input_path),
                str(preprocessed_path),
                skip_symbolic_shape=True
            )
            quantize_input = preprocessed_path
        except Exception as e:
            print(f"  [WARN] Preprocessing failed ({e}), using original model")
            quantize_input = input_path

        # Quantize to INT8 using dynamic quantization
        print(f"  [STEP] Quantizing to INT8...")
        quantize_dynamic(
            model_input=str(quantize_input),
            model_output=str(output_path),
            weight_type=QuantType.QUInt8,
            optimize_model=True,
            per_channel=False,  # per_channel can cause issues with some ops
            reduce_range=False
        )

        # Clean up preprocessed model
        if preprocessed_path.exists():
            preprocessed_path.unlink()

        output_size = get_model_size(output_path)
        reduction = ((input_size - output_size) / input_size) * 100

        print(f"  [OK] Output: {output_path} ({output_size:.1f}MB)")
        print(f"  [OK] Size reduction: {reduction:.1f}%")

        # Update symlink in onnx/ subdirectory
        onnx_dir = input_path.parent / "onnx" if "onnx" not in str(input_path) else input_path.parent
        if onnx_dir.exists():
            quantized_link = onnx_dir / "model_quantized.onnx"
            if quantized_link.is_symlink():
                quantized_link.unlink()
            # Create relative symlink
            rel_path = os.path.relpath(output_path, onnx_dir)
            quantized_link.symlink_to(rel_path)
            print(f"  [OK] Updated symlink: {quantized_link} -> {rel_path}")

        return True

    except Exception as e:
        print(f"  [ERROR] Quantization failed: {e}")
        import traceback
        traceback.print_exc()
        return False


def verify_model(model_name: str) -> bool:
    """Verify a quantized model can be loaded."""
    _, output_path = get_model_paths(model_name)

    if not output_path.exists():
        print(f"  [ERROR] Quantized model not found: {output_path}")
        return False

    try:
        import onnxruntime as ort

        # Try to create inference session
        print(f"  [STEP] Loading {output_path}...")
        session = ort.InferenceSession(
            str(output_path),
            providers=['CPUExecutionProvider']
        )

        # Get model info
        inputs = session.get_inputs()
        outputs = session.get_outputs()

        print(f"  [OK] Model loaded successfully")
        print(f"  [INFO] Inputs: {[i.name + ' ' + str(i.shape) for i in inputs]}")
        print(f"  [INFO] Outputs: {[o.name for o in outputs]}")

        return True

    except Exception as e:
        print(f"  [ERROR] Verification failed: {e}")
        return False


def main():
    parser = argparse.ArgumentParser(
        description="Quantize ONNX models from FP32 to INT8"
    )
    parser.add_argument(
        "models",
        nargs="*",
        default=MODELS,
        help="Model names to quantize (default: all)"
    )
    parser.add_argument(
        "--force", "-f",
        action="store_true",
        help="Overwrite existing quantized models"
    )
    parser.add_argument(
        "--verify", "-v",
        action="store_true",
        help="Verify quantized models can be loaded"
    )
    parser.add_argument(
        "--list", "-l",
        action="store_true",
        help="List available models and their sizes"
    )

    args = parser.parse_args()

    print("=" * 60)
    print("ONNX Model Quantization (FP32 -> INT8)")
    print("=" * 60)

    if args.list:
        print("\nAvailable models:")
        total_fp32 = 0
        total_int8 = 0

        for model in MODELS:
            input_path, output_path = get_model_paths(model)
            fp32_size = get_model_size(input_path)
            int8_size = get_model_size(output_path)
            total_fp32 += fp32_size
            total_int8 += int8_size

            status = "quantized" if output_path.exists() else "not quantized"
            print(f"  {model}: {fp32_size:.1f}MB FP32, {int8_size:.1f}MB INT8 ({status})")

        print(f"\nTotal FP32: {total_fp32:.1f}MB")
        print(f"Total INT8: {total_int8:.1f}MB")
        if total_int8 > 0:
            print(f"Reduction: {((total_fp32 - total_int8) / total_fp32) * 100:.1f}%")
        return

    if args.verify:
        print("\nVerifying quantized models...")
        success = 0
        for model in args.models:
            print(f"\n[{model}]")
            if verify_model(model):
                success += 1

        print(f"\n{success}/{len(args.models)} models verified successfully")
        return

    # Quantize models
    print(f"\nQuantizing {len(args.models)} models...")
    success = 0

    for model in args.models:
        print(f"\n[{model}]")
        if quantize_model(model, force=args.force):
            success += 1

    print("\n" + "=" * 60)
    print(f"Quantization complete: {success}/{len(args.models)} successful")

    # Show summary
    print("\nSize summary:")
    total_fp32 = 0
    total_int8 = 0

    for model in args.models:
        input_path, output_path = get_model_paths(model)
        fp32_size = get_model_size(input_path)
        int8_size = get_model_size(output_path)
        total_fp32 += fp32_size
        total_int8 += int8_size

    print(f"  Total FP32: {total_fp32:.1f}MB")
    print(f"  Total INT8: {total_int8:.1f}MB")
    if total_int8 > 0:
        print(f"  Reduction: {((total_fp32 - total_int8) / total_fp32) * 100:.1f}%")

    print("\nTo use quantized models, update model wrappers to load 'model_int8.onnx'")
    print("or update symlinks in models/*/onnx/model_quantized.onnx")


if __name__ == "__main__":
    main()
