import type { ResultadoUsina } from "./analise";

export type StatusUsina = "normal" | "atencao" | "critico" | "semDados";

/**
 * Status da usina para a visão da frota: "sem dados" quando o dia atual tem ≥ 60 min de sol sem
 * leituras (comunicação), senão a pior severidade entre os alertas em andamento.
 */
export function statusUsina(r: ResultadoUsina): StatusUsina {
  const ultimo = r.agregados[r.agregados.length - 1];
  if (ultimo && ultimo.minutosAusentes >= 60) return "semDados";
  const ativos = r.alertas.filter((a) => a.fim === null && a.severidade !== "info");
  if (ativos.some((a) => a.severidade === "critico")) return "critico";
  if (ativos.length > 0) return "atencao";
  return "normal";
}

export function alertasAtivos(r: ResultadoUsina) {
  return r.alertas.filter((a) => a.fim === null);
}
