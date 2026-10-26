/**
 * Perfis de carga horários. Os perfis por segmento são ILUSTRATIVOS (premissa editável):
 * distribuem o consumo mensal informado ao longo das horas do mês. Quando houver medição,
 * o usuário importa um CSV horário ou de 15 minutos, que substitui o perfil.
 */
import { z } from "zod";
import { ANO_REFERENCIA_TIPICO } from "../solar/clima";
import { diasNoMes } from "../util/tempo";

export type Segmento = "residencial" | "comercial" | "industrial1t" | "industrial2t" | "industrial3t" | "agro";

export const SEGMENTOS: Segmento[] = ["residencial", "comercial", "industrial1t", "industrial2t", "industrial3t", "agro"];

/** Pesos horários relativos (hora local 0–23) para dias úteis e fins de semana. */
export const PERFIS_CARGA: Record<Segmento, { util: number[]; fimDeSemana: number[] }> = {
  residencial: {
    util: [0.55, 0.5, 0.45, 0.45, 0.45, 0.55, 0.8, 0.9, 0.7, 0.65, 0.65, 0.7, 0.8, 0.75, 0.7, 0.7, 0.8, 1.0, 1.4, 1.65, 1.55, 1.35, 1.05, 0.75],
    fimDeSemana: [0.6, 0.5, 0.45, 0.45, 0.45, 0.5, 0.6, 0.8, 0.95, 1.0, 1.05, 1.1, 1.15, 1.05, 0.95, 0.9, 0.95, 1.1, 1.4, 1.6, 1.5, 1.3, 1.05, 0.8],
  },
  comercial: {
    util: [0.25, 0.25, 0.25, 0.25, 0.25, 0.3, 0.5, 0.9, 1.4, 1.6, 1.7, 1.7, 1.6, 1.7, 1.75, 1.7, 1.6, 1.4, 1.0, 0.7, 0.5, 0.4, 0.3, 0.25],
    fimDeSemana: [0.25, 0.25, 0.25, 0.25, 0.25, 0.25, 0.3, 0.4, 0.6, 0.7, 0.7, 0.7, 0.6, 0.5, 0.45, 0.4, 0.4, 0.35, 0.3, 0.3, 0.3, 0.25, 0.25, 0.25],
  },
  industrial1t: {
    util: [0.3, 0.3, 0.3, 0.3, 0.3, 0.4, 0.9, 1.8, 1.9, 1.9, 1.9, 1.6, 1.3, 1.8, 1.9, 1.9, 1.7, 1.0, 0.5, 0.4, 0.35, 0.3, 0.3, 0.3],
    fimDeSemana: [0.3, 0.3, 0.3, 0.3, 0.3, 0.3, 0.35, 0.4, 0.4, 0.4, 0.4, 0.4, 0.35, 0.3, 0.3, 0.3, 0.3, 0.3, 0.3, 0.3, 0.3, 0.3, 0.3, 0.3],
  },
  industrial2t: {
    util: [0.35, 0.35, 0.35, 0.35, 0.35, 0.6, 1.4, 1.6, 1.6, 1.6, 1.6, 1.4, 1.3, 1.6, 1.6, 1.6, 1.6, 1.5, 1.4, 1.4, 1.4, 1.3, 0.9, 0.5],
    fimDeSemana: [0.35, 0.35, 0.35, 0.35, 0.35, 0.4, 0.5, 0.6, 0.6, 0.6, 0.6, 0.55, 0.5, 0.45, 0.45, 0.4, 0.4, 0.4, 0.4, 0.4, 0.4, 0.4, 0.35, 0.35],
  },
  industrial3t: {
    util: [1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.05, 1.05, 1.05, 1.05, 1.05, 1.0, 0.95, 1.05, 1.05, 1.05, 1.0, 1.0, 0.95, 0.95, 0.95, 1.0, 1.0, 1.0],
    fimDeSemana: [0.9, 0.9, 0.9, 0.9, 0.9, 0.9, 0.9, 0.9, 0.9, 0.9, 0.9, 0.9, 0.9, 0.9, 0.9, 0.9, 0.9, 0.9, 0.9, 0.9, 0.9, 0.9, 0.9, 0.9],
  },
  agro: {
    util: [0.6, 0.6, 0.6, 0.6, 0.7, 0.9, 1.2, 1.4, 1.5, 1.5, 1.4, 1.3, 1.2, 1.3, 1.4, 1.4, 1.3, 1.1, 0.9, 0.8, 0.7, 0.7, 0.6, 0.6],
    fimDeSemana: [0.6, 0.6, 0.6, 0.6, 0.7, 0.85, 1.1, 1.3, 1.4, 1.4, 1.3, 1.2, 1.1, 1.2, 1.3, 1.3, 1.2, 1.0, 0.85, 0.75, 0.7, 0.65, 0.6, 0.6],
  },
};

/** Ano de referência das séries horárias: 8.760 h em hora local, de 1º de janeiro a 31 de dezembro. */
export const HORAS_ANO = 8760;

/** Índices [início, fim) de cada mês na série horária do ano de referência. */
export function limitesMensaisHorarios(): Array<[number, number]> {
  const limites: Array<[number, number]> = [];
  let inicio = 0;
  for (let m = 1; m <= 12; m++) {
    const fim = inicio + diasNoMes(ANO_REFERENCIA_TIPICO, m) * 24;
    limites.push([inicio, fim]);
    inicio = fim;
  }
  return limites;
}

/** Distribui o consumo mensal (kWh) em 8.760 horas segundo o perfil do segmento. */
export function cargaHorariaPorPerfil(consumoMensalKWh: number[], perfil: { util: number[]; fimDeSemana: number[] }): Float64Array {
  const carga = new Float64Array(HORAS_ANO);
  const limites = limitesMensaisHorarios();
  for (let m = 0; m < 12; m++) {
    const [inicio, fim] = limites[m];
    let soma = 0;
    for (let h = inicio; h < fim; h++) {
      const dia = Math.floor(h / 24);
      const diaSemana = new Date(Date.UTC(ANO_REFERENCIA_TIPICO, 0, 1 + dia)).getUTCDay();
      const pesos = diaSemana === 0 || diaSemana === 6 ? perfil.fimDeSemana : perfil.util;
      carga[h] = pesos[h % 24];
      soma += carga[h];
    }
    for (let h = inicio; h < fim; h++) carga[h] = soma > 0 ? (carga[h] / soma) * consumoMensalKWh[m] : 0;
  }
  return carga;
}

export const esquemaLinhaMedicao = z.object({ instante: z.date(), energiaKWh: z.number().min(0).max(1e7) });

export type ResultadoImportacaoCarga =
  | { ok: true; cargaHorariaKWh: Float64Array; consumoMensalKWh: number[]; intervaloMin: number; mesesCobertos: number[]; linhas: number }
  | { ok: false; erro: "vazio" | "formato" | "intervalo" | "linha"; linha?: number };

/**
 * Importa medição horária ou de 15 min. Formato: duas colunas (data-hora local ISO "AAAA-MM-DDTHH:mm"
 * ou "AAAA-MM-DD HH:mm", e energia do intervalo em kWh), separadas por vírgula ou ponto e vírgula;
 * decimal com ponto ou vírgula. Meses sem medição são preenchidos pelo perfil escalado ao consumo
 * mensal informado. O ano da medição é ignorado (a série é rebatida no ano de referência).
 */
export function importarCargaCsv(texto: string, consumoMensalKWh: number[], perfil: { util: number[]; fimDeSemana: number[] }): ResultadoImportacaoCarga {
  const linhas = texto.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);
  if (linhas.length < 2) return { ok: false, erro: "vazio" };
  const registros: Array<{ mes: number; dia: number; hora: number; minuto: number; kWh: number }> = [];
  for (let i = 0; i < linhas.length; i++) {
    const partes = linhas[i].split(/[;,\t](?=[^;,\t]*$)/);
    if (partes.length !== 2) {
      if (i === 0) continue; // cabeçalho
      return { ok: false, erro: "formato", linha: i + 1 };
    }
    const m = partes[0].trim().match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/);
    const valor = Number(partes[1].trim().replace(",", "."));
    if (!m || !Number.isFinite(valor)) {
      if (i === 0) continue;
      return { ok: false, erro: "linha", linha: i + 1 };
    }
    const instante = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5])));
    const valido = esquemaLinhaMedicao.safeParse({ instante, energiaKWh: valor });
    if (!valido.success) return { ok: false, erro: "linha", linha: i + 1 };
    registros.push({ mes: Number(m[2]), dia: Number(m[3]), hora: Number(m[4]), minuto: Number(m[5]), kWh: valor });
  }
  if (registros.length < 24) return { ok: false, erro: "vazio" };
  const minutos = new Set(registros.map((r) => r.minuto));
  const intervaloMin = minutos.size >= 4 ? 15 : 60;
  if (intervaloMin === 60 && minutos.size > 1) return { ok: false, erro: "intervalo" };

  const base = cargaHorariaPorPerfil(consumoMensalKWh, perfil);
  const medida = new Float64Array(HORAS_ANO);
  const cobertas = new Uint8Array(HORAS_ANO);
  for (const r of registros) {
    if (r.mes === 2 && r.dia === 29) continue;
    const diaDoAno = Math.floor((Date.UTC(ANO_REFERENCIA_TIPICO, r.mes - 1, r.dia) - Date.UTC(ANO_REFERENCIA_TIPICO, 0, 1)) / 86_400_000);
    const h = diaDoAno * 24 + r.hora;
    medida[h] += r.kWh;
    cobertas[h] = 1;
  }
  const limites = limitesMensaisHorarios();
  const carga = new Float64Array(HORAS_ANO);
  const mesesCobertos: number[] = [];
  const consumoFinal: number[] = [];
  for (let m = 0; m < 12; m++) {
    const [ini, fim] = limites[m];
    let horasCobertas = 0;
    for (let h = ini; h < fim; h++) horasCobertas += cobertas[h];
    const usarMedicao = horasCobertas >= (fim - ini) * 0.9;
    if (usarMedicao) mesesCobertos.push(m + 1);
    let soma = 0;
    for (let h = ini; h < fim; h++) {
      carga[h] = usarMedicao ? (cobertas[h] ? medida[h] : base[h]) : base[h];
      soma += carga[h];
    }
    consumoFinal.push(soma);
  }
  return { ok: true, cargaHorariaKWh: carga, consumoMensalKWh: consumoFinal, intervaloMin, mesesCobertos, linhas: registros.length };
}
