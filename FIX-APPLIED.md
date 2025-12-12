# Critical Fix Applied - WASM Path Issue

## Problem Identified

The "can't access property 'buffer'" error was caused by **setting custom WASM paths** in the ONNX configuration.

### Root Cause

Transformers.js bundles its own version of ONNX Runtime Web. When we tried to override the WASM paths to point to `/vendor/onnxruntime-1.17.0/`, it created a **version mismatch**:

- Transformers.js JavaScript code expected ONNX Runtime v2.17.x
- We were pointing it to v1.17.0 WASM binaries
- The API changed between versions → buffer property doesn't exist in the old version

## Solution

**DO NOT set `env.backends.onnx.wasm.wasmPaths`** - let Transformers.js use its bundled runtime.

Instead:
1. ✅ Load Transformers.js from CDN (jsdelivr) - uses bundled ONNX Runtime v2.17.x
2. ✅ Copy WASM files to `/vendor/` (for local WASM fallback if needed)
3. ✅ Do NOT override wasmPaths in configuration

## Files Changed

### 1. `/vendor/` directory
**WASM files for local fallback:**
```
/vendor/
├── ort-wasm.wasm              ← Local WASM files
├── ort-wasm-simd.wasm
├── ort-wasm-threaded.wasm
├── ort-wasm-simd-threaded.wasm
└── onnxruntime-1.17.0/        (kept for reference)
```

**Note:** Transformers.js is now loaded from CDN (jsdelivr)

### 2. `src/config/onnx-init.js`
**Removed the problematic wasmPaths setting:**
```javascript
// BEFORE (WRONG - causes buffer error):
env.backends.onnx.wasm.wasmPaths = '/vendor/onnxruntime-1.17.0/';

// AFTER (CORRECT - no override):
backends: {
  onnx: {
    wasm: {
      // NO wasmPaths property!
      numThreads: 1,
      simd: true,
      proxy: false
    }
  }
}
```

### 3. `test/verify-phase1.html`
**Removed wasmPaths override from test:**
```javascript
// BEFORE (WRONG):
env.backends.onnx.wasm.wasmPaths = '/vendor/onnxruntime-1.17.0/';

// AFTER (CORRECT):
// DO NOT set wasmPaths - let Transformers.js use its bundled ONNX Runtime
```

## Why This Works

1. **Transformers.js bundles ONNX Runtime** - It has the JavaScript runtime compiled in
2. **WASM files auto-detected** - When in the same directory, they're found automatically
3. **Version match guaranteed** - Bundled JS + matching WASM = no API mismatches
4. **No configuration needed** - Just put the files in the right place

## Expected Test Results

After this fix, running `http://localhost:8000/test/verify-phase1.html`:

```
✅ Cache Nuclear Clear: PASS
✅ ONNX Init Script Loaded: PASS
✅ WASM files location: PASS (in /vendor/)
✅ WASM Files Accessible: PASS
✅ Transformers.js Loads: PASS
✅ Model Config Accessible: PASS
✅ Model Pipeline Creates: PASS (no more buffer errors!)
✅ Inference Runs: PASS
```

## Deployment Notes

When deploying, ensure:
1. All 4 WASM files are in `/vendor/` directory
2. CSP allows `https://cdn.jsdelivr.net` for script-src and connect-src
3. No `wasmPaths` override in any configuration
4. Service worker cache cleared (cache version bump handles this)

## References

- Comment in original `paths.js:50-51` warned about this exact issue
- Transformers.js expects WASM files in same directory as the JS file
- Setting custom paths breaks the bundled runtime's expectations
