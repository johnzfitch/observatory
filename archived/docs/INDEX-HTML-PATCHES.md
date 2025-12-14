# index.html Phase 1 Patches

This file documents the exact changes needed to index.html for Phase 1.

## Patch 1: Add Cache Nuclear Script (CRITICAL - Add FIRST)

Location: After `<body>` tag, BEFORE any other scripts or content

```html
<body>
  <!-- PHASE 1 FIX: Emergency cache clear - MUST BE FIRST -->
  <script src="/patches/001-cache-nuclear.js"></script>
  
  <!-- PHASE 1 FIX: ONNX pre-initialization - BEFORE module imports -->
  <script src="/src/config/onnx-init.js"></script>

  <!-- Progress Tracker Container (for model loading progress) -->
  <div id="progress-tracker" class="progress-tracker-container"></div>
  <!-- ... rest of body ... -->
```

## Patch 2: Update CSP (If External Resources Needed)

The current CSP is already correct for local-only operation:
```html
<meta http-equiv="Content-Security-Policy"
      content="default-src 'self';
               script-src 'self' 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval';
               style-src 'self' 'unsafe-inline';
               img-src 'self' blob: data:;
               worker-src 'self' blob:;
               connect-src 'self' blob: data:;">
```

No changes needed IF all ONNX Runtime is vendored locally.

## Patch 3: Service Worker Version Bump

Location: Line ~954 (service worker registration)

Change the cache name in service-worker.js:
```javascript
const CACHE_NAME = 'observatory-v1.0.3-phase1'; // Was v1.0.2
```

## Full Patched Head Section

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="description" content="AI Observatory - Advanced deepfake detection using WebGPU acceleration">
  <title>AI Observatory - Deepfake Detection</title>
  
  <!-- Security: Content Security Policy -->
  <meta http-equiv="Content-Security-Policy"
        content="default-src 'self';
                 script-src 'self' 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval';
                 style-src 'self' 'unsafe-inline';
                 img-src 'self' blob: data:;
                 worker-src 'self' blob:;
                 connect-src 'self' blob: data:;">

  <!-- Fonts (Local - No External CDN) -->
  <link rel="stylesheet" href="fonts/fonts.css">

  <!-- Styles -->
  <link rel="stylesheet" href="src/ui/styles.css">
</head>
<body>
  <!-- ============================================ -->
  <!-- PHASE 1 CRITICAL SCRIPTS - ORDER MATTERS!   -->
  <!-- ============================================ -->
  
  <!-- 1. Emergency cache clear (runs synchronously, may reload page) -->
  <script src="/patches/001-cache-nuclear.js"></script>
  
  <!-- 2. ONNX pre-initialization (sets global config before any imports) -->
  <script src="/src/config/onnx-init.js"></script>
  
  <!-- ============================================ -->
  
  <!-- Progress Tracker Container (for model loading progress) -->
  <div id="progress-tracker" class="progress-tracker-container"></div>
  
  <!-- ... rest of body content unchanged ... -->
```

## Module Script Updates

The existing module script section (around line 184) should be updated to respect the pre-configured environment:

```html
<script type="module">
  // Conditional logging for production
  const DEBUG = window.location.hostname === 'localhost' || window.location.search.includes('debug=1');
  const logger = {
    log: (...args) => DEBUG && console.log(...args),
    warn: console.warn.bind(console),
    error: console.error.bind(console)
  };

  // PHASE 1: Verify ONNX init ran
  if (!window.ort?.env?.wasm?.wasmPaths) {
    console.error('[App] ONNX init script did not run! Check script load order.');
  } else {
    logger.log('[App] ONNX paths configured:', window.ort.env.wasm.wasmPaths);
  }

  import * as ModelManager from './src/ui/ModelManager.js';
  import * as InferenceEngine from './src/ui/InferenceEngine.js';
  import { stateManager } from './src/ui/StateManager.js';
  import * as DownloadTracker from './src/ui/DownloadTracker.js';
  
  // ... rest of module code ...
</script>
```

## Files to Deploy

After applying these patches, deploy these files:

1. `/patches/001-cache-nuclear.js` (NEW)
2. `/src/config/onnx-init.js` (NEW)
3. `/src/ui/InferenceEngine.js` (MODIFIED - FORCE_WASM)
4. `/vendor/onnxruntime-1.17.0/` (NEW - all WASM files)
5. `/test/verify-phase1.html` (NEW - testing)
6. `index.html` (MODIFIED - script tags)
7. `service-worker.js` (MODIFIED - version bump)

## Verification

After deployment:

1. Clear browser cache manually (Ctrl+Shift+Del)
2. Visit: https://look.definitelynot.ai/
3. Check console for:
   - `[CacheNuclear]` messages (should see "Already cleared" or clear process)
   - `[ONNX-Init]` messages (should see WASM paths)
   - `[InferenceEngine]` messages (should see "WASM mode forced")
4. Visit: https://look.definitelynot.ai/test/verify-phase1.html
5. Run all tests - should see 8/8 pass
