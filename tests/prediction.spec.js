import { test, expect } from '@playwright/test';
import {
  loadApp,
  uploadImage,
  waitForResults,
  getConsoleErrors,
  exposeResultsToWindow
} from './helpers/browser-helpers.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Prediction Accuracy Tests
 *
 * These tests verify that the models correctly classify images.
 * Requires test images to be present in tests/images/
 */

// Helper to load metadata
function loadMetadata(category) {
  const metadataPath = path.join(__dirname, 'images', category, 'metadata.json');
  if (!fs.existsSync(metadataPath)) {
    return {};
  }
  const data = fs.readFileSync(metadataPath, 'utf-8');
  return JSON.parse(data);
}

// Helper to get test images
function getTestImages(category) {
  const dirPath = path.join(__dirname, 'images', category);
  if (!fs.existsSync(dirPath)) {
    return [];
  }

  const files = fs.readdirSync(dirPath);
  const images = files.filter(f =>
    f.endsWith('.png') || f.endsWith('.jpg') || f.endsWith('.jpeg')
  );

  return images.map(filename => ({
    filename,
    path: path.join(dirPath, filename)
  }));
}

test.describe('prediction - AI Detection', () => {

  test.skip(({ browserName }) => {
    const aiImages = getTestImages('ai-generated');
    return aiImages.length === 0;
  }, 'No AI test images found - add images to tests/images/ai-generated/');

  test('should detect AI-generated images', async ({ page }) => {
    const aiImages = getTestImages('ai-generated');
    const metadata = loadMetadata('ai-generated');

    // Skip if no images
    if (aiImages.length === 0) {
      test.skip();
      return;
    }

    // Test first AI image
    const testImage = aiImages[0];
    const meta = metadata[testImage.filename] || {};

    await loadApp(page);
    await exposeResultsToWindow(page);

    // Upload image
    await uploadImage(page, testImage.path);

    // Wait for results
    const results = await waitForResults(page);

    // Should detect as AI or likely AI
    expect(results.verdict).toMatch(/AI_GENERATED|LIKELY_AI|AI/i);

    // Log results for debugging
    console.log(`Image: ${testImage.filename}`);
    console.log(`Verdict: ${results.verdict}`);
    console.log(`Confidence: ${results.confidence}%`);
    console.log(`AI Probability: ${results.aiProbability}%`);

    // Check no errors occurred
    const errors = await getConsoleErrors(page);
    const criticalErrors = errors.filter(e => !e.text.includes('404'));
    expect(criticalErrors).toHaveLength(0);
  });

  test('should have reasonable confidence for AI images', async ({ page }) => {
    const aiImages = getTestImages('ai-generated');

    if (aiImages.length === 0) {
      test.skip();
      return;
    }

    const testImage = aiImages[0];

    await loadApp(page);
    await exposeResultsToWindow(page);
    await uploadImage(page, testImage.path);

    const results = await waitForResults(page);

    // Confidence should be a percentage (0-100)
    expect(results.confidence).toBeGreaterThanOrEqual(0);
    expect(results.confidence).toBeLessThanOrEqual(100);

    // For AI images, we expect > 50% confidence
    expect(results.confidence).toBeGreaterThan(50);
  });

});

test.describe('prediction - Real Image Detection', () => {

  test.skip(({ browserName }) => {
    const realImages = getTestImages('real');
    return realImages.length === 0;
  }, 'No real test images found - add images to tests/images/real/');

  test('should detect real photographs', async ({ page }) => {
    const realImages = getTestImages('real');
    const metadata = loadMetadata('real');

    if (realImages.length === 0) {
      test.skip();
      return;
    }

    const testImage = realImages[0];
    const meta = metadata[testImage.filename] || {};

    await loadApp(page);
    await exposeResultsToWindow(page);
    await uploadImage(page, testImage.path);

    const results = await waitForResults(page);

    // Should detect as real or likely real
    expect(results.verdict).toMatch(/HUMAN_CREATED|LIKELY_REAL|REAL/i);

    console.log(`Image: ${testImage.filename}`);
    console.log(`Verdict: ${results.verdict}`);
    console.log(`Confidence: ${results.confidence}%`);

    // Check no errors
    const errors = await getConsoleErrors(page);
    const criticalErrors = errors.filter(e => !e.text.includes('404'));
    expect(criticalErrors).toHaveLength(0);
  });

});

test.describe('prediction - Model Aggregation', () => {

  test.skip(({ browserName }) => {
    const aiImages = getTestImages('ai-generated');
    return aiImages.length === 0;
  }, 'No test images found');

  test('all models should complete without errors', async ({ page }) => {
    const aiImages = getTestImages('ai-generated');

    if (aiImages.length === 0) {
      // Try real images instead
      const realImages = getTestImages('real');
      if (realImages.length === 0) {
        test.skip();
        return;
      }
    }

    const testImages = aiImages.length > 0 ? aiImages : getTestImages('real');
    const testImage = testImages[0];

    await loadApp(page);
    await exposeResultsToWindow(page);
    await uploadImage(page, testImage.path);

    const results = await waitForResults(page);

    // Get console logs to check model execution
    const logs = await page.evaluate(() => window._testConsoleLogs || []);

    // Look for runModelsParallel completion log
    const completionLog = logs.find(log =>
      log.text.includes('[runModelsParallel] All promises completed')
    );

    // Should have completion log
    expect(completionLog).toBeDefined();

    // Look for successful results count
    const successLog = logs.find(log =>
      log.text.includes('[runModelsParallel] Successful results:')
    );

    if (successLog) {
      console.log('Success log:', successLog.text);
    }

    // Check for aggregation errors
    const aggregationError = logs.find(log =>
      log.type === 'error' && log.text.includes('All models failed')
    );

    expect(aggregationError).toBeUndefined();
  });

  test('confidence values should be percentages', async ({ page }) => {
    const testImages = getTestImages('ai-generated');
    if (testImages.length === 0) {
      test.skip();
      return;
    }

    const testImage = testImages[0];

    await loadApp(page);
    await exposeResultsToWindow(page);
    await uploadImage(page, testImage.path);

    const results = await waitForResults(page);

    // Check aggregate confidence
    expect(results.confidence).toBeGreaterThanOrEqual(0);
    expect(results.confidence).toBeLessThanOrEqual(100);

    // Check AI probability
    if (results.aiProbability !== undefined) {
      expect(results.aiProbability).toBeGreaterThanOrEqual(0);
      expect(results.aiProbability).toBeLessThanOrEqual(100);
    }
  });

  test('should log detailed execution trace', async ({ page }) => {
    const testImages = getTestImages('ai-generated');
    if (testImages.length === 0) {
      test.skip();
      return;
    }

    const testImage = testImages[0];

    await loadApp(page);
    await exposeResultsToWindow(page);
    await uploadImage(page, testImage.path);

    await waitForResults(page);

    // Get all console logs
    const logs = await page.evaluate(() => window._testConsoleLogs || []);

    // Should have runModelsParallel logs
    const parallelLogs = logs.filter(log =>
      log.text.includes('[runModelsParallel]')
    );

    expect(parallelLogs.length).toBeGreaterThan(0);

    // Should have results breakdown
    const breakdownLog = logs.find(log =>
      log.text.includes('[runModelsParallel] Results breakdown:')
    );

    expect(breakdownLog).toBeDefined();

    // Log summary for debugging
    console.log('\n=== Execution Trace ===');
    parallelLogs.forEach(log => {
      console.log(`[${log.type}] ${log.text}`);
    });
  });

});
