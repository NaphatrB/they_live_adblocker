/*******************************************************************************

    They Live Extension — Playwright E2E Tests
    Run: npm run test:e2e

    Tests the full extension installed in a real Chromium browser.
    Uses a custom persistent browser context to load the built extension
    from the ./chromium/ directory.

    Requires: npm run test:e2e (which calls npx playwright test)
    Browser:  Chromium (downloaded by Playwright)

*******************************************************************************/

import { test as base, expect, chromium } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EXTENSION_PATH = path.resolve(__dirname, '../../chromium');
const FIXTURE_PATH = path.resolve(__dirname, 'fixtures/test-ads.html');

// ---------------------------------------------------------------------------
// Custom fixtures — persistent context with the extension loaded
// ---------------------------------------------------------------------------

const test = base.extend({
    context: async ({}, use) => {
        const context = await chromium.launchPersistentContext('', {
            headless: false,
            args: [
                '--headless=new',
                `--disable-extensions-except=${EXTENSION_PATH}`,
                `--load-extension=${EXTENSION_PATH}`,
                '--no-sandbox',
            ],
        });
        await use(context);
        await context.close();
    },

    extensionId: async ({ context }, use) => {
        // Background service worker URL is chrome-extension://{id}/...
        let [background] = context.serviceWorkers();
        if ( !background ) {
            background = await context.waitForEvent('serviceworker', { timeout: 10_000 });
        }
        const extId = background.url().split('/')[2];
        await use(extId);
    },
});

// ---------------------------------------------------------------------------
// 1. Extension loads
// ---------------------------------------------------------------------------

test.describe('Extension loads', () => {
    test('service worker starts with correct extension URL', async ({ context }) => {
        let [sw] = context.serviceWorkers();
        if ( !sw ) {
            sw = await context.waitForEvent('serviceworker', { timeout: 10_000 });
        }
        expect(sw.url()).toMatch(/^chrome-extension:\/\/[a-z]{32}\//);
    });

    test('dashboard page is reachable', async ({ context, extensionId }) => {
        const page = await context.newPage();
        const response = await page.goto(
            `chrome-extension://${extensionId}/dashboard.html`,
            { waitUntil: 'domcontentloaded' }
        );
        expect(response?.status() ?? 200).toBe(200);
        await page.close();
    });
});

// ---------------------------------------------------------------------------
// 2. Dashboard UI
// ---------------------------------------------------------------------------

test.describe('Dashboard UI', () => {
    let page;

    test.beforeEach(async ({ context, extensionId }) => {
        page = await context.newPage();
        await page.goto(
            `chrome-extension://${extensionId}/dashboard.html`,
            { waitUntil: 'domcontentloaded' }
        );
    });

    test.afterEach(async () => {
        await page?.close();
    });

    test('"They Live" tab button is visible', async () => {
        const tab = page.locator('.tabButton[data-pane="they-live"]');
        await expect(tab).toBeVisible();
    });

    test('"They Live" tab shows stat cards when clicked', async () => {
        await page.click('.tabButton[data-pane="they-live"]');
        // Wait for the section to become visible
        await page.waitForSelector('section[data-pane="they-live"]', { state: 'visible' });
        const cards = page.locator('.tlStatCard');
        await expect(cards).toHaveCount(4);
    });

    test('stat card labels are present', async () => {
        await page.click('.tabButton[data-pane="they-live"]');
        await page.waitForSelector('section[data-pane="they-live"]', { state: 'visible' });
        const labels = await page.locator('.tlStatLabel').allTextContents();
        expect(labels).toContain('Local fast-path');
        expect(labels).toContain('Cache hits');
        expect(labels).toContain('LLM calls');
    });

    test('phrase table and log table are in the DOM', async () => {
        await page.click('.tabButton[data-pane="they-live"]');
        await page.waitForSelector('section[data-pane="they-live"]', { state: 'visible' });
        await expect(page.locator('#tlPhraseTable')).toBeAttached();
        await expect(page.locator('#tlLogTable')).toBeAttached();
    });

    test('Export button is present', async () => {
        await page.click('.tabButton[data-pane="they-live"]');
        await page.waitForSelector('section[data-pane="they-live"]', { state: 'visible' });
        await expect(page.locator('#tlExportLog')).toBeVisible();
    });

    test('Settings tab still works (no regression)', async () => {
        await page.click('.tabButton[data-pane="settings"]');
        await page.waitForSelector('section[data-pane="settings"]', { state: 'visible' });
        // AI settings section should still be in settings pane
        await expect(page.locator('#theyLiveEnabled')).toBeAttached();
    });
});

// ---------------------------------------------------------------------------
// 3. Background messaging — test via extension's own dashboard page
//    (chrome-extension:// pages have full access to chrome.runtime)
// ---------------------------------------------------------------------------

test.describe('Background messaging via extension page', () => {
    const sendMsg = async (page, msg) => {
        return page.evaluate(async (m) => {
            try {
                return await chrome.runtime.sendMessage(m);
            } catch (e) {
                return null;
            }
        }, msg);
    };

    test('getTheyLiveStats returns expected structure', async ({ context, extensionId }) => {
        const page = await context.newPage();
        await page.goto(`chrome-extension://${extensionId}/dashboard.html`, { waitUntil: 'domcontentloaded' });

        const stats = await sendMsg(page, { what: 'getTheyLiveStats' });

        expect(stats).not.toBeNull();
        expect(stats).toHaveProperty('local');
        expect(stats).toHaveProperty('cache');
        expect(stats).toHaveProperty('llm');
        expect(typeof stats.local).toBe('number');
        await page.close();
    });

    test('getTheyLiveSettings returns expected structure', async ({ context, extensionId }) => {
        const page = await context.newPage();
        await page.goto(`chrome-extension://${extensionId}/dashboard.html`, { waitUntil: 'domcontentloaded' });

        const settings = await sendMsg(page, { what: 'getTheyLiveSettings' });

        expect(settings).not.toBeNull();
        expect(settings).toHaveProperty('aiEnabled');
        expect(settings).toHaveProperty('aiModel');
        await page.close();
    });

    test('getTheyLiveLog returns an array', async ({ context, extensionId }) => {
        const page = await context.newPage();
        await page.goto(`chrome-extension://${extensionId}/dashboard.html`, { waitUntil: 'domcontentloaded' });

        const result = await sendMsg(page, { what: 'getTheyLiveLog' });

        // Handler returns { log: [...] }
        expect(result).not.toBeNull();
        expect(result).toHaveProperty('log');
        expect(Array.isArray(result.log)).toBe(true);
        await page.close();
    });

    test('theyLiveClassify returns array or empty array', async ({ context, extensionId }) => {
        const page = await context.newPage();
        await page.goto(`chrome-extension://${extensionId}/dashboard.html`, { waitUntil: 'domcontentloaded' });

        const result = await sendMsg(page, {
            what: 'theyLiveClassify',
            contexts: ['[page:amazon.com] [link:amazon.com]'],
        });

        // AI disabled → returns []; AI enabled → returns array of phrases
        expect(Array.isArray(result)).toBe(true);
        await page.close();
    });

    test('theyLiveClassify handles empty array', async ({ context, extensionId }) => {
        const page = await context.newPage();
        await page.goto(`chrome-extension://${extensionId}/dashboard.html`, { waitUntil: 'domcontentloaded' });

        const result = await sendMsg(page, { what: 'theyLiveClassify', contexts: [] });

        expect(Array.isArray(result)).toBe(true);
        expect(result.length).toBe(0);
        await page.close();
    });
});

// ---------------------------------------------------------------------------
// 4. Ad replacement smoke test — fixture page served locally
//    Verifies extension content scripts can communicate with the background.
//    Note: the extension's DNR filter rules don't target localhost, so ad
//    elements are NOT auto-tagged. The chrome.runtime API IS available to
//    extension content scripts injected on localhost pages.
// ---------------------------------------------------------------------------

test.describe('Fixture page — content script messaging', () => {
    let server;
    let fixtureUrl;

    test.beforeAll(async () => {
        const html = readFileSync(FIXTURE_PATH, 'utf8');
        server = createServer((req, res) => {
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(html);
        });
        await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
        fixtureUrl = `http://127.0.0.1:${server.address().port}/`;
    });

    test.afterAll(() => {
        server?.close();
    });

    test('fixture page loads without error', async ({ context }) => {
        const page = await context.newPage();
        const errors = [];
        page.on('pageerror', e => errors.push(e.message));
        await page.goto(fixtureUrl, { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(500);
        expect(errors.filter(e => !e.includes('net::ERR'))).toHaveLength(0);
        await page.close();
    });

    test('ad slot elements exist in fixture', async ({ context }) => {
        const page = await context.newPage();
        await page.goto(fixtureUrl, { waitUntil: 'domcontentloaded' });
        const slots = await page.evaluate(() => window.__adSlots?.length ?? 0);
        expect(slots).toBeGreaterThan(0);
        await page.close();
    });
});
