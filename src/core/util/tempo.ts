/**
 * Convenções de tempo do núcleo:
 * - Todos os instantes são armazenados em UTC (milissegundos desde a época Unix).
 * - A exibição usa America/Sao_Paulo. Desde o Decreto nº 9.772/2019 não há horário de verão,
 *   então o deslocamento é fixo em UTC−3; o núcleo usa esse deslocamento para delimitar dias locais.
 */

export const DESLOCAMENTO_SAO_PAULO_H = -3;
export const MS_POR_MINUTO = 60_000;
export const MS_POR_HORA = 3_600_000;
export const MS_POR_DIA = 86_400_000;

/** Instante UTC (ms) do início do dia local (00:00 em America/Sao_Paulo). */
export function inicioDiaLocalUtcMs(ano: number, mes: number, dia: number): number {
  return Date.UTC(ano, mes - 1, dia) - DESLOCAMENTO_SAO_PAULO_H * MS_POR_HORA;
}

/** Data local (America/Sao_Paulo) de um instante UTC. */
export function dataLocal(instanteUtcMs: number): { ano: number; mes: number; dia: number; hora: number; minuto: number } {
  const d = new Date(instanteUtcMs + DESLOCAMENTO_SAO_PAULO_H * MS_POR_HORA);
  return {
    ano: d.getUTCFullYear(),
    mes: d.getUTCMonth() + 1,
    dia: d.getUTCDate(),
    hora: d.getUTCHours(),
    minuto: d.getUTCMinutes(),
  };
}

/** Chave "AAAA-MM-DD" do dia local de um instante UTC. */
export function chaveDiaLocal(instanteUtcMs: number): string {
  const { ano, mes, dia } = dataLocal(instanteUtcMs);
  return `${ano}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
}

/** Converte "AAAA-MM-DD" (dia local) no instante UTC de 00:00 local. */
export function chaveParaUtcMs(chave: string): number {
  const [ano, mes, dia] = chave.split("-").map(Number);
  return inicioDiaLocalUtcMs(ano, mes, dia);
}

export function diasNoMes(ano: number, mes: number): number {
  return new Date(Date.UTC(ano, mes, 0)).getUTCDate();
}

/** Dia do ano (1–366) de um instante UTC, no calendário UTC (usado pelos modelos solares). */
export function diaDoAnoUtc(instanteUtcMs: number): number {
  const d = new Date(instanteUtcMs);
  return Math.floor((instanteUtcMs - Date.UTC(d.getUTCFullYear(), 0, 1)) / MS_POR_DIA) + 1;
}

export function somarDias(chave: string, dias: number): string {
  return chaveDiaLocal(chaveParaUtcMs(chave) + dias * MS_POR_DIA + MS_POR_HORA);
}

export function diferencaDias(deChave: string, ateChave: string): number {
  return Math.round((chaveParaUtcMs(ateChave) - chaveParaUtcMs(deChave)) / MS_POR_DIA);
}
