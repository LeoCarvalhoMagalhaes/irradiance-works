import { defineConfig, devices } from "@playwright/test";

/**
 * Testes de ponta a ponta contra a exportação estática (pasta out/, gerada por `npm run build`),
 * servida como no GitHub Pages por scripts/servir-estatico.mjs.
 *
 * E2E_BASE_PATH (por exemplo "/irradiance-works") testa sob o caminho base do Pages; o build precisa
 * ter sido feito com o mesmo NEXT_PUBLIC_BASE_PATH. No CI os testes rodam assim, como o site publicado.
 * Os testes navegam com caminhos relativos ("pt/simulador/") para respeitar o caminho base.
 */
const BASE = (process.env.E2E_BASE_PATH ?? "").replace(/\/$/, "");
const ORIGEM = `http://localhost:4173${BASE}`;

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 120_000,
  expect: { timeout: 30_000 },
  fullyParallel: true,
  workers: process.env.CI ? 2 : 4,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `${ORIGEM}/`,
    timezoneId: "America/Sao_Paulo",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "celular", use: { ...devices["Pixel 7"] }, testMatch: /idiomas\.spec/ },
  ],
  webServer: {
    command: `node scripts/servir-estatico.mjs 4173 ${BASE}`.trim(),
    url: `${ORIGEM}/pt/`,
    reuseExistingServer: !process.env.CI,
  },
});
