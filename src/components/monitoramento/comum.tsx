"use client";

import { AlertTriangle } from "lucide-react";
import type { Alerta } from "@/core/monitoramento/detectores";
import { preencher } from "@/i18n/config";
import { useTextos } from "@/i18n/cliente";
import type { EstadoAnalise } from "@/lib/analise-frota";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";

/** Título do alerta: tipo, ou categoria padronizada quando vem de alarme do inversor. */
export function useTituloAlerta() {
  const t = useTextos("monitoramento");
  return (a: Pick<Alerta, "tipo" | "categoriaAlarme">) => (a.tipo === "alarme" && a.categoriaAlarme ? `${t.tipos.alarme}: ${t.categorias[a.categoriaAlarme]}` : t.tipos[a.tipo]);
}

export function useCausaAcao() {
  const t = useTextos("monitoramento");
  return (a: Pick<Alerta, "tipo" | "categoriaAlarme">) =>
    a.tipo === "alarme" && a.categoriaAlarme
      ? { causa: t.causas.alarme[a.categoriaAlarme], acao: t.acoesRecomendadas.alarme[a.categoriaAlarme] }
      : { causa: t.causas[a.tipo as Exclude<Alerta["tipo"], "alarme">], acao: t.acoesRecomendadas[a.tipo as Exclude<Alerta["tipo"], "alarme">] };
}

/** Estados de carregamento e erro da análise (Web Worker), com dimensões reservadas. */
export function EstadoCarregamento({ analise, altura = 560 }: { analise: EstadoAnalise | null; altura?: number }) {
  const t = useTextos("monitoramento");
  const tc = useTextos("comum");
  if (analise?.situacao === "erro") {
    return (
      <Alert variant="destructive">
        <AlertTriangle aria-hidden="true" />
        <AlertDescription>{preencher(t.erro, { mensagem: analise.mensagem || tc.erro })}</AlertDescription>
      </Alert>
    );
  }
  const feitas = analise?.situacao === "carregando" ? analise.feitas : 0;
  const total = analise?.situacao === "carregando" ? analise.total : 1;
  return (
    <div className="grid gap-4" aria-busy="true">
      <div role="status" className="space-y-2">
        <p className="text-sm text-muted-foreground">{preencher(t.carregando, { feitas, total: Math.max(total, feitas) })}</p>
        <Progress value={(feitas / Math.max(1, total)) * 100} aria-label={tc.carregando} />
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {Array.from({ length: 5 }, (_, i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
      <Skeleton className="w-full" style={{ height: altura }} />
    </div>
  );
}
