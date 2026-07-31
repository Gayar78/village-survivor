import { expect, test } from '@playwright/test';

/**
 * Smoke test du build de production.
 *
 * Il vise `play.html` et non `/` : la page de jeu se comporte de la même façon avec ou sans
 * projet Supabase configuré, alors que le lobby affiche soit un écran de connexion, soit un
 * écran « Configuration requise » selon l'environnement. Ce choix rend le test exécutable
 * partout, y compris en intégration continue où aucune clé n'est disponible.
 *
 * Ce que ce test garantit : le jeu démarre réellement dans un navigateur, le build de
 * production n'expose aucune API de débogage, et la graine reçue par l'URL n'est jamais
 * interprétée comme du HTML.
 */

/** Graine hostile : si elle était insérée en HTML, elle poserait `window.__seedInjected`. */
const HOSTILE_SEED = '<img src=x onerror=window.__seedInjected=true>';

test('sert le build de production sans capacité de débogage ni erreur console', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') {
      errors.push(message.text());
    }
  });
  page.on('pageerror', (error) => errors.push(error.message));

  await page.goto(`/play.html?seed=${encodeURIComponent(HOSTILE_SEED)}`);

  // Le canvas Phaser prouve que la scène a démarré, le HUD que l'état est bien projeté.
  await expect(page.locator('canvas')).toBeVisible();
  await expect(page.locator('#hud')).toContainText('Vitalité');

  // Aucune déclaration de type n'est ajoutée pour ce symbole : tout l'intérêt du test est
  // qu'il n'existe pas. On l'interroge donc par indexation, sans le faire entrer au typage.
  const debugType = await page.evaluate(
    () => typeof (window as unknown as Record<string, unknown>).__VILLAGE_SURVIVOR_DEBUG__,
  );
  const seedInjected = await page.evaluate(
    () => (window as unknown as { __seedInjected?: boolean }).__seedInjected,
  );

  expect(debugType).toBe('undefined');
  expect(seedInjected).toBeUndefined();
  expect(errors).toEqual([]);
});
