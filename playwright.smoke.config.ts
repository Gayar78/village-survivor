import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/smoke',
  fullyParallel: false,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium-production',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: [
    {
      command: 'node tests/smoke/fake-postgrest.mjs',
      port: 31981,
      reuseExistingServer: false,
      env: {
        FAKE_POSTGREST_PORT: '31981',
        FAKE_SERVICE_ROLE_KEY: 'smoke-service-role-key',
      },
    },
    {
      command: 'pnpm --filter @village-survivor/server start',
      port: 2567,
      reuseExistingServer: false,
      env: {
        JWT_SECRET: 'smoke-jwt-secret-at-least-sixteen-characters',
        SERVICE_ROLE_KEY: 'smoke-service-role-key',
        POSTGREST_URL: 'http://127.0.0.1:31981',
        PORT: '2567',
      },
    },
    {
      command: 'pnpm --filter @village-survivor/client preview --host 127.0.0.1',
      port: 4173,
      reuseExistingServer: !process.env.CI,
    },
  ],
});
