/// <reference lib="webworker" />
/**
 * Web Worker da análise da frota: gera 365 dias de telemetria (5 min) por usina, roda os
 * detectores e a validação fora da thread da interface e devolve o resultado.
 */
import { type Comissionamento, usinaDeProposta } from "@/core/integracao/comissionamento";
import { analisarUsinas } from "@/core/monitoramento/analise";
import { frotaDemonstracao, type UsinaMonitorada } from "@/core/monitoramento/frota";
import type { EventoUsuario } from "@/core/monitoramento/gerador";
import { calcularProposta } from "@/core/simulador/proposta";

export type PedidoAnalise = { id: number; hoje: string; agoraUtcMs: number; eventos: EventoUsuario[]; comissionamentos: Comissionamento[] };

export function montarUsinas(comissionamentos: Comissionamento[], hoje: string): UsinaMonitorada[] {
  const extras: UsinaMonitorada[] = [];
  for (const c of comissionamentos) {
    try {
      extras.push(usinaDeProposta(calcularProposta(c.entrada), c, hoje));
    } catch {
      // Comissionamento inválido (por exemplo, dados antigos): ignorado sem derrubar a análise.
    }
  }
  return [...frotaDemonstracao(), ...extras];
}

const escopo = self as unknown as DedicatedWorkerGlobalScope;
escopo.onmessage = (evento: MessageEvent<PedidoAnalise>) => {
  const p = evento.data;
  try {
    const usinas = montarUsinas(p.comissionamentos, p.hoje);
    const resultado = analisarUsinas(usinas, { hoje: p.hoje, agoraUtcMs: p.agoraUtcMs, eventos: p.eventos }, {
      aoProgredir: (feitas, total) => escopo.postMessage({ tipo: "progresso", id: p.id, feitas, total }),
    });
    escopo.postMessage({ tipo: "resultado", id: p.id, resultado, usinas });
  } catch (erro) {
    escopo.postMessage({ tipo: "erro", id: p.id, mensagem: erro instanceof Error ? erro.message : String(erro) });
  }
};
