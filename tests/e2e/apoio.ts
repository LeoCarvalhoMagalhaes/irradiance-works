import { expect, type Page } from "@playwright/test";
import type { Idioma } from "../../src/i18n/config";
import { de } from "../../src/i18n/dicionarios/de";
import { en } from "../../src/i18n/dicionarios/en";
import { es } from "../../src/i18n/dicionarios/es";
import { fr } from "../../src/i18n/dicionarios/fr";
import { it } from "../../src/i18n/dicionarios/it";
import { pt } from "../../src/i18n/dicionarios/pt";
import { zh } from "../../src/i18n/dicionarios/zh";
import type { Dicionario } from "../../src/i18n/tipos";

export const DICIONARIOS: Record<Idioma, Dicionario> = { pt, en, es, de, it, fr, zh };

/** Coleta erros de console e exceções da página para conferir no fim do teste. */
export function vigiarErros(pagina: Page): string[] {
  const erros: string[] = [];
  pagina.on("console", (m) => m.type() === "error" && erros.push(m.text()));
  pagina.on("pageerror", (e) => erros.push(e.message));
  return erros;
}

/** Percorre o assistente com os valores padrão (ou outra cidade, pelo código IBGE) até o resultado. */
export async function simularPadrao(pagina: Page, idioma: Idioma, cidadeId?: string) {
  const t = DICIONARIOS[idioma];
  await pagina.goto(`${idioma}/simulador/`);
  if (cidadeId) await pagina.getByLabel(t.simulador.local.cidade, { exact: true }).selectOption(cidadeId);
  for (let i = 0; i < 2; i++) await pagina.getByRole("button", { name: t.comum.acoes.proximo }).click();
  await pagina.getByRole("button", { name: t.simulador.calcular }).click();
  await expect(pagina.getByRole("tab", { name: t.simulador.resultado.abas.resumo })).toBeVisible();
}

/** Clica num botão de exportação e devolve o arquivo baixado. */
export async function baixarArquivo(pagina: Page, rotulo: string) {
  const [download] = await Promise.all([pagina.waitForEvent("download"), pagina.getByRole("button", { name: rotulo }).click()]);
  const caminho = await download.path();
  const { readFileSync } = await import("node:fs");
  return { nome: download.suggestedFilename(), bytes: readFileSync(caminho) };
}
