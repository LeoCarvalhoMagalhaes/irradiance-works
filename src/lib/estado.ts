"use client";

import { useSyncExternalStore } from "react";
import type { Comissionamento } from "@/core/integracao/comissionamento";
import { aplicarConclusoes, type Conclusao, eventoDaOs, type OrdemServico } from "@/core/manutencao/ordens";
import type { EventoUsuario } from "@/core/monitoramento/gerador";
import type { Premissas } from "@/core/simulador/premissas";
import type { EntradaProposta, Proposta } from "@/core/simulador/proposta";
import { hojeLocal } from "./hoje";
import { CHAVE_ARMAZENAMENTO, type Estado, estadoDemonstracao, gravarEstado, lerEstado, type PropostaSalva, type ResultadoLeitura } from "./persistencia";

let atual: ResultadoLeitura | null = null;
let ultimaGravacaoOk = true;
const ouvintes = new Set<() => void>();

function carregar(): ResultadoLeitura {
  if (!atual) atual = lerEstado(hojeLocal());
  return atual;
}

function notificar() {
  for (const o of ouvintes) o();
}

function assinar(ouvinte: () => void) {
  ouvintes.add(ouvinte);
  const aoMudarOutraAba = (e: StorageEvent) => {
    if (e.key !== CHAVE_ARMAZENAMENTO) return;
    atual = lerEstado(hojeLocal());
    notificar();
  };
  window.addEventListener("storage", aoMudarOutraAba);
  return () => {
    ouvintes.delete(ouvinte);
    window.removeEventListener("storage", aoMudarOutraAba);
  };
}

/** Estado persistido; null durante a pré-renderização estática (antes da hidratação). */
export function useEstado(): ResultadoLeitura | null {
  return useSyncExternalStore(assinar, carregar, () => null);
}

export function gravacaoFalhou(): boolean {
  return !ultimaGravacaoOk;
}

function atualizar(fn: (e: Estado) => Estado) {
  const novo = fn(carregar().estado);
  ultimaGravacaoOk = gravarEstado(novo);
  atual = { estado: novo, situacao: "ok" };
  notificar();
}

export function salvarProposta(entrada: EntradaProposta, proposta: Proposta, nome: string, idExistente?: string): string {
  let id = idExistente ?? "";
  atualizar((e) => {
    const resumo = {
      cidade: proposta.cidade.nome,
      uf: proposta.cidade.uf,
      potenciaCcKWp: proposta.arranjo.potenciaCcKWp,
      energiaAnualKWh: proposta.simulacao.energiaAnualKWh,
      vplR: proposta.financeiro.cenarios[0].vplR,
      paybackAnos: proposta.financeiro.cenarios[0].paybackAnos,
    };
    if (idExistente && e.propostas.some((p) => p.id === idExistente)) {
      return { ...e, propostas: e.propostas.map((p) => (p.id === idExistente ? { ...p, nome, entrada, resumo } : p)) };
    }
    const seq = e.sequenciaProposta + 1;
    id = `P-${String(seq).padStart(4, "0")}`;
    const nova: PropostaSalva = { id, nome, criadaEm: new Date().toISOString(), entrada, resumo };
    return { ...e, sequenciaProposta: seq, propostas: [nova, ...e.propostas] };
  });
  return id;
}

export function removerProposta(id: string) {
  atualizar((e) => ({ ...e, propostas: e.propostas.filter((p) => p.id !== id) }));
}

export function comissionar(dados: Omit<Comissionamento, "id" | "criadoEm">): string {
  let id = "";
  atualizar((e) => {
    const seq = e.sequenciaUsina + 1;
    id = `UFV-C${String(seq).padStart(2, "0")}`;
    return { ...e, sequenciaUsina: seq, comissionamentos: [...e.comissionamentos, { ...dados, id, criadoEm: new Date().toISOString() }] };
  });
  return id;
}

export function removerComissionamento(id: string) {
  atualizar((e) => ({ ...e, comissionamentos: e.comissionamentos.filter((c) => c.id !== id), ordens: e.ordens.filter((o) => o.ativo.usinaId !== id) }));
}

/** Cria OS a partir de uma função que recebe o próximo número de sequência. */
export function adicionarOrdens(criar: (proximaSequencia: () => number) => OrdemServico[]): OrdemServico[] {
  let criadas: OrdemServico[] = [];
  atualizar((e) => {
    let seq = e.sequenciaOs;
    criadas = criar(() => ++seq);
    return { ...e, sequenciaOs: seq, ordens: [...criadas, ...e.ordens] };
  });
  return criadas;
}

export function atualizarOrdem(id: string, mudanca: Partial<OrdemServico>) {
  atualizar((e) => ({ ...e, ordens: e.ordens.map((o) => (o.id === id ? { ...o, ...mudanca } : o)) }));
}

export function importarConclusoesNoEstado(conclusoes: Conclusao[]): { atualizadas: number; desconhecidas: string[] } {
  let resultado = { atualizadas: 0, desconhecidas: [] as string[] };
  atualizar((e) => {
    const r = aplicarConclusoes(e.ordens, conclusoes);
    resultado = { atualizadas: r.atualizadas, desconhecidas: r.desconhecidas };
    return { ...e, ordens: r.ordens };
  });
  return resultado;
}

export function definirPremissasPersonalizadas(p: Premissas | null) {
  atualizar((e) => ({ ...e, premissasPersonalizadas: p }));
}

export function definirCustoLimpeza(usinaId: string, valor: number) {
  atualizar((e) => ({ ...e, custosLimpeza: { ...e.custosLimpeza, [usinaId]: valor } }));
}

export function restaurarDemonstracao() {
  atualizar(() => estadoDemonstracao(hojeLocal()));
}

/** Eventos do usuário (OS concluídas) que entram no gerador sintético. */
export function eventosDoEstado(e: Estado): EventoUsuario[] {
  return e.ordens.map(eventoDaOs).filter((x): x is EventoUsuario => x !== null);
}
