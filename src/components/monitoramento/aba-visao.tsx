"use client";

import { ChevronLeft, ChevronRight, Info } from "lucide-react";
import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, XAxis, YAxis } from "recharts";
import type { ResultadoUsina } from "@/core/monitoramento/analise";
import { piCorrigidoSerie } from "@/core/monitoramento/detectores";
import type { UsinaMonitorada } from "@/core/monitoramento/frota";
import type { ContextoGeracao } from "@/core/monitoramento/gerador";
import { somarDias } from "@/core/util/tempo";
import { useFormato, useTextos } from "@/i18n/cliente";
import { DicaGrafico, EIXO, GRADE, RAIO_BARRA } from "@/components/charts/base";
import { GraficoAcessivel } from "@/components/shared/grafico-acessivel";
import { Kpi } from "@/components/shared/indicadores";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ChartContainer, ChartLegendContent, ChartTooltip } from "@/components/ui/chart";
import { Input } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { CurvaDia, useDiaGerado } from "./curva-dia";

export function SeletorDia({ chave, aoMudar, min, max }: { chave: string; aoMudar: (c: string) => void; min: string; max: string }) {
  const t = useTextos("monitoramento").usina;
  return (
    <div className="flex items-center gap-1">
      <Button size="icon-sm" variant="ghost" aria-label={t.diaAnterior} disabled={chave <= min} onClick={() => aoMudar(somarDias(chave, -1))}>
        <ChevronLeft />
      </Button>
      <Input type="date" aria-label={t.dia} value={chave} min={min} max={max} onChange={(e) => e.target.value && aoMudar(e.target.value)} className="h-7 w-36 text-xs" />
      <Button size="icon-sm" variant="ghost" aria-label={t.diaSeguinte} disabled={chave >= max} onClick={() => aoMudar(somarDias(chave, 1))}>
        <ChevronRight />
      </Button>
    </div>
  );
}

export function AbaVisao({ usina, resultado, ctx, fator }: { usina: UsinaMonitorada; resultado: ResultadoUsina; ctx: ContextoGeracao; fator: Map<string, number> }) {
  const t = useTextos("monitoramento").usina;
  const f = useFormato();
  const [periodo, setPeriodo] = useState<"hoje" | "mes" | "doze">("mes");
  const [dia, setDia] = useState(ctx.hoje);
  const [janela, setJanela] = useState<"d30" | "d90" | "d365">("d30");
  const diaGerado = useDiaGerado(usina, dia, ctx);
  const k = periodo === "hoje" ? resultado.kpisHoje : periodo === "mes" ? resultado.kpisMes : resultado.kpis12Meses;
  const primeiro = resultado.agregados[0]?.chave ?? ctx.hoje;
  const n = janela === "d30" ? 30 : janela === "d90" ? 90 : 365;
  const diarios = resultado.agregados.slice(-n).map((d) => ({ chave: d.chave, rotulo: f.data(d.chave), medida: d.energiaKWh, esperada: d.esperadaVisivelKWh }));
  const tendencia = useMemo(() => {
    const pis = piCorrigidoSerie(resultado.agregados, fator);
    return resultado.agregados.map((d, i) => {
      const janela7 = pis.slice(Math.max(0, i - 6), i + 1).filter(Number.isFinite);
      return { chave: d.chave, indice: Number.isFinite(pis[i]) ? pis[i] : null, media: janela7.length ? janela7.reduce((a, b) => a + b, 0) / janela7.length : null };
    });
  }, [resultado, fator]);
  const configEnergia = { medida: { label: t.real, color: "var(--chart-2)" }, esperada: { label: t.esperada, color: "var(--chart-1)" } };
  const configPr = { indice: { label: t.indice, color: "var(--chart-3)" }, media: { label: t.mediaMovel, color: "var(--chart-1)" } };

  return (
    <div className="grid gap-6">
      <Alert>
        <Info aria-hidden="true" />
        <AlertDescription>
          {usina.tipo === "scada" ? t.prMedidoAviso : t.prEstimadoAviso} {resultado.temVizinhos ? t.comVizinhos : t.semVizinhos}
        </AlertDescription>
      </Alert>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <ToggleGroup type="single" variant="outline" size="sm" value={periodo} onValueChange={(v) => v && setPeriodo(v as typeof periodo)} aria-label={t.kpis.energia}>
          {(["hoje", "mes", "doze"] as const).map((p) => (
            <ToggleGroupItem key={p} value={p}>
              {t.kpis.periodo[p]}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi rotulo={t.kpis.energia} valor={f.energia(k.energiaKWh)} detalhe={`${t.kpis.esperada}: ${f.energia(k.esperadaKWh)}`} />
        <Kpi rotulo={t.kpis.desvio} valor={f.pct(k.desvioPct)} />
        <Kpi rotulo={t.kpis.produtividade} valor={`${f.numero(k.produtividadeKWhKWp, 1)} kWh/kWp`} />
        <Kpi rotulo={t.kpis.pr} valor={f.numero(k.performanceRatio, 3)} detalhe={`${t.kpis.prCorrigido}: ${f.numero(k.performanceRatioCorrigido, 3)}`} />
        <Kpi rotulo={t.kpis.disponibilidade} valor={f.pct(k.disponibilidadeTecnicaPct, 2)} />
        <Kpi rotulo={t.kpis.disponibilidadeContratual} valor={f.pct(k.disponibilidadeContratualPct, 2)} />
        <Kpi rotulo={t.kpis.co2} valor={`${f.numero(k.co2EvitadoT, 2)} t`} />
      </div>

      {diaGerado && (
        <CurvaDia dia={diaGerado} titulo={t.curvaTitulo} descricao={t.curvaDescricao} acoes={<SeletorDia chave={dia} aoMudar={setDia} min={primeiro} max={ctx.hoje} />} />
      )}

      <GraficoAcessivel
        titulo={t.energiaDiariaTitulo}
        descricao={t.energiaDiariaDescricao}
        linhas={diarios}
        acoes={
          <ToggleGroup type="single" variant="outline" size="sm" value={janela} onValueChange={(v) => v && setJanela(v as typeof janela)}>
            {(["d30", "d90", "d365"] as const).map((p) => (
              <ToggleGroupItem key={p} value={p}>
                {t.periodo[p]}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        }
        colunas={[
          { chave: "d", rotulo: t.dia, valor: (l) => l.rotulo },
          { chave: "m", rotulo: t.real, valor: (l) => f.energia(l.medida), numerica: true },
          { chave: "e", rotulo: t.esperada, valor: (l) => f.energia(l.esperada), numerica: true },
        ]}
      >
        <ChartContainer config={configEnergia} className="aspect-auto h-full w-full">
          <BarChart accessibilityLayer={false} data={diarios} barGap={1}>
            <CartesianGrid {...GRADE} />
            <XAxis dataKey="rotulo" {...EIXO} minTickGap={24} />
            <YAxis {...EIXO} width={60} tickFormatter={(v) => f.numero(v)} />
            <ChartTooltip content={<DicaGrafico formatar={(v) => f.energia(v)} />} />
            <Legend content={<ChartLegendContent />} />
            <Bar dataKey="esperada" fill="var(--color-esperada)" radius={RAIO_BARRA} />
            <Bar dataKey="medida" fill="var(--color-medida)" radius={RAIO_BARRA} />
          </BarChart>
        </ChartContainer>
      </GraficoAcessivel>

      <GraficoAcessivel
        titulo={t.prTitulo}
        descricao={t.prDescricao}
        linhas={tendencia.filter((_, i) => i % 7 === 0)}
        colunas={[
          { chave: "d", rotulo: t.dia, valor: (l) => f.data(l.chave) },
          { chave: "i", rotulo: t.indice, valor: (l) => (l.indice === null ? "—" : f.numero(l.indice, 3)), numerica: true },
          { chave: "m", rotulo: t.mediaMovel, valor: (l) => (l.media === null ? "—" : f.numero(l.media, 3)), numerica: true },
        ]}
      >
        <ChartContainer config={configPr} className="aspect-auto h-full w-full">
          <LineChart accessibilityLayer={false} data={tendencia}>
            <CartesianGrid {...GRADE} />
            <XAxis dataKey="chave" {...EIXO} tickFormatter={(c) => f.mesAno(String(c).slice(0, 7))} minTickGap={40} />
            <YAxis {...EIXO} width={48} domain={["auto", "auto"]} tickFormatter={(v) => f.numero(v, 2)} />
            <ChartTooltip content={<DicaGrafico formatar={(v) => f.numero(v, 3)} rotulo={(c) => f.data(String(c))} />} />
            <Legend content={<ChartLegendContent />} />
            <Line dataKey="indice" stroke="var(--color-indice)" strokeWidth={1} strokeOpacity={0.5} dot={false} connectNulls={false} isAnimationActive={false} />
            <Line dataKey="media" stroke="var(--color-media)" strokeWidth={2} dot={false} isAnimationActive={false} />
          </LineChart>
        </ChartContainer>
      </GraficoAcessivel>
    </div>
  );
}
