# Automated Testing Infrastructure for web-gpu-fix

## Overview

This document outlines an automated testing infrastructure that enables Claude Code to independently test the deepfake detector web application without manual intervention.

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Test Orchestrator                    │
│                  (test-runner.mjs)                      │
└────────────┬────────────────────────────────────────────┘
             │
             ├─────► Playwright Browser Automation
             │       - Headless Chrome/Firefox
             │       - WebGPU/WASM backend control
             │       - Console log capture
             │       - Screenshot capture
             │
             ├─────► Test Image Library
             │       - Known AI-generated images
             │       - Known real images
             │       - Edge cases (low quality, etc.)
             │
             ├─────► Assertion Engine
             │       - Model loading verification
             │       - Prediction accuracy checks
             │       - Performance benchmarks
             │       - Console error detection
             │
             └─────► Test Reports
                     - JSON results
                     - HTML dashboard
                     - Console logs
                     - Screenshots on failure
```

## Components

### 1. Test Runner (`tests/test-runner.mjs`)

**Purpose:** Orchestrate all test execution and reporting

**Features:**
- Launch local dev server or test against production URL
- Run tests in parallel for speed
- Capture browser console logs
- Take screenshots on failures
- Generate detailed reports
- Exit with proper status codes for CI/CD

**Usage:**
```bash
# Test local development
node tests/test-runner.mjs --local

# Test production deployment
node tests/test-runner.mjs --url https://look.definitelynot.ai

# Test specific models
node tests/test-runner.mjs --models prithiv_v2,smogy

# Run with headful browser (debugging)
node tests/test-runner.mjs --headful
```

### 2. Test Image Library (`tests/images/`)

**Structure:**
```
tests/images/
├── ai-generated/
│   ├── midjourney-1.png        # Known AI (Midjourney)
│   ├── dalle-1.png              # Known AI (DALL-E)
│   ├── stable-diffusion-1.png   # Known AI (Stable Diffusion)
│   └── metadata.json            # Ground truth labels
├── real/
│   ├── photograph-1.png         # Known Real (camera photo)
│   ├── painting-1.png           # Known Real (digital painting)
│   ├── drawing-1.png            # Known Real (hand drawing)
│   └── metadata.json            # Ground truth labels
└── edge-cases/
    ├── low-quality.png          # Test robustness
    ├── grayscale.png            # Test color handling
    └── metadata.json
```

**metadata.json format:**
```json
{
  "midjourney-1.png": {
    "groundTruth": "AI",
    "source": "Midjourney v6",
    "category": "digital_art",
    "expectedConfidence": ">70"
  },
  "photograph-1.png": {
    "groundTruth": "REAL",
    "source": "Canon EOS camera",
    "category": "photograph",
    "expectedConfidence": ">70"
  }
}
```

### 3. Test Suites

#### Suite A: Smoke Tests (Fast - 30 seconds)
- ✅ Page loads without errors
- ✅ Service worker registers
- ✅ ONNX runtime initializes
- ✅ WebGPU detection works
- ✅ Model registry loads
- ✅ UI components render

#### Suite B: Model Loading Tests (Medium - 2 minutes)
- ✅ Each model loads successfully
- ✅ Model files cached properly
- ✅ No console errors during loading
- ✅ Memory usage stays reasonable
- ✅ Loading progress updates correctly

#### Suite C: Prediction Tests (Slow - 5 minutes)
- ✅ Predict on known AI images → expect AI verdict
- ✅ Predict on known Real images → expect REAL verdict
- ✅ Confidence values are percentages (0-100)
- ✅ All models complete without errors
- ✅ Results aggregate correctly
- ✅ Timing information accurate

#### Suite D: End-to-End Workflows (Comprehensive - 10 minutes)
- ✅ Upload image → analyze → see results
- ✅ Switch between models
- ✅ Clear cache → reload → verify models reload
- ✅ Service worker update cycle
- ✅ Error handling (bad images, timeouts)

#### Suite E: Performance Tests (Benchmarks)
- ⏱️ Model load time < 5 seconds per model
- ⏱️ Inference time < 3 seconds per model
- ⏱️ Total analysis time < 15 seconds for 4 models
- 💾 Memory usage < 2GB total
- 💾 IndexedDB cache size < 1GB

### 4. Browser Test Helpers (`tests/browser-helpers.mjs`)

```javascript
export async function loadApp(page, url) {
  // Navigate to app
  await page.goto(url);

  // Wait for critical resources
  await page.waitForSelector('#app', { timeout: 10000 });

  // Collect console logs
  const logs = [];
  page.on('console', msg => logs.push({
    type: msg.type(),
    text: msg.text(),
    timestamp: Date.now()
  }));

  return { logs };
}

export async function uploadImage(page, imagePath) {
  // Trigger file upload
  const input = await page.locator('input[type="file"]');
  await input.setInputFiles(imagePath);

  // Wait for analysis to start
  await page.waitForSelector('.analyzing-indicator', { timeout: 5000 });
}

export async function waitForResults(page, timeout = 30000) {
  // Wait for results panel
  await page.waitForSelector('.results-panel', { timeout });

  // Extract results
  const results = await page.evaluate(() => {
    // Access the inference engine's last result
    return window.lastAnalysisResult;
  });

  return results;
}

export async function getConsoleLogs(page, filter = null) {
  const logs = page._logs || [];

  if (filter) {
    return logs.filter(log => log.text.includes(filter));
  }

  return logs;
}

export async function checkForErrors(page) {
  const errors = await page.evaluate(() => {
    return window._capturedErrors || [];
  });

  return errors;
}
```

### 5. Playwright Configuration (`playwright.config.js`)

```javascript
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,

  use: {
    baseURL: 'http://localhost:8000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  projects: [
    {
      name: 'chromium-webgpu',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: {
          args: [
            '--enable-unsafe-webgpu',
            '--enable-features=Vulkan',
          ]
        }
      },
    },
    {
      name: 'chromium-wasm',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: {
          args: ['--disable-webgpu']
        }
      },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
  ],

  webServer: {
    command: 'python -m http.server 8000',
    url: 'http://localhost:8000',
    reuseExistingServer: !process.env.CI,
  },
});
```

### 6. Example Test (`tests/prediction-accuracy.spec.mjs`)

```javascript
import { test, expect } from '@playwright/test';
import { loadApp, uploadImage, waitForResults } from './browser-helpers.mjs';
import fs from 'fs';

// Load test image metadata
const aiImageMeta = JSON.parse(fs.readFileSync('tests/images/ai-generated/metadata.json'));
const realImageMeta = JSON.parse(fs.readFileSync('tests/images/real/metadata.json'));

test.describe('Prediction Accuracy Tests', () => {

  test('should detect AI-generated image correctly', async ({ page }) => {
    // Load app
    await loadApp(page, '/');

    // Upload AI image
    await uploadImage(page, 'tests/images/ai-generated/midjourney-1.png');

    // Wait for analysis
    const results = await waitForResults(page);

    // Assert verdict
    expect(results.verdict).toMatch(/AI_GENERATED|LIKELY_AI/);

    // Assert confidence
    expect(results.confidence).toBeGreaterThan(70);

    // Assert all models completed
    expect(results.modelResults.filter(r => r.success)).toHaveLength(4);

    // Check console for errors
    const consoleLogs = await page.evaluate(() => window._consoleLogs);
    const errors = consoleLogs.filter(log => log.type === 'error');
    expect(errors).toHaveLength(0);
  });

  test('should detect real photograph correctly', async ({ page }) => {
    await loadApp(page, '/');
    await uploadImage(page, 'tests/images/real/photograph-1.png');

    const results = await waitForResults(page);

    expect(results.verdict).toMatch(/HUMAN_CREATED|LIKELY_REAL/);
    expect(results.confidence).toBeGreaterThan(70);
  });

  test('all models should complete without errors', async ({ page }) => {
    await loadApp(page, '/');
    await uploadImage(page, 'tests/images/ai-generated/midjourney-1.png');

    const results = await waitForResults(page);

    // Check that all 4 models completed
    expect(results.modelResults).toHaveLength(4);

    // Check that all succeeded
    const successful = results.modelResults.filter(r => r.success);
    expect(successful).toHaveLength(4);

    // Check that no model failed
    const failed = results.modelResults.filter(r => !r.success);
    expect(failed).toHaveLength(0);
  });

  test('confidence values should be percentages (0-100)', async ({ page }) => {
    await loadApp(page, '/');
    await uploadImage(page, 'tests/images/ai-generated/dalle-1.png');

    const results = await waitForResults(page);

    // Check aggregate confidence
    expect(results.confidence).toBeGreaterThanOrEqual(0);
    expect(results.confidence).toBeLessThanOrEqual(100);

    // Check each model's confidence
    results.modelResults.forEach(model => {
      expect(model.confidence).toBeGreaterThanOrEqual(0);
      expect(model.confidence).toBeLessThanOrEqual(100);
    });
  });
});
```

### 7. CI/CD Integration (GitHub Actions)

```yaml
# .github/workflows/test.yml
name: E2E Tests

on:
  push:
    branches: [ main, master ]
  pull_request:
    branches: [ main, master ]

jobs:
  test:
    runs-on: ubuntu-latest

    steps:
    - uses: actions/checkout@v3

    - uses: actions/setup-node@v3
      with:
        node-version: '20'

    - name: Install dependencies
      run: npm ci

    - name: Install Playwright Browsers
      run: npx playwright install --with-deps chromium

    - name: Run tests
      run: npm test

    - uses: actions/upload-artifact@v3
      if: failure()
      with:
        name: test-results
        path: |
          test-results/
          screenshots/
```

## Implementation Steps

### Phase 1: Setup (1 hour)
1. Install Playwright: `npm install -D @playwright/test`
2. Create `tests/` directory structure
3. Add basic test runner script
4. Create smoke test

### Phase 2: Test Images (30 minutes)
1. Collect 10 known AI images (Midjourney, DALL-E, SD)
2. Collect 10 known real images (photos, paintings)
3. Create metadata.json files with ground truth
4. Store in `tests/images/`

### Phase 3: Core Tests (2 hours)
1. Write model loading tests
2. Write prediction accuracy tests
3. Write aggregation tests
4. Write error handling tests

### Phase 4: Automation (1 hour)
1. Configure CI/CD pipeline
2. Add test commands to package.json
3. Create test reporting dashboard
4. Document usage

## Usage for Claude Code

Once set up, I can run tests with:

```bash
# Quick smoke test
npm test -- --grep "smoke"

# Full test suite
npm test

# Test specific feature
npm test -- prediction-accuracy

# Test against production
npm test -- --url https://look.definitelynot.ai

# Debug mode (see browser)
npm test -- --headed
```

## Benefits

✅ **Independent Testing** - I can verify fixes without manual testing
✅ **Regression Detection** - Catch bugs before deployment
✅ **Performance Monitoring** - Track inference times and memory
✅ **Browser Compatibility** - Test WebGPU and WASM backends
✅ **Deployment Verification** - Verify production after deployment
✅ **Documentation** - Tests serve as usage examples

## Next Steps

1. **Create initial test infrastructure** - Set up Playwright and directory structure
2. **Add first test images** - Start with 2-3 AI and 2-3 Real images
3. **Write smoke tests** - Basic page load and initialization
4. **Expand coverage** - Add prediction and accuracy tests
5. **Automate** - Integrate with CI/CD pipeline

---

**Estimated Total Setup Time:** 4-5 hours
**Maintenance:** Minimal - update tests when features change
**ROI:** Massive - enables autonomous development and testing
