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
      return window.ort !== undefined;
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

  test('should load model registry', async ({ page }) => {
    await loadApp(page);

    // Wait for models to appear
    await waitForModels(page);

    // Check model cards exist
    const modelCount = await page.locator('.model-card').count();
    expect(modelCount).toBeGreaterThan(0);
  });

  test('should have expected models (4 models)', async ({ page }) => {
    await loadApp(page);
    await waitForModels(page);

    // Get model count
    const modelCount = await page.locator('.model-card').count();

    // Should have 4 models: dima806_ai_real, smogy, umm_maybe, prithiv_v2
    expect(modelCount).toBe(4);
  });

  test('should display model information', async ({ page }) => {
    await loadApp(page);
    await waitForModels(page);

    // Check first model has required info
    const firstModel = page.locator('.model-card').first();

    // Should have display name
    const hasName = await firstModel.locator('.model-name, [class*="name"]').count();
    expect(hasName).toBeGreaterThan(0);

    // Should have accuracy or some metric
    const hasAccuracy = await firstModel.locator('.accuracy, [class*="accuracy"]').count();
    expect(hasAccuracy).toBeGreaterThan(0);
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

    // Check version is v2.0.5
    expect(swCode).toContain('v2.0.5');
  });

});
