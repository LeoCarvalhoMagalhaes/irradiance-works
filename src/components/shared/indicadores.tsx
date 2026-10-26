"use client";

import { AlertOctagon, AlertTriangle, CheckCircle2, CircleSlash, Info } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useTextos } from "@/i18n/cliente";
import { cn } from "@/lib/utils";

export function Kpi({ rotulo, valor, detalhe, icone, destaque }: { rotulo: string; valor: string; detalhe?: React.ReactNode; icone?: React.ReactNode; destaque?: boolean }) {
  return (
    <Card className={cn("gap-1 py-4", destaque && "border-solar/50 bg-solar-suave/40")}>
      <CardContent className="space-y-1 px-4">
        <p className="flex items-center gap-1.5 text-xs font-medium tracking-wide text-muted-foreground uppercase">
          {icone}
          {rotulo}
        </p>
        <p className="text-xl font-semibold tabular-nums sm:text-2xl" data-valor>
          {valor}
        </p>
        {detalhe && <div className="text-xs text-muted-foreground">{detalhe}</div>}
      </CardContent>
    </Card>
  );
}

export type Status = "normal" | "atencao" | "critico" | "semDados";

const ESTILO_STATUS: Record<Status, { classe: string; Icone: typeof CheckCircle2 }> = {
  normal: { classe: "bg-ok-suave text-ok", Icone: CheckCircle2 },
  atencao: { classe: "bg-atencao-suave text-atencao", Icone: AlertTriangle },
  critico: { classe: "bg-critico-suave text-critico", Icone: AlertOctagon },
  semDados: { classe: "bg-sem-dados-suave text-sem-dados", Icone: CircleSlash },
};

/** Status sempre com ícone e texto, nunca só cor. */
export function SeloStatus({ status, className }: { status: Status; className?: string }) {
  const t = useTextos("comum");
  const { classe, Icone } = ESTILO_STATUS[status];
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap", classe, className)}>
      <Icone className="size-3.5" aria-hidden="true" />
      {t.status[status]}
    </span>
  );
}

const SEVERIDADE_STATUS = { info: "semDados", atencao: "atencao", critico: "critico" } as const;

export function SeloSeveridade({ severidade }: { severidade: "info" | "atencao" | "critico" }) {
  const t = useTextos("comum");
  const { classe, Icone } = severidade === "info" ? { classe: "bg-secondary text-secondary-foreground", Icone: Info } : ESTILO_STATUS[SEVERIDADE_STATUS[severidade]];
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap", classe)}>
      <Icone className="size-3.5" aria-hidden="true" />
      {t.severidade[severidade]}
    </span>
  );
}

/** Marca uma premissa (valor sem fonte oficial). */
export function MarcaPremissa() {
  const t = useTextos("comum");
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span tabIndex={0} className="ml-1 inline-flex cursor-help items-center rounded border border-dashed border-atencao/60 px-1 text-[0.65rem] font-medium tracking-wide text-atencao uppercase">
          {t.premissa}
        </span>
      </TooltipTrigger>
      <TooltipContent>{t.premissaDica}</TooltipContent>
    </Tooltip>
  );
}

export function CabecalhoPagina({ titulo, descricao, children }: { titulo: string; descricao: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3 pb-6 sm:flex-row sm:items-end sm:justify-between">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{titulo}</h1>
        <p className="max-w-3xl text-muted-foreground">{descricao}</p>
      </div>
      {children && <div className="flex flex-wrap gap-2">{children}</div>}
    </div>
  );
}
