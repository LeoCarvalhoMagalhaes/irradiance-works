import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { DICIONARIOS, simularPadrao } from "./apoio";

const t = DICIONARIOS.pt;
const NORMAS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

async function auditar(page: import("@playwright/test").Page) {
  const r = await new AxeBuilder({ page }).withTags(NORMAS).analyze();
  return r.violations.map((v) => `${v.id} (${v.impact}): ${v.nodes.length}× — ${v.nodes[0]?.target.join(" ")}`);
}

for (const tema of ["light", "dark"] as const) {
  test.describe(`axe, tema ${tema}`, () => {
    test.use({ colorScheme: tema });

    for (const [nome, caminho] of [
      ["início", "/pt/"],
      ["metodologia", "/pt/metodologia/"],
      ["manutenção", "/pt/manutencao/"],
      ["início em chinês", "/zh/"],
    ] as const) {
      test(nome, async ({ page }) => {
        await page.goto(caminho);
        expect(await auditar(page)).toEqual([]);
      });
    }

    test("assistente e resultado do simulador", async ({ page }) => {
      await page.goto("/pt/simulador/");
      expect(await auditar(page)).toEqual([]);
      await simularPadrao(page, "pt");
      for (const aba of ["resumo", "fatura", "eletrica"] as const) {
        await page.getByRole("tab", { name: t.simulador.resultado.abas[aba] }).click();
        expect(await auditar(page), aba).toEqual([]);
      }
    });

    test("frota e detalhe da usina", async ({ page }) => {
      await page.goto("/pt/monitoramento/");
      await expect(page.getByRole("row").filter({ hasText: "UFV-16" })).toBeVisible({ timeout: 90_000 });
      expect(await auditar(page)).toEqual([]);
      await page.goto("/pt/monitoramento/usina/?id=UFV-16");
      await expect(page.getByRole("tab", { name: t.monitoramento.usina.abas.alertas })).toBeVisible({ timeout: 90_000 });
      expect(await auditar(page)).toEqual([]);
    });
  });
}

test("teclado: atalho para o conteúdo e assistente operável sem mouse", async ({ page }) => {
  await page.goto("/pt/simulador/");
  await page.keyboard.press("Tab");
  const atalho = page.getByRole("link", { name: t.comum.pularParaConteudo });
  await expect(atalho).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/#conteudo$/);

  // Avança as etapas só com o teclado: o foco vai para o título de cada etapa.
  for (const etapa of [t.simulador.etapas.consumo, t.simulador.etapas.instalacao]) {
    await page.getByRole("button", { name: t.comum.acoes.proximo }).focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("heading", { level: 2, name: etapa })).toBeFocused();
  }
  await page.getByRole("button", { name: t.simulador.calcular }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("tab", { name: t.simulador.resultado.abas.resumo })).toBeVisible();

  // Abas com setas (padrão WAI-ARIA).
  await page.getByRole("tab", { name: t.simulador.resultado.abas.resumo }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("tab", { name: t.simulador.resultado.abas.geracao })).toBeFocused();
});

test.describe("movimento reduzido", () => {
  test.use({ reducedMotion: "reduce" });

  test("assistente funciona e não anima transições", async ({ page }) => {
    await page.goto("/pt/");
    const animacoes = await page.evaluate(() => document.getAnimations().filter((a) => a.playState === "running").length);
    expect(animacoes).toBe(0);
    await simularPadrao(page, "pt");
  });
});
