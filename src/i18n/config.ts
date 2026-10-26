export const IDIOMAS = ["pt", "en", "es", "de", "it", "fr", "zh"] as const;
export type Idioma = (typeof IDIOMAS)[number];
export const IDIOMA_PADRAO: Idioma = "pt";

/** Locale do Intl para números, moedas e datas (a moeda é sempre BRL, o mercado é brasileiro). */
export const LOCALE_INTL: Record<Idioma, string> = {
  pt: "pt-BR",
  en: "en-US",
  es: "es-ES",
  de: "de-DE",
  it: "it-IT",
  fr: "fr-FR",
  zh: "zh-CN",
};

/** Nome de cada idioma escrito no próprio idioma (seletor de idioma). */
export const NOME_IDIOMA: Record<Idioma, string> = {
  pt: "Português",
  en: "English",
  es: "Español",
  de: "Deutsch",
  it: "Italiano",
  fr: "Français",
  zh: "中文",
};

/** Atributo lang do HTML (BCP 47). */
export const LANG_HTML: Record<Idioma, string> = {
  pt: "pt-BR",
  en: "en",
  es: "es",
  de: "de",
  it: "it",
  fr: "fr",
  zh: "zh-CN",
};

export const ehIdioma = (valor: string): valor is Idioma => (IDIOMAS as readonly string[]).includes(valor);

/** Substitui marcadores {chave} por valores. */
export function preencher(texto: string, valores: Record<string, string | number> = {}): string {
  return texto.replace(/\{(\w+)\}/g, (_, chave: string) => (chave in valores ? String(valores[chave]) : `{${chave}}`));
}
