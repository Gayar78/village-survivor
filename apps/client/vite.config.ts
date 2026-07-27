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
    // Minification désactivée le temps de valider le rendu en production ; à
    // réactiver ensuite (aucune incidence sur le gameplay).
    minify: false,
    rollupOptions: {
      input: {
        // Page lobby : authentification + hub multijoueur.
        main: 'index.html',
        // Page de jeu dédiée (voir src/play.ts).
        play: 'play.html',
      },
    },
  },
});
