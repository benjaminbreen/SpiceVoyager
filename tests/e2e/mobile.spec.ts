import { expect, test, type Locator, type Page } from '@playwright/test';

const MOBILE_URL = '/?testMode=1&skipOpening=1&showPerformance=1&mobile=1&seed=1612&port=goa&time=9';

async function bootMobile(page: Page, viewport: { width: number; height: number }, options: { waitForPerf?: boolean } = {}) {
  await page.setViewportSize(viewport);
  await page.goto(MOBILE_URL);
  await page.waitForFunction(() => Boolean(window.__SPICE_VOYAGER_TEST__?.getSnapshot().portsReady));
  if (options.waitForPerf) {
    await page.waitForFunction(() => {
      const stats = window.__SPICE_VOYAGER_TEST__?.getPerformanceStats();
      return Boolean(stats && Number.isFinite(stats.fps) && stats.drawCalls > 0);
    });
  }
}

async function box(locator: Locator) {
  await expect(locator).toBeVisible();
  await expect.poll(() => locator.boundingBox()).not.toBeNull();
  const rect = await locator.boundingBox();
  expect(rect).not.toBeNull();
  return rect!;
}

async function openSeededGoaMarket(page: Page) {
  await page.keyboard.press('Escape');

  await page.evaluate(() => {
    const api = window.__SPICE_VOYAGER_TEST__!;
    const state = api.getState();
    const port = state.ports.find((entry) => entry.id === 'goa') ?? state.ports[0];
    if (!port) throw new Error('No generated port available for mobile market test.');

    const zeroCargo = { ...state.cargo };
    for (const key of Object.keys(zeroCargo) as Array<keyof typeof zeroCargo>) {
      zeroCargo[key] = 0;
    }
    const activePort = {
      ...port,
      inventory: { ...port.inventory, 'Black Pepper': 10 },
      baseInventory: { ...port.baseInventory, 'Black Pepper': 10 },
      basePrices: { ...port.basePrices, 'Black Pepper': 100 },
      prices: { ...port.prices, 'Black Pepper': 100 },
    };

    api.setState({
      gold: 500,
      cargo: zeroCargo,
      cargoProvenance: [],
      knowledgeState: { ...state.knowledgeState, 'Black Pepper': 1 },
      notifications: [],
      journalEntries: [],
      npcShips: [],
      nearestHailableNpc: null,
      paused: false,
      activePort,
      ports: state.ports.map((entry) => entry.id === activePort.id ? activePort : entry),
    });
    api.setShipTransform(activePort.position, 0, 0);
  });

  await expect(page.getByTestId('port-modal')).toBeVisible({ timeout: 15000 });
  const mobileMarketTab = page.getByTestId('port-tab-mobile-market');
  if (await mobileMarketTab.isVisible().catch(() => false)) {
    await mobileMarketTab.click();
  } else {
    await page.getByTestId('port-tab-market').click();
  }
  await expect(page.getByTestId('market-ledger')).toBeVisible();
}

function overlaps(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number },
) {
  return a.x < b.x + b.width
    && a.x + a.width > b.x
    && a.y < b.y + b.height
    && a.y + a.height > b.y;
}

test.describe('mobile layout and performance', () => {
  test('portrait HUD exposes touch controls without clipping core buttons', async ({ page }) => {
    await bootMobile(page, { width: 390, height: 844 }, { waitForPerf: true });

    const actionBar = page.getByTestId('mobile-action-bar');
    const controls = page.getByTestId('touch-controls');
    const joystick = page.getByTestId('virtual-joystick-ship');
    const sailToggle = page.getByTestId('touch-sail-toggle');

    await expect(actionBar).toBeVisible();
    await expect(controls).toBeVisible();

    const viewport = page.viewportSize()!;
    const steeringControl = await joystick.isVisible().catch(() => false) ? joystick : sailToggle;
    await expect(steeringControl).toBeVisible();

    for (const target of [actionBar, steeringControl]) {
      const rect = await box(target);
      expect(rect.x).toBeGreaterThanOrEqual(0);
      expect(rect.y).toBeGreaterThanOrEqual(0);
      expect(rect.x + rect.width).toBeLessThanOrEqual(viewport.width);
      expect(rect.y + rect.height).toBeLessThanOrEqual(viewport.height);
    }

    expect(overlaps(await box(actionBar), await box(steeringControl))).toBe(false);

    await expect.poll(() => page.evaluate(() => window.__SPICE_VOYAGER_TEST__!.getPerformanceStats()), {
      timeout: 15000,
    }).not.toBeNull();
    const perf = await page.evaluate(() => window.__SPICE_VOYAGER_TEST__!.getPerformanceStats());
    expect(perf).toMatchObject({
      postprocessing: false,
      shadows: false,
      advancedWater: false,
    });
    expect(perf!.fps).toBeGreaterThan(0);

  });

  test('landscape HUD keeps touch controls usable', async ({ page }) => {
    await bootMobile(page, { width: 844, height: 390 });

    await expect(page.getByTestId('mobile-action-bar')).toBeVisible();
    await expect(page.getByTestId('touch-controls')).toBeVisible();
  });

  test('portrait world map keeps route selection and Set Sail reachable', async ({ page }) => {
    await bootMobile(page, { width: 390, height: 844 });

    await page.evaluate(() => window.__SPICE_VOYAGER_TEST__!.getState().setRequestWorldMap(true));
    await expect(page.getByTestId('world-map-modal')).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId('world-map-chart-map')).toBeVisible();
    await expect(page.getByTestId('world-map-chart-route-sheet')).toBeVisible();

    await page.getByTestId('world-route-port-calicut').click();
    await expect(page.getByTestId('world-map-set-sail')).toBeVisible();

    const viewport = page.viewportSize()!;
    for (const target of [
      page.getByTestId('world-map-chart-map'),
      page.getByTestId('world-map-chart-route-sheet'),
      page.getByTestId('world-map-close'),
    ]) {
      const rect = await box(target);
      expect(rect.x).toBeGreaterThanOrEqual(0);
      expect(rect.y).toBeGreaterThanOrEqual(0);
      expect(rect.x + rect.width).toBeLessThanOrEqual(viewport.width);
      expect(rect.y + rect.height).toBeLessThanOrEqual(viewport.height);
    }
  });

  test('portrait market keeps trade controls visible and can buy a selected good', async ({ page }) => {
    await bootMobile(page, { width: 390, height: 844 });
    await openSeededGoaMarket(page);
    await expect(page.getByTestId('mobile-market-trade-dock')).toBeVisible();
    await page.getByTestId('market-row-black-pepper').click({ noWaitAfter: true });
    await expect(page.getByTestId('mobile-market-buy-button')).toBeVisible();
    await expect(page.getByTestId('mobile-market-sell-button')).toBeVisible();
    const tradeDock = page.getByTestId('mobile-market-trade-dock');
    await expect(tradeDock.getByText('Buy Cost')).toBeVisible();
    await expect(tradeDock.getByText('Hold 1/')).toBeVisible();

    const viewport = page.viewportSize()!;
    for (const target of [
      page.getByTestId('mobile-market-trade-dock'),
      page.getByTestId('mobile-market-buy-button'),
    ]) {
      const rect = await box(target);
      expect(rect.x).toBeGreaterThanOrEqual(0);
      expect(rect.y).toBeGreaterThanOrEqual(0);
      expect(rect.x + rect.width).toBeLessThanOrEqual(viewport.width);
      expect(rect.y + rect.height).toBeLessThanOrEqual(viewport.height);
    }

    await page.getByTestId('mobile-market-buy-button').click({ noWaitAfter: true });
    await page.waitForFunction(() => window.__SPICE_VOYAGER_TEST__?.getState().cargo['Black Pepper'] === 1);
  });

  test('landscape port market leaves room for content and supports a real trade click', async ({ page }) => {
    await bootMobile(page, { width: 844, height: 390 });
    await openSeededGoaMarket(page);

    const bannerRect = await box(page.getByTestId('port-modal-banner'));
    expect(bannerRect.height).toBeLessThanOrEqual(130);

    await page.getByTestId('market-row-black-pepper').click({ noWaitAfter: true });
    const buyButton = page.getByTestId('market-buy-button');
    await expect(buyButton).toBeVisible();
    await expect(buyButton).toBeEnabled();
    await buyButton.scrollIntoViewIfNeeded();

    const viewport = page.viewportSize()!;
    for (const target of [
      buyButton,
    ]) {
      const rect = await box(target);
      expect(rect.x).toBeGreaterThanOrEqual(0);
      expect(rect.y).toBeGreaterThanOrEqual(0);
      expect(rect.x + rect.width).toBeLessThanOrEqual(viewport.width);
      expect(rect.y + rect.height).toBeLessThanOrEqual(viewport.height);
    }

    await buyButton.click();
    await expect.poll(() => page.evaluate(() => window.__SPICE_VOYAGER_TEST__?.getState().cargo['Black Pepper'] ?? 0)).toBe(1);
  });
});
