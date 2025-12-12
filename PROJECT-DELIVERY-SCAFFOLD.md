# look.definitelynot.ai - Project Delivery Scaffold

## Executive Summary

**Current State:** Complete model loading failure due to cascading WASM/WebGPU issues
**Target State:** Stable inference with graceful degradation across all browsers
**Timeline:** 3 phases over ~2 weeks
**Risk Level:** Medium (root cause identified, fixes are deterministic)

---

## Phase 1: Emergency Stabilization (Days 1-3)

### Goal: Get at least 3 models working reliably

### 1.1 Cache Nuclear Option (Hour 1)

**Problem:** Corrupted WASM binaries cached in Service Worker
**Solution:** Force cache invalidation for all users

```javascript
// Add to index.html BEFORE any other scripts
<script>
(async function emergencyCacheClear() {
  const REQUIRED_VERSION = '2024-12-09-nuclear-v1';
  const cleared = localStorage.getItem('cache-nuclear-clear');
  
  if (cleared !== REQUIRED_VERSION) {
    console.log('[Emergency] Nuking all caches...');
    
    // Unregister all service workers
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map(r => r.unregister()));
    }
    
    // Delete all caches
    const names = await caches.keys();
    await Promise.all(names.map(n => caches.delete(n)));
    
    // Clear IndexedDB (Transformers.js cache)
    const dbs = await indexedDB.databases();
    dbs.forEach(db => indexedDB.deleteDatabase(db.name));
    
    localStorage.setItem('cache-nuclear-clear', REQUIRED_VERSION);
    window.location.reload(true);
    return;
  }
})();
</script>
```

**Deliverable:** `patches/001-cache-nuclear.js`

---

### 1.2 Vendor ONNX Runtime Locally (Hours 2-4)

**Problem:** CSP blocks CDN imports, version mismatches cause buffer errors
**Solution:** Bundle exact compatible versions locally

**Files to download:**
```bash
mkdir -p vendor/onnxruntime-1.17.0
cd vendor/onnxruntime-1.17.0

# Download ONNX Runtime Web 1.17.0 (matches Transformers.js 2.17.x)
curl -O https://cdn.jsdelivr.net/npm/onnxruntime-web@1.17.0/dist/ort.min.js
curl -O https://cdn.jsdelivr.net/npm/onnxruntime-web@1.17.0/dist/ort.wasm.min.js
curl -O https://cdn.jsdelivr.net/npm/onnxruntime-web@1.17.0/dist/ort-wasm.wasm
curl -O https://cdn.jsdelivr.net/npm/onnxruntime-web@1.17.0/dist/ort-wasm-simd.wasm
curl -O https://cdn.jsdelivr.net/npm/onnxruntime-web@1.17.0/dist/ort-wasm-simd-threaded.wasm
curl -O https://cdn.jsdelivr.net/npm/onnxruntime-web@1.17.0/dist/ort-wasm-threaded.wasm
```

**Critical:** Verify Transformers.js version compatibility:
```javascript
// Check what version Transformers.js expects
// In vendor/transformers.js, search for "onnxruntime" 
// Match that version EXACTLY
```

**Deliverable:** `vendor/onnxruntime-1.17.0/` directory with all files

---

### 1.3 Fix WASM Path Initialization Order (Hours 4-6)

**Problem:** WASM paths set AFTER Transformers.js import (too late)
**Solution:** Set paths BEFORE import via global config

**Create:** `src/config/onnx-init.js`
```javascript
// MUST be loaded before transformers.js
// Sets global ONNX Runtime configuration

(function() {
  // Create global ONNX Runtime env before any imports
  window.ort = window.ort || {};
  window.ort.env = window.ort.env || {};
  window.ort.env.wasm = window.ort.env.wasm || {};
  
  // Set WASM paths BEFORE anything loads
  window.ort.env.wasm.wasmPaths = '/vendor/onnxruntime-1.17.0/';
  
  // Disable threading initially (known to cause issues)
  window.ort.env.wasm.numThreads = 1;
  
  // Disable SIMD if causing issues (fallback)
  // window.ort.env.wasm.simd = false;
  
  console.log('[ONNX-Init] WASM paths pre-configured:', window.ort.env.wasm.wasmPaths);
})();
```

**Update index.html:**
```html
<!-- BEFORE any module imports -->
<script src="/src/config/onnx-init.js"></script>
<script type="module">
  // Now safe to import
  import * as ModelManager from './src/ui/ModelManager.js';
  // ...
</script>
```

**Deliverable:** `src/config/onnx-init.js`

---

### 1.4 Disable WebGPU Temporarily (Hour 6-7)

**Problem:** WebGPU detection passes but initialization fails silently
**Solution:** Force WASM backend until WASM is stable

**Update:** `src/ui/InferenceEngine.js`
```javascript
export async function init() {
  // TEMPORARY: Force WASM while debugging
  const FORCE_WASM = true; // TODO: Remove after WebGPU verified
  
  if (FORCE_WASM) {
    console.log('[InferenceEngine] WASM mode forced for stability');
    engineState.webgpuAvailable = false;
    engineState.backend = 'wasm';
    engineState.initialized = true;
    return 'wasm';
  }
  
  // Original WebGPU detection code (disabled)
  // ...
}
```

**Deliverable:** Patched `src/ui/InferenceEngine.js`

---

### 1.5 Verification Testing (Hours 7-8)

**Test Script:** `test/verify-phase1.js`
```javascript
// Run in browser console after Phase 1 deploy

async function verifyPhase1() {
  const results = {
    cacheCleared: localStorage.getItem('cache-nuclear-clear') === '2024-12-09-nuclear-v1',
    wasmPathsSet: window.ort?.env?.wasm?.wasmPaths === '/vendor/onnxruntime-1.17.0/',
    wasmFileAccessible: false,
    transformersLoads: false,
    modelLoads: false
  };
  
  // Test WASM file access
  try {
    const resp = await fetch('/vendor/onnxruntime-1.17.0/ort-wasm-simd.wasm', { method: 'HEAD' });
    results.wasmFileAccessible = resp.ok;
  } catch (e) {
    results.wasmFileAccessible = false;
  }
  
  // Test Transformers.js loads
  try {
    const { env } = await import('/vendor/transformers.js');
    results.transformersLoads = true;
    results.transformersConfig = {
      allowLocalModels: env.allowLocalModels,
      localModelPath: env.localModelPath
    };
  } catch (e) {
    results.transformersError = e.message;
  }
  
  // Test a single model loads
  try {
    const { pipeline } = await import('/vendor/transformers.js');
    const classifier = await pipeline('image-classification', 'dima806_ai_real', {
      device: 'wasm',
      local_files_only: true
    });
    results.modelLoads = true;
    classifier.dispose();
  } catch (e) {
    results.modelError = e.message;
  }
  
  console.table(results);
  return results;
}

verifyPhase1();
```

**Success Criteria:**
- [ ] `cacheCleared: true`
- [ ] `wasmPathsSet: true`
- [ ] `wasmFileAccessible: true`
- [ ] `transformersLoads: true`
- [ ] `modelLoads: true`

---

## Phase 2: Model Tiers & Graceful Degradation (Days 4-7)

### Goal: All models categorized by reliability, graceful fallbacks

### 2.1 Model Tiering System

**Tier 1 - Transformers.js (High Reliability)**
- dima806_ai_real
- smogy  
- haywood
- umm_maybe
- prithiv_v2
- ateeqq

**Tier 2 - Raw ONNX Runtime (Medium Reliability)**
- cnn_detection
- npr
- trufor
- ucf

**Tier 3 - Face Detection (Requires Face)**
- All face manipulation models

**Implementation:** `src/config/model-tiers.js`
```javascript
export const MODEL_TIERS = {
  TIER_1_RELIABLE: {
    models: ['dima806_ai_real', 'smogy', 'haywood', 'umm_maybe', 'prithiv_v2', 'ateeqq'],
    runtime: 'transformers',
    fallbackToServer: false,
    minForConsensus: 2
  },
  TIER_2_EXPERIMENTAL: {
    models: ['cnn_detection', 'npr', 'trufor', 'ucf'],
    runtime: 'onnx-direct',
    fallbackToServer: true,
    minForConsensus: 1
  },
  TIER_3_SPECIALIZED: {
    models: ['dfdc_efficientnet', 'ff_efficientnet', 'faceforensics'],
    runtime: 'onnx-direct',
    requiresFace: true,
    fallbackToServer: true
  }
};

export function getModelTier(modelId) {
  for (const [tier, config] of Object.entries(MODEL_TIERS)) {
    if (config.models.includes(modelId)) {
      return { tier, ...config };
    }
  }
  return null;
}
```

---

### 2.2 Graceful Degradation Engine

**Create:** `src/ui/FallbackEngine.js`
```javascript
export class FallbackEngine {
  constructor() {
    this.failedModels = new Set();
    this.workingModels = new Set();
  }
  
  async runWithFallback(modelId, image, options = {}) {
    const tier = getModelTier(modelId);
    
    // Try client-side first
    try {
      const result = await this.runClientSide(modelId, image);
      this.workingModels.add(modelId);
      return { source: 'client', result };
    } catch (clientError) {
      console.warn(`[Fallback] ${modelId} failed client-side:`, clientError.message);
      this.failedModels.add(modelId);
      
      // If tier allows server fallback AND FrankenPHP endpoint exists
      if (tier?.fallbackToServer && options.serverEndpoint) {
        try {
          const result = await this.runServerSide(modelId, image, options.serverEndpoint);
          return { source: 'server', result };
        } catch (serverError) {
          console.error(`[Fallback] ${modelId} failed server-side:`, serverError.message);
        }
      }
      
      // Return null result with metadata
      return { 
        source: 'failed', 
        result: null,
        error: clientError.message,
        modelId
      };
    }
  }
  
  async runClientSide(modelId, image) {
    // Existing inference logic
  }
  
  async runServerSide(modelId, image, endpoint) {
    const formData = new FormData();
    formData.append('image', image);
    formData.append('model', modelId);
    
    const response = await fetch(endpoint, {
      method: 'POST',
      body: formData
    });
    
    if (!response.ok) throw new Error(`Server returned ${response.status}`);
    return response.json();
  }
  
  getHealthReport() {
    return {
      working: [...this.workingModels],
      failed: [...this.failedModels],
      healthScore: this.workingModels.size / (this.workingModels.size + this.failedModels.size)
    };
  }
}
```

---

### 2.3 Consensus with Partial Results

**Update:** Analysis result aggregation to handle partial failures

```javascript
function aggregateResults(results) {
  const successful = results.filter(r => r.source !== 'failed');
  const failed = results.filter(r => r.source === 'failed');
  
  if (successful.length === 0) {
    return {
      verdict: 'ERROR',
      message: 'All models failed to load',
      failedModels: failed.map(f => f.modelId),
      confidence: 0
    };
  }
  
  if (successful.length < 3) {
    // Low confidence with few models
    const avgScore = successful.reduce((sum, r) => sum + r.result.score, 0) / successful.length;
    return {
      verdict: avgScore > 0.6 ? 'LIKELY_AI' : avgScore < 0.4 ? 'LIKELY_HUMAN' : 'UNCERTAIN',
      message: `Low confidence (only ${successful.length} models responded)`,
      confidence: Math.round(Math.max(avgScore, 1 - avgScore) * 100 * 0.7), // Penalize confidence
      warning: `${failed.length} models failed to load`
    };
  }
  
  // Normal aggregation with 3+ models
  // ... existing logic
}
```

---

### 2.4 Server-Side Fallback Endpoint (FrankenPHP)

**Create:** `server/inference.php`
```php
<?php
// FrankenPHP inference endpoint for fallback

use function Swoole\Coroutine\run;

// Only accept POST
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    exit(json_encode(['error' => 'Method not allowed']));
}

$allowedModels = ['cnn_detection', 'npr', 'trufor', 'ucf'];
$modelId = $_POST['model'] ?? '';

if (!in_array($modelId, $allowedModels)) {
    http_response_code(400);
    exit(json_encode(['error' => 'Invalid model']));
}

if (!isset($_FILES['image'])) {
    http_response_code(400);
    exit(json_encode(['error' => 'No image provided']));
}

// Validate image
$finfo = new finfo(FILEINFO_MIME_TYPE);
$mimeType = $finfo->file($_FILES['image']['tmp_name']);
if (!in_array($mimeType, ['image/jpeg', 'image/png', 'image/webp'])) {
    http_response_code(400);
    exit(json_encode(['error' => 'Invalid image type']));
}

// Run inference via Python subprocess or FFI
// This is where you'd integrate with native ONNX Runtime
$imagePath = $_FILES['image']['tmp_name'];
$modelPath = "/models/{$modelId}/model.onnx";

// Option A: Python subprocess
$result = shell_exec("python3 /scripts/infer.py --model {$modelPath} --image {$imagePath} 2>&1");

// Option B: PHP FFI to ONNX Runtime C API (more complex but faster)
// $ort = FFI::cdef(...);

header('Content-Type: application/json');
echo json_encode([
    'model' => $modelId,
    'score' => floatval($result),
    'source' => 'server'
]);
```

---

## Phase 3: WebGPU Re-enablement & Performance (Days 8-14)

### Goal: WebGPU acceleration working, sub-2s inference

### 3.1 WebGPU Diagnostic Suite

**Create:** `test/webgpu-diagnostics.html`
```html
<!DOCTYPE html>
<html>
<head><title>WebGPU Diagnostics</title></head>
<body>
<pre id="output"></pre>
<script type="module">
const log = (msg) => document.getElementById('output').textContent += msg + '\n';

async function diagnose() {
  log('=== WebGPU Diagnostics ===\n');
  
  // Step 1: API availability
  log('1. navigator.gpu exists: ' + ('gpu' in navigator));
  if (!('gpu' in navigator)) {
    log('FAIL: WebGPU API not available');
    return;
  }
  
  // Step 2: Adapter request
  log('\n2. Requesting adapter...');
  try {
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) {
      log('FAIL: No adapter returned');
      return;
    }
    log('   Adapter name: ' + (adapter.name || 'unknown'));
    log('   Adapter vendor: ' + (adapter.vendor || 'unknown'));
    
    // Step 3: Device request
    log('\n3. Requesting device...');
    const device = await adapter.requestDevice();
    log('   Device created: ' + !!device);
    
    // Step 4: Limits
    log('\n4. Device limits:');
    log('   maxBufferSize: ' + device.limits.maxBufferSize);
    log('   maxStorageBufferBindingSize: ' + device.limits.maxStorageBufferBindingSize);
    log('   maxComputeWorkgroupSizeX: ' + device.limits.maxComputeWorkgroupSizeX);
    
    // Step 5: Test compute shader
    log('\n5. Testing compute shader...');
    const module = device.createShaderModule({
      code: `
        @group(0) @binding(0) var<storage, read_write> data: array<f32>;
        @compute @workgroup_size(64)
        fn main(@builtin(global_invocation_id) id: vec3u) {
          data[id.x] = data[id.x] * 2.0;
        }
      `
    });
    
    const pipeline = device.createComputePipeline({
      layout: 'auto',
      compute: { module, entryPoint: 'main' }
    });
    log('   Compute pipeline created: ' + !!pipeline);
    
    // Step 6: Test buffer operations
    log('\n6. Testing buffer operations...');
    const buffer = device.createBuffer({
      size: 256,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST
    });
    log('   Buffer created: ' + !!buffer);
    
    // Cleanup
    buffer.destroy();
    device.destroy();
    
    log('\n=== WebGPU PASSED ===');
    
  } catch (e) {
    log('ERROR: ' + e.message);
    log('Stack: ' + e.stack);
  }
}

diagnose();
</script>
</body>
</html>
```

---

### 3.2 Gradual WebGPU Rollout

**Strategy:** Feature flag with A/B testing

```javascript
// src/config/feature-flags.js
export const FEATURES = {
  WEBGPU_ENABLED: {
    default: false,
    // Enable via URL param: ?webgpu=true
    urlParam: 'webgpu',
    // Or percentage rollout
    rolloutPercent: 0, // Start at 0%, increase gradually
  }
};

export function isFeatureEnabled(featureName) {
  const feature = FEATURES[featureName];
  if (!feature) return false;
  
  // Check URL override
  const params = new URLSearchParams(window.location.search);
  if (params.has(feature.urlParam)) {
    return params.get(feature.urlParam) === 'true';
  }
  
  // Check rollout percentage
  const userId = localStorage.getItem('userId') || Math.random().toString(36);
  localStorage.setItem('userId', userId);
  const hash = hashCode(userId + featureName);
  const bucket = Math.abs(hash) % 100;
  
  return bucket < feature.rolloutPercent;
}

function hashCode(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return hash;
}
```

---

### 3.3 Performance Monitoring

**Create:** `src/ui/PerformanceMonitor.js`
```javascript
export class PerformanceMonitor {
  constructor() {
    this.metrics = [];
  }
  
  startInference(modelId) {
    return {
      modelId,
      startTime: performance.now(),
      memoryBefore: performance.memory?.usedJSHeapSize
    };
  }
  
  endInference(context, success, error = null) {
    const metric = {
      ...context,
      endTime: performance.now(),
      duration: performance.now() - context.startTime,
      memoryAfter: performance.memory?.usedJSHeapSize,
      memoryDelta: (performance.memory?.usedJSHeapSize || 0) - (context.memoryBefore || 0),
      success,
      error: error?.message,
      backend: window.__INFERENCE_BACKEND__ || 'unknown',
      timestamp: Date.now()
    };
    
    this.metrics.push(metric);
    this.report(metric);
    
    return metric;
  }
  
  report(metric) {
    // Console logging for debugging
    console.log(`[Perf] ${metric.modelId}: ${metric.duration.toFixed(0)}ms (${metric.success ? 'OK' : 'FAIL'})`);
    
    // Optional: Send to analytics endpoint
    if (window.ANALYTICS_ENDPOINT) {
      navigator.sendBeacon(window.ANALYTICS_ENDPOINT, JSON.stringify(metric));
    }
  }
  
  getSummary() {
    const successful = this.metrics.filter(m => m.success);
    return {
      totalRuns: this.metrics.length,
      successRate: successful.length / this.metrics.length,
      avgDuration: successful.reduce((s, m) => s + m.duration, 0) / successful.length,
      p95Duration: this.percentile(successful.map(m => m.duration), 95),
      byModel: this.groupBy(this.metrics, 'modelId')
    };
  }
  
  percentile(arr, p) {
    const sorted = [...arr].sort((a, b) => a - b);
    const idx = Math.ceil(sorted.length * p / 100) - 1;
    return sorted[idx];
  }
  
  groupBy(arr, key) {
    return arr.reduce((acc, item) => {
      acc[item[key]] = acc[item[key]] || [];
      acc[item[key]].push(item);
      return acc;
    }, {});
  }
}
```

---

## File Manifest

### New Files to Create

```
patches/
├── 001-cache-nuclear.js          # Emergency cache clear
├── 002-onnx-init.js              # Pre-import ONNX config

src/config/
├── onnx-init.js                  # WASM path initialization
├── model-tiers.js                # Model reliability tiers
├── feature-flags.js              # A/B testing flags

src/ui/
├── FallbackEngine.js             # Graceful degradation
├── PerformanceMonitor.js         # Inference metrics

server/
├── inference.php                 # FrankenPHP fallback endpoint
├── infer.py                      # Python ONNX inference script

test/
├── verify-phase1.js              # Phase 1 verification
├── webgpu-diagnostics.html       # WebGPU testing page
├── model-health-check.html       # Model loading verification

vendor/onnxruntime-1.17.0/
├── ort.min.js
├── ort.wasm.min.js
├── ort-wasm.wasm
├── ort-wasm-simd.wasm
├── ort-wasm-simd-threaded.wasm
├── ort-wasm-threaded.wasm
```

### Files to Modify

```
index.html
├── Add cache nuclear script (before all other scripts)
├── Add onnx-init.js import
├── Update CSP if needed

src/ui/InferenceEngine.js
├── Add FORCE_WASM flag
├── Integrate PerformanceMonitor
├── Add WebGPU feature flag check

src/ui/ModelManager.js
├── Integrate model tiers
├── Add health reporting

src/config/paths.js
├── Update WASM paths to vendor/onnxruntime-1.17.0/

service-worker.js
├── Bump version to force refresh
├── Add network-first for WASM files
```

---

## Deployment Checklist

### Phase 1 Deploy

- [ ] Download ONNX Runtime 1.17.0 files to `vendor/onnxruntime-1.17.0/`
- [ ] Create `src/config/onnx-init.js`
- [ ] Add cache nuclear script to `index.html`
- [ ] Update `InferenceEngine.js` with FORCE_WASM
- [ ] Bump service-worker.js version
- [ ] rsync to server
- [ ] Fix permissions: `sudo chown -R caddy:caddy /var/www/definitelynot.ai/look`
- [ ] Test with verify-phase1.js
- [ ] Monitor error rates for 24 hours

### Phase 2 Deploy

- [ ] Create model-tiers.js
- [ ] Create FallbackEngine.js
- [ ] Update analysis aggregation
- [ ] Deploy FrankenPHP endpoint (if using)
- [ ] Test graceful degradation
- [ ] Monitor partial success rates

### Phase 3 Deploy

- [ ] Create WebGPU diagnostics page
- [ ] Create feature-flags.js
- [ ] Enable WebGPU for 1% of users
- [ ] Monitor performance metrics
- [ ] Gradually increase rollout
- [ ] Full WebGPU enable at 100%

---

## Risk Mitigation

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Cache clear breaks returning users | Medium | Low | Clear only corrupted items, show loading message |
| ONNX version mismatch | High | High | Pin exact versions, test before deploy |
| WebGPU still broken after fix | Medium | Medium | Keep WASM as stable fallback |
| Server fallback overloaded | Low | Medium | Rate limit, queue system |
| Model files missing on server | Medium | High | Verification script before deploy |

---

## Success Metrics

### Phase 1 Success
- 3+ models load without errors
- Zero "buffer undefined" errors in console
- Page loads in under 3 seconds
- Service worker caches correctly

### Phase 2 Success  
- All Tier 1 models working (6/6)
- Graceful degradation shown for Tier 2 failures
- Users see results even with partial failures
- Server fallback responds in <5s

### Phase 3 Success
- WebGPU acceleration working for 90%+ of Chrome users
- Average inference time <2s per model
- Zero silent WebGPU failures
- Performance dashboard showing metrics

---

## Rollback Plan

If Phase 1 fails:
```bash
# Revert to previous index.html
git checkout HEAD~1 -- index.html
rsync -avz . adept:/var/www/definitelynot.ai/look/

# Or disable all models temporarily
# Update ModelManager.js to return empty arrays
```

If Phase 2 fails:
```bash
# Disable fallback engine
# Revert to Phase 1 simple architecture
```

If Phase 3 fails:
```bash
# Set WEBGPU_ENABLED rollout to 0%
# All users fall back to WASM
```

---

## Commands Reference

```bash
# Deploy to server
rsync -avz --exclude=node_modules --exclude=.git . adept:/var/www/definitelynot.ai/look/

# Fix permissions
ssh adept 'sudo chown -R caddy:caddy /var/www/definitelynot.ai/look && sudo chmod -R 755 /var/www/definitelynot.ai/look'

# View server logs
ssh adept 'tail -f /var/log/caddy/look.definitelynot.ai.log'

# Check WASM files accessible
curl -I https://look.definitelynot.ai/vendor/onnxruntime-1.17.0/ort-wasm-simd.wasm

# Local testing
npm run debug
```
