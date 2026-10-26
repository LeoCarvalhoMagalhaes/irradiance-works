"use client";

import { createContext, useContext, useMemo } from "react";
import { criarFormatadores, type Formatadores } from "@/lib/formatacao";
import type { Idioma } from "./config";
import type { Dicionario } from "./tipos";

type Valor = { idioma: Idioma; textos: Partial<Dicionario> };
const Contexto = createContext<Valor | null>(null);

/**
 * Fornece o idioma e as seções do dicionário usadas pela árvore. Provedores aninhados somam
 * seções: o layout fornece "comum" e cada página acrescenta apenas as suas (menos JavaScript).
 */
export function ProvedorIdioma({ idioma, textos, children }: { idioma: Idioma; textos: Partial<Dicionario>; children: React.ReactNode }) {
  const pai = useContext(Contexto);
  const valor = useMemo(() => ({ idioma, textos: { ...pai?.textos, ...textos } }), [idioma, pai, textos]);
  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

function useContexto(): Valor {
  const v = useContext(Contexto);
  if (!v) throw new Error("ProvedorIdioma ausente");
  return v;
}

export const useIdioma = () => useContexto().idioma;

export function useTextos<K extends keyof Dicionario>(secao: K): Dicionario[K] {
  const textos = useContexto().textos[secao];
  if (!textos) throw new Error(`Seção de textos não fornecida: ${String(secao)}`);
  return textos as Dicionario[K];
}

export function useFormato(): Formatadores {
  const idioma = useIdioma();
  return useMemo(() => criarFormatadores(idioma), [idioma]);
}
