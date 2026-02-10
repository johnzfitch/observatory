/**
 * Browser Test Helpers
 *
 * Utility functions for interacting with the deepfake detector app in tests
 */

/**
 * Load the application and wait for it to be ready
 * @param {import('@playwright/test').Page} page - Playwright page
 * @param {string} url - URL to navigate to (defaults to baseURL from config)
 * @returns {Promise<Object>} - { logs, errors }
 */
export async function loadApp(page, url = '/') {
  const consoleLogs = [];
  const consoleErrors = [];

  // Capture console messages
  page.on('console', msg => {
    const log = {
      type: msg.type(),
      text: msg.text(),
      timestamp: Date.now()
    };
    consoleLogs.push(log);

    if (msg.type() === 'error') {
      consoleErrors.push(log);
    }
  });

  // Capture page errors
  page.on('pageerror', error => {
    consoleErrors.push({
      type: 'pageerror',
      text: error.message,
      stack: error.stack,
      timestamp: Date.now()
    });
  });

  // Navigate to app
  await page.goto(url);

  // Wait for app to be ready (main container)
  await page.waitForSelector('.container, body', { timeout: 10000 });

  // Wait for service worker to register (if present)
  try {
    await page.waitForFunction(
      () => navigator.serviceWorker?.controller !== null || navigator.serviceWorker?.controller === null,
      { timeout: 5000 }
    );
  } catch (e) {
    // Service worker might not be available in all contexts
    console.log('Service worker check timed out - continuing anyway');
  }

  return {
    logs: consoleLogs,
    errors: consoleErrors
  };
}

/**
 * Wait for ONNX runtime to initialize
 * @param {import('@playwright/test').Page} page
 * @param {number} timeout - Timeout in ms
 */
export async function waitForOnnxInit(page, timeout = 10000) {
  await page.waitForFunction(
    () => window.__ONNX_RUNTIME_CONFIG__ !== undefined,
    { timeout }
  );
  await page.evaluate(async () => {
    const { init } = await import('/src/core/ort-runtime.js');
    await init();
  });
  await page.waitForFunction(
    () => window.ort?.InferenceSession !== undefined,
    { timeout }
  );
}

/**
 * Wait for models to be registered
 * @param {import('@playwright/test').Page} page
 * @param {number} timeout - Timeout in ms
 */
export async function waitForModels(page, timeout = 10000) {
  await page.waitForFunction(
    () => {
      // Check if model info card is loaded (new single-model UI)
      const modelInfoCard = document.querySelector('.model-info-card');
      if (modelInfoCard) return true;
      // Fallback: Check if model categories are loaded (legacy multi-model UI)
      const modelCategories = document.querySelectorAll('.model-category');
      return modelCategories.length > 0;
    },
    { timeout }
  );
}

/**
 * Upload an image for analysis
 * @param {import('@playwright/test').Page} page
 * @param {string} imagePath - Path to image file
 */
export async function uploadImage(page, imagePath) {
  // Find file input
  const fileInput = page.locator('input[type="file"]');

  // Upload file
  await fileInput.setInputFiles(imagePath);

  // Wait a moment for the upload to process
  await page.waitForTimeout(500);
}

/**
 * Wait for analysis to complete
 * @param {import('@playwright/test').Page} page
 * @param {number} timeout - Timeout in ms (default 60s for model loading + inference)
 * @returns {Promise<Object>} - Analysis results
 */
export async function waitForResults(page, timeout = 60000) {
  // Wait for results panel to appear
  await page.waitForSelector('.results-panel, .result-card', { timeout });

  // Wait for analysis to complete (spinner should disappear)
  await page.waitForFunction(
    () => {
      const spinner = document.querySelector('.analyzing, .loading, .spinner');
      return spinner === null || spinner.style.display === 'none';
    },
    { timeout: 5000 }
  ).catch(() => {
    // Spinner might not exist or already hidden
  });

  // Extract results from the page
  const results = await page.evaluate(() => {
    // Try to get results from window object (if exposed)
    if (window.lastAnalysisResult) {
      return window.lastAnalysisResult;
    }

    // Otherwise, parse from UI
    const resultPanel = document.querySelector('.results-panel, .result-card');
    if (!resultPanel) return null;

    // Extract basic info from UI
    const verdictElement = resultPanel.querySelector('.verdict, [class*="verdict"]');
    const confidenceElement = resultPanel.querySelector('.confidence, [class*="confidence"]');
    const probabilityElement = resultPanel.querySelector('.probability, [class*="probability"]');

    return {
      verdict: verdictElement?.textContent?.trim() || null,
      confidence: parseFloat(confidenceElement?.textContent) || null,
      aiProbability: parseFloat(probabilityElement?.textContent) || null,
      fromUI: true
    };
  });

  return results;
}

/**
 * Get console logs from the page
 * @param {import('@playwright/test').Page} page
 * @param {string} filter - Optional filter string
 * @returns {Promise<Array>} - Array of console logs
 */
export async function getConsoleLogs(page, filter = null) {
  const logs = await page.evaluate(() => {
    return window._testConsoleLogs || [];
  });

  if (filter) {
    return logs.filter(log => log.text.includes(filter));
  }

  return logs;
}

/**
 * Get console errors from the page
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<Array>} - Array of console errors
 */
export async function getConsoleErrors(page) {
  const logs = await getConsoleLogs(page);
  return logs.filter(log => log.type === 'error');
}

/**
 * Check if WebGPU is available
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<boolean>}
 */
export async function isWebGPUAvailable(page) {
  return await page.evaluate(() => {
    return 'gpu' in navigator;
  });
}

/**
 * Get backend being used (webgpu, wasm, cpu)
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<string|null>}
 */
export async function getBackend(page) {
  return await page.evaluate(() => {
    // Check console logs for backend info
    const logs = window._testConsoleLogs || [];
    const backendLog = logs.find(log =>
      log.text.includes('WebGPU available') ||
      log.text.includes('falling back to WASM') ||
      log.text.includes('using CPU fallback')
    );

    if (backendLog?.text.includes('WebGPU available')) return 'webgpu';
    if (backendLog?.text.includes('WASM')) return 'wasm';
    if (backendLog?.text.includes('CPU')) return 'cpu';

    return null;
  });
}

/**
 * Expose results to window for testing
 * Call this before running inference to capture results
 * @param {import('@playwright/test').Page} page
 */
export async function exposeResultsToWindow(page) {
  await page.evaluate(() => {
    // Store console logs
    window._testConsoleLogs = [];
    const originalLog = console.log;
    const originalError = console.error;
    const originalWarn = console.warn;

    console.log = function(...args) {
      window._testConsoleLogs.push({
        type: 'log',
        text: args.join(' '),
        timestamp: Date.now()
      });
      originalLog.apply(console, args);
    };

    console.error = function(...args) {
      window._testConsoleLogs.push({
        type: 'error',
        text: args.join(' '),
        timestamp: Date.now()
      });
      originalError.apply(console, args);
    };

    console.warn = function(...args) {
      window._testConsoleLogs.push({
        type: 'warn',
        text: args.join(' '),
        timestamp: Date.now()
      });
      originalWarn.apply(console, args);
    };
  });
}

/**
 * Get model loading status
 * @param {import('@playwright/test').Page} page
 * @param {string} modelId - Model ID to check
 * @returns {Promise<boolean>} - True if loaded
 */
export async function isModelLoaded(page, modelId) {
  return await page.evaluate((id) => {
    // Check if model module exists and is loaded
    const modelCards = document.querySelectorAll('.model-card');
    for (const card of modelCards) {
      if (card.dataset.modelId === id) {
        const status = card.querySelector('.status, [class*="status"]');
        return status?.textContent?.toLowerCase().includes('loaded') || false;
      }
    }
    return false;
  }, modelId);
}

/**
 * Click analyze button (if it exists)
 * @param {import('@playwright/test').Page} page
 */
export async function clickAnalyze(page) {
  const button = page.locator('button:has-text("Analyze"), button:has-text("Start"), #analyze-btn');
  await button.click();
}

/**
 * Clear service worker cache
 * @param {import('@playwright/test').Page} page
 */
export async function clearCache(page) {
  await page.evaluate(async () => {
    // Unregister service worker
    const registrations = await navigator.serviceWorker.getRegistrations();
    for (const registration of registrations) {
      await registration.unregister();
    }

    // Clear caches
    const cacheNames = await caches.keys();
    for (const name of cacheNames) {
      await caches.delete(name);
    }

    // Clear IndexedDB
    const dbs = await indexedDB.databases();
    for (const db of dbs) {
      indexedDB.deleteDatabase(db.name);
    }
  });
}
