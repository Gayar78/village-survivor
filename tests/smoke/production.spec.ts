import { expect, test } from '@playwright/test';

test('serves the production build without debug capabilities or console errors', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') {
      errors.push(message.text());
    }
  });
  page.on('pageerror', (error) => errors.push(error.message));

  await page.goto('/?seed=%3Cimg%20src%3Dx%20onerror%3Dwindow.__seedInjected%3Dtrue%3E');
  await expect(page.locator('canvas')).toBeVisible();
  await expect(page.getByTestId('objective')).toContainText('Explorez');
  const debugType = await page.evaluate(() => typeof window.__VILLAGE_SURVIVOR_DEBUG__);
  const seedInjected = await page.evaluate(
    () => (window as unknown as { __seedInjected?: boolean }).__seedInjected,
  );

  expect(debugType).toBe('undefined');
  expect(seedInjected).toBeUndefined();
  await expect(page.locator('.brand img')).toHaveCount(0);
  expect(errors).toEqual([]);
});
