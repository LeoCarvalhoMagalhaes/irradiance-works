import { preencher } from "@/i18n/config";
import type { Dicionario } from "@/i18n/tipos";

type Textos = Dicionario["comum"];

/** Nome do módulo no idioma: os genéricos do catálogo são traduzidos; os do usuário ficam como digitados. */
export function nomeModulo(m: { id: string; nome?: string }, t: Textos): string {
  return t.equipamentos.modulos[m.id as keyof Textos["equipamentos"]["modulos"]] ?? (m.nome || m.id);
}

/** Nome do inversor no idioma (mesma regra de nomeModulo). */
export function nomeInversor(i: { id: string; nome?: string; potenciaCaW: number; fases: 1 | 3 }, t: Textos): string {
  if (!i.id.startsWith("inv-generico-")) return i.nome || i.id;
  return preencher(t.equipamentos.inversor, { kw: i.potenciaCaW / 1000, fases: t.equipamentos.fases[i.fases] });
}
