import { expect, test } from "@playwright/test";
import { IDIOMAS, LANG_HTML, NOME_IDIOMA } from "../../src/i18n/config";
import { baixarArquivo, DICIONARIOS, simularPadrao, vigiarErros } from "./apoio";

for (const idioma of IDIOMAS) {
  const t = DICIONARIOS[idioma];

  test.describe(`idioma ${idioma}`, () => {
    test("páginas carregam traduzidas e sem erros", async ({ page }) => {
      const erros = vigiarErros(page);
      const paginas: Array<[string, string]> = [
        ["", t.inicio.titulo],
        ["simulador/", t.simulador.titulo],
        ["manutencao/", t.manutencao.titulo],
        ["metodologia/", t.metodologia.titulo],
        ["monitoramento/", t.monitoramento.titulo],
      ];
      for (const [caminho, titulo] of paginas) {
        await page.goto(`${idioma}/${caminho}`);
        await expect(page.locator("html")).toHaveAttribute("lang", LANG_HTML[idioma]);
        await expect(page.getByRole("heading", { level: 1 })).toHaveText(titulo);
        // Textos longos (alemão, francês) não podem estourar a largura da página.
        const excesso = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        expect(excesso, `rolagem horizontal em /${idioma}/${caminho}`).toBeLessThanOrEqual(1);
      }
      // A análise da frota (Web Worker) termina e preenche a tabela.
      await expect(page.getByRole("row").filter({ hasText: "UFV-16" })).toBeVisible({ timeout: 90_000 });
      expect(erros).toEqual([]);
    });

    test("simulação completa e PDF no idioma", async ({ page }) => {
      const erros = vigiarErros(page);
      await simularPadrao(page, idioma);
      await expect(page.getByText(t.simulador.resultado.kpis.energiaAnual)).toBeVisible();
      const pdf = await baixarArquivo(page, t.simulador.resultado.acoes.pdf);
      expect(pdf.bytes.subarray(0, 5).toString()).toBe("%PDF-");
      expect(pdf.bytes.toString("latin1")).toContain(idioma === "zh" ? "NotoSansSC" : "NotoSans-");
      expect(erros).toEqual([]);
    });
  });
}

test("seletor de idioma preserva a página e os parâmetros", async ({ page }) => {
  await page.goto("pt/monitoramento/usina/?id=UFV-03");
  await page.getByRole("button", { name: new RegExp(DICIONARIOS.pt.comum.idioma) }).click();
  await page.getByRole("menuitem", { name: NOME_IDIOMA.de }).click();
  await expect(page).toHaveURL(/\/de\/monitoramento\/usina\/\?id=UFV-03$/);
  await expect(page.locator("html")).toHaveAttribute("lang", LANG_HTML.de);
  await expect(page.getByRole("link", { name: DICIONARIOS.de.monitoramento.usina.voltar })).toBeVisible();
});

test("raiz redireciona para um idioma", async ({ page }) => {
  await page.goto("./");
  await expect(page).toHaveURL(/\/(pt|en|es|de|it|fr|zh)\/$/);
});
