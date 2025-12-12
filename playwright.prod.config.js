import { defineConfig } from '@playwright/test';
import baseConfig from './playwright.config.js';

/**
 * Production Testing Configuration
 * Tests against deployed site: https://look.definitelynot.ai
 *
 * Usage: npm run test:prod
 */
export default defineConfig({
  ...baseConfig,

  // Override base URL for production
  use: {
    ...baseConfig.use,
    baseURL: 'https://look.definitelynot.ai',
  },

  // No local web server for production
  webServer: undefined,

  // More retries for production (network issues)
  retries: 3,
});
