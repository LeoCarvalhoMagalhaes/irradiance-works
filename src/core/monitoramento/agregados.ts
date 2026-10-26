/**
 * Agregados diários calculados apenas com os dados VISÍVEIS ao aplicativo (recebidos do
 * datalogger, inclusive os reenviados). Dados ausentes não entram nem na energia medida nem na
 * esperada usada nos índices — "sem dados" é diferente de "geração zero".
 */
import { chaveParaUtcMs, MS_POR_HORA, MS_POR_MINUTO, somarDias } from "../util/tempo";
import type { UsinaMonitorada } from "./frota";
import { type AlarmeDia, type ContextoGeracao, type DiaGerado, gerarDia, PASSO_MIN, RECEBIMENTO, type RestricaoDia, STATUS } from "./gerador";

export const LIMIAR_IRRADIANCIA_DISPONIBILIDADE = 50; // W/m², IEC 61724-1 (limiar típico para período com sol)
export const LIMIAR_JANELA_DC = 300; // W/m² — janela de comparação por MPPT

export type AgregadoInversor = {
  id: string;
  energiaKWh: number;
  esperadaKWh: number;
  esperadaVisivelKWh: number;
  minutosSol: number;
  minutosZeroComSol: number;
  /** Minutos com sol e geração zero por causa interna (exclui restrição externa e manutenção programada). */
  minutosIndisponivel: number;
  minutosAlarme: number;
  minutosManutencao: number;
  minutosRestricao: number;
  energiaRestritaKWh: number;
  perdaAlarmeKWh: number;
  minutosClipping: number;
  perdaClippingKWh: number;
  /** Energia CC medida e esperada por MPPT na janela de alta irradiância, só em operação normal. */
  mppts: Array<{ id: string; strings: number; dcKWh: number; dcEsperadaKWh: number }>;
};

export type AgregadoDia = {
  chave: string;
  energiaKWh: number;
  esperadaKWh: number;
  esperadaVisivelKWh: number;
  irradiacaoModeladaKWhM2: number;
  irradiacaoMedidaKWhM2: number | null;
  /** Σ G_poa·[1 + γ·(Tc − 25)]·Δt — denominador do PR corrigido para 25 °C. */
  irradiacaoCorrigidaKWhM2: number;
  minutosSol: number;
  minutosAusentes: number;
  minutosReenviados: number;
  chuvaMm: number;
  horarioRealKWh: number[];
  horarioEsperadoKWh: number[];
  inversores: AgregadoInversor[];
  alarmes: AlarmeDia[];
  restricoes: RestricaoDia[];
  /** Somente para validação: não deve ser lido pelos detectores. */
  verdade: DiaGerado["verdade"];
};

export function agregarDia(usina: UsinaMonitorada, d: DiaGerado): AgregadoDia {
  const h = PASSO_MIN / 60;
  const n = d.recebimento.length;
  const horarioReal = new Array(24).fill(0);
  const horarioEsperado = new Array(24).fill(0);
  let minutosSol = 0;
  let minutosAusentes = 0;
  let minutosReenviados = 0;
  let irradModelada = 0;
  let irradMedida = 0;
  let irradCorrigida = 0;
  const gamma = usina.modulo.coefPotenciaPctC / 100;
  for (let k = 0; k < n; k++) {
    const poaRef = d.poaMedidaWM2 ? d.poaMedidaWM2[k] : d.poaModeladaWM2[k];
    const tc = d.tempModuloMedidaC ? d.tempModuloMedidaC[k] : d.tempCelulaModeladaC[k];
    irradCorrigida += poaRef * (1 + gamma * (tc - 25));
    const sol = d.poaModeladaWM2[k] > LIMIAR_IRRADIANCIA_DISPONIBILIDADE;
    irradModelada += d.poaModeladaWM2[k];
    if (d.poaMedidaWM2) irradMedida += d.poaMedidaWM2[k];
    if (sol) minutosSol += PASSO_MIN;
    if (sol && d.recebimento[k] === RECEBIMENTO.ausente) minutosAusentes += PASSO_MIN;
    if (sol && d.recebimento[k] === RECEBIMENTO.reenviado) minutosReenviados += PASSO_MIN;
  }
  const visivel = (k: number) => d.recebimento[k] === RECEBIMENTO.online || d.recebimento[k] === RECEBIMENTO.reenviado;
  const inversores: AgregadoInversor[] = d.inversores.map((inv, i) => {
    const cfg = usina.inversores[i];
    const a: AgregadoInversor = {
      id: inv.id, energiaKWh: 0, esperadaKWh: 0, esperadaVisivelKWh: 0, minutosSol: 0, minutosZeroComSol: 0, minutosIndisponivel: 0, minutosAlarme: 0,
      minutosManutencao: 0, minutosRestricao: 0, energiaRestritaKWh: 0, perdaAlarmeKWh: 0, minutosClipping: 0, perdaClippingKWh: 0,
      mppts: cfg.mppts.map((m) => ({ id: m.id, strings: m.strings, dcKWh: 0, dcEsperadaKWh: 0 })),
    };
    for (let k = 0; k < n; k++) {
      const esp = (inv.pacEsperadaW[k] * h) / 1000;
      a.esperadaKWh += esp;
      if (!visivel(k)) continue;
      const real = (inv.pacW[k] * h) / 1000;
      a.energiaKWh += real;
      a.esperadaVisivelKWh += esp;
      // Perfil horário só com operação normal: alarmes, desligamentos e restrições não viram "sombreamento".
      if (inv.status[k] === STATUS.normal) {
        const hora = Math.floor((((d.inicioUtcMs + (k + 0.5) * PASSO_MIN * MS_POR_MINUTO) / MS_POR_HORA - 3) % 24 + 24) % 24);
        horarioReal[hora] += real;
        horarioEsperado[hora] += esp;
      }
      const sol = d.poaModeladaWM2[k] > LIMIAR_IRRADIANCIA_DISPONIBILIDADE;
      if (sol) {
        a.minutosSol += PASSO_MIN;
        if (inv.pacW[k] <= 0) {
          a.minutosZeroComSol += PASSO_MIN;
          if (inv.status[k] !== STATUS.restricao && inv.status[k] !== STATUS.manutencao) a.minutosIndisponivel += PASSO_MIN;
        }
      }
      if (inv.status[k] === STATUS.alarme) {
        a.minutosAlarme += PASSO_MIN;
        a.perdaAlarmeKWh += Math.max(0, esp - real);
      }
      if (inv.status[k] === STATUS.manutencao) a.minutosManutencao += PASSO_MIN;
      if (inv.status[k] === STATUS.restricao) {
        a.minutosRestricao += PASSO_MIN;
        a.energiaRestritaKWh += (Math.max(0, inv.pacSemRestricaoW[k] - inv.pacW[k]) * h) / 1000;
      }
      if (inv.pacW[k] >= 0.99 * cfg.potenciaCaW) {
        a.minutosClipping += PASSO_MIN;
        let dc = 0;
        for (const m of inv.mppts) dc += m.pdcW[k];
        a.perdaClippingKWh += (Math.max(0, dc * cfg.etaNominal - inv.pacW[k]) * h) / 1000;
      }
      if (inv.status[k] === STATUS.normal && d.poaModeladaWM2[k] >= LIMIAR_JANELA_DC) {
        inv.mppts.forEach((m, j) => {
          a.mppts[j].dcKWh += (m.pdcW[k] * h) / 1000;
          a.mppts[j].dcEsperadaKWh += (m.pdcEsperadaW[k] * h) / 1000;
        });
      }
    }
    return a;
  });
  return {
    chave: d.chave,
    energiaKWh: inversores.reduce((s, i) => s + i.energiaKWh, 0),
    esperadaKWh: inversores.reduce((s, i) => s + i.esperadaKWh, 0),
    esperadaVisivelKWh: inversores.reduce((s, i) => s + i.esperadaVisivelKWh, 0),
    irradiacaoModeladaKWhM2: (irradModelada * h) / 1000,
    irradiacaoMedidaKWhM2: d.poaMedidaWM2 ? (irradMedida * h) / 1000 : null,
    irradiacaoCorrigidaKWhM2: (irradCorrigida * h) / 1000,
    minutosSol,
    minutosAusentes,
    minutosReenviados,
    chuvaMm: d.chuvaMm,
    horarioRealKWh: horarioReal,
    horarioEsperadoKWh: horarioEsperado,
    inversores,
    alarmes: d.alarmes,
    restricoes: d.restricoes,
    verdade: d.verdade,
  };
}

/** Agregados de N dias até hoje (inclusive), a partir do comissionamento. */
export function agregarUsina(usina: UsinaMonitorada, ctx: ContextoGeracao, dias = 365): AgregadoDia[] {
  const saida: AgregadoDia[] = [];
  const inicio = somarDias(ctx.hoje, -(dias - 1));
  for (let chave = inicio; chave <= ctx.hoje; chave = somarDias(chave, 1)) {
    if (chave < usina.comissionamento) continue;
    if (chaveParaUtcMs(chave) > ctx.agoraUtcMs) break;
    saida.push(agregarDia(usina, gerarDia(usina, chave, ctx)));
  }
  return saida;
}
