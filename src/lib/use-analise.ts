"use client";

import { useMemo } from "react";
import { useAnaliseFrota } from "./analise-frota";
import { eventosDoEstado, useEstado } from "./estado";
import { hojeLocal } from "./hoje";

/** Análise da frota para o estado atual (eventos das OS concluídas e usinas comissionadas). */
export function useAnaliseAtual() {
  const estado = useEstado();
  const entrada = useMemo(
    () => (estado ? { hoje: hojeLocal(), eventos: eventosDoEstado(estado.estado), comissionamentos: estado.estado.comissionamentos } : null),
    [estado],
  );
  return { estado, analise: useAnaliseFrota(entrada) };
}
