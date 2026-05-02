import { expect, test, type Page } from '@playwright/test';

async function bootTestWorld(page: Page) {
  await page.goto('/?testMode=1&skipOpening=1&showPerformance=1&seed=1612&port=goa&time=9');
  await page.waitForFunction(() => Boolean(window.__SPICE_VOYAGER_TEST__?.getSnapshot().portsReady));
}

test('market flow buys a seeded good through the real port UI', async ({ page }) => {
  await bootTestWorld(page);

  await page.evaluate(() => {
    const api = window.__SPICE_VOYAGER_TEST__!;
    const state = api.getState();
    const port = state.ports.find((entry) => entry.id === 'goa') ?? state.ports[0];
    if (!port) throw new Error('No generated port available for market test.');

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
      ports: state.ports.map((entry) => entry.id === activePort.id ? activePort : entry),
    });
    api.setShipTransform(activePort.position, 0, 0);
  });

  await expect(page.getByTestId('port-modal')).toBeVisible({ timeout: 15000 });
  await page.getByTestId('port-tab-market').click();
  await expect(page.getByTestId('market-ledger')).toBeVisible();
  await page.getByTestId('market-row-black-pepper').click();
  await page.getByTestId('market-buy-button').dispatchEvent('click');

  await page.waitForFunction(() => window.__SPICE_VOYAGER_TEST__?.getState().cargo['Black Pepper'] === 1);

  const result = await page.evaluate(() => {
    const state = window.__SPICE_VOYAGER_TEST__!.getState();
    return {
      gold: state.gold,
      pepper: state.cargo['Black Pepper'],
      activeInventory: state.activePort?.inventory['Black Pepper'],
      reputation: state.getReputation('Portuguese'),
      notification: state.notifications.at(-1)?.message ?? '',
    };
  });

  expect(result.pepper).toBe(1);
  expect(result.activeInventory).toBe(9);
  expect(result.reputation).toBe(2);
  expect(result.gold).toBeLessThan(500);
  expect(result.notification).toContain('Bought 1 Black Pepper');
});

test('completed arrival state is visible to the game harness', async ({ page }) => {
  await bootTestWorld(page);

  await page.evaluate(() => {
    const api = window.__SPICE_VOYAGER_TEST__!;
    const state = api.getState();
    api.setState({
      currentWorldPortId: 'jamestown',
      activePort: null,
      notifications: [],
      journalEntries: [],
      provisions: 28,
      dayCount: 12,
      timeOfDay: 14,
      playerMode: 'ship',
      playerVelocity: 0,
    });
    state.addJournalEntry('navigation', 'Made landfall at Jamestown after a hard Atlantic crossing.', 'Jamestown');
    state.addNotification('Jamestown', 'info', {
      openPortId: 'jamestown',
      subtitle: 'Small port · Atlantic',
    });
  });

  await page.waitForFunction(() => window.__SPICE_VOYAGER_TEST__?.getSnapshot().currentWorldPortId === 'jamestown');

  const result = await page.evaluate(() => {
    const state = window.__SPICE_VOYAGER_TEST__!.getState();
    const entry = state.journalEntries.at(-1);
    return {
      currentWorldPortId: state.currentWorldPortId,
      playerMode: state.playerMode,
      playerVelocity: state.playerVelocity,
      activePort: state.activePort,
      dayCount: state.dayCount,
      provisions: state.provisions,
      journalCategory: entry?.category ?? null,
      notification: state.notifications.at(-1)?.message ?? null,
    };
  });

  expect(result.currentWorldPortId).toBe('jamestown');
  expect(result.playerMode).toBe('ship');
  expect(result.playerVelocity).toBe(0);
  expect(result.activePort).toBeNull();
  expect(result.dayCount).toBe(12);
  expect(result.provisions).toBe(28);
  expect(result.journalCategory).toBe('navigation');
  expect(result.notification).toBe('Jamestown');
});

test('world map opens from the HUD and reflects the current port', async ({ page }) => {
  await bootTestWorld(page);

  await page.evaluate(() => {
    window.__SPICE_VOYAGER_TEST__!.openWorldMap();
  });
  await expect(page.getByTestId('world-map-modal')).toBeVisible({ timeout: 15000 });
  await expect(page.getByText(/Near Goa/i)).toBeVisible();
});

test('world map voyage completes through the passage report', async ({ page }) => {
  await bootTestWorld(page);

  await page.evaluate(() => {
    Math.random = () => 0.99;
    const api = window.__SPICE_VOYAGER_TEST__!;
    const state = api.getState();
    api.setState({
      currentWorldPortId: 'goa',
      activePort: null,
      provisions: 80,
      dayCount: 20,
      timeOfDay: 9,
      playerMode: 'ship',
      playerVelocity: 0,
      notifications: [],
      journalEntries: [],
      renderDebug: { ...state.renderDebug, worldMapChart: true },
    });
    api.openWorldMap();
  });

  await expect(page.getByTestId('world-map-modal')).toBeVisible({ timeout: 15000 });
  await page.getByTestId('world-route-port-calicut').click();
  await page.getByTestId('world-map-set-sail').click();

  await expect(page.getByText('Passage Log')).toBeVisible({ timeout: 15000 });
  await expect(page.getByText(/Goa to Calicut/i)).toBeVisible();
  await page.getByTestId('voyage-landfall').click();
  await expect(page.getByText('Making Landfall')).toBeVisible();
  await expect(page.getByTestId('world-map-modal')).toBeHidden({ timeout: 15000 });

  const result = await page.evaluate(() => {
    const state = window.__SPICE_VOYAGER_TEST__!.getState();
    const entry = state.journalEntries.at(-1);
    return {
      currentWorldPortId: state.currentWorldPortId,
      provisions: state.provisions,
      dayCount: state.dayCount,
      playerMode: state.playerMode,
      activePort: state.activePort,
      journalCategory: entry?.category ?? null,
    };
  });

  expect(result.currentWorldPortId).toBe('calicut');
  expect(result.provisions).toBeLessThan(80);
  expect(result.dayCount).toBeGreaterThan(20);
  expect(result.playerMode).toBe('ship');
  expect(result.activePort).toBeNull();
  expect(result.journalCategory).toBe('navigation');
});
