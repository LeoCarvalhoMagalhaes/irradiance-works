"use client";

import { Bar, BarChart, CartesianGrid, Legend, XAxis, YAxis } from "recharts";
import type { Proposta } from "@/core/simulador/proposta";
import { preencher } from "@/i18n/config";
import { useFormato, useTextos } from "@/i18n/cliente";
import { DicaGrafico, EIXO, GRADE, RAIO_BARRA } from "@/components/charts/base";
import { GraficoAcessivel } from "@/components/shared/grafico-acessivel";
import { ChartContainer, ChartLegendContent, ChartTooltip } from "@/components/ui/chart";

export function AbaFatura({ p }: { p: Proposta }) {
  const ts = useTextos("simulador");
  const t = ts.resultado.fatura;
  const tc = useTextos("comum");
  const f = useFormato();
  const meses = p.projecao.meses.slice(0, 12);
  const dados = meses.map((m) => ({
    rotulo: `${f.mes(m.mes - 1)}/${String(m.ano).slice(2)}`,
    sem: m.faturaSemR,
    com: m.faturaComR,
    compensada: m.compensadaKWh,
    fioB: m.valorCompensadaR,
    disponibilidade: m.aplicouCustoDisponibilidade,
    creditos: m.saldoCreditosKWh,
  }));
  const config = { sem: { label: t.sem, color: "var(--chart-1)" }, com: { label: t.com, color: "var(--chart-2)" } };
  return (
    <div className="grid gap-6">
      <GraficoAcessivel
        titulo={t.titulo}
        descricao={t.descricao}
        linhas={dados}
        colunas={[
          { chave: "m", rotulo: ts.resultado.geracao.mes, valor: (l) => l.rotulo },
          { chave: "s", rotulo: t.sem, valor: (l) => f.moeda(l.sem), numerica: true },
          { chave: "c", rotulo: t.com, valor: (l) => f.moeda(l.com), numerica: true },
          { chave: "e", rotulo: t.compensada, valor: (l) => f.energia(l.compensada), numerica: true },
          { chave: "f", rotulo: t.fioBPago, valor: (l) => f.moeda(l.fioB), numerica: true },
          { chave: "d", rotulo: t.custoDisponibilidade, valor: (l) => (l.disponibilidade ? tc.sim : tc.nao) },
          { chave: "k", rotulo: t.creditos, valor: (l) => f.energia(l.creditos), numerica: true },
        ]}
      >
        <ChartContainer config={config} className="aspect-auto h-full w-full">
          <BarChart data={dados} barGap={2}>
            <CartesianGrid {...GRADE} />
            <XAxis dataKey="rotulo" {...EIXO} />
            <YAxis {...EIXO} width={64} tickFormatter={(v) => f.moedaInteira(v)} />
            <ChartTooltip content={<DicaGrafico formatar={(v) => f.moeda(v)} />} />
            <Legend content={<ChartLegendContent />} />
            <Bar dataKey="sem" fill="var(--color-sem)" radius={RAIO_BARRA} />
            <Bar dataKey="com" fill="var(--color-com)" radius={RAIO_BARRA} />
          </BarChart>
        </ChartContainer>
      </GraficoAcessivel>
      <div className="space-y-1 rounded-xl border bg-card p-4 text-sm">
        <p className="font-medium">{preencher(t.residualMinima, { valor: f.moeda(p.dimensionamento.faturaResidualMinimaAno1R) })}</p>
        <p className="text-muted-foreground">{t.regra}</p>
      </div>
    </div>
  );
}
