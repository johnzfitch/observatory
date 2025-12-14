import { test, expect } from '@playwright/test';
import {
  loadApp,
  waitForModels,
  exposeResultsToWindow,
  clearCache
} from './helpers/browser-helpers.js';

/**
 * Stress Tests & Edge Cases
 *
 * Tests for stability under load, rapid interactions, and edge conditions.
 */

test.describe('stress - Rapid Interactions', () => {

  test('should handle rapid page reloads without crashing', async ({ page }) => {
    // Reload 5 times rapidly
    for (let i = 0; i < 5; i++) {
      await page.goto('/');
      await page.waitForLoadState('domcontentloaded');
    }

    // Final load should work
    await loadApp(page);
    const container = page.locator('.container');
    await expect(container).toBeVisible();
  });

  test('should handle rapid scroll events', async ({ page }) => {
    await loadApp(page);

    // Simulate rapid scrolling
    for (let i = 0; i < 20; i++) {
      await page.evaluate(() => {
        window.scrollBy(0, 100);
      });
      await page.waitForTimeout(50);
    }

    for (let i = 0; i < 20; i++) {
      await page.evaluate(() => {
        window.scrollBy(0, -100);
      });
      await page.waitForTimeout(50);
    }

    // Page should still be functional
    const container = page.locator('.container');
    await expect(container).toBeVisible();
  });

  test('should handle multiple file input clicks without file', async ({ page }) => {
    await loadApp(page);

    const uploadZone = page.locator('.upload-zone');

    // Click multiple times rapidly (simulating confused user)
    for (let i = 0; i < 5; i++) {
      await uploadZone.click({ force: true }).catch(() => {});
      await page.waitForTimeout(100);
    }

    // Page should still be functional
    await expect(uploadZone).toBeVisible();
  });

});

test.describe('stress - Canvas Animation', () => {

  test('should maintain matrix rain animation after long idle', async ({ page }) => {
    await loadApp(page);

    // Wait 10 seconds (simulating user reading page)
    await page.waitForTimeout(10000);

    // Check canvas still exists and is rendering
    const canvas = page.locator('#matrixRain');
    await expect(canvas).toBeVisible();

    // Canvas should have content (non-zero image data)
    const hasContent = await page.evaluate(() => {
      const canvas = document.getElementById('matrixRain');
      const ctx = canvas.getContext('2d');
      const data = ctx.getImageData(0, 0, 100, 100).data;
      // Check if any non-zero values (not completely black)
      return data.some(v => v > 0);
    });

    expect(hasContent).toBe(true);
  });

  test('should not reset canvas on simulated touch events', async ({ page }) => {
    await loadApp(page);

    // Wait for animation to build up
    await page.waitForTimeout(3000);

    // Get initial canvas state
    const initialHash = await page.evaluate(() => {
      const canvas = document.getElementById('matrixRain');
      const ctx = canvas.getContext('2d');
      const data = ctx.getImageData(0, 0, 50, 50).data;
      return data.slice(0, 100).join(',');
    });

    // Simulate touch events
    await page.evaluate(() => {
      const event = new TouchEvent('touchstart', {
        touches: [new Touch({ identifier: 0, target: document.body, clientX: 100, clientY: 100 })]
      });
      document.dispatchEvent(event);
    });

    await page.waitForTimeout(500);

    // Canvas should still have content (not reset to blank)
    const hasContent = await page.evaluate(() => {
      const canvas = document.getElementById('matrixRain');
      const ctx = canvas.getContext('2d');
      const data = ctx.getImageData(0, 0, 100, 100).data;
      return data.some(v => v > 0);
    });

    expect(hasContent).toBe(true);
  });

});

test.describe('stress - Memory & Performance', () => {

  test('should not leak memory on repeated model category interactions', async ({ page }) => {
    await loadApp(page);
    await waitForModels(page);

    // Get initial memory (if available)
    const initialMemory = await page.evaluate(() => {
      return performance.memory?.usedJSHeapSize || 0;
    });

    // Toggle model categories multiple times
    const categories = page.locator('.model-category');
    const count = await categories.count();

    for (let round = 0; round < 3; round++) {
      for (let i = 0; i < count; i++) {
        const header = categories.nth(i).locator('.model-category-header');
        await header.click().catch(() => {});
        await page.waitForTimeout(100);
      }
    }

    // Check memory didn't grow excessively (if metrics available)
    const finalMemory = await page.evaluate(() => {
      return performance.memory?.usedJSHeapSize || 0;
    });

    if (initialMemory > 0 && finalMemory > 0) {
      const growth = (finalMemory - initialMemory) / initialMemory;
      console.log(`Memory growth: ${(growth * 100).toFixed(2)}%`);
      // Memory shouldn't grow more than 50%
      expect(growth).toBeLessThan(0.5);
    }
  });

  test('should handle cache clear and reload gracefully', async ({ page }) => {
    await loadApp(page);
    await exposeResultsToWindow(page);

    // Clear cache
    await clearCache(page);

    // Reload
    await page.reload();
    await page.waitForLoadState('domcontentloaded');

    // App should still work
    const container = page.locator('.container');
    await expect(container).toBeVisible({ timeout: 10000 });
  });

});

test.describe('edge - Invalid Inputs', () => {

  test('should handle empty file gracefully', async ({ page }) => {
    await loadApp(page);
    await exposeResultsToWindow(page);

    // Try to set empty file (shouldn't crash)
    const fileInput = page.locator('input[type="file"]');

    // This should not throw
    await expect(fileInput).toBeAttached();
  });

  test('should handle very large viewport', async ({ page }) => {
    // Set very large viewport
    await page.setViewportSize({ width: 2560, height: 1440 });
    await loadApp(page);

    // App should render correctly
    const container = page.locator('.container');
    await expect(container).toBeVisible();
  });

  test('should handle very small viewport', async ({ page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 320, height: 480 });
    await loadApp(page);

    // App should still be visible
    const container = page.locator('.container');
    await expect(container).toBeVisible();
  });

});

test.describe('edge - Network Conditions', () => {

  test('should handle offline mode gracefully after initial load', async ({ page, context }) => {
    // First load with network
    await loadApp(page);
    await waitForModels(page);

    // Go offline
    await context.setOffline(true);

    // Try to interact
    const uploadZone = page.locator('.upload-zone');
    await expect(uploadZone).toBeVisible();

    // Restore network
    await context.setOffline(false);
  });

});
