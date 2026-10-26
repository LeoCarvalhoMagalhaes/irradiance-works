import { expect, test } from "@playwright/test";
import { preencher } from "../../src/i18n/config";
import { baixarArquivo, DICIONARIOS, simularPadrao, vigiarErros } from "./apoio";

const t = DICIONARIOS.pt;
const CAMPINAS = "3509502";

test("comissionar numa cidade sem usinas da frota avisa que a sujidade pode não ser detectada", async ({ page }) => {
  await simularPadrao(page, "pt"); // padrão: São Paulo, sem usinas da frota
  await page.getByRole("button", { name: t.simulador.comissionar.titulo }).click();
  const dialogo = page.getByRole("dialog");
  await expect(dialogo).toContainText(preencher(t.simulador.comissionar.semVizinhas, { cidade: "São Paulo" }));
  await dialogo.getByLabel(t.simulador.comissionar.falhaSujidade).click();
  await expect(dialogo).not.toContainText(t.simulador.comissionar.semVizinhas.slice(0, 20));
});

test("proposta → PDF e Excel → comissionamento → usina na frota → alerta → OS → manutenção", async ({ page }) => {
  const erros = vigiarErros(page);

  // 1. Simulação em Campinas: cidade com usinas da frota, onde o sensor virtual detecta a sujidade.
  await simularPadrao(page, "pt", CAMPINAS);
  for (const aba of Object.values(t.simulador.resultado.abas)) {
    await page.getByRole("tab", { name: aba }).click();
    await expect(page.getByRole("tabpanel")).toBeVisible();
  }

  // 2. PDF (com as fontes embutidas e a fonte de reserva de símbolos) e Excel.
  const pdf = await baixarArquivo(page, t.simulador.resultado.acoes.pdf);
  expect(pdf.nome).toMatch(/\.pdf$/);
  expect(pdf.bytes.subarray(0, 5).toString()).toBe("%PDF-");
  expect(pdf.bytes.length).toBeGreaterThan(20_000);
  const textoPdf = pdf.bytes.toString("latin1");
  expect(textoPdf).toContain("NotoSans-");
  expect(textoPdf).toContain("NotoSansSC"); // subfonte de símbolos usada para ≤ e ≥
  expect(textoPdf).not.toContain("/Helvetica");

  const xlsx = await baixarArquivo(page, t.simulador.resultado.acoes.excel);
  expect(xlsx.nome).toMatch(/\.xlsx$/);
  expect(xlsx.bytes.subarray(0, 2).toString()).toBe("PK");

  // 3. Comissionamento com sujidade de demonstração.
  await page.getByRole("button", { name: t.simulador.comissionar.titulo }).click();
  const dialogo = page.getByRole("dialog");
  await dialogo.getByLabel(t.simulador.comissionar.nome).fill("Teste E2E");
  await dialogo.getByRole("button", { name: t.simulador.comissionar.confirmar }).click();
  const status = dialogo.getByRole("status");
  await expect(status).toContainText(/UFV-C\d+/);
  const id = (await status.textContent())!.match(/UFV-C\d+/)![0];
  await dialogo.getByRole("link", { name: t.simulador.comissionar.verUsina }).click();

  // 4. A usina aparece no monitoramento, com o painel prometido × real e o alerta de sujidade.
  await expect(page.getByRole("heading", { level: 1, name: "Teste E2E" })).toBeVisible({ timeout: 90_000 });
  await page.getByRole("tab", { name: t.monitoramento.usina.abas.prometido }).click();
  await expect(page.getByRole("tabpanel")).toContainText(t.monitoramento.usina.prometido.decomposicao);
  await page.getByRole("tab", { name: t.monitoramento.usina.abas.alertas }).click();
  const painel = page.getByRole("tabpanel");
  await expect(painel).toContainText(t.monitoramento.tipos.sujidade);

  // 5. Ordem de serviço criada a partir do alerta.
  await painel.getByRole("button", { name: t.monitoramento.usina.alertas.criarOs }).first().click();
  const aviso = page.getByText(/OS-[A-Z0-9]+-\d{4}/).first();
  await expect(aviso).toBeVisible();
  const os = (await aviso.textContent())!.match(/OS-[A-Z0-9]+-\d{4}/)![0];

  // 6. A OS está na manutenção, ligada à usina comissionada.
  await page.goto("/pt/manutencao/");
  const linha = page.getByRole("row").filter({ hasText: os });
  await expect(linha).toContainText(id);
  await expect(linha).toContainText(t.manutencao.status.aberta);

  // 7. A usina também aparece na tabela da frota.
  await page.goto("/pt/monitoramento/");
  await expect(page.getByRole("row").filter({ hasText: "Teste E2E" })).toBeVisible({ timeout: 90_000 });

  expect(erros).toEqual([]);
});

test("retorno simulado do CMMS conclui as OS abertas", async ({ page }) => {
  await page.goto("/pt/monitoramento/usina/?id=UFV-16");
  await page.getByRole("tab", { name: t.monitoramento.usina.abas.alertas }).click();
  await page.getByRole("tabpanel").getByRole("button", { name: t.monitoramento.usina.alertas.criarOs }).first().click({ timeout: 90_000 });
  await page.goto("/pt/manutencao/");
  await page.getByRole("button", { name: t.manutencao.integracao.simular }).click();
  await expect(page.getByText(preencher(t.manutencao.integracao.simulado, { n: 1 }))).toBeVisible();
  await expect(page.getByRole("row").filter({ hasText: t.manutencao.status.concluida }).first()).toBeVisible();
});
