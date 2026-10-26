"use client";

import { useMemo } from "react";
import { CartesianGrid, Legend, Line, LineChart, ReferenceArea, XAxis, YAxis } from "recharts";
import type { UsinaMonitorada } from "@/core/monitoramento/frota";
import { type ContextoGeracao, type DiaGerado, gerarDia, PASSO_MIN, RECEBIMENTO } from "@/core/monitoramento/gerador";
import { MS_POR_MINUTO } from "@/core/util/tempo";
import { useFormato, useTextos } from "@/i18n/cliente";
import { DicaGrafico, EIXO, GRADE } from "@/components/charts/base";
import { GraficoAcessivel } from "@/components/shared/grafico-acessivel";
import { ChartContainer, ChartLegendContent, ChartTooltip } from "@/components/ui/chart";

export function useDiaGerado(usina: UsinaMonitorada | undefined, chave: string, ctx: ContextoGeracao | null): DiaGerado | null {
  return useMemo(() => (usina && ctx ? gerarDia(usina, chave, ctx, { detalhe: true }) : null), [usina, chave, ctx]);
}

export type PontoCurva = { minuto: number; hora: string; real: number | null; esperada: number; irradiancia: number; situacao: number };

export function serieDoDia(dia: DiaGerado, filtroInversor?: string): PontoCurva[] {
  const inversores = filtroInversor ? dia.inversores.filter((i) => i.id === filtroInversor) : dia.inversores;
  return Array.from({ length: dia.recebimento.length }, (_, k) => {
    const instante = dia.inicioUtcMs + k * PASSO_MIN * MS_POR_MINUTO;
    const visivel = dia.recebimento[k] === RECEBIMENTO.online || dia.recebimento[k] === RECEBIMENTO.reenviado;
    const minuto = k * PASSO_MIN;
    return {
      minuto,
      hora: `${String(Math.floor(minuto / 60)).padStart(2, "0")}:${String(minuto % 60).padStart(2, "0")}`,
      real: visivel ? inversores.reduce((s, i) => s + i.pacW[k], 0) / 1000 : null,
      esperada: inversores.reduce((s, i) => s + i.pacEsperadaW[k], 0) / 1000,
      irradiancia: (dia.poaMedidaWM2 ?? dia.poaModeladaWM2)[k],
      situacao: dia.recebimento[k],
      instante,
    };
  });
}

/** Faixas contínuas sem dados (para sombrear no gráfico). */
function faixasSemDados(pontos: PontoCurva[]) {
  const faixas: Array<[number, number]> = [];
  let inicio: number | null = null;
  pontos.forEach((p, i) => {
    const ausente = p.situacao === RECEBIMENTO.ausente;
    if (ausente && inicio === null) inicio = p.minuto;
    if ((!ausente || i === pontos.length - 1) && inicio !== null) {
      faixas.push([inicio, p.minuto]);
      inicio = null;
    }
  });
  return faixas;
}

export function CurvaDia({ dia, titulo, descricao, acoes, inversor, janela }: { dia: DiaGerado; titulo: string; descricao: string; acoes?: React.ReactNode; inversor?: string; janela?: [number, number] }) {
  const t = useTextos("monitoramento").usina;
  const f = useFormato();
  const pontos = useMemo(() => serieDoDia(dia, inversor).filter((p) => (janela ? p.minuto >= janela[0] && p.minuto <= janela[1] : p.minuto >= 300 && p.minuto <= 1200)), [dia, inversor, janela]);
  const config = { real: { label: t.real, color: "var(--chart-2)" }, esperada: { label: t.esperada, color: "var(--chart-1)" } };
  const faixas = faixasSemDados(pontos);
  return (
    <GraficoAcessivel
      titulo={titulo}
      descricao={descricao}
      acoes={acoes}
      linhas={pontos.filter((p) => p.minuto % 15 === 0)}
      colunas={[
        { chave: "h", rotulo: t.dia, valor: (p) => p.hora },
        { chave: "r", rotulo: `${t.real} (kW)`, valor: (p) => (p.real === null ? t.semDadosTrecho : f.numero(p.real, 2)), numerica: true },
        { chave: "e", rotulo: `${t.esperada} (kW)`, valor: (p) => f.numero(p.esperada, 2), numerica: true },
        { chave: "g", rotulo: t.irradiancia, valor: (p) => f.numero(p.irradiancia), numerica: true },
      ]}
    >
      <ChartContainer config={config} className="aspect-auto h-full w-full">
        <LineChart accessibilityLayer={false} data={pontos}>
          <CartesianGrid {...GRADE} />
          <XAxis dataKey="minuto" type="number" domain={["dataMin", "dataMax"]} {...EIXO} tickFormatter={(m) => `${Math.floor(m / 60)}h`} ticks={pontos.filter((p) => p.minuto % 120 === 0).map((p) => p.minuto)} />
          <YAxis {...EIXO} width={56} tickFormatter={(v) => f.numero(v, v < 10 ? 1 : 0)} />
          {faixas.map(([a, b]) => (
            <ReferenceArea key={a} x1={a} x2={b} className="fill-sem-dados/15" label={{ value: t.semDadosTrecho, position: "insideTop", className: "fill-muted-foreground text-[11px]" }} />
          ))}
          <ChartTooltip content={<DicaGrafico formatar={(v) => `${f.numero(v, 2)} kW`} rotulo={(m) => `${String(Math.floor(Number(m) / 60)).padStart(2, "0")}:${String(Number(m) % 60).padStart(2, "0")}`} />} />
          <Legend content={<ChartLegendContent />} />
          <Line dataKey="esperada" type="monotone" stroke="var(--color-esperada)" strokeWidth={2} strokeDasharray="5 4" dot={false} isAnimationActive={false} />
          <Line dataKey="real" type="monotone" stroke="var(--color-real)" strokeWidth={2} dot={false} connectNulls={false} isAnimationActive={false} />
        </LineChart>
      </ChartContainer>
    </GraficoAcessivel>
  );
}
