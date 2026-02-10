import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright Configuration for Deepfake Detector Testing
 *
 * Test Modes:
 * - Local: Tests against local dev server (http://localhost:8000)
 * - Production: Tests against deployed site (use playwright.prod.config.js)
 *
 * Browser Configurations:
 * - chromium-webgpu: Chrome with WebGPU enabled (requires GPU)
 * - chromium-wasm: Chrome with WebGPU disabled (WASM fallback)
 * - firefox: Firefox browser (WASM only)
 */
export default defineConfig({
  testDir: './tests',

  // Timeout settings
  timeout: 60000, // 60 seconds per test
  expect: {
    timeout: 10000 // 10 seconds for assertions
  },

  // Test execution
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : 2,

  // Reporting
  reporter: [
    ['html'],
    ['json', { outputFile: 'test-results/results.json' }],
    ['list']
  ],

  // Global settings
  use: {
    baseURL: 'http://localhost:8918',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',

    // Capture console logs
    contextOptions: {
      recordVideo: {
        dir: 'test-results/videos/',
        size: { width: 1280, height: 720 }
      }
    }
  },

  // Browser projects
  projects: [
    // Helium with GPU - connect to running instance
    // Start Helium first: helium --remote-debugging-port=9222
    {
      name: 'helium-gpu',
      use: {
        ...devices['Desktop Chrome'],
        // Connect via CDP to running browser
        launchOptions: undefined,
      },
      // Use custom fixture to connect via CDP
    },

    // Helium launched by Playwright (falls back to SwiftShader)
    {
      name: 'helium',
      use: {
        ...devices['Desktop Chrome'],
        channel: undefined,
        headless: false,
        launchOptions: {
          executablePath: process.env.HOME + '/.local/helium/helium.AppImage',
          args: [
            '--ozone-platform=wayland',
            '--use-gl=egl',
            '--enable-gpu',
            '--ignore-gpu-blocklist',
            '--enable-features=Vulkan,VulkanFromANGLE,UseSkiaRenderer,WebGPU',
            '--enable-unsafe-webgpu',
            '--no-sandbox',
            '--disable-web-security',
          ]
        }
      },
    },

    {
      name: 'chromium-webgpu',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: {
          args: [
            '--enable-unsafe-webgpu',
            '--enable-features=Vulkan',
            '--disable-web-security', // For local testing
          ]
        }
      },
    },

    {
      name: 'chromium-wasm',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: {
          args: [
            '--disable-webgpu',
            '--disable-web-security'
          ]
        }
      },
    },

    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },

    // Mobile device emulation for testing
    {
      name: 'mobile-iphone',
      use: {
        ...devices['iPhone 14 Pro'],
        // iOS uses WebKit which supports WebGPU in Safari 26
      },
    },

    {
      name: 'mobile-android',
      use: {
        ...devices['Pixel 7'],
        launchOptions: {
          args: [
            '--enable-unsafe-webgpu',
            '--enable-features=Vulkan'
          ]
        }
      },
    },
  ],

  // Local dev server
  webServer: {
    command: 'python3 -m http.server 8918',
    url: 'http://localhost:8918',
    reuseExistingServer: !process.env.CI,
    timeout: 10000,
  },
});
