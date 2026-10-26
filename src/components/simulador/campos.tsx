"use client";

import { useId, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MarcaPremissa } from "@/components/shared/indicadores";
import { cn } from "@/lib/utils";

type Base = { rotulo: string; dica?: string; erro?: string; premissa?: boolean; className?: string };

function Moldura({ id, rotulo, dica, erro, premissa, className, children }: Base & { id: string; children: React.ReactNode }) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label htmlFor={id} className="flex flex-wrap items-center">
        {rotulo}
        {premissa && <MarcaPremissa />}
      </Label>
      {children}
      {dica && !erro && (
        <p id={`${id}-dica`} className="text-xs text-muted-foreground">
          {dica}
        </p>
      )}
      {erro && (
        <p id={`${id}-erro`} role="alert" className="text-xs font-medium text-destructive">
          {erro}
        </p>
      )}
    </div>
  );
}

const descricao = (id: string, dica?: string, erro?: string) => [erro ? `${id}-erro` : null, dica && !erro ? `${id}-dica` : null].filter(Boolean).join(" ") || undefined;

/**
 * Campo numérico: mantém o texto digitado enquanto o usuário edita e só publica valores válidos.
 * Valor null representa "em branco" quando `opcional`.
 */
export function CampoNumero({
  valor,
  aoMudar,
  min,
  max,
  passo = "any",
  sufixo,
  opcional,
  ...base
}: Base & { valor: number | null; aoMudar: (v: number | null) => void; min?: number; max?: number; passo?: number | "any"; sufixo?: string; opcional?: boolean }) {
  const id = useId();
  const [texto, setTexto] = useState(valor === null ? "" : String(valor));
  const [valorAnterior, setValorAnterior] = useState(valor);
  // Valor alterado de fora (por exemplo, "restaurar padrão"): ressincroniza o texto sem efeito.
  if (valor !== valorAnterior) {
    setValorAnterior(valor);
    if (!(Number(texto.replace(",", ".")) === valor || (valor === null && texto === ""))) setTexto(valor === null ? "" : String(valor));
  }
  return (
    <Moldura id={id} {...base}>
      <div className="relative">
        <Input
          id={id}
          type="number"
          inputMode="decimal"
          step={passo}
          min={min}
          max={max}
          value={texto}
          aria-invalid={base.erro ? true : undefined}
          aria-describedby={descricao(id, base.dica, base.erro)}
          className={cn("tabular-nums", sufixo && "pr-12")}
          onChange={(e) => {
            const v = e.target.value;
            setTexto(v);
            if (v.trim() === "") {
              if (opcional) aoMudar(null);
              return;
            }
            const n = Number(v.replace(",", "."));
            if (Number.isFinite(n)) aoMudar(n);
          }}
        />
        {sufixo && <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-muted-foreground">{sufixo}</span>}
      </div>
    </Moldura>
  );
}

export function CampoTexto({ valor, aoMudar, ...base }: Base & { valor: string; aoMudar: (v: string) => void }) {
  const id = useId();
  return (
    <Moldura id={id} {...base}>
      <Input id={id} value={valor} onChange={(e) => aoMudar(e.target.value)} aria-invalid={base.erro ? true : undefined} aria-describedby={descricao(id, base.dica, base.erro)} />
    </Moldura>
  );
}

export function CampoData({ valor, aoMudar, ...base }: Base & { valor: string; aoMudar: (v: string) => void }) {
  const id = useId();
  return (
    <Moldura id={id} {...base}>
      <Input id={id} type="date" value={valor} onChange={(e) => e.target.value && aoMudar(e.target.value)} aria-invalid={base.erro ? true : undefined} aria-describedby={descricao(id, base.dica, base.erro)} />
    </Moldura>
  );
}

export type Opcao = { valor: string; rotulo: string; grupo?: string };

/** Seleção nativa (acessível, com busca por digitação e grupos). */
export function CampoSelecao({ valor, aoMudar, opcoes, ...base }: Base & { valor: string; aoMudar: (v: string) => void; opcoes: Opcao[] }) {
  const id = useId();
  const grupos = [...new Set(opcoes.map((o) => o.grupo ?? ""))];
  return (
    <Moldura id={id} {...base}>
      <select
        id={id}
        value={valor}
        onChange={(e) => aoMudar(e.target.value)}
        aria-invalid={base.erro ? true : undefined}
        aria-describedby={descricao(id, base.dica, base.erro)}
        className="h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30 [&_option]:bg-popover [&_option]:text-popover-foreground"
      >
        {grupos.map((g) =>
          g ? (
            <optgroup key={g} label={g}>
              {opcoes
                .filter((o) => o.grupo === g)
                .map((o) => (
                  <option key={o.valor} value={o.valor}>
                    {o.rotulo}
                  </option>
                ))}
            </optgroup>
          ) : (
            opcoes
              .filter((o) => !o.grupo)
              .map((o) => (
                <option key={o.valor} value={o.valor}>
                  {o.rotulo}
                </option>
              ))
          ),
        )}
      </select>
    </Moldura>
  );
}

/** Grupo de opções exclusivas como botões de rádio nativos estilizados. */
export function GrupoOpcoes({ rotulo, valor, aoMudar, opcoes, dica, colunas = 2 }: { rotulo: string; valor: string; aoMudar: (v: string) => void; opcoes: Opcao[]; dica?: string; colunas?: 2 | 3 | 4 }) {
  const nome = useId();
  return (
    <fieldset className="space-y-1.5">
      <legend className="mb-1.5 text-sm font-medium">{rotulo}</legend>
      <div className={cn("grid gap-2", colunas === 2 && "sm:grid-cols-2", colunas === 3 && "sm:grid-cols-3", colunas === 4 && "grid-cols-2 sm:grid-cols-4")}>
        {opcoes.map((o) => (
          <label
            key={o.valor}
            className={cn(
              "flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50",
              valor === o.valor ? "border-solar bg-solar-suave/60 font-medium" : "hover:bg-muted",
            )}
          >
            <input type="radio" name={nome} value={o.valor} checked={valor === o.valor} onChange={() => aoMudar(o.valor)} className="accent-[var(--solar)]" />
            {o.rotulo}
          </label>
        ))}
      </div>
      {dica && <p className="text-xs text-muted-foreground">{dica}</p>}
    </fieldset>
  );
}
