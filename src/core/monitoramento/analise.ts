/**
 * Análise completa da frota: agregados diários, sensor virtual, detectores, indicadores,
 * recomendação de limpeza e validação contra os rótulos verdadeiros.
 */
import { somarDias } from "../util/tempo";
import { type AgregadoDia, agregarUsina } from "./agregados";
import { type Alerta, detectar, fatoresSensorVirtual, LIMIARES_PADRAO, type Limiares } from "./detectores";
import type { UsinaMonitorada } from "./frota";
import type { ContextoGeracao } from "./gerador";
import { calcularKpis, type Kpis } from "./kpis";
import { type RecomendacaoLimpeza, recomendarLimpeza } from "./limpeza";
import { type MetricaTipo, rotulos, validar } from "./validacao";

export const DIAS_HISTORICO = 365;

export type ResultadoUsina = {
  usinaId: string;
  agregados: AgregadoDia[];
  fatorCidade: Array<[string, number]>;
  temVizinhos: boolean;
  alertas: Alerta[];
  kpisHoje: Kpis;
  kpisMes: Kpis;
  kpis12Meses: Kpis;
  limpeza: RecomendacaoLimpeza | null;
};

export type ResultadoFrota = {
  hoje: string;
  usinas: ResultadoUsina[];
  validacao: { porTipo: MetricaTipo[]; global: MetricaTipo };
};

export function analisarUsinas(
  usinas: UsinaMonitorada[],
  ctx: ContextoGeracao,
  opcoes: { limiares?: Limiares; aoProgredir?: (feitas: number, total: number) => void } = {},
): ResultadoFrota {
  const agregados = new Map<string, { usina: UsinaMonitorada; agregados: AgregadoDia[] }>();
  usinas.forEach((u, i) => {
    agregados.set(u.id, { usina: u, agregados: agregarUsina(u, ctx, DIAS_HISTORICO) });
    opcoes.aoProgredir?.(i + 1, usinas.length);
  });
  const fatores = fatoresSensorVirtual(agregados);
  const mesAtual = ctx.hoje.slice(0, 7);
  const resultados: ResultadoUsina[] = usinas.map((u) => {
    const dias = agregados.get(u.id)!.agregados;
    const fator = fatores.get(u.cidade.id);
    const limpezas = new Set(ctx.eventos.filter((e) => e.usinaId === u.id && e.tipo === "limpeza").map((e) => e.chave));
    const alertas = detectar(u, dias, fator, opcoes.limiares ?? LIMIARES_PADRAO, limpezas);
    const temSujidade = alertas.some((a) => a.tipo === "sujidade" && a.fim === null);
    return {
      usinaId: u.id,
      agregados: dias,
      fatorCidade: fator ? [...fator.entries()] : [],
      temVizinhos: (fator?.size ?? 0) > 0,
      alertas,
      kpisHoje: calcularKpis(u, dias.filter((d) => d.chave === ctx.hoje)),
      kpisMes: calcularKpis(u, dias.filter((d) => d.chave.startsWith(mesAtual))),
      kpis12Meses: calcularKpis(u, dias),
      limpeza: u.tipo === "gd" || temSujidade ? recomendarLimpeza(u, dias, fator, ctx.eventos) : null,
    };
  });
  const inicioJanela = somarDias(ctx.hoje, -(DIAS_HISTORICO - 1));
  const validacao = validar(
    resultados.flatMap((r) => r.alertas),
    rotulos(usinas.filter((u) => u.origem === "demonstracao"), ctx.hoje, inicioJanela, ctx.eventos),
    ctx.hoje,
  );
  return { hoje: ctx.hoje, usinas: resultados, validacao };
}
