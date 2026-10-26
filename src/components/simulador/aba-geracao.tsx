"use client";

import { useState } from "react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Legend, XAxis, YAxis } from "recharts";
import irradiacao from "@/data/irradiacao.json";
import type { Proposta } from "@/core/simulador/proposta";
import { preencher } from "@/i18n/config";
import { useFormato, useTextos } from "@/i18n/cliente";
import { DicaGrafico, EIXO, GRADE, RAIO_BARRA } from "@/components/charts/base";
import { GraficoAcessivel } from "@/components/shared/grafico-acessivel";
import { ChartContainer, ChartLegendContent, ChartTooltip } from "@/components/ui/chart";
import { CampoSelecao } from "./campos";

export function AbaGeracao({ p }: { p: Proposta }) {
  const t = useTextos("simulador").resultado.geracao;
  const f = useFormato();
  const [mes, setMes] = useState(0);
  const dados = p.simultaneidade.consumoMensalKWh.map((consumo, i) => ({
    mes: f.mes(i),
    geracao: p.projecao.meses.find((m) => m.mes === i + 1 && m.anoOperacao === 1)?.geracaoKWh ?? 0,
    consumo,
    autoconsumo: p.simultaneidade.autoconsumoMensalKWh[i],
    injetada: p.simultaneidade.injetadaMensalKWh[i],
  }));
  const perfil = p.simulacao.perfilDiarioMedioW[mes].geracao.map((g, h) => ({ hora: h, geracao: g / 1000, carga: p.simulacao.perfilDiarioMedioW[mes].carga[h] / 1000 }));
  const config = {
    geracao: { label: t.geracao, color: "var(--chart-2)" },
    consumo: { label: t.consumo, color: "var(--chart-1)" },
    autoconsumo: { label: t.autoconsumo, color: "var(--chart-3)" },
    injetada: { label: t.injetada, color: "var(--chart-4)" },
  };
  const configPerfil = { geracao: { label: t.geracao, color: "var(--chart-2)" }, carga: { label: t.consumo, color: "var(--chart-1)" } };
  const kwh = (v: number) => f.energia(v);

  return (
    <div className="grid gap-6">
      <GraficoAcessivel
        titulo={t.titulo}
        descricao={t.descricao}
        linhas={dados}
        colunas={[
          { chave: "mes", rotulo: t.mes, valor: (l) => l.mes },
          { chave: "g", rotulo: t.geracao, valor: (l) => kwh(l.geracao), numerica: true },
          { chave: "c", rotulo: t.consumo, valor: (l) => kwh(l.consumo), numerica: true },
          { chave: "a", rotulo: t.autoconsumo, valor: (l) => kwh(l.autoconsumo), numerica: true },
          { chave: "i", rotulo: t.injetada, valor: (l) => kwh(l.injetada), numerica: true },
        ]}
      >
        <ChartContainer config={config} className="aspect-auto h-full w-full">
          <BarChart data={dados} barGap={2} barCategoryGap="20%">
            <CartesianGrid {...GRADE} />
            <XAxis dataKey="mes" {...EIXO} />
            <YAxis {...EIXO} width={56} tickFormatter={(v) => f.numero(v)} />
            <ChartTooltip cursor={{ fillOpacity: 0.4 }} content={<DicaGrafico formatar={kwh} />} />
            <Legend content={<ChartLegendContent />} />
            <Bar dataKey="geracao" fill="var(--color-geracao)" radius={RAIO_BARRA} />
            <Bar dataKey="consumo" fill="var(--color-consumo)" radius={RAIO_BARRA} />
            <Bar dataKey="autoconsumo" fill="var(--color-autoconsumo)" radius={RAIO_BARRA} />
          </BarChart>
        </ChartContainer>
      </GraficoAcessivel>

      <div className="rounded-xl border bg-card p-4">
        <p className="text-sm font-medium">{t.simultaneidade}</p>
        <p className="text-sm text-muted-foreground">{preencher(t.fracaoAutoconsumo, { valor: f.pct(p.simultaneidade.fracaoAutoconsumoPct) })}</p>
        <p className="mt-2 text-xs text-muted-foreground">
          {preencher(t.irradiacao, { ghi: f.numero(p.simulacao.irradiacaoGhiKWhM2), poa: f.numero(p.simulacao.irradiacaoPoaKWhM2) })}
        </p>
        <p className="text-xs text-muted-foreground">{preencher(t.fonteClima, { periodo: (irradiacao.fonte.periodo ?? "").match(/\d{4}/g)?.join("–") ?? "" })}</p>
      </div>

      <GraficoAcessivel
        titulo={preencher(t.perfilTitulo, { mes: f.mes(mes) })}
        descricao={t.perfilDescricao}
        linhas={perfil}
        acoes={
          <div className="w-28">
            <CampoSelecao rotulo={t.mes} valor={String(mes)} aoMudar={(v) => setMes(Number(v))} opcoes={Array.from({ length: 12 }, (_, i) => ({ valor: String(i), rotulo: f.mes(i) }))} className="[&_label]:sr-only" />
          </div>
        }
        colunas={[
          { chave: "h", rotulo: t.hora, valor: (l) => `${String(l.hora).padStart(2, "0")}h`, numerica: true },
          { chave: "g", rotulo: t.geracao, valor: (l) => f.numero(l.geracao, 2), numerica: true },
          { chave: "c", rotulo: t.consumo, valor: (l) => f.numero(l.carga, 2), numerica: true },
        ]}
      >
        <ChartContainer config={configPerfil} className="aspect-auto h-full w-full">
          <AreaChart data={perfil}>
            <CartesianGrid {...GRADE} />
            <XAxis dataKey="hora" {...EIXO} tickFormatter={(h) => `${h}h`} interval={2} />
            <YAxis {...EIXO} width={48} tickFormatter={(v) => f.numero(v, 1)} label={{ value: t.potenciaMedia, angle: -90, position: "insideLeft", offset: 0, className: "fill-muted-foreground text-[11px]" }} />
            <ChartTooltip content={<DicaGrafico formatar={(v) => `${f.numero(v, 2)} kW`} rotulo={(h) => `${h}h`} />} />
            <Legend content={<ChartLegendContent />} />
            <Area dataKey="carga" type="monotone" stroke="var(--color-carga)" fill="var(--color-carga)" fillOpacity={0.15} strokeWidth={2} />
            <Area dataKey="geracao" type="monotone" stroke="var(--color-geracao)" fill="var(--color-geracao)" fillOpacity={0.25} strokeWidth={2} />
          </AreaChart>
        </ChartContainer>
      </GraficoAcessivel>
    </div>
  );
}
