/*******************************************************************************

    Playwright E2E configuration for They Live extension tests.
    Uses a custom persistent context that loads the built Chromium extension.

    Run with: npm run test:e2e
    Or single test: npx playwright test docs/tests/they-live.e2e.js

*******************************************************************************/

import { defineConfig } from '@playwright/test';

export default defineConfig({
    testDir: 'docs/tests',
    testMatch: '*.e2e.js',
    timeout: 30_000,
    retries: 1,
    reporter: 'line',
    use: {
        // No shared browser here — each test file manages its own
        // persistent context so the extension can be loaded.
        actionTimeout: 10_000,
        navigationTimeout: 15_000,
    },
});
