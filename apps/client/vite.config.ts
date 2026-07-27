import { defineConfig } from 'vite';

export default defineConfig({
  // Le `.env` est à la racine du monorepo, mais Vite s'exécute dans apps/client :
  // on lui indique donc de charger les variables d'environnement depuis la racine.
  envDir: '../../',
  server: {
    host: '127.0.0.1',
    port: 5173,
  },
  preview: {
    host: '127.0.0.1',
    port: 4173,
  },
  build: {
    sourcemap: true,
    // Phaser 4 ne se rend pas correctement quand le bundle de production est
    // minifié par le moteur de Vite 8 (rolldown/oxc) : la simulation tourne mais
    // le canvas reste vide. On désactive la minification pour un rendu fiable
    // (bundle plus volumineux, sans incidence sur le gameplay).
    minify: false,
    rollupOptions: {
      input: {
        // Page principale du jeu.
        main: 'index.html',
        // Page de diagnostic isolée du rendu Phaser (voir src/phasertest.ts).
        phasertest: 'phasertest.html',
      },
    },
  },
});
