"use client";

import type { CascataPerdas } from "@/core/solar/simulacao";
import { useFormato, useTextos } from "@/i18n/cliente";

const ETAPAS: Array<keyof CascataPerdas> = [
  "referenciaHorizontalKWh", "transposicaoKWh", "sujidadeKWh", "sombreamentoKWh", "temperaturaKWh", "mismatchKWh",
  "cabosCcKWh", "inversorKWh", "clippingKWh", "cabosCaKWh", "disponibilidadeKWh", "entregueKWh",
];

/** Cascata em barras flutuantes (HTML), com valores escritos em cada linha. */
export function CascataHorizontal({ cascata, titulo, descricao }: { cascata: CascataPerdas; titulo: string; descricao: string }) {
  const t = useTextos("simulador").resultado.perdas;
  const f = useFormato();
  const linhas: Array<{ e: keyof CascataPerdas; v: number; inicio: number; largura: number; total: boolean }> = [];
  for (let i = 0, acumulado = 0; i < ETAPAS.length; i++) {
    const e = ETAPAS[i];
    const v = cascata[e];
    const total = e === "referenciaHorizontalKWh" || e === "entregueKWh";
    linhas.push({ e, v, inicio: total ? 0 : v >= 0 ? acumulado : acumulado + v, largura: Math.abs(v), total });
    if (e === "referenciaHorizontalKWh") acumulado = v;
    else if (!total) acumulado += v;
  }
  const maximo = Math.max(...linhas.map((l) => l.inicio + l.largura));
  const referencia = cascata.referenciaHorizontalKWh;
  return (
    <section className="rounded-xl border bg-card p-4" aria-labelledby="cascata">
      <h3 id="cascata" className="font-semibold">{titulo}</h3>
      <p className="mt-1 text-sm text-muted-foreground">{descricao}</p>
      <ul className="mt-4 space-y-1.5">
        {linhas.map((l) => (
          <li key={l.e} className="grid grid-cols-[9rem_1fr_6.5rem] items-center gap-2 text-sm sm:grid-cols-[12rem_1fr_8rem]">
            <span className={l.total ? "font-medium" : "text-muted-foreground"}>{t.etapas[l.e]}</span>
            <div className="relative h-4" aria-hidden="true">
              <div
                className={`absolute inset-y-0 rounded-sm ${l.total ? "bg-chart-1" : l.v >= 0 ? "bg-chart-3" : "bg-chart-5"}`}
                style={{ left: `${(l.inicio / maximo) * 100}%`, width: `${Math.max(0.4, (l.largura / maximo) * 100)}%` }}
              />
            </div>
            <span className="text-right tabular-nums">
              {l.total ? f.energia(l.v) : `${l.v >= 0 ? "+" : "−"}${f.pct((Math.abs(l.v) / referencia) * 100)}`}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function AbaPerdas({ cascata }: { cascata: CascataPerdas }) {
  const t = useTextos("simulador").resultado.perdas;
  return <CascataHorizontal cascata={cascata} titulo={t.titulo} descricao={t.descricao} />;
}
