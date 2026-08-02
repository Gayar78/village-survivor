import { defineConfig } from 'vite';

/**
 * Identifiant de la construction, figé à la compilation.
 *
 * Le lockstep exige que tous les pairs exécutent **le même code**. Rien ne le vérifiait, et le
 * 2 août 2026 deux postes ont joué une build périmée servie par leur cache pendant qu'une build
 * corrigée était déployée — sans qu'aucun signal ne le dise. Cet identifiant est échangé à la
 * jonction coopérative et attaché à la télémétrie : un écart devient un message avant la partie
 * au lieu d'une énigme après.
 *
 * Il n'a pas à être lisible ni ordonné : il doit seulement différer d'une construction à l'autre.
 */
const buildId = Date.now().toString(36);

export default defineConfig({
  define: {
    __VS_BUILD_ID__: JSON.stringify(buildId),
  },
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
