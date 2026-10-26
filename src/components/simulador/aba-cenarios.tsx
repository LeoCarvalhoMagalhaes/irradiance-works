"use client";

import type { Proposta } from "@/core/simulador/proposta";
import { preencher } from "@/i18n/config";
import { useFormato, useTextos } from "@/i18n/cliente";
import { MarcaPremissa } from "@/components/shared/indicadores";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export function AbaCenarios({ p }: { p: Proposta }) {
  const tr = useTextos("simulador").resultado;
  const t = tr.cenarios;
  const f = useFormato();
  const base = p.financeiro.cenarios[0].vplR;
  const extremo = Math.max(...p.sensibilidade.flatMap((s) => [Math.abs(s.baixoVplR - base), Math.abs(s.altoVplR - base)]), 1);
  const pct = (v: number) => (Math.abs(v - base) / extremo) * 50;
  const rotuloCenario = (c: string) => (c === "fioB100" || c === "somenteTe" ? t.nomes[c] : preencher(t.nomes.teMaisBeneficios, { pct: p.entrada.premissas.regulatorias.beneficioPctTusd }));
  const rotuloSens = (tipo: Proposta["sensibilidade"][number]["tipoVariacao"], v: number | string) =>
    tipo === "cenario" ? rotuloCenario(String(v)) : tipo === "relativa" ? `${Number(v) > 0 ? "+" : "−"}${f.pct(Math.abs(Number(v)), 0)}` : f.pct(Number(v), 2).replace(/[,.]00 %/, " %");

  return (
    <div className="grid gap-6">
      <section className="rounded-xl border bg-card p-4" aria-labelledby="pos2029">
        <h3 id="pos2029" className="flex items-center font-semibold">
          {t.pos2029Titulo}
          <MarcaPremissa />
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">{t.pos2029Descricao}</p>
        <div className="mt-3 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead scope="col" />
                <TableHead scope="col" className="text-right">{tr.financeiro.vpl}</TableHead>
                <TableHead scope="col" className="text-right">{tr.financeiro.payback}</TableHead>
                <TableHead scope="col" className="text-right">{tr.financeiro.tir}</TableHead>
                <TableHead scope="col" className="text-right">{tr.financeiro.economia}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {p.pos2029.map((c) => (
                <TableRow key={c.cenario} className={c.cenario === p.entrada.premissas.regulatorias.cenarioPos2029 ? "bg-solar-suave/40" : undefined}>
                  <TableHead scope="row" className="font-normal">{rotuloCenario(c.cenario)}</TableHead>
                  <TableCell className="text-right tabular-nums">{f.moedaInteira(c.vplR)}</TableCell>
                  <TableCell className="text-right tabular-nums">{c.paybackAnos === null ? tr.financeiro.naoAtinge : preencher(tr.financeiro.anos, { valor: f.anos(c.paybackAnos) })}</TableCell>
                  <TableCell className="text-right tabular-nums">{c.tir === null ? "—" : f.pct(c.tir * 100)}</TableCell>
                  <TableCell className="text-right tabular-nums">{f.moedaInteira(c.economia25AnosR)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </section>

      <section className="rounded-xl border bg-card p-4" aria-labelledby="tornado">
        <h3 id="tornado" className="font-semibold">{t.sensibilidadeTitulo}</h3>
        <p className="mt-1 text-sm text-muted-foreground">{t.sensibilidadeDescricao}</p>
        <p className="mt-1 text-sm font-medium">{preencher(t.base, { valor: f.moedaInteira(base) })}</p>
        <div className="mt-4 flex gap-4 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-[2px] bg-chart-5" aria-hidden="true" />{t.baixo}</span>
          <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-[2px] bg-chart-1" aria-hidden="true" />{t.alto}</span>
        </div>
        {/* Tornado em HTML: cada linha tem os valores escritos, então a cor não carrega sozinha a informação. */}
        <ul className="mt-3 space-y-3">
          {p.sensibilidade.map((s) => {
            const baixoEsq = s.baixoVplR < base;
            return (
              <li key={s.parametro} className="grid gap-1 sm:grid-cols-[11rem_1fr] sm:items-center">
                <span className="text-sm">{t.parametros[s.parametro as keyof typeof t.parametros]}</span>
                <div>
                  <div className="relative h-5 rounded bg-muted" aria-hidden="true">
                    <div className="absolute inset-y-0 left-1/2 w-px bg-foreground/40" />
                    <div
                      className="absolute inset-y-0.5 rounded-sm bg-chart-5"
                      style={baixoEsq ? { right: "50%", width: `${pct(s.baixoVplR)}%` } : { left: "50%", width: `${pct(s.baixoVplR)}%` }}
                    />
                    <div
                      className="absolute inset-y-0.5 rounded-sm bg-chart-1"
                      style={s.altoVplR >= base ? { left: "50%", width: `${pct(s.altoVplR)}%` } : { right: "50%", width: `${pct(s.altoVplR)}%` }}
                    />
                  </div>
                  <p className="mt-0.5 flex justify-between text-xs tabular-nums text-muted-foreground">
                    <span>
                      {rotuloSens(s.tipoVariacao, s.variacaoBaixo)}: {f.moedaInteira(s.baixoVplR)}
                    </span>
                    <span>
                      {rotuloSens(s.tipoVariacao, s.variacaoAlto)}: {f.moedaInteira(s.altoVplR)}
                    </span>
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
