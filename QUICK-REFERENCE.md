# 📋 Quick Reference Card - Phase 1 Fixes

## The Problem (TL;DR)

```
User uploads image → Models fail to load → "buffer undefined" error
                                        ↑
                          WASM binaries corrupted in cache
                          + WebGPU detection false positive
                          + ONNX paths set too late
```

## The Fix (TL;DR)

1. **Nuclear cache clear** - Force users to get fresh files
2. **Vendor ONNX locally** - No CDN dependencies
3. **Pre-set WASM paths** - Before any imports happen
4. **Force WASM mode** - Until WebGPU is verified working

---

## Commands Cheatsheet

```bash
# Setup (run once)
chmod +x scripts/setup-phase1.sh
./scripts/setup-phase1.sh

# Deploy
chmod +x scripts/deploy-phase1.sh
./scripts/deploy-phase1.sh

# Quick rsync (manual)
rsync -avz --exclude=node_modules --exclude=.git . adept:/var/www/definitelynot.ai/look/

# Fix permissions
ssh adept 'sudo chown -R caddy:caddy /var/www/definitelynot.ai/look'

# View server logs
ssh adept 'tail -f /var/log/caddy/look.definitelynot.ai.log'

# Check WASM accessible
curl -I https://look.definitelynot.ai/vendor/onnxruntime-1.17.0/ort-wasm-simd.wasm
```

---

## Files Created

| File | Purpose |
|------|---------|
| `patches/001-cache-nuclear.js` | Emergency cache clear |
| `src/config/onnx-init.js` | Pre-import ONNX config |
| `src/ui/InferenceEngine.js` | Patched with FORCE_WASM |
| `test/verify-phase1.html` | Verification test suite |
| `scripts/setup-phase1.sh` | Downloads ONNX Runtime |
| `scripts/deploy-phase1.sh` | Deploys to server |

---

## index.html Changes

Add these scripts **IMMEDIATELY after `<body>`**:

```html
<body>
  <script src="/patches/001-cache-nuclear.js"></script>
  <script src="/src/config/onnx-init.js"></script>
  <!-- ... rest of page ... -->
```

---

## Verification Checklist

After deploy, run tests at: `https://look.definitelynot.ai/test/verify-phase1.html`

- [ ] Cache Nuclear Clear: PASS
- [ ] ONNX Init Script Loaded: PASS
- [ ] WASM Paths Configured: PASS
- [ ] WASM Files Accessible: PASS
- [ ] Transformers.js Loads: PASS
- [ ] Model Config Accessible: PASS
- [ ] Model Pipeline Creates: PASS
- [ ] Inference Runs: PASS

---

## Console Logs to Look For

**Good signs:**
```
[CacheNuclear] Already cleared for version: 2024-12-09-nuclear-v1
[ONNX-Init] WASM paths pre-configured: /vendor/onnxruntime-1.17.0/
[InferenceEngine] FORCE_WASM enabled - bypassing WebGPU detection
[InferenceEngine] Initialized with WASM backend (forced)
```

**Bad signs:**
```
❌ TypeError: Cannot read properties of undefined (reading 'buffer')
❌ no available backend found
❌ CSP blocked script
```

---

## Rollback

If Phase 1 breaks things worse:

```bash
# Revert to previous index.html
git checkout HEAD~1 -- index.html

# Disable the cache nuclear script
mv patches/001-cache-nuclear.js patches/001-cache-nuclear.js.disabled

# Re-deploy
./scripts/deploy-phase1.sh
```

---

## Phase 2 Preview

Once Phase 1 is stable:
1. Add model tiers (reliable vs experimental)
2. Add graceful degradation
3. Add FrankenPHP server fallback
4. Re-enable WebGPU with feature flag

---

## Support

- Debug mode: Add `?debug=1` to URL
- Run diagnostics: `window.__runInferenceDiagnostics__()` in console
- Verify ONNX: `window.__verifyONNXInit__()` in console
