"use client";

import { CalendarCheck, ClipboardPlus } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import type { ResultadoUsina } from "@/core/monitoramento/analise";
import type { UsinaMonitorada } from "@/core/monitoramento/frota";
import { cascataMensal } from "@/core/monitoramento/kpis";
import { recomendarLimpeza } from "@/core/monitoramento/limpeza";
import { criarOsLimpezaPreventiva } from "@/core/manutencao/ordens";
import { preencher } from "@/i18n/config";
import { useFormato, useTextos } from "@/i18n/cliente";
import { adicionarOrdens, definirCustoLimpeza, eventosDoEstado, useEstado } from "@/lib/estado";
import { Kpi } from "@/components/shared/indicadores";
import { Button } from "@/components/ui/button";
import { CampoNumero, CampoSelecao } from "@/components/simulador/campos";
import { useTituloAlerta } from "./comum";

export function AbaPerdasUsina({ usina, resultado }: { usina: UsinaMonitorada; resultado: ResultadoUsina }) {
  const t = useTextos("monitoramento");
  const tp = t.usina.perdas;
  const f = useFormato();
  const titulo = useTituloAlerta();
  const meses = [...new Set(resultado.agregados.map((d) => d.chave.slice(0, 7)))].reverse();
  const [mes, setMes] = useState(meses[0]);
  const c = useMemo(() => cascataMensal(usina, resultado.agregados, resultado.alertas, mes), [usina, resultado, mes]);
  const rotulo = (cat: string) =>
    cat === "naoExplicada" ? tp.naoExplicada : cat === "restricaoExterna" ? tp.restricaoExterna : cat.startsWith("alarme:") ? titulo({ tipo: "alarme", categoriaAlarme: cat.slice(7) as never }) : titulo({ tipo: cat as never });
  const maximo = Math.max(c.esperadaKWh, 1);
  const perdas = c.perdas.filter((p) => p.categoria !== "naoExplicada" || Math.abs(p.kWh) > 0.005 * c.esperadaKWh);
  const linhasPerda: Array<(typeof perdas)[number] & { inicio: number }> = [];
  for (let i = 0, acumulado = c.esperadaKWh; i < perdas.length; i++) {
    const p = perdas[i];
    const depois = acumulado - p.kWh;
    linhasPerda.push({ ...p, inicio: Math.min(acumulado, depois) });
    acumulado = depois;
  }
  return (
    <section className="rounded-xl border bg-card p-4" aria-labelledby="cascata-usina">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 id="cascata-usina" className="font-semibold">{tp.titulo}</h3>
          <p className="text-sm text-muted-foreground">{tp.descricao}</p>
        </div>
        <div className="w-40">
          <CampoSelecao rotulo={tp.mes} valor={mes} aoMudar={setMes} opcoes={meses.map((m) => ({ valor: m, rotulo: f.mesAno(m) }))} />
        </div>
      </div>
      <ul className="mt-4 space-y-1.5">
        <LinhaCascata rotulo={tp.esperada} valor={c.esperadaKWh} inicio={0} maximo={maximo} total formato={f.energia(c.esperadaKWh)} />
        {linhasPerda.map((l) => (
          <LinhaCascata key={l.categoria} rotulo={rotulo(l.categoria)} valor={l.kWh} inicio={l.inicio} maximo={maximo} formato={`−${f.energia(l.kWh)} · ${f.moedaInteira(l.r)}`} />
        ))}
        <LinhaCascata rotulo={tp.medida} valor={c.medidaKWh} inicio={0} maximo={maximo} total formato={f.energia(c.medidaKWh)} />
      </ul>
      {perdas.length === 0 && <p className="mt-2 text-sm text-muted-foreground">{tp.semPerdas}</p>}
    </section>
  );
}

function LinhaCascata({ rotulo, valor, inicio, maximo, total, formato }: { rotulo: string; valor: number; inicio: number; maximo: number; total?: boolean; formato: string }) {
  return (
    <li className="grid grid-cols-[minmax(8rem,14rem)_1fr_minmax(7rem,11rem)] items-center gap-2 text-sm">
      <span className={total ? "font-medium" : "text-muted-foreground"}>{rotulo}</span>
      <div className="relative h-4" aria-hidden="true">
        <div
          className={`absolute inset-y-0 rounded-sm ${total ? "bg-chart-1" : valor >= 0 ? "bg-chart-5" : "bg-chart-3"}`}
          style={{ left: `${(Math.max(0, inicio) / maximo) * 100}%`, width: `${Math.max(0.4, (Math.abs(valor) / maximo) * 100)}%` }}
        />
      </div>
      <span className="text-right tabular-nums">{formato}</span>
    </li>
  );
}

export function AbaLimpeza({ usina, resultado, fator }: { usina: UsinaMonitorada; resultado: ResultadoUsina; fator: Map<string, number> }) {
  const tu = useTextos("monitoramento").usina;
  const t = tu.limpeza;
  const ta = tu.alertas;
  const f = useFormato();
  const estado = useEstado();
  const custo = estado?.estado.custosLimpeza[usina.id] ?? usina.custoLimpezaR;
  const eventos = useMemo(() => (estado ? eventosDoEstado(estado.estado) : []), [estado]);
  const r = useMemo(() => recomendarLimpeza(usina, resultado.agregados, fator, eventos, custo), [usina, resultado, fator, eventos, custo]);
  if (!r) return <p className="text-sm text-muted-foreground">{t.semTendencia}</p>;
  const criarOs = () => {
    const [os] = adicionarOrdens((proxima) => [criarOsLimpezaPreventiva(usina, r.dataRecomendada ?? resultado.agregados.at(-1)!.chave, (r.perdaAtualPct / 100) * r.energiaDiariaKWh * usina.valorEnergiaRKWh, new Date(), proxima(), null)]);
    toast.success(preencher(ta.osCriada, { id: os.id }));
  };
  return (
    <section className="grid gap-4" aria-labelledby="limpeza">
      <h3 id="limpeza" className="font-semibold">{t.titulo}</h3>
      {!r.tendenciaSignificativa && <p className="text-sm text-muted-foreground">{t.semTendencia}</p>}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi rotulo={t.perdaAtual} valor={f.pct(r.perdaAtualPct)} />
        <Kpi rotulo={t.taxa} valor={`${f.numero(r.taxaPerdaPctDia, 3)} %/d`} />
        <Kpi rotulo={t.inicioAcumulo} valor={f.data(r.inicioAcumulo)} detalhe={t.inicioMotivo[r.motivoInicio]} />
        <Kpi rotulo={t.perdaAcumulada} valor={f.moedaInteira(r.perdaAcumuladaR)} detalhe={f.energia(r.perdaAcumuladaKWh)} />
        <Kpi rotulo={t.intervalo} valor={Number.isFinite(r.intervaloOtimoDias) ? `${f.numero(r.intervaloOtimoDias)} d` : "—"} />
        <Kpi destaque rotulo={t.dataRecomendada} valor={f.data(r.dataRecomendada)} detalhe={r.limparAgora ? t.limparAgora : undefined} />
      </div>
      <div className="grid gap-4 sm:grid-cols-[16rem_1fr] sm:items-end">
        <CampoNumero rotulo={t.custo} premissa dica={t.custoEditavel} valor={custo} min={0} sufixo="R$" aoMudar={(v) => v !== null && definirCustoLimpeza(usina.id, v)} />
        <div>
          {r.dataRecomendada && (
            <Button onClick={criarOs}>
              <ClipboardPlus aria-hidden="true" /> {t.criarOs}
            </Button>
          )}
        </div>
      </div>
      <div className="space-y-1 rounded-lg bg-muted/60 p-3 text-sm">
        <p className="flex items-center gap-1.5 font-mono text-xs">
          <CalendarCheck className="size-4" aria-hidden="true" />
          {preencher(t.formula, { r: f.numero(r.crescimentoPrejuizoRDia2, 4) })}
        </p>
        <p className="text-muted-foreground">{t.hipotese}</p>
      </div>
    </section>
  );
}
