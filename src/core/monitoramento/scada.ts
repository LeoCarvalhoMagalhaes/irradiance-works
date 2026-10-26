/**
 * Análises para usinas acima de 5 MW monitoradas por SCADA. O aplicativo é SOMENTE LEITURA:
 * importa exportações do histórico e nunca envia comandos (requisito de segurança de redes
 * industriais; ver metodologia).
 */
import { z } from "zod";
import config from "@/data/config-regulatoria.json";
import { criarAleatorio, normalRapida } from "../util/aleatorio";
import { MS_POR_MINUTO } from "../util/tempo";
import type { AgregadoDia } from "./agregados";
import type { UsinaMonitorada } from "./frota";
import { type DiaGerado, PASSO_MIN, STATUS } from "./gerador";

export type MotivoRestricao = keyof typeof config.restricaoGeracao.motivos;
export const MOTIVOS_RESTRICAO = Object.keys(config.restricaoGeracao.motivos) as MotivoRestricao[];

export type EventoRestricao = {
  id: string;
  chave: string;
  motivo: MotivoRestricao;
  inicioUtcMs: number;
  fimUtcMs: number;
  limiteKW: number;
  energiaRestritaKWh: number;
  valorR: number;
  ressarcivel: "sim" | "condicional" | "nao";
};

/** Restrições registradas no SCADA, com a energia não gerada e a elegibilidade a ressarcimento. */
export function analisarRestricoes(usina: UsinaMonitorada, dias: AgregadoDia[]): {
  eventos: EventoRestricao[];
  porMotivo: Array<{ motivo: MotivoRestricao; eventos: number; energiaKWh: number; valorR: number; ressarcivel: "sim" | "condicional" | "nao" }>;
} {
  const eventos: EventoRestricao[] = [];
  for (const d of dias) {
    if (d.restricoes.length === 0) continue;
    const restrita = d.inversores.reduce((s, i) => s + i.energiaRestritaKWh, 0);
    const duracaoTotal = d.restricoes.reduce((s, r) => s + (r.fimUtcMs - r.inicioUtcMs), 0);
    for (const r of d.restricoes) {
      const motivo = r.motivo as MotivoRestricao;
      // Rateio da energia restrita do dia pela duração de cada ordem (normalmente uma por dia).
      const energia = duracaoTotal > 0 ? (restrita * (r.fimUtcMs - r.inicioUtcMs)) / duracaoTotal : 0;
      eventos.push({
        id: r.id,
        chave: d.chave,
        motivo,
        inicioUtcMs: r.inicioUtcMs,
        fimUtcMs: r.fimUtcMs,
        limiteKW: r.limiteW / 1000,
        energiaRestritaKWh: energia,
        valorR: energia * usina.valorEnergiaRKWh,
        ressarcivel: config.restricaoGeracao.motivos[motivo].ressarcivel as "sim" | "condicional" | "nao",
      });
    }
  }
  const porMotivo = MOTIVOS_RESTRICAO.map((motivo) => {
    const lista = eventos.filter((e) => e.motivo === motivo);
    return {
      motivo,
      eventos: lista.length,
      energiaKWh: lista.reduce((s, e) => s + e.energiaRestritaKWh, 0),
      valorR: lista.reduce((s, e) => s + e.valorR, 0),
      ressarcivel: config.restricaoGeracao.motivos[motivo].ressarcivel as "sim" | "condicional" | "nao",
    };
  });
  return { eventos: eventos.sort((a, b) => b.inicioUtcMs - a.inicioUtcMs), porMotivo };
}

export type ComparacaoInversor = {
  inversorId: string;
  potenciaCcKWp: number;
  energiaKWh: number;
  produtividadeKWhKWp: number;
  performanceRatio: number;
  desvioMedianaPct: number;
  disponibilidadePct: number;
  posicao: number;
};

/** Comparação entre inversores/skids no período: produtividade, PR medido e desvio da mediana. */
export function compararInversores(usina: UsinaMonitorada, dias: AgregadoDia[]): ComparacaoInversor[] {
  const hPoa = dias.reduce((s, d) => s + (d.irradiacaoMedidaKWhM2 ?? d.irradiacaoModeladaKWhM2) * (d.minutosSol > 0 ? 1 - d.minutosAusentes / d.minutosSol : 1), 0);
  const linhas = usina.inversores.map((inv, i) => {
    const p0 = inv.mppts.reduce((s, m) => s + m.potenciaCcW, 0) / 1000;
    const energia = dias.reduce((s, d) => s + d.inversores[i].energiaKWh + d.inversores[i].energiaRestritaKWh, 0);
    const sol = dias.reduce((s, d) => s + d.inversores[i].minutosSol, 0);
    const indisp = dias.reduce((s, d) => s + d.inversores[i].minutosIndisponivel + d.inversores[i].minutosManutencao, 0);
    return {
      inversorId: inv.id,
      potenciaCcKWp: p0,
      energiaKWh: energia,
      produtividadeKWhKWp: energia / p0,
      performanceRatio: hPoa > 0 ? energia / p0 / hPoa : 0,
      desvioMedianaPct: 0,
      disponibilidadePct: sol > 0 ? (1 - indisp / sol) * 100 : 100,
      posicao: 0,
    };
  });
  const ordenadas = [...linhas].map((l) => l.produtividadeKWhKWp).sort((a, b) => a - b);
  const m = Math.floor(ordenadas.length / 2);
  const mediana = ordenadas.length % 2 ? ordenadas[m] : (ordenadas[m - 1] + ordenadas[m]) / 2;
  for (const l of linhas) l.desvioMedianaPct = mediana > 0 ? (l.produtividadeKWhKWp / mediana - 1) * 100 : 0;
  [...linhas].sort((a, b) => b.produtividadeKWhKWp - a.produtividadeKWhKWp).forEach((l, k) => (l.posicao = k + 1));
  return linhas;
}

export type SerieUmMinuto = { inicioUtcMs: number; poaWM2: Float32Array; ghiWM2: Float32Array; pacKW: Float32Array; setpointKW: Float32Array };

/**
 * Refinamento para 1 minuto (janelas curtas do SCADA): interpolação linear dos passos de 5 min com
 * variabilidade de alta frequência determinística (bordas de nuvem), respeitando potência nominal
 * e limites de restrição.
 */
export function serieUmMinuto(usina: UsinaMonitorada, dia: DiaGerado): SerieUmMinuto {
  const n = dia.recebimento.length * PASSO_MIN;
  const aleatorio = criarAleatorio(`1min|${usina.id}|${dia.chave}`);
  const poaBase = dia.poaMedidaWM2 ?? dia.poaModeladaWM2;
  const ghiBase = dia.ghiMedidaWM2 ?? dia.ghiModeladaWM2;
  const pacBase = Float32Array.from({ length: dia.recebimento.length }, (_, k) => dia.inversores.reduce((s, inv) => s + inv.pacW[k], 0) / 1000);
  const interpolar = (serie: ArrayLike<number>, minuto: number) => {
    const pos = (minuto + 0.5) / PASSO_MIN - 0.5;
    const a = Math.max(0, Math.min(serie.length - 1, Math.floor(pos)));
    const b = Math.min(serie.length - 1, a + 1);
    const f = Math.min(1, Math.max(0, pos - a));
    return serie[a] * (1 - f) + serie[b] * f;
  };
  const poa = new Float32Array(n);
  const ghi = new Float32Array(n);
  const pac = new Float32Array(n);
  const setpoint = new Float32Array(n).fill(NaN);
  let nuvem = 0;
  for (let t = 0; t < n; t++) {
    nuvem = 0.6 * nuvem + 0.8 * normalRapida(aleatorio);
    const fator = poaBase[Math.floor(t / PASSO_MIN)] > 100 ? 1 + 0.02 * nuvem : 1;
    poa[t] = Math.max(0, interpolar(poaBase, t) * fator);
    ghi[t] = Math.max(0, interpolar(ghiBase, t) * fator);
    let p = Math.max(0, interpolar(pacBase, t) * fator);
    p = Math.min(p, usina.potenciaCaW / 1000);
    const instante = dia.inicioUtcMs + (t + 0.5) * MS_POR_MINUTO;
    for (const r of dia.restricoes) {
      if (instante >= r.inicioUtcMs && instante < r.fimUtcMs) {
        setpoint[t] = r.limiteW / 1000;
        p = Math.min(p, r.limiteW / 1000);
      }
    }
    pac[t] = p;
  }
  return { inicioUtcMs: dia.inicioUtcMs, poaWM2: poa, ghiWM2: ghi, pacKW: pac, setpointKW: setpoint };
}

// ---------------------------------------------------------------------------------------------
// Exportação/importação do histórico (CSV) — somente leitura.
// ---------------------------------------------------------------------------------------------

export const COLUNAS_SCADA = ["timestamp_utc", "inversor_id", "p_ac_kw", "poa_wm2", "ghi_wm2", "t_mod_c", "setpoint_kw", "motivo_restricao", "status"] as const;

const NOMES_STATUS: Record<number, string> = {
  [STATUS.normal]: "normal",
  [STATUS.alarme]: "alarme",
  [STATUS.desligado]: "desligado",
  [STATUS.manutencao]: "manutencao",
  [STATUS.restricao]: "restricao",
  [STATUS.noite]: "noite",
};

/** Gera um arquivo de exemplo no formato aceito pela importação (passo de 5 min, um dia). */
export function exportarHistoricoScadaCsv(usina: UsinaMonitorada, dia: DiaGerado): string {
  const linhas: string[] = [COLUNAS_SCADA.join(",")];
  for (let k = 0; k < dia.recebimento.length; k++) {
    const instante = dia.inicioUtcMs + k * PASSO_MIN * MS_POR_MINUTO;
    const restricao = dia.restricoes.find((r) => instante >= r.inicioUtcMs && instante < r.fimUtcMs);
    for (const inv of dia.inversores) {
      linhas.push(
        [
          new Date(instante).toISOString(),
          inv.id,
          (inv.pacW[k] / 1000).toFixed(3),
          (dia.poaMedidaWM2?.[k] ?? 0).toFixed(1),
          (dia.ghiMedidaWM2?.[k] ?? 0).toFixed(1),
          (dia.tempModuloMedidaC?.[k] ?? 0).toFixed(1),
          restricao ? ((restricao.limiteW / 1000) * (usina.inversores.length > 0 ? 1 / usina.inversores.length : 1)).toFixed(1) : "",
          restricao ? restricao.motivo : "",
          NOMES_STATUS[inv.status[k]] ?? "normal",
        ].join(","),
      );
    }
  }
  return linhas.join("\n");
}

const esquemaLinhaScada = z.object({
  timestamp_utc: z.string().datetime(),
  inversor_id: z.string().min(1).max(40),
  p_ac_kw: z.number().min(0),
  poa_wm2: z.number().min(0).max(1600),
  ghi_wm2: z.number().min(0).max(1600),
  t_mod_c: z.number().min(-30).max(110),
  setpoint_kw: z.number().min(0).nullable(),
  motivo_restricao: z.enum(["razaoEnergetica", "confiabilidadeEletrica", "indisponibilidadeExterna"]).nullable(),
  status: z.string().max(30),
});

export type ResumoImportacaoScada =
  | {
      ok: true;
      linhas: number;
      inicio: string;
      fim: string;
      inversores: Array<{ id: string; energiaKWh: number }>;
      energiaTotalKWh: number;
      irradiacaoPoaKWhM2: number;
      performanceRatio: number | null;
      disponibilidadeTecnicaPct: number | null;
      minutosRestricaoPorMotivo: Record<string, number>;
    }
  | { ok: false; erro: "cabecalho" | "linha" | "vazio"; linha?: number };

/**
 * Lê um CSV exportado do SCADA (somente leitura) e resume o período. O PR medido usa a potência
 * CC nominal informada (kWp) e a irradiância no plano medida pela estação meteorológica.
 */
export function importarHistoricoScada(texto: string, potenciaCcKWp: number): ResumoImportacaoScada {
  const linhas = texto.trim().split(/\r?\n/);
  if (linhas.length < 2) return { ok: false, erro: "vazio" };
  const cabecalho = linhas[0].split(",").map((c) => c.trim());
  if (COLUNAS_SCADA.some((c) => !cabecalho.includes(c))) return { ok: false, erro: "cabecalho" };
  const idx = Object.fromEntries(COLUNAS_SCADA.map((c) => [c, cabecalho.indexOf(c)])) as Record<(typeof COLUNAS_SCADA)[number], number>;
  const porInversor = new Map<string, number>();
  const porInstante = new Map<string, { poa: number; algumaGeracao: boolean; externo: boolean }>();
  const minutosRestricao: Record<string, number> = {};
  const instantes: string[] = [];
  let passoMin = 5;
  for (let i = 1; i < linhas.length; i++) {
    const c = linhas[i].split(",");
    const numero = (v: string) => (v === undefined || v.trim() === "" ? null : Number(v));
    const r = esquemaLinhaScada.safeParse({
      timestamp_utc: c[idx.timestamp_utc],
      inversor_id: c[idx.inversor_id],
      p_ac_kw: numero(c[idx.p_ac_kw]),
      poa_wm2: numero(c[idx.poa_wm2]),
      ghi_wm2: numero(c[idx.ghi_wm2]),
      t_mod_c: numero(c[idx.t_mod_c]),
      setpoint_kw: numero(c[idx.setpoint_kw]),
      motivo_restricao: c[idx.motivo_restricao]?.trim() ? c[idx.motivo_restricao].trim() : null,
      status: c[idx.status] ?? "",
    });
    if (!r.success) return { ok: false, erro: "linha", linha: i + 1 };
    const l = r.data;
    instantes.push(l.timestamp_utc);
    const e = porInstante.get(l.timestamp_utc) ?? { poa: l.poa_wm2, algumaGeracao: false, externo: false };
    e.algumaGeracao ||= l.p_ac_kw > 0;
    e.externo ||= l.motivo_restricao !== null;
    porInstante.set(l.timestamp_utc, e);
    porInversor.set(l.inversor_id, (porInversor.get(l.inversor_id) ?? 0) + l.p_ac_kw);
    if (l.motivo_restricao) minutosRestricao[l.motivo_restricao] = (minutosRestricao[l.motivo_restricao] ?? 0) + 1;
  }
  const ordenados = [...new Set(instantes)].sort();
  if (ordenados.length >= 2) passoMin = Math.max(1, Math.round((Date.parse(ordenados[1]) - Date.parse(ordenados[0])) / MS_POR_MINUTO));
  const horas = passoMin / 60;
  const energiaTotal = [...porInversor.values()].reduce((a, b) => a + b, 0) * horas;
  let hPoa = 0;
  let comSol = 0;
  let disponivel = 0;
  for (const e of porInstante.values()) {
    hPoa += (e.poa * horas) / 1000;
    if (e.poa > 50) {
      comSol++;
      if (e.algumaGeracao || e.externo) disponivel++;
    }
  }
  const nInv = porInversor.size || 1;
  for (const k of Object.keys(minutosRestricao)) minutosRestricao[k] = (minutosRestricao[k] / nInv) * passoMin;
  return {
    ok: true,
    linhas: linhas.length - 1,
    inicio: ordenados[0],
    fim: ordenados[ordenados.length - 1],
    inversores: [...porInversor.entries()].map(([id, kw]) => ({ id, energiaKWh: kw * horas })),
    energiaTotalKWh: energiaTotal,
    irradiacaoPoaKWhM2: hPoa,
    performanceRatio: hPoa > 0 && potenciaCcKWp > 0 ? energiaTotal / potenciaCcKWp / hPoa : null,
    disponibilidadeTecnicaPct: comSol > 0 ? (disponivel / comSol) * 100 : null,
    minutosRestricaoPorMotivo: minutosRestricao,
  };
}
