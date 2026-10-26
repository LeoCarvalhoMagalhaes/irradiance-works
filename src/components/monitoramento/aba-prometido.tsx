"use client";

import Link from "next/link";
import { useMemo } from "react";
import { Bar, BarChart, CartesianGrid, Legend, XAxis, YAxis } from "recharts";
import { prometidoVsReal } from "@/core/integracao/comissionamento";
import type { ResultadoUsina } from "@/core/monitoramento/analise";
import type { UsinaMonitorada } from "@/core/monitoramento/frota";
import { PREMISSAS_PADRAO } from "@/core/simulador/premissas";
import { preencher } from "@/i18n/config";
import { useFormato, useIdioma, useTextos } from "@/i18n/cliente";
import { useEstado } from "@/lib/estado";
import { DicaGrafico, EIXO, GRADE, RAIO_BARRA } from "@/components/charts/base";
import { GraficoAcessivel } from "@/components/shared/grafico-acessivel";
import { Button } from "@/components/ui/button";
import { ChartContainer, ChartLegendContent, ChartTooltip } from "@/components/ui/chart";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export function AbaPrometido({ usina, resultado }: { usina: UsinaMonitorada; resultado: ResultadoUsina }) {
  const tu = useTextos("monitoramento").usina;
  const t = tu.prometido;
  const f = useFormato();
  const idioma = useIdioma();
  const estado = useEstado();
  const comissionamento = estado?.estado.comissionamentos.find((c) => c.id === usina.id);
  const degradacao = comissionamento?.entrada.premissas.tecnicas.degradacaoAnualPct ?? PREMISSAS_PADRAO.tecnicas.degradacaoAnualPct;
  const pr = useMemo(() => prometidoVsReal(usina, resultado.agregados, resultado.alertas, degradacao), [usina, resultado, degradacao]);
  if (!usina.geracaoPrometidaMensalKWh) return <p className="text-sm text-muted-foreground">{t.apenasComissionadas}</p>;
  const dados = pr.meses.map((m) => ({ rotulo: f.mesAno(m.mes), prometido: m.prometidoKWh, esperado: m.esperadoKWh, medido: m.medidoKWh, ...m }));
  const config = { prometido: { label: t.prometido, color: "var(--chart-1)" }, esperado: { label: t.esperado, color: "var(--chart-4)" }, medido: { label: t.medido, color: "var(--chart-2)" } };
  const salva = estado?.estado.propostas.find((p) => p.id === usina.propostaId);
  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-4">
        <p className="text-lg font-semibold tabular-nums">{preencher(t.desvioAcumulado, { valor: f.pct(pr.acumulado.desvioPct) })}</p>
        {salva && (
          <Button asChild variant="outline" size="sm">
            <Link href={`/${idioma}/simulador/?proposta=${salva.id}`}>{t.verProposta}</Link>
          </Button>
        )}
      </div>
      <GraficoAcessivel
        titulo={t.titulo}
        descricao={t.descricao}
        linhas={dados}
        colunas={[
          { chave: "m", rotulo: tu.perdas.mes, valor: (l) => l.rotulo },
          { chave: "p", rotulo: t.prometido, valor: (l) => f.energia(l.prometido), numerica: true },
          { chave: "e", rotulo: t.esperado, valor: (l) => f.energia(l.esperado), numerica: true },
          { chave: "r", rotulo: t.medido, valor: (l) => f.energia(l.medido), numerica: true },
        ]}
      >
        <ChartContainer config={config} className="aspect-auto h-full w-full">
          <BarChart accessibilityLayer={false} data={dados} barGap={2}>
            <CartesianGrid {...GRADE} />
            <XAxis dataKey="rotulo" {...EIXO} />
            <YAxis {...EIXO} width={60} tickFormatter={(v) => f.numero(v)} />
            <ChartTooltip content={<DicaGrafico formatar={(v) => f.energia(v)} />} />
            <Legend content={<ChartLegendContent />} />
            <Bar dataKey="prometido" fill="var(--color-prometido)" radius={RAIO_BARRA} />
            <Bar dataKey="esperado" fill="var(--color-esperado)" radius={RAIO_BARRA} />
            <Bar dataKey="medido" fill="var(--color-medido)" radius={RAIO_BARRA} />
          </BarChart>
        </ChartContainer>
      </GraficoAcessivel>
      <section className="rounded-xl border bg-card p-4" aria-labelledby="explicacao">
        <h3 id="explicacao" className="font-semibold">{t.decomposicao}</h3>
        <div className="mt-3 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead scope="col" />
                <TableHead scope="col" className="text-right">{t.prometido}</TableHead>
                <TableHead scope="col" className="text-right">{t.clima}</TableHead>
                <TableHead scope="col" className="text-right">{t.operacionais}</TableHead>
                <TableHead scope="col" className="text-right">{t.naoExplicado}</TableHead>
                <TableHead scope="col" className="text-right">{t.medido}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {dados.map((d) => (
                <TableRow key={d.mes}>
                  <TableHead scope="row" className="font-normal">{d.rotulo}</TableHead>
                  <TableCell className="text-right">{f.energia(d.prometidoKWh)}</TableCell>
                  <TableCell className="text-right">{`${d.efeitoClimaKWh >= 0 ? "+" : "−"}${f.energia(Math.abs(d.efeitoClimaKWh))}`}</TableCell>
                  <TableCell className="text-right">{d.perdasOperacionaisKWh > 0 ? `−${f.energia(d.perdasOperacionaisKWh)}` : "—"}</TableCell>
                  <TableCell className="text-right">{`${d.naoExplicadoKWh >= 0 ? "+" : "−"}${f.energia(Math.abs(d.naoExplicadoKWh))}`}</TableCell>
                  <TableCell className="text-right font-medium">{f.energia(d.medidoKWh)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </section>
    </div>
  );
}
