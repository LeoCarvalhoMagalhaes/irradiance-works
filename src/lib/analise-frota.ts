"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";
import type { Comissionamento } from "@/core/integracao/comissionamento";
import type { ResultadoFrota } from "@/core/monitoramento/analise";
import type { UsinaMonitorada } from "@/core/monitoramento/frota";
import type { EventoUsuario } from "@/core/monitoramento/gerador";

export type EstadoAnalise =
  | { situacao: "carregando"; feitas: number; total: number }
  | { situacao: "pronto"; resultado: ResultadoFrota; usinas: UsinaMonitorada[] }
  | { situacao: "erro"; mensagem: string };

type Entrada = { hoje: string; eventos: EventoUsuario[]; comissionamentos: Comissionamento[] };

/** Cache da sessão: a análise só é refeita quando mudam a data, os eventos ou as usinas. */
const cache = new Map<string, EstadoAnalise>();
const ouvintes = new Map<string, Set<() => void>>();
let sequencia = 0;

function chaveDe(e: Entrada) {
  return JSON.stringify([e.hoje, e.eventos.map((x) => [x.id, x.chave, x.tipo]), e.comissionamentos.map((c) => [c.id, c.dataComissionamento, c.falhasDemo, c.entrada])]);
}

function iniciar(chave: string, entrada: Entrada) {
  const avisar = (e: EstadoAnalise) => {
    cache.set(chave, e);
    for (const f of ouvintes.get(chave) ?? []) f();
  };
  avisar({ situacao: "carregando", feitas: 0, total: 1 });
  const id = ++sequencia;
  // Arredonda "agora" para 5 min: leituras de hoje param no instante atual (dados "futuros" não existem).
  const agoraUtcMs = Math.floor(Date.now() / 300_000) * 300_000;
  let trabalhador: Worker;
  try {
    trabalhador = new Worker(new URL("../workers/analise.worker.ts", import.meta.url), { type: "module" });
  } catch (erro) {
    avisar({ situacao: "erro", mensagem: erro instanceof Error ? erro.message : String(erro) });
    return;
  }
  trabalhador.onmessage = (ev: MessageEvent) => {
    const m = ev.data;
    if (m.id !== id) return;
    if (m.tipo === "progresso") avisar({ situacao: "carregando", feitas: m.feitas, total: m.total });
    else if (m.tipo === "resultado") {
      avisar({ situacao: "pronto", resultado: m.resultado, usinas: m.usinas });
      trabalhador.terminate();
    } else {
      avisar({ situacao: "erro", mensagem: m.mensagem });
      trabalhador.terminate();
    }
  };
  trabalhador.onerror = (ev) => {
    avisar({ situacao: "erro", mensagem: ev.message || "worker" });
    trabalhador.terminate();
  };
  trabalhador.postMessage({ id, hoje: entrada.hoje, agoraUtcMs, eventos: entrada.eventos, comissionamentos: entrada.comissionamentos });
}

export function useAnaliseFrota(entrada: Entrada | null): EstadoAnalise | null {
  const chave = entrada ? chaveDe(entrada) : null;
  const assinar = useCallback(
    (ouvinte: () => void) => {
      if (!chave) return () => {};
      const conjunto = ouvintes.get(chave) ?? new Set();
      conjunto.add(ouvinte);
      ouvintes.set(chave, conjunto);
      return () => conjunto.delete(ouvinte);
    },
    [chave],
  );
  const estado = useSyncExternalStore(
    assinar,
    () => (chave ? (cache.get(chave) ?? null) : null),
    () => null,
  );
  useEffect(() => {
    if (!chave || !entrada) return;
    const existente = cache.get(chave);
    if (!existente || existente.situacao === "erro") iniciar(chave, entrada);
    // A chave resume a entrada; incluir o objeto recriaria a análise a cada renderização.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chave]);
  return estado;
}
