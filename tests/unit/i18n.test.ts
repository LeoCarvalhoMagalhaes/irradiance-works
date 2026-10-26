import { describe, expect, it } from "vitest";
import { IDIOMAS } from "@/i18n/config";
import { obterDicionario } from "@/i18n/servidor";
import { pt } from "@/i18n/dicionarios/pt";

type Folha = { caminho: string; valor: string };

/** Achata o dicionário em folhas "a.b.0.c" → texto. */
function folhas(no: unknown, caminho = ""): Folha[] {
  if (typeof no === "string") return [{ caminho, valor: no }];
  if (Array.isArray(no)) return no.flatMap((x, i) => folhas(x, `${caminho}.${i}`));
  if (no && typeof no === "object") return Object.entries(no).flatMap(([k, v]) => folhas(v, caminho ? `${caminho}.${k}` : k));
  throw new Error(`Valor inesperado em ${caminho}: ${String(no)}`);
}

const marcadores = (texto: string) => [...texto.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

/** Textos idênticos por natureza (fórmulas com a mesma notação decimal e trigonométrica). */
const IGUAIS_LEGITIMOS = new Set(["es:metodologia.solar.itens.1.texto", "es:comum.equipamentos.inversor"]);

const referencia = new Map(folhas(pt).map((f) => [f.caminho, f.valor]));

describe("dicionários", () => {
  for (const idioma of IDIOMAS.filter((i) => i !== "pt")) {
    describe(idioma, async () => {
      const d = await obterDicionario(idioma);
      const lista = folhas(d);
      const mapa = new Map(lista.map((f) => [f.caminho, f.valor]));

      it("tem exatamente as mesmas chaves (inclusive itens de listas) que o português", () => {
        expect([...mapa.keys()].sort()).toEqual([...referencia.keys()].sort());
      });

      it("mantém os mesmos marcadores {…} em cada texto", () => {
        const divergentes = lista.filter((f) => marcadores(f.valor).join() !== marcadores(referencia.get(f.caminho) ?? "").join());
        expect(divergentes.map((f) => f.caminho)).toEqual([]);
      });

      it("não tem textos vazios", () => {
        expect(lista.filter((f) => f.valor.trim() === "").map((f) => f.caminho)).toEqual([]);
      });

      it("não é uma cópia do português (tradução efetiva)", () => {
        const iguais = lista.filter((f) => f.valor.length > 25 && f.valor === referencia.get(f.caminho) && !IGUAIS_LEGITIMOS.has(`${idioma}:${f.caminho}`));
        // Textos longos idênticos indicam trechos esquecidos sem tradução.
        expect(iguais.map((f) => f.caminho)).toEqual([]);
      });
    });
  }
});
