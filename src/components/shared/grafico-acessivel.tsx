"use client";

import { Table2 } from "lucide-react";
import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { preencher } from "@/i18n/config";
import { useTextos } from "@/i18n/cliente";

export type ColunaTabela<T> = { chave: string; rotulo: string; valor: (linha: T) => string; numerica?: boolean };

/**
 * Moldura padrão de gráfico acessível: título, descrição textual, legenda (no próprio gráfico) e
 * alternativa em tabela ("Ver dados"). O SVG do gráfico fica oculto para leitores de tela, que
 * recebem a descrição e a tabela.
 */
export function GraficoAcessivel<T>({
  titulo,
  descricao,
  colunas,
  linhas,
  children,
  acoes,
  altura = 280,
}: {
  titulo: string;
  descricao: string;
  colunas: ColunaTabela<T>[];
  linhas: T[];
  children: React.ReactNode;
  acoes?: React.ReactNode;
  altura?: number;
}) {
  const t = useTextos("comum");
  const [tabela, setTabela] = useState(false);
  const idDescricao = useId();
  const idTabela = useId();
  return (
    <Card role="figure" aria-labelledby={`${idDescricao}-t`} aria-describedby={idDescricao}>
      <CardHeader>
        <CardTitle id={`${idDescricao}-t`} className="text-base">
          {titulo}
        </CardTitle>
        <CardDescription id={idDescricao}>{descricao}</CardDescription>
        <CardAction className="flex items-center gap-1">
          {acoes}
          <Button variant="ghost" size="sm" aria-expanded={tabela} aria-controls={idTabela} onClick={() => setTabela((v) => !v)}>
            <Table2 aria-hidden="true" />
            <span className="hidden sm:inline">{tabela ? t.grafico.ocultarDados : t.grafico.verDados}</span>
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        <div aria-hidden="true" style={{ height: altura }} className="w-full">
          {children}
        </div>
        {tabela && (
          <div id={idTabela} className="mt-4 max-h-80 overflow-auto rounded-md border">
            <Table>
              <caption className="sr-only">{preencher(t.grafico.tabelaDe, { titulo })}</caption>
              <TableHeader className="sticky top-0 bg-card">
                <TableRow>
                  {colunas.map((c) => (
                    <TableHead key={c.chave} className={c.numerica ? "text-right" : undefined} scope="col">
                      {c.rotulo}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {linhas.map((l, i) => (
                  <TableRow key={i}>
                    {colunas.map((c) => (
                      <TableCell key={c.chave} className={c.numerica ? "text-right tabular-nums" : undefined}>
                        {c.valor(l)}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
