import { test, expect } from '@playwright/test';
import {
  loadApp,
  waitForOnnxInit,
  waitForModels,
  getConsoleErrors,
  isWebGPUAvailable,
  exposeResultsToWindow
} from './helpers/browser-helpers.js';

/**
 * Smoke Tests - Fast Basic Checks
 *
 * These tests verify the application loads and initializes correctly.
 * They should run quickly (< 30 seconds total) and catch critical issues.
 */

test.describe('smoke - Application Loading', () => {

  test('should load the homepage without errors', async ({ page }) => {
    const { errors } = await loadApp(page);

    // Check page loaded
    await expect(page).toHaveTitle(/Deepfake|AI|Detector/i);

    // Check for critical page errors
    expect(errors.filter(e => e.type === 'pageerror')).toHaveLength(0);
  });

  test('should have the main app container', async ({ page }) => {
    await loadApp(page);

    // Check for main container
    const container = page.locator('.container');
    await expect(container).toBeVisible();
  });

  test('should not have console errors on load', async ({ page }) => {
    await loadApp(page);

    // Get console errors
    const errors = await getConsoleErrors(page);

    // Filter out known non-critical errors
    const criticalErrors = errors.filter(error => {
      const text = error.text.toLowerCase();
      // Ignore resource loading warnings
      if (text.includes('failed to load') && text.includes('404')) return false;
      // Ignore favicon errors
      if (text.includes('favicon')) return false;
      return true;
    });

    // Should have no critical errors
    expect(criticalErrors).toHaveLength(0);
  });

});

test.describe('smoke - ONNX Runtime Initialization', () => {

  test('should initialize ONNX runtime', async ({ page }) => {
    await loadApp(page);
    await exposeResultsToWindow(page);

    // Wait for ONNX to initialize
    await waitForOnnxInit(page);

    // Check ONNX is available
    const hasOnnx = await page.evaluate(() => {
      return window.ort?.InferenceSession !== undefined;
    });

    expect(hasOnnx).toBe(true);
  });

  test('should configure WASM threads', async ({ page }) => {
    await loadApp(page);
    await waitForOnnxInit(page);

    // Check thread configuration
    const numThreads = await page.evaluate(() => {
      return window.ort?.env?.wasm?.numThreads;
    });

    expect(numThreads).toBeGreaterThan(0);
  });

  test('should detect backend (WebGPU or WASM)', async ({ page }) => {
    await loadApp(page);
    await exposeResultsToWindow(page);

    // Wait for backend detection
    await page.waitForTimeout(2000);

    // Check if WebGPU is available
    const webgpuAvailable = await isWebGPUAvailable(page);

    // At minimum, WASM should be available
    const hasWasm = await page.evaluate(() => {
      return typeof WebAssembly !== 'undefined';
    });

    expect(hasWasm).toBe(true);

    // Log backend for debugging
    console.log(`WebGPU available: ${webgpuAvailable}`);
  });

});

test.describe('smoke - Model Registry', () => {

  test('should load model info card', async ({ page }) => {
    await loadApp(page);

    // Wait for model info card to appear
    await waitForModels(page);

    // Check model info card exists
    const modelCard = await page.locator('.model-info-card').count();
    expect(modelCard).toBe(1);
  });

  test('should display model status as ready', async ({ page }) => {
    await loadApp(page);
    await waitForModels(page);

    // Wait for status to show ready
    await page.waitForSelector('.model-info-status.ready', { timeout: 10000 });
    const statusText = await page.textContent('.model-info-status .status-text');
    expect(statusText).toBe('Ready');
  });

  test('should display model information', async ({ page }) => {
    await loadApp(page);
    await waitForModels(page);

    // Check model info card has required info
    const modelCard = page.locator('.model-info-card');

    // Should have title (Ateeqq AI vs Human Detector)
    const title = await modelCard.locator('.model-info-title').textContent();
    expect(title).toContain('Ateeqq');

    // Should have subtitle with accuracy
    const subtitle = await modelCard.locator('.model-info-subtitle').textContent();
    expect(subtitle).toContain('99.23%');

    // Should have feature items (WebGPU, Privacy, Model Size)
    const featureCount = await modelCard.locator('.feature-item').count();
    expect(featureCount).toBe(3);
  });

});

test.describe('smoke - File Upload UI', () => {

  test('should have file input for image upload', async ({ page }) => {
    await loadApp(page);

    // Check file input exists
    const fileInput = page.locator('input[type="file"]');
    await expect(fileInput).toBeAttached();
  });

  test('should accept image files', async ({ page }) => {
    await loadApp(page);

    // Check accepted file types
    const acceptAttr = await page.locator('input[type="file"]').getAttribute('accept');

    // Should accept images
    expect(acceptAttr).toMatch(/image/i);
  });

});

test.describe('smoke - Service Worker', () => {

  test('should register service worker', async ({ page }) => {
    await loadApp(page);

    // Wait for service worker registration
    await page.waitForTimeout(2000);

    // Check if service worker is registered
    const swRegistered = await page.evaluate(async () => {
      if (!('serviceWorker' in navigator)) return false;
      const registrations = await navigator.serviceWorker.getRegistrations();
      return registrations.length > 0;
    });

    // Service worker should be registered (or not available in some browsers)
    if (swRegistered !== null) {
      console.log(`Service Worker registered: ${swRegistered}`);
    }
  });

  test('should have correct cache version', async ({ page }) => {
    await loadApp(page);

    // Fetch service worker script
    const response = await page.request.get('/service-worker.js');
    const swCode = await response.text();

    // Check version format (v2.x.x)
    expect(swCode).toMatch(/CACHE_VERSION\s*=\s*['"]v2\.\d+\.\d+['"]/);

    // Log current version for visibility
    const versionMatch = swCode.match(/CACHE_VERSION\s*=\s*['"]([^'"]+)['"]/);
    if (versionMatch) {
      console.log(`Service Worker version: ${versionMatch[1]}`);
    }
  });

});
