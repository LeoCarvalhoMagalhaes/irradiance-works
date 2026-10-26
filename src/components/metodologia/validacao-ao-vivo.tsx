"use client";

import { useFormato, useTextos } from "@/i18n/cliente";
import { useAnaliseAtual } from "@/lib/use-analise";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useTituloAlerta } from "@/components/monitoramento/comum";

/** Tabela de precisão, revocação e atraso por tipo — calculada agora, nunca escrita à mão. */
export function ValidacaoAoVivo() {
  const t = useTextos("metodologia").validacao;
  const f = useFormato();
  const titulo = useTituloAlerta();
  const { analise } = useAnaliseAtual();
  if (analise?.situacao !== "pronto") {
    return (
      <div aria-busy="true" className="space-y-2">
        <p className="text-sm text-muted-foreground" role="status">{t.calculando}</p>
        <Skeleton className="h-72 w-full" />
      </div>
    );
  }
  const v = analise.resultado.validacao;
  const nome = (tipo: string) => (tipo.startsWith("alarme:") ? titulo({ tipo: "alarme", categoriaAlarme: tipo.slice(7) as never }) : titulo({ tipo: tipo as never }));
  const pct = (x: number | null) => (x === null ? "—" : f.pct(x * 100, 0));
  return (
    <div className="overflow-x-auto rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            {(["tipo", "falhas", "detectadas", "alertas", "precisao", "revocacao", "atraso"] as const).map((c) => (
              <TableHead key={c} scope="col" className={c === "tipo" ? undefined : "text-right"}>
                {t.colunas[c]}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {v.porTipo.map((m) => (
            <TableRow key={m.tipo}>
              <TableHead scope="row" className="font-normal">{nome(m.tipo)}</TableHead>
              <TableCell className="text-right">{m.falhas}</TableCell>
              <TableCell className="text-right">{m.detectadas}</TableCell>
              <TableCell className="text-right">{m.alertas}</TableCell>
              <TableCell className="text-right">{pct(m.precisao)}</TableCell>
              <TableCell className="text-right">{pct(m.revocacao)}</TableCell>
              <TableCell className="text-right">{m.atrasoMedioDias === null ? "—" : f.numero(m.atrasoMedioDias, 1)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
        <TableFooter>
          <TableRow>
            <TableHead scope="row">{t.total}</TableHead>
            <TableCell className="text-right">{v.global.falhas}</TableCell>
            <TableCell className="text-right">{v.global.detectadas}</TableCell>
            <TableCell className="text-right">{v.global.alertas}</TableCell>
            <TableCell className="text-right">{pct(v.global.precisao)}</TableCell>
            <TableCell className="text-right">{pct(v.global.revocacao)}</TableCell>
            <TableCell className="text-right">{v.global.atrasoMedioDias === null ? "—" : f.numero(v.global.atrasoMedioDias, 1)}</TableCell>
          </TableRow>
        </TableFooter>
      </Table>
    </div>
  );
}
