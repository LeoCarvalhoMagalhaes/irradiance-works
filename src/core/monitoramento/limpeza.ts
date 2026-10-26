/**
 * Recomendação de limpeza.
 *
 * Hipótese: desde a última lavagem, a perda por sujidade cresce linearmente no tempo. Se r é o
 * crescimento diário do prejuízo (R$/dia por dia) e C o custo de uma limpeza, o custo médio
 * diário de um ciclo de T dias é (C + r·T²/2)/T, mínimo em T* = √(2C/r).
 *
 * A taxa de crescimento vem da tendência do índice de desempenho corrigido desde a última vez em
 * que a usina estava limpa (ou desde a última limpeza) e só é usada se for significativa (t ≤ −3).
 *
 * Limitações: chuvas lavam parcialmente os módulos e reiniciam o ciclo de forma imprevisível; a
 * taxa herda a incerteza da irradiância modelada (menor quando há usinas vizinhas).
 */
import { diferencaDias, somarDias } from "../util/tempo";
import type { AgregadoDia } from "./agregados";
import { nivelSujidadePct, piCorrigidoSerie, taxaSujidadePctDia } from "./detectores";
import type { UsinaMonitorada } from "./frota";
import type { EventoUsuario } from "./gerador";

export function intervaloOtimoDias(custoLimpezaR: number, crescimentoPrejuizoRDia2: number): number {
  if (crescimentoPrejuizoRDia2 <= 0) return Infinity;
  return Math.sqrt((2 * custoLimpezaR) / crescimentoPrejuizoRDia2);
}

export type RecomendacaoLimpeza = {
  /** Início estimado do acúmulo: última limpeza registrada ou hoje − perda/taxa. */
  inicioAcumulo: string;
  motivoInicio: "limpeza" | "estimado";
  tendenciaSignificativa: boolean;
  taxaPerdaPctDia: number;
  perdaAtualPct: number;
  energiaDiariaKWh: number;
  crescimentoPrejuizoRDia2: number;
  custoLimpezaR: number;
  intervaloOtimoDias: number;
  dataRecomendada: string | null;
  perdaAcumuladaKWh: number;
  perdaAcumuladaR: number;
  limparAgora: boolean;
};

export function recomendarLimpeza(
  usina: UsinaMonitorada,
  dias: AgregadoDia[],
  fatorCidade: Map<string, number> | undefined,
  eventos: EventoUsuario[],
  custoLimpezaR = usina.custoLimpezaR,
): RecomendacaoLimpeza | null {
  if (dias.length < 30) return null;
  const fim = dias.length - 1;
  const hoje = dias[fim].chave;
  const limpezas = new Set(eventos.filter((e) => e.usinaId === usina.id && e.tipo === "limpeza").map((e) => e.chave));
  const pis = piCorrigidoSerie(dias, fatorCidade);
  const temVizinhos = (fatorCidade?.size ?? 0) > 0;
  const nivel = nivelSujidadePct(dias, pis, fim, limpezas, temVizinhos);
  const taxa = taxaSujidadePctDia(dias, pis, fim, limpezas, temVizinhos);
  const perdaAtualPct = Number.isFinite(nivel) ? nivel : 0;
  const ultimaLimpeza = [...limpezas].filter((c) => c <= hoje).sort().pop();
  let inicioAcumulo: string;
  let motivoInicio: RecomendacaoLimpeza["motivoInicio"];
  if (ultimaLimpeza && (taxa === null || diferencaDias(ultimaLimpeza, hoje) <= perdaAtualPct / taxa)) {
    inicioAcumulo = ultimaLimpeza;
    motivoInicio = "limpeza";
  } else {
    inicioAcumulo = taxa ? somarDias(hoje, -Math.round(perdaAtualPct / taxa)) : hoje;
    motivoInicio = "estimado";
  }
  const taxaFracao = (taxa ?? 0) / 100;
  const energiaDiariaKWh = dias.slice(-30).reduce((s, d) => s + d.esperadaVisivelKWh, 0) / 30;
  const r = taxaFracao * energiaDiariaKWh * usina.valorEnergiaRKWh;
  const tOtimo = intervaloOtimoDias(custoLimpezaR, r);
  const decorridos = Math.max(0, diferencaDias(inicioAcumulo, hoje));
  const perdaAcumuladaKWh = Array.from({ length: decorridos }, (_, k) => Math.min(1, taxaFracao * k) * energiaDiariaKWh).reduce((a, b) => a + b, 0);
  const dataRecomendada = Number.isFinite(tOtimo) ? somarDias(inicioAcumulo, Math.round(tOtimo)) : null;
  return {
    inicioAcumulo,
    motivoInicio,
    tendenciaSignificativa: taxa !== null,
    taxaPerdaPctDia: taxa ?? 0,
    perdaAtualPct,
    energiaDiariaKWh,
    crescimentoPrejuizoRDia2: r,
    custoLimpezaR,
    intervaloOtimoDias: tOtimo,
    dataRecomendada,
    perdaAcumuladaKWh,
    perdaAcumuladaR: perdaAcumuladaKWh * usina.valorEnergiaRKWh,
    limparAgora: dataRecomendada !== null && dataRecomendada <= hoje,
  };
}
