import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['packages/**/*.test.ts', 'apps/**/*.test.ts'],
    // Les garde-fous de tick mesurent un temps mural. Les exécuter en parallèle d'une
    // charge serveur transformerait la saturation du runner en fausse régression jeu.
    fileParallelism: false,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['packages/game-core/src/**/*.ts', 'packages/content/src/**/*.ts'],
    },
  },
});
