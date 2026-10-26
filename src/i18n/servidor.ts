import type { Idioma } from "./config";
import type { Dicionario } from "./tipos";

const carregadores: Record<Idioma, () => Promise<Dicionario>> = {
  pt: () => import("./dicionarios/pt").then((m) => m.pt),
  en: () => import("./dicionarios/en").then((m) => m.en),
  es: () => import("./dicionarios/es").then((m) => m.es),
  de: () => import("./dicionarios/de").then((m) => m.de),
  it: () => import("./dicionarios/it").then((m) => m.it),
  fr: () => import("./dicionarios/fr").then((m) => m.fr),
  zh: () => import("./dicionarios/zh").then((m) => m.zh),
};

/** Carrega o dicionário no servidor (durante o build estático). */
export function obterDicionario(idioma: Idioma): Promise<Dicionario> {
  return carregadores[idioma]();
}

/** Recorta as seções que uma página entrega aos componentes de cliente. */
export function secoes<K extends keyof Dicionario>(d: Dicionario, ...chaves: K[]): Pick<Dicionario, K> {
  return Object.fromEntries(chaves.map((k) => [k, d[k]])) as Pick<Dicionario, K>;
}
