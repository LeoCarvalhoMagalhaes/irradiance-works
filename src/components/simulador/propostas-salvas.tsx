"use client";

import { FolderOpen, Trash2 } from "lucide-react";
import { preencher } from "@/i18n/config";
import { useFormato, useTextos } from "@/i18n/cliente";
import { removerProposta } from "@/lib/estado";
import type { PropostaSalva } from "@/lib/persistencia";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function PropostasSalvas({ propostas, abrir }: { propostas: PropostaSalva[]; abrir: (p: PropostaSalva) => void }) {
  const t = useTextos("simulador").salvas;
  const f = useFormato();
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t.titulo}</CardTitle>
      </CardHeader>
      <CardContent>
        {propostas.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t.vazio}</p>
        ) : (
          <ul className="divide-y">
            {propostas.map((p) => (
              <li key={p.id} className="flex items-center gap-2 py-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    <span className="font-mono text-xs text-muted-foreground">{p.id}</span> {p.nome || `${p.resumo.cidade}/${p.resumo.uf}`}
                  </p>
                  <p className="truncate text-xs text-muted-foreground tabular-nums">
                    {preencher(t.resumo, { kwp: f.potenciaKWp(p.resumo.potenciaCcKWp), energia: f.energia(p.resumo.energiaAnualKWh), vpl: f.moedaInteira(p.resumo.vplR) })}
                  </p>
                </div>
                <Button size="icon-sm" variant="ghost" aria-label={`${t.abrir} ${p.id}`} onClick={() => abrir(p)}>
                  <FolderOpen />
                </Button>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  aria-label={`${t.excluir} ${p.id}`}
                  onClick={() => {
                    if (window.confirm(preencher(t.excluirConfirma, { id: p.id }))) removerProposta(p.id);
                  }}
                >
                  <Trash2 />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
