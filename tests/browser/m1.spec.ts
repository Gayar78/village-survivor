import { expect, test } from '@playwright/test';

test('boots, moves and deposits resources explicitly without console errors', async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') {
      consoleErrors.push(message.text());
    }
  });
  page.on('pageerror', (error) => consoleErrors.push(error.message));

  await page.goto('/?seed=e2e-smoke');
  await expect(page.locator('canvas')).toBeVisible();
  await expect(page.getByTestId('objective')).toContainText('Explorez');
  const initialX = await page.evaluate(
    () => window.__VILLAGE_SURVIVOR_DEBUG__?.getState().player.position.x,
  );
  await page.keyboard.down('KeyD');
  await page.waitForTimeout(250);
  await page.keyboard.up('KeyD');
  const movedX = await page.evaluate(
    () => window.__VILLAGE_SURVIVOR_DEBUG__?.getState().player.position.x,
  );

  expect(movedX).toBeGreaterThan(initialX ?? 0);

  await page.evaluate(() => {
    const debug = window.__VILLAGE_SURVIVOR_DEBUG__!;
    const resource = debug.getState().resources[0]!;
    debug.defeatEnemy(resource.guardianId);
    debug.teleportPlayer(resource.position);
  });
  await expect(page.getByTestId('location')).toContainText('extérieur');
  await page.keyboard.press('KeyE');
  await expect
    .poll(() =>
      page.evaluate(() => window.__VILLAGE_SURVIVOR_DEBUG__?.getState().player.carriedWood),
    )
    .toBe(4);
  await page.evaluate(() => {
    const debug = window.__VILLAGE_SURVIVOR_DEBUG__!;
    debug.teleportPlayer(debug.getState().village.position);
  });
  await expect(page.getByTestId('location')).toContainText('Dans le village');
  await expect(page.getByTestId('interaction-hint')).toContainText('E — Déposer 4 bois');
  expect(
    await page.evaluate(() => window.__VILLAGE_SURVIVOR_DEBUG__?.getState().player.storedWood),
  ).toBe(0);
  await page.keyboard.press('KeyE');
  await expect
    .poll(() =>
      page.evaluate(() => window.__VILLAGE_SURVIVOR_DEBUG__?.getState().player.storedWood),
    )
    .toBe(4);
  await page.screenshot({ path: 'test-results/m1-day.png', fullPage: true });
  expect(consoleErrors).toEqual([]);
});

test('drives the M1 through construction, activation and victory', async ({ page }) => {
  await page.goto('/?seed=e2e-victory');
  await expect(page.locator('canvas')).toBeVisible();

  await page.evaluate(() => {
    const debug = window.__VILLAGE_SURVIVOR_DEBUG__;
    if (debug === undefined) {
      throw new Error('API de débogage absente en développement.');
    }
    debug.giveResources(32);
    debug.giveExperience(45); // deux niveaux d'un coup : les choix doivent s'empiler
    debug.teleportPlayer({ x: 140, y: 0 });
  });
  await page.keyboard.press('KeyB');
  await page.evaluate(() => window.__VILLAGE_SURVIVOR_DEBUG__!.advance(5_100));
  await expect
    .poll(() =>
      page.evaluate(() => window.__VILLAGE_SURVIVOR_DEBUG__?.getState().defenses[0]?.built),
    )
    .toBe(true);

  await page.evaluate(() => {
    const debug = window.__VILLAGE_SURVIVOR_DEBUG__!;
    debug.teleportPlayer(debug.getState().village.position);
  });
  await page.keyboard.press('KeyE');
  await expect
    .poll(() =>
      page.evaluate(() => window.__VILLAGE_SURVIVOR_DEBUG__?.getState().village.heartLevel),
    )
    .toBe(2);

  // Le panneau ne s'impose plus : il attend que le joueur l'ouvre.
  await expect(page.getByTestId('upgrade-pending')).toContainText('2 améliorations à choisir');
  await expect(page.getByTestId('upgrade-panel')).toBeHidden();
  await page.keyboard.press('KeyF');
  await expect(page.getByTestId('upgrade-panel')).toBeVisible();

  // Le premier choix ne referme pas le panneau : une nouvelle offre le remplace.
  const firstChoice = await page
    .locator('[data-upgrade-id]')
    .first()
    .getAttribute('data-upgrade-id');
  await page.locator('[data-upgrade-id]').first().click();
  await expect(page.getByTestId('upgrade-panel')).toBeVisible();
  await expect(page.locator(`[data-upgrade-id="${firstChoice}"]`)).toHaveCount(0);

  await page.locator('[data-upgrade-id]').first().click();
  await expect(page.getByTestId('upgrade-panel')).toBeHidden();
  await expect(page.getByTestId('upgrade-pending')).toBeHidden();
  expect(
    await page.evaluate(
      () => window.__VILLAGE_SURVIVOR_DEBUG__?.getState().player.selectedUpgrades.length,
    ),
  ).toBe(2);
  await page.keyboard.press('KeyE');
  await expect
    .poll(() => page.evaluate(() => window.__VILLAGE_SURVIVOR_DEBUG__?.getState().phase))
    .toBe('final');

  await page.evaluate(() => {
    const debug = window.__VILLAGE_SURVIVOR_DEBUG__!;
    debug.defeatAllAssailants();
    debug.advance(90_100);
  });
  await expect(page.getByTestId('result-panel')).toContainText('Village sauvé');
  await page.screenshot({ path: 'test-results/m1-victory.png', fullPage: true });
});
