import { expect, test } from '@playwright/test';

test('boots in deterministic test mode and exposes performance stats', async ({ page }) => {
  await page.goto('/?testMode=1&skipOpening=1&showPerformance=1&seed=1612&port=goa&time=9');

  await expect(page.getByTestId('game-root')).toBeVisible();
  await expect(page.getByTestId('performance-overlay')).toBeVisible();

  await page.waitForFunction(() => Boolean(window.__SPICE_VOYAGER_TEST__?.getSnapshot().portsReady));

  const snapshot = await page.evaluate(() => window.__SPICE_VOYAGER_TEST__?.getSnapshot());
  expect(snapshot).toMatchObject({
    worldSeed: 1612,
    currentWorldPortId: 'goa',
    timeOfDay: 9,
    playerMode: 'ship',
  });

  await page.waitForFunction(() => {
    const stats = window.__SPICE_VOYAGER_TEST__?.getPerformanceStats();
    return Boolean(stats && Number.isFinite(stats.fps) && stats.drawCalls > 0);
  });

  const perf = await page.evaluate(() => window.__SPICE_VOYAGER_TEST__?.getPerformanceStats());
  expect(perf?.drawCalls).toBeGreaterThan(0);
  expect(perf?.fps).toBeGreaterThan(0);
});
