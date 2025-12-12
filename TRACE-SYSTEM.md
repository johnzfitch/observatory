# Execution Trace System

## Overview

Comprehensive tracing system for debugging and validating the model inference pipeline. Tracks every step of execution with timestamps, performance metrics, and detailed logging.

## Files

1. **`src/utils/tracer.js`** - Core tracing library
2. **`test-trace.html`** - Interactive trace test UI

## Usage

### Open the Trace Test Page

```
http://localhost:8000/test-trace.html
```

### Features

1. **Recreate User Log Flow** - Simulates the exact execution flow from your test2c.log
2. **Run Traced Inference** - Executes actual model inference with detailed tracing
3. **Export Traces** - Download traces as JSON for analysis
4. **Model Selection** - Choose which models to test

## Trace Output Format

Matches your console log format:

```
[span-id] 🚀 Message data (+123ms)
[span-id] ✓ Success message (+456ms)
[span-id] ❌ Error message (+789ms)
```

### Log Levels

- **START** (🚀) - Beginning of operation
- **END** (🏁) - Completion of operation
- **SUCCESS** (✓) - Successful step
- **ERROR** (❌) - Error occurred
- **WARN** (⚠️) - Warning
- **INFO** (ℹ️) - Informational

## Expected Execution Flow (from test2c.log)

### 1. ONNX Initialization
```
[ONNX-Init] Pre-configuring ONNX Runtime environment...
[ONNX-Init] WASM paths pre-configured: /vendor/
[ONNX-Init] ✓ Configuration complete
```

### 2. InferenceEngine Initialization
```
[InferenceEngine] Initializing...
[InferenceEngine] FORCE_WASM enabled - bypassing WebGPU detection
[InferenceEngine] ✓ Initialized with WASM backend (forced)
```

### 3. Model Loading
```
[dima806_ai_real] 🚀 Starting model load process...
[dima806_ai_real] 📥 Importing transformers.js from CDN
[dima806_ai_real] ✓ Transformers.js imported successfully
[dima806_ai_real] ⚙️  Configuring transformers.js environment...
[paths.js] ✓ allowLocalModels = true
[paths.js] ✓ useBrowserCache = true
[paths.js] ✓ localModelPath = /models/
[paths.js] ✓ allowRemoteModels = false
[paths.js] ℹ️  WASM paths NOT configured - using bundled ONNX Runtime
[paths.js] Current WASM paths: https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.1.2/dist/
[dima806_ai_real] ✓ Environment configured
[dima806_ai_real] 🔨 Creating pipeline...
[dima806_ai_real] Task: image-classification
[dima806_ai_real] Model: dima806_ai_real
[dima806_ai_real] Device: wasm
[dima806_ai_real] Loading ONNX model from: http://localhost:8000/models/dima806_ai_real/onnx/model.onnx
[dima806_ai_real] ✅ Pipeline created successfully!
[dima806_ai_real] 🏁 Load process complete
```

### 4. Inference Execution
```
[InferenceEngine] Running inference with 1 model
[InferenceEngine] Backend: wasm
[InferenceEngine] ✓ Model ID validated: dima806_ai_real
[InferenceEngine] ✓ Model already loaded
[InferenceEngine] 🔮 Running prediction...
[dima806_ai_real] 🔮 predict() called
[dima806_ai_real] imageSource type: String (data URL)
[dima806_ai_real] 🎯 Running classifier...
[dima806_ai_real] ✓ Classifier returned results:
[dima806_ai_real] Array [ {label: "ai", score: 0.969}, {label: "real", score: 0.031} ]
[dima806_ai_real] aiProbability: 96.9
[dima806_ai_real] verdict: AI
[dima806_ai_real] confidence: 93.8
[InferenceEngine] ✓ Prediction complete
```

## Trace API

### Starting a Trace Span

```javascript
import { startTrace, endTrace, trace } from './src/utils/tracer.js';

const spanId = startTrace('my-operation', 'Operation Label', { metadata });
```

### Logging Within a Span

```javascript
trace(spanId, 'INFO', 'Processing data...');
trace(spanId, 'SUCCESS', 'Data processed', { count: 123 });
trace(spanId, 'ERROR', 'Failed to process', { error: 'message' });
```

### Ending a Trace Span

```javascript
endTrace(spanId, { resultMetadata });
```

### Getting Trace Summary

```javascript
import { getTraceSummary } from './src/utils/tracer.js';

const summary = getTraceSummary();
console.log(summary);
```

### Exporting Traces

```javascript
import { exportTraces } from './src/utils/tracer.js';

const traces = exportTraces();
// Save to file or send to analytics
```

## Validation Checklist

Use the trace system to verify:

- ✅ ONNX Runtime initializes before models load
- ✅ WASM paths are set correctly (CDN, not local override)
- ✅ Models load in correct order
- ✅ Blob → data URL conversion happens
- ✅ Classifier receives correct input format
- ✅ Results are in expected format (percentage 0-100)
- ✅ Error handling works at each step
- ✅ Performance metrics are reasonable

## Troubleshooting

### If models aren't loading:

1. Check ONNX-Init logs - should complete before model import
2. Check transformers.js import - should load from CDN
3. Check WASM paths - should use CDN bundled runtime

### If predictions fail:

1. Check Blob conversion - should convert to data URL
2. Check classifier input - should be string (data URL), not Blob
3. Check result format - aiProbability should be 0-100 percentage

### If percentages are wrong:

1. Check model output - should be percentage (96.9), not decimal (0.969)
2. Check UI display - should not multiply by 100 again
3. Check thresholds - should use 70, 55, not 0.7, 0.55

## Performance Baselines

Expected timings from test2c.log:

- **Model Load:** 2-3 seconds (first time)
- **Model Load:** <100ms (cached)
- **Inference:** 300-500ms per model
- **Total (1 model):** ~3-5 seconds (cold start)
- **Total (1 model):** ~0.5-1 second (warm start)

## Export Format

Traces export to JSON with this structure:

```json
{
  "startTime": 12345.67,
  "endTime": 12350.45,
  "traces": [
    {
      "id": "span-id",
      "label": "Operation Label",
      "startTime": 12345.67,
      "endTime": 12346.89,
      "duration": 1.22,
      "metadata": {},
      "logs": [
        {
          "level": "INFO",
          "message": "Log message",
          "timestamp": 12345.78,
          "relativeTime": 110
        }
      ]
    }
  ]
}
```

## Integration with Main App

To add tracing to the main app, import the tracer in index.html:

```html
<script type="module">
  import { startTrace, endTrace, trace } from './src/utils/tracer.js';

  // Wrap inference calls
  const span = startTrace('analysis', 'Image Analysis');
  // ... run inference ...
  endTrace(span, { success: true });
</script>
```

Or enable automatic tracing in InferenceEngine.js by importing tracer.

---

**Next Steps:**
1. Run test-trace.html and verify execution flow matches expectations
2. Export traces and compare with test2c.log
3. Add tracing to main app for production debugging
4. Monitor performance metrics over time
