"use client";

import { CheckCircle2, TriangleAlert, XCircle } from "lucide-react";
import type { Proposta } from "@/core/simulador/proposta";
import { preencher } from "@/i18n/config";
import { useFormato, useTextos } from "@/i18n/cliente";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export function AbaEletrica({ p }: { p: Proposta }) {
  const tr = useTextos("simulador").resultado;
  const t = tr.eletrica;
  const f = useFormato();
  const cfg = p.arranjo.configuracao;
  return (
    <div className="grid gap-6">
      <section className="rounded-xl border bg-card p-4" aria-labelledby="memoria">
        <h3 id="memoria" className="font-semibold">{t.titulo}</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          {preencher(t.descricao, { tmin: f.numero(p.temperaturasProjeto.tempMinC, 1), tmax: f.numero(p.temperaturasProjeto.tempMaxCelulaC, 1) })}
        </p>
        {cfg && (
          <p className="mt-1 text-sm">
            {preencher(t.configuracao, { inv: cfg.quantidadeInversores, ns: cfg.modulosEmSerie, strings: cfg.stringsPorMppt.join(" / ") })}
          </p>
        )}
        <div className="mt-3 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead scope="col">{t.formula}</TableHead>
                <TableHead scope="col">{t.substituicao}</TableHead>
                <TableHead scope="col" className="text-right">{t.resultado}</TableHead>
                <TableHead scope="col" className="text-right">{t.limite}</TableHead>
                <TableHead scope="col" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {p.verificacoes.map((v) => {
                const casas = v.unidade === "" ? 2 : 1;
                return (
                  <TableRow key={v.codigo}>
                    <TableCell className="min-w-56 align-top">
                      <p className="font-medium">{t.codigos[v.codigo]}</p>
                      <p className="font-mono text-xs text-muted-foreground">{v.formula}</p>
                    </TableCell>
                    <TableCell className="align-top font-mono text-xs whitespace-normal">{v.substituicao}</TableCell>
                    <TableCell className="text-right align-top tabular-nums">
                      {f.numero(v.valor, casas)} {v.unidade}
                    </TableCell>
                    <TableCell className="text-right align-top tabular-nums">
                      {v.comparador === "<=" ? "≤" : "≥"} {f.numero(v.limite, casas)} {v.unidade}
                    </TableCell>
                    <TableCell className="align-top">
                      {v.aprovado ? (
                        <span className="inline-flex items-center gap-1 text-sm text-ok">
                          <CheckCircle2 className="size-4" aria-hidden="true" /> {t.aprovado}
                        </span>
                      ) : v.tipo === "aviso" ? (
                        <span className="inline-flex items-center gap-1 text-sm text-atencao">
                          <TriangleAlert className="size-4" aria-hidden="true" /> {t.aviso}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-sm font-medium text-critico">
                          <XCircle className="size-4" aria-hidden="true" /> {t.reprovado}
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
        <ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-muted-foreground">
          <li>{preencher(t.tempMinNota, { margem: p.entrada.premissas.tecnicas.margemTempMinC })}</li>
          <li>{t.tempMaxNota}</li>
        </ul>
      </section>

      <section className="rounded-xl border bg-card p-4" aria-labelledby="enquadramento">
        <h3 id="enquadramento" className="font-semibold">{t.enquadramentoTitulo}</h3>
        <p className="mt-1 font-medium">
          {tr.portes[p.enquadramento.porte]}
          {p.enquadramento.categoria && ` · ${tr.categorias[p.enquadramento.categoria]}`}
        </p>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
          {p.enquadramento.fundamentos.map((fu) => (
            <li key={fu} lang="pt-BR">{fu}</li>
          ))}
        </ul>
      </section>
    </div>
  );
}
