/**
 * Formatação dependente de idioma (Intl). Valores monetários sempre em reais (BRL) e datas sempre
 * no fuso America/Sao_Paulo, que é onde as usinas operam.
 */
import { type Idioma, LOCALE_INTL } from "@/i18n/config";

export const FUSO = "America/Sao_Paulo";

export type Formatadores = ReturnType<typeof criarFormatadores>;

export function criarFormatadores(idioma: Idioma) {
  const locale = LOCALE_INTL[idioma];
  const cache = new Map<string, Intl.NumberFormat>();
  const nf = (min: number, max: number) => {
    const chave = `${min}|${max}`;
    let f = cache.get(chave);
    if (!f) {
      f = new Intl.NumberFormat(locale, { minimumFractionDigits: min, maximumFractionDigits: max });
      cache.set(chave, f);
    }
    return f;
  };
  const moedaFmt = new Intl.NumberFormat(locale, { style: "currency", currency: "BRL", minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const moedaInteira = new Intl.NumberFormat(locale, { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
  const dataFmt = new Intl.DateTimeFormat(locale, { timeZone: FUSO, day: "2-digit", month: "2-digit", year: "numeric" });
  const dataLongaFmt = new Intl.DateTimeFormat(locale, { timeZone: FUSO, day: "numeric", month: "long", year: "numeric" });
  const horaFmt = new Intl.DateTimeFormat(locale, { timeZone: FUSO, hour: "2-digit", minute: "2-digit", hour12: false });
  const dataHoraFmt = new Intl.DateTimeFormat(locale, { timeZone: FUSO, day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });
  const mesCurtoFmt = new Intl.DateTimeFormat(locale, { timeZone: "UTC", month: "short" });
  const mesAnoFmt = new Intl.DateTimeFormat(locale, { timeZone: "UTC", month: "short", year: "numeric" });
  const valido = (v: number) => Number.isFinite(v);
  const traco = "—";

  /** Converte "AAAA-MM-DD" (dia local) em Date ao meio-dia de Brasília, evitando trocas de dia. */
  const deChave = (chave: string) => new Date(`${chave}T15:00:00Z`);

  return {
    locale,
    numero: (v: number, casas = 0) => (valido(v) ? nf(casas, casas).format(v) : traco),
    numeroAte: (v: number, max = 2) => (valido(v) ? nf(0, max).format(v) : traco),
    moeda: (v: number) => (valido(v) ? moedaFmt.format(v) : traco),
    moedaInteira: (v: number) => (valido(v) ? moedaInteira.format(v) : traco),
    pct: (v: number, casas = 1) => (valido(v) ? `${nf(casas, casas).format(v)} %` : traco),
    /** Energia com unidade adequada (kWh, MWh, GWh). */
    energia: (kWh: number, casas?: number) => {
      if (!valido(kWh)) return traco;
      const a = Math.abs(kWh);
      if (a >= 1e6) return `${nf(casas ?? 2, casas ?? 2).format(kWh / 1e6)} GWh`;
      if (a >= 1e4) return `${nf(casas ?? 1, casas ?? 1).format(kWh / 1e3)} MWh`;
      return `${nf(casas ?? 0, casas ?? 0).format(kWh)} kWh`;
    },
    potenciaKWp: (kWp: number) => (valido(kWp) ? (kWp >= 1000 ? `${nf(2, 2).format(kWp / 1000)} MWp` : `${nf(2, 2).format(kWp)} kWp`) : traco),
    potenciaKW: (kW: number) => (valido(kW) ? (kW >= 1000 ? `${nf(2, 2).format(kW / 1000)} MW` : `${nf(1, 1).format(kW)} kW`) : traco),
    data: (chave: string | null) => (chave ? dataFmt.format(deChave(chave)) : traco),
    dataLonga: (chave: string) => dataLongaFmt.format(deChave(chave)),
    hora: (instanteUtcMs: number) => horaFmt.format(new Date(instanteUtcMs)),
    dataHora: (instanteUtcMs: number) => dataHoraFmt.format(new Date(instanteUtcMs)),
    /** Nome curto do mês (índice 0–11). */
    mes: (indice: number) => mesCurtoFmt.format(new Date(Date.UTC(2025, indice, 15))),
    /** "AAAA-MM" → mês e ano curtos. */
    mesAno: (aaaaMm: string) => {
      const [a, m] = aaaaMm.split("-").map(Number);
      return mesAnoFmt.format(new Date(Date.UTC(a, m - 1, 15)));
    },
    anos: (v: number | null, casas = 1) => (v === null || !valido(v) ? traco : nf(casas, casas).format(v)),
  };
}
