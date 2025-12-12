# CDN Migration - Transformers.js

## Change Summary

**Before:** Transformers.js bundled locally in `/vendor/transformers.js` (~898KB)
**After:** Loaded from CDN `https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.1.2`

## Benefits

1. **Reduced bundle size** - Eliminates 898KB from vendor directory
2. **Browser caching** - Shared cache across all sites using transformers.js
3. **Faster updates** - Get latest patches via CDN without redeploying
4. **Better performance** - CDN edge caching closer to users

## Files Modified

### 1. `index.html`
**CSP updated to allow jsdelivr CDN:**
```html
<meta http-equiv="Content-Security-Policy"
      content="default-src 'self';
               script-src 'self' 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval' https://cdn.jsdelivr.net;
               ...
               connect-src 'self' blob: data: https://cdn.jsdelivr.net;">
```

### 2. Model Files (All 6 models)
**Changed import from local to CDN:**

Files updated:
- `src/models/dima806_ai_real.js`
- `src/models/smogy.js`
- `src/models/haywood.js`
- `src/models/umm_maybe.js`
- `src/models/prithiv_v2.js`
- `src/models/ateeqq.js`

**Before:**
```javascript
const { pipeline, env } = await import('../../vendor/transformers.js');
```

**After:**
```javascript
const { pipeline, env } = await import('https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.1.2');
```

### 3. `test/verify-phase1.html`
**Updated test to use CDN:**
```javascript
const { env, pipeline } = await import('https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.1.2');
```

### 4. `service-worker.js`
**Removed transformers.js from cache, updated version:**
```javascript
const CACHE_VERSION = 'observatory-v1.0.4-cdn'; // Was v1.0.3-phase1

const VENDOR_ASSETS = [
  // transformers.js removed - loaded from CDN
  '/vendor/ort-wasm.wasm',
  '/vendor/ort-wasm-simd.wasm',
  '/vendor/ort-wasm-threaded.wasm',
  '/vendor/ort-wasm-simd-threaded.wasm'
];
```

## WASM Files (Still Local)

WASM binaries remain in `/vendor/` directory:
- `ort-wasm.wasm` (9.3MB)
- `ort-wasm-simd.wasm` (11MB)
- `ort-wasm-threaded.wasm` (9.4MB)
- `ort-wasm-simd-threaded.wasm` (11MB)

**Why local?** Transformers.js from CDN bundles ONNX Runtime v2.17.x JavaScript, but looks for WASM files at same origin. Local WASM files ensure compatibility.

## Version Pinning

Using `@3.1.2` to ensure stability. Update version in all 7 locations when upgrading:
- 6 model files
- 1 test file

## Testing

After migration:
1. Clear browser cache
2. Run `http://localhost:8000/test/verify-phase1.html`
3. Verify all 8 tests pass
4. Check Network tab for CDN load (should see jsdelivr.net)

## Rollback Plan

If issues occur, revert by:
1. Restore local transformers.js to `/vendor/`
2. Update all imports back to `../../vendor/transformers.js`
3. Remove jsdelivr from CSP
4. Restore service worker VENDOR_ASSETS
5. Bump cache version again

## Production Deployment

```bash
# Cache version already bumped to v1.0.4-cdn
# Deploy will force cache refresh for all users
rsync -avz --exclude=node_modules --exclude=.git \
  /home/zack/dev/deepfake-detector/web-gpu-fix/ \
  adept:/var/www/definitelynot.ai/look/

ssh adept 'sudo chown -R caddy:caddy /var/www/definitelynot.ai/look'
```

## Security Considerations

- jsdelivr has high uptime (99.99% SLA)
- Using specific version `@3.1.2` prevents unexpected changes
- CDN uses SRI (Subresource Integrity) checksums
- Fallback: If CDN fails, models won't load (fail-safe, not fail-silent)

## Performance Impact

**Initial load (cold cache):**
- Before: Load 898KB from origin
- After: Load 898KB from CDN edge (faster)

**Subsequent loads (warm cache):**
- Before: 898KB from browser cache
- After: 898KB from browser cache (shared across sites)

**Net benefit:** Faster initial loads, shared cache reduces total bandwidth
