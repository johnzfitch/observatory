# Automated Testing Infrastructure

Complete test suite for the Deepfake Detector web application using Playwright.

## 📋 Overview

This testing infrastructure enables automated browser-based testing of the deepfake detection application, including:

- ✅ **Smoke Tests** - Basic application loading and initialization
- ✅ **Model Loading Tests** - Verify all models load correctly
- ✅ **Prediction Tests** - Test inference accuracy with real images
- ✅ **Aggregation Tests** - Verify multi-model result aggregation
- ✅ **Performance Tests** - Monitor inference times and memory usage

## 🚀 Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Install Playwright Browsers

```bash
npx playwright install chromium
```

### 3. Add Test Images

Add test images to these directories:
- `tests/images/ai-generated/` - AI-generated images
- `tests/images/real/` - Real photographs
- `tests/images/edge-cases/` - Edge cases

See `tests/images/*/README.md` for detailed instructions.

### 4. Run Tests

```bash
# Run all tests
npm test

# Run only smoke tests (fast)
npm run test:smoke

# Run prediction tests
npm run test:prediction

# Run with visible browser (debugging)
npm run test:headed

# Run in debug mode (step through)
npm run test:debug
```

## 📁 Directory Structure

```
tests/
├── README.md                    # This file
├── smoke.spec.js                # Smoke tests (fast)
├── prediction.spec.js           # Prediction accuracy tests
├── helpers/
│   └── browser-helpers.js       # Test utility functions
├── images/
│   ├── ai-generated/            # AI test images
│   │   ├── README.md
│   │   └── metadata.json
│   ├── real/                    # Real test images
│   │   ├── README.md
│   │   └── metadata.json
│   └── edge-cases/              # Edge case images
│       ├── README.md
│       └── metadata.json
└── fixtures/
    └── setup-test-images.js     # Image setup script
```

## 🧪 Test Suites

### Smoke Tests (`smoke.spec.js`)

Fast tests that verify basic functionality:

- ✅ Page loads without errors
- ✅ ONNX runtime initializes
- ✅ WebGPU/WASM backend detection
- ✅ Model registry loads
- ✅ Service worker registers
- ✅ UI components render

**Run:** `npm run test:smoke`
**Duration:** ~30 seconds

### Prediction Tests (`prediction.spec.js`)

Tests model inference and accuracy:

- ✅ AI images detected correctly
- ✅ Real images detected correctly
- ✅ Confidence values are percentages (0-100)
- ✅ All models complete without errors
- ✅ Results aggregate properly
- ✅ Detailed execution logging

**Run:** `npm run test:prediction`
**Duration:** ~5 minutes (requires test images)

## 🖼️ Adding Test Images

### AI-Generated Images

1. Generate or download AI-created images:
   - Midjourney, DALL-E, Stable Diffusion, etc.
   - HuggingFace AI art datasets
   - Reddit communities (r/StableDiffusion, r/midjourney)

2. Save to `tests/images/ai-generated/`

3. Update `metadata.json`:

```json
{
  "midjourney-1.png": {
    "groundTruth": "AI",
    "source": "Midjourney v6",
    "category": "digital_art",
    "expectedConfidence": ">70",
    "description": "Fantasy landscape"
  }
}
```

### Real Images

1. Download real photographs:
   - Your own camera photos
   - Unsplash.com (free stock photos)
   - Rawpixel.com (public domain)
   - Creative Commons Flickr

2. Save to `tests/images/real/`

3. Update `metadata.json` similarly

## 🔧 Configuration

### Local Testing

Default configuration tests against local dev server:
- URL: `http://localhost:8000`
- Config: `playwright.config.js`
- Server: Auto-started (`python3 -m http.server 8000`)

### Production Testing

Test against deployed site:
- URL: `https://look.definitelynot.ai`
- Config: `playwright.prod.config.js`
- Command: `npm run test:prod`

### Browser Configurations

Three browser setups are tested:

1. **chromium-webgpu** - Chrome with WebGPU enabled
2. **chromium-wasm** - Chrome with WebGPU disabled (WASM fallback)
3. **firefox** - Firefox browser

To run specific browser:
```bash
npx playwright test --project=chromium-webgpu
```

## 📊 Test Reports

### View HTML Report

```bash
npm run test:report
```

Opens an interactive HTML report showing:
- Test results by suite
- Screenshots of failures
- Video recordings
- Console logs
- Execution traces

### Test Results Location

```
test-results/
├── html-report/        # Interactive HTML report
├── results.json        # Machine-readable results
├── videos/             # Video recordings
└── screenshots/        # Failure screenshots
```

## 🛠️ Helper Functions

The `browser-helpers.js` module provides utilities:

```javascript
import {
  loadApp,              // Load and initialize app
  uploadImage,          // Upload test image
  waitForResults,       // Wait for analysis completion
  getConsoleErrors,     // Get console errors
  isWebGPUAvailable,    // Check WebGPU support
  clearCache,           // Clear SW cache
  // ... and more
} from './helpers/browser-helpers.js';
```

## 🐛 Debugging Tests

### Run Single Test

```bash
npx playwright test smoke.spec.js
```

### Run Specific Test

```bash
npx playwright test -g "should load the homepage"
```

### Debug Mode

```bash
npm run test:debug
```

Opens Playwright Inspector to step through tests.

### View Browser

```bash
npm run test:headed
```

Shows browser window during test execution.

### Capture Screenshots

```bash
npx playwright test --screenshot=on
```

## 📈 Performance Testing

Tests track:
- Model load time
- Inference time per model
- Total analysis time
- Memory usage
- Cache efficiency

View timing in test output:
```
Image: midjourney-1.png
Verdict: AI_GENERATED
Confidence: 85.3%
Inference Time: 2.4s
```

## 🔄 CI/CD Integration

### GitHub Actions

Add to `.github/workflows/test.yml`:

```yaml
name: E2E Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '20'
      - run: npm ci
      - run: npx playwright install --with-deps chromium
      - run: npm test
      - uses: actions/upload-artifact@v3
        if: failure()
        with:
          name: test-results
          path: test-results/
```

## 🎯 Best Practices

### Writing Tests

1. **Use descriptive test names**
   ```javascript
   test('should detect AI-generated images correctly', ...)
   ```

2. **Clean up after tests**
   ```javascript
   test.afterEach(async ({ page }) => {
     await clearCache(page);
   });
   ```

3. **Use helper functions**
   ```javascript
   await loadApp(page);
   await uploadImage(page, imagePath);
   const results = await waitForResults(page);
   ```

4. **Assert specific behaviors**
   ```javascript
   expect(results.verdict).toMatch(/AI_GENERATED/);
   expect(results.confidence).toBeGreaterThan(70);
   ```

### Test Maintenance

- Update tests when UI changes
- Add new tests for new features
- Keep test images up to date
- Review failing tests promptly
- Maintain metadata.json files

## 🚨 Troubleshooting

### Tests Won't Run

```bash
# Reinstall dependencies
npm install

# Reinstall browsers
npx playwright install
```

### Server Won't Start

```bash
# Check if port 8000 is in use
lsof -i :8000

# Kill process using port
kill -9 <PID>
```

### Tests Timeout

Increase timeout in `playwright.config.js`:
```javascript
timeout: 120000, // 2 minutes
```

### WebGPU Not Available

Some systems don't support WebGPU. Tests will automatically fall back to WASM.

Check with:
```bash
npx playwright test --project=chromium-wasm
```

## 📝 Examples

### Complete Test Example

```javascript
test('should analyze image end-to-end', async ({ page }) => {
  // Load app
  await loadApp(page);
  await exposeResultsToWindow(page);

  // Upload image
  await uploadImage(page, 'tests/images/ai-generated/test.png');

  // Wait for results
  const results = await waitForResults(page);

  // Assert results
  expect(results.verdict).toMatch(/AI/i);
  expect(results.confidence).toBeGreaterThan(50);

  // Check no errors
  const errors = await getConsoleErrors(page);
  expect(errors).toHaveLength(0);
});
```

## 🎓 Learning Resources

- [Playwright Documentation](https://playwright.dev)
- [Writing Tests Guide](https://playwright.dev/docs/writing-tests)
- [Best Practices](https://playwright.dev/docs/best-practices)
- [Debugging Tests](https://playwright.dev/docs/debug)

## 📞 Support

For issues with tests:
1. Check this README
2. Review test output and screenshots
3. Run tests in headed mode for visibility
4. Check browser console logs

---

**Happy Testing!** 🎉
