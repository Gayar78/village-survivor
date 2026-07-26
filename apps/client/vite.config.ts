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
  },
});
