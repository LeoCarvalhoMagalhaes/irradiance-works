import { defineConfig, devices } from "@playwright/test";

/**
 * Testes de ponta a ponta contra a exportação estática (pasta out/, gerada por `npm run build`),
 * servida como no GitHub Pages por scripts/servir-estatico.mjs.
 */
export default defineConfig({
  testDir: "tests/e2e",
  timeout: 120_000,
  expect: { timeout: 30_000 },
  fullyParallel: true,
  workers: process.env.CI ? 2 : 4,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: "http://localhost:4173",
    timezoneId: "America/Sao_Paulo",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "celular", use: { ...devices["Pixel 7"] }, testMatch: /idiomas\.spec/ },
  ],
  webServer: {
    command: "node scripts/servir-estatico.mjs 4173",
    url: "http://localhost:4173/pt/",
    reuseExistingServer: !process.env.CI,
  },
});
