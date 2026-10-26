/**
 * Gerador sintético de telemetria de datalogger, determinístico:
 *   (usina, dia, eventos do usuário, data de referência) → leituras de 5 em 5 minutos.
 *
 * - Irradiância real na usina = clima da cidade (gerador calibrado pela NASA POWER) × variação
 *   local da usina (σ = 1,5 %/dia).
 * - Irradiância MODELADA (o que o aplicativo conhece, como uma estimativa por satélite) = clima da
 *   cidade × (1 + ε), com ε diário comum à cidade (σ = 6 %). Usinas de GD não têm piranômetro.
 * - Usinas SCADA têm estação meteorológica: irradiância no plano medida com ruído de 1 %.
 * - Falhas injetadas e alarmes de fabricante alteram apenas a série "real"; a série "esperada"
 *   usa a irradiância modelada, degradação nominal e nenhuma falha.
 * - Perda de comunicação: o datalogger guarda até 72 h e reenvia ao reconectar.
 * - Instantes em UTC; dias delimitados em America/Sao_Paulo (UTC−3).
 */
import alarmesJson from "@/data/alarmes-fabricantes.json";
import { criarAleatorio, normal, normalRapida } from "../util/aleatorio";
import { chaveDiaLocal, chaveParaUtcMs, diferencaDias, MS_POR_DIA, MS_POR_HORA, MS_POR_MINUTO, somarDias } from "../util/tempo";
import { gerarClimaMes, type SerieClima } from "../solar/clima";
import { irradianciaExtraterrestreWM2 } from "../solar/geometria";
import { decomporErbs, transpor } from "../solar/irradiancia";
import { inversorPvwatts, potenciaCcPvwattsW, temperaturaCelulaNoctC } from "../solar/potencia";
import { tensaoNaTemperatura } from "../eletrica/strings";
import type { CategoriaAlarme, Falha, UsinaMonitorada } from "./frota";

export const PASSO_MIN = 5;
export const PASSOS_DIA = 1440 / PASSO_MIN;

export const PREMISSAS_GERADOR = {
  erroIrradianciaModeladaDiario: 0.06,
  variacaoLocalUsina: 0.015,
  sujidadeNaturalPctDia: 0.03,
  chuvaLimpezaMm: 5,
  fracaoRemovidaPelaChuva: 0.7,
  sujidadeMaximaPct: 30,
  degradacaoNominalPctAno: 0.5,
  bufferDataloggerHoras: 72,
  atrasoReenvioMin: 20,
  perdasCcFator: 0.98 * 0.985,
  limiteTermicoFracao: 0.7,
};

/**
 * Evento registrado pelo usuário (ordem de serviço concluída). É uma ENTRADA do gerador, o que
 * mantém o determinismo: "limpeza" zera a sujidade; "reparo" descreve o ativo e o tipo de problema
 * corrigido, e o simulador encerra as falhas compatíveis a partir da data (o aplicativo nunca
 * consulta os rótulos verdadeiros).
 */
export type EventoUsuario = {
  id: string;
  usinaId: string;
  tipo: "limpeza" | "reparo";
  chave: string;
  alvo?: { tipo: Falha["tipo"]; categoria?: CategoriaAlarme; inversorId?: string; mpptId?: string };
};

export type ContextoGeracao = { hoje: string; agoraUtcMs: number; eventos: EventoUsuario[] };

export const STATUS = { normal: 0, alarme: 1, desligado: 2, manutencao: 3, restricao: 4, noite: 5 } as const;
export const RECEBIMENTO = { online: 0, reenviado: 1, ausente: 2, futuro: 3 } as const;

export type MpptDia = { id: string; vV: Float32Array; iA: Float32Array; pdcW: Float32Array; pdcEsperadaW: Float32Array };
export type InversorDia = {
  id: string;
  pacW: Float32Array;
  pacEsperadaW: Float32Array;
  pacSemRestricaoW: Float32Array;
  tempInternaC: Float32Array;
  status: Uint8Array;
  mppts: MpptDia[];
};
export type AlarmeDia = { inversorId: string; codigo: string; categoria: CategoriaAlarme; inicioUtcMs: number; fimUtcMs: number };
export type RestricaoDia = { id: string; motivo: string; inicioUtcMs: number; fimUtcMs: number; limiteW: number };

export type DiaGerado = {
  usinaId: string;
  chave: string;
  inicioUtcMs: number;
  passoMin: number;
  ghiModeladaWM2: Float32Array;
  poaModeladaWM2: Float32Array;
  /** Medida pela estação meteorológica (somente SCADA). */
  poaMedidaWM2: Float32Array | null;
  ghiMedidaWM2: Float32Array | null;
  tempModuloMedidaC: Float32Array | null;
  tempCelulaModeladaC: Float32Array;
  tempArC: Float32Array;
  recebimento: Uint8Array;
  inversores: InversorDia[];
  alarmes: AlarmeDia[];
  restricoes: RestricaoDia[];
  manutencao: Array<{ inversorId: string; inicioUtcMs: number; fimUtcMs: number }>;
  chuvaMm: number;
  /** Rótulos verdadeiros (não usados pelos detectores, apenas pela validação). */
  verdade: { sujidadeFracao: number; falhasAtivas: string[] };
};

const cacheClima = new Map<string, SerieClima>();
function climaDoMes(usina: UsinaMonitorada, ano: number, mes: number): SerieClima {
  const chave = `${usina.cidade.id}|${ano}-${mes}`;
  let c = cacheClima.get(chave);
  if (!c) {
    c = gerarClimaMes({ climatologia: usina.cidade, ano, mes, passoMin: PASSO_MIN, semente: `cidade|${usina.cidade.id}` });
    if (cacheClima.size > 300) cacheClima.clear();
    cacheClima.set(chave, c);
  }
  return c;
}

function climaDoDia(usina: UsinaMonitorada, chave: string) {
  const [ano, mes, dia] = chave.split("-").map(Number);
  const c = climaDoMes(usina, ano, mes);
  const ini = (dia - 1) * PASSOS_DIA;
  return {
    ghi: c.ghiWM2.subarray(ini, ini + PASSOS_DIA),
    temp: c.tempArC.subarray(ini, ini + PASSOS_DIA),
    zen: c.zenitalGraus.subarray(ini, ini + PASSOS_DIA),
    az: c.azimuteSolGraus.subarray(ini, ini + PASSOS_DIA),
    chuvaMm: c.dias[dia - 1].chuvaMm,
  };
}

function reparoCorresponde(e: EventoUsuario, f: Falha, usina: UsinaMonitorada): boolean {
  if (e.usinaId !== usina.id || e.tipo !== "reparo" || !e.alvo || e.alvo.tipo !== f.tipo) return false;
  if (f.tipo === "alarme" && e.alvo.categoria !== f.categoria) return false;
  if ("inversor" in f && e.alvo.inversorId && usina.inversores[f.inversor - 1]?.id !== e.alvo.inversorId) return false;
  if (f.tipo === "stringDesligada" && e.alvo.mpptId && `MPPT${f.mppt}` !== e.alvo.mpptId) return false;
  return true;
}

/** Janela absoluta de uma falha, ajustada pelos reparos registrados pelo usuário. */
export function janelaFalha(f: Falha, hoje: string, eventos: EventoUsuario[], usina: UsinaMonitorada): { inicio: string; fim: string | null } {
  const inicio = somarDias(hoje, -f.inicioDiasAtras);
  let fim: string | null =
    f.tipo === "perdaComunicacao"
      ? f.duracaoHoras === null
        ? null
        : chaveDiaLocal(chaveParaUtcMs(inicio) + (f.horaInicio + f.duracaoHoras) * MS_POR_HORA)
      : f.fimDiasAtras === null
        ? null
        : somarDias(hoje, -f.fimDiasAtras);
  for (const e of eventos) {
    if (!reparoCorresponde(e, f, usina)) continue;
    if (e.chave >= inicio && (fim === null || e.chave < fim)) fim = e.chave;
  }
  return { inicio, fim };
}

const ativaNoDia = (j: { inicio: string; fim: string | null }, chave: string) => chave >= j.inicio && (j.fim === null || chave < j.fim);

/** Nível de sujidade (fração) no início de cada dia, simulado de forma sequencial com chuva e limpezas. */
const cacheSujidade = new Map<string, Map<string, number>>();
export function serieSujidade(usina: UsinaMonitorada, ctx: ContextoGeracao): Map<string, number> {
  const chaveCache = `${usina.id}|${ctx.hoje}|${ctx.eventos.filter((e) => e.usinaId === usina.id).map((e) => e.id + e.chave).join(",")}`;
  const existente = cacheSujidade.get(chaveCache);
  if (existente) return existente;
  const inicio = usina.comissionamento > somarDias(ctx.hoje, -430) ? usina.comissionamento : somarDias(ctx.hoje, -430);
  const falhasSuj = usina.falhas.filter((f): f is Extract<Falha, { tipo: "sujidade" }> => f.tipo === "sujidade");
  const janelas = falhasSuj.map((f) => ({ f, j: janelaFalha(f, ctx.hoje, ctx.eventos, usina) }));
  const limpezas = new Set(ctx.eventos.filter((e) => e.usinaId === usina.id && e.tipo === "limpeza").map((e) => e.chave));
  const serie = new Map<string, number>();
  let natural = 0;
  const porFalha = janelas.map(() => 0);
  const p = PREMISSAS_GERADOR;
  for (let chave = inicio; chave <= ctx.hoje; chave = somarDias(chave, 1)) {
    if (limpezas.has(chave)) {
      natural = 0;
      porFalha.fill(0);
    }
    serie.set(chave, Math.min(p.sujidadeMaximaPct / 100, natural + porFalha.reduce((a, b) => a + b, 0)));
    natural += p.sujidadeNaturalPctDia / 100;
    janelas.forEach(({ f, j }, i) => {
      if (ativaNoDia({ inicio: j.inicio, fim: null }, chave)) porFalha[i] += f.taxaPctDia / 100;
    });
    if (climaDoDia(usina, chave).chuvaMm >= p.chuvaLimpezaMm) {
      natural *= 1 - p.fracaoRemovidaPelaChuva;
      janelas.forEach(({ f }, i) => (porFalha[i] *= 1 - f.remocaoChuva));
    }
  }
  if (cacheSujidade.size > 200) cacheSujidade.clear();
  cacheSujidade.set(chaveCache, serie);
  return serie;
}

function codigoAlarme(fabricante: "A" | "B", categoria: CategoriaAlarme): string {
  const tabela = alarmesJson.fabricantes[fabricante] as Record<string, string>;
  return Object.entries(tabela).find(([, c]) => c === categoria)![0];
}

const horaLocal = (instanteUtcMs: number) => (((instanteUtcMs / MS_POR_HORA - 3) % 24) + 24) % 24;

export function gerarDia(usina: UsinaMonitorada, chave: string, ctx: ContextoGeracao, opcoes: { detalhe?: boolean } = {}): DiaGerado {
  const p = PREMISSAS_GERADOR;
  const inicioUtcMs = chaveParaUtcMs(chave);
  const clima = climaDoDia(usina, chave);
  const n = PASSOS_DIA;
  const aleatorio = criarAleatorio(`dia|${usina.id}|${chave}`);
  const erroModelo = 1 + p.erroIrradianciaModeladaDiario * normal(criarAleatorio(`satelite|${usina.cidade.id}|${chave}`));
  const fatorLocal = 1 + p.variacaoLocalUsina * normal(aleatorio);
  const diaDoAno = Math.floor((inicioUtcMs + 12 * MS_POR_HORA - Date.UTC(Number(chave.slice(0, 4)), 0, 1)) / MS_POR_DIA) + 1;
  const e0 = irradianciaExtraterrestreWM2(diaDoAno);

  const anosOperacao = Math.max(0, diferencaDias(usina.comissionamento, chave) / 365.25);
  const fatorDegNominal = 1 - (p.degradacaoNominalPctAno / 100) * anosOperacao;
  const sujidade = serieSujidade(usina, ctx).get(chave) ?? 0;

  // Falhas ativas no dia
  const janelas = usina.falhas.map((f) => ({ f, j: janelaFalha(f, ctx.hoje, ctx.eventos, usina) }));
  const ativas = janelas.filter(({ j }) => ativaNoDia(j, chave));
  let fatorDegExtra = 1;
  for (const { f, j } of janelas) {
    if (f.tipo !== "degradacaoAcelerada" || chave < j.inicio) continue;
    const ate = j.fim !== null && j.fim < chave ? j.fim : chave;
    fatorDegExtra *= 1 - (f.taxaPctAno / 100) * (diferencaDias(j.inicio, ate) / 365.25);
  }

  const poaReal = new Float32Array(n);
  const poaModelada = new Float32Array(n);
  const ghiModelada = new Float32Array(n);
  const tempAr = new Float32Array(n);
  const tcReal = new Float32Array(n);
  const tcModelo = new Float32Array(n);
  for (let k = 0; k < n; k++) {
    tempAr[k] = clima.temp[k];
    const ghiCidade = clima.ghi[k];
    if (ghiCidade <= 0 || clima.zen[k] >= 90) {
      tcReal[k] = tcModelo[k] = clima.temp[k];
      continue;
    }
    const calcularPoa = (ghi: number) => {
      const d = decomporErbs(ghi, clima.zen[k], e0);
      return transpor({
        modelo: "hayDavies",
        inclinacaoGraus: usina.inclinacaoGraus,
        azimutePlanoGraus: usina.azimuteGraus,
        zenitalGraus: clima.zen[k],
        azimuteSolGraus: clima.az[k],
        ghiWM2: ghi,
        dniWM2: d.dniWM2,
        dhiWM2: d.dhiWM2,
        extraterrestreWM2: e0,
        albedo: 0.2,
      }).globalWM2;
    };
    const ghiReal = ghiCidade * fatorLocal;
    ghiModelada[k] = ghiCidade * erroModelo;
    poaReal[k] = calcularPoa(ghiReal);
    poaModelada[k] = calcularPoa(ghiModelada[k]);
    tcReal[k] = temperaturaCelulaNoctC(poaReal[k], clima.temp[k], usina.modulo.noctC);
    tcModelo[k] = temperaturaCelulaNoctC(poaModelada[k], clima.temp[k], usina.modulo.noctC);
  }

  // Potência CC por watt-pico (PVWatts é linear em P0): calculada uma vez por passo para a usina.
  const gamma = usina.modulo.coefPotenciaPctC / 100;
  const unitarioReal = new Float32Array(n);
  const unitarioModelo = new Float32Array(n);
  for (let k = 0; k < n; k++) {
    if (poaReal[k] > 0) unitarioReal[k] = potenciaCcPvwattsW(poaReal[k], tcReal[k], 1, gamma);
    if (poaModelada[k] > 0) unitarioModelo[k] = potenciaCcPvwattsW(poaModelada[k], tcModelo[k], 1, gamma);
  }
  const sombreamento = ativas.map(({ f }) => f).find((f): f is Extract<Falha, { tipo: "sombreamento" }> => f.tipo === "sombreamento");
  const alarmes: AlarmeDia[] = [];
  const instante = (k: number) => inicioUtcMs + (k + 0.5) * PASSO_MIN * MS_POR_MINUTO;

  // Restrições e manutenção programada (SCADA)
  const restricoes: RestricaoDia[] = [];
  const manutencao: DiaGerado["manutencao"] = [];
  if (usina.scada) {
    for (const r of usina.scada.restricoes) {
      if (somarDias(ctx.hoje, -r.inicioDiasAtras) !== chave) continue;
      restricoes.push({
        id: r.id,
        motivo: r.motivo,
        inicioUtcMs: inicioUtcMs + r.horaInicio * MS_POR_HORA,
        fimUtcMs: inicioUtcMs + r.horaFim * MS_POR_HORA,
        limiteW: (r.limitePct / 100) * usina.potenciaCaW,
      });
    }
    for (const m of usina.scada.manutencaoProgramada) {
      if (somarDias(ctx.hoje, -m.inicioDiasAtras) !== chave) continue;
      manutencao.push({ inversorId: usina.inversores[m.inversor - 1].id, inicioUtcMs: inicioUtcMs + m.horaInicio * MS_POR_HORA, fimUtcMs: inicioUtcMs + m.horaFim * MS_POR_HORA });
    }
  }

  const inversores: InversorDia[] = usina.inversores.map((inv, idxInv) => {
    const numInv = idxInv + 1;
    const pac = new Float32Array(n);
    const pacEsp = new Float32Array(n);
    const pacLivre = new Float32Array(n);
    const tempInt = new Float32Array(n);
    const status = new Uint8Array(n);
    const mppts: MpptDia[] = inv.mppts.map((m) => ({
      id: m.id,
      vV: new Float32Array(opcoes.detalhe ? n : 0),
      iA: new Float32Array(opcoes.detalhe ? n : 0),
      pdcW: new Float32Array(n),
      pdcEsperadaW: new Float32Array(n),
    }));
    const falhasInv = ativas.filter(({ f }) => "inversor" in f && f.inversor === numInv);
    const offline = falhasInv.find(({ f }) => f.tipo === "inversorOffline");
    const subdesempenho = falhasInv.find(({ f }) => f.tipo === "subdesempenhoInversor");
    const alarmeAtivo = falhasInv.find(({ f }) => f.tipo === "alarme") as { f: Extract<Falha, { tipo: "alarme" }>; j: { inicio: string; fim: string | null } } | undefined;
    const manut = manutencao.find((m) => m.inversorId === inv.id);
    let alarmeAberto: AlarmeDia | null = null;
    const abrirAlarme = (k: number, categoria: CategoriaAlarme) => {
      if (alarmeAberto) return;
      alarmeAberto = { inversorId: inv.id, codigo: codigoAlarme(usina.fabricante, categoria), categoria, inicioUtcMs: instante(k) - (PASSO_MIN / 2) * MS_POR_MINUTO, fimUtcMs: 0 };
    };
    const fecharAlarme = (k: number) => {
      if (!alarmeAberto) return;
      alarmeAberto.fimUtcMs = instante(k) - (PASSO_MIN / 2) * MS_POR_MINUTO;
      alarmes.push(alarmeAberto);
      alarmeAberto = null;
    };
    // Padrão determinístico de desarmes por rede (10 min a cada ~30 min na janela).
    const fase = Math.floor(aleatorio() * 6);

    // Fatores constantes no dia por MPPT (string desligada, subdesempenho do inversor).
    const fatorBase = (1 - sujidade) * fatorDegNominal * fatorDegExtra * p.perdasCcFator;
    const fatorMppt = inv.mppts.map((m, idxM) => {
      let f = fatorBase;
      for (const { f: falha } of ativas) {
        if (falha.tipo === "stringDesligada" && falha.inversor === numInv && falha.mppt === idxM + 1) f *= (m.strings - 1) / m.strings;
      }
      if (subdesempenho) f *= 1 - (subdesempenho.f as Extract<Falha, { tipo: "subdesempenhoInversor" }>).perdaPct / 100;
      return f;
    });
    const fatorEsperado = fatorDegNominal * p.perdasCcFator;

    for (let k = 0; k < n; k++) {
      const h = horaLocal(instante(k));
      const sol = poaReal[k] > 0;
      let pdcTotal = 0;
      let pdcEspTotal = 0;
      for (let idxM = 0; idxM < inv.mppts.length; idxM++) {
        let fator = fatorMppt[idxM];
        if (idxM === 0 && sombreamento && h >= sombreamento.horaInicio && h < sombreamento.horaFim) fator *= 1 - sombreamento.perdaPct / 100;
        const pdc = sol ? Math.max(0, unitarioReal[k] * inv.mppts[idxM].potenciaCcW * fator) : 0;
        const pdcEsp = Math.max(0, unitarioModelo[k] * inv.mppts[idxM].potenciaCcW * fatorEsperado);
        mppts[idxM].pdcW[k] = pdc;
        mppts[idxM].pdcEsperadaW[k] = pdcEsp;
        pdcTotal += pdc;
        pdcEspTotal += pdcEsp;
      }
      pacEsp[k] = inversorPvwatts(pdcEspTotal, inv.potenciaCaW, inv.etaNominal).potenciaCaW;
      let saida = inversorPvwatts(pdcTotal, inv.potenciaCaW, inv.etaNominal).potenciaCaW;
      let st: number = sol ? STATUS.normal : STATUS.noite;
      let desligado = false;

      if (sol && offline) {
        desligado = true;
        st = STATUS.desligado;
      }
      if (sol && manut && instante(k) >= manut.inicioUtcMs && instante(k) < manut.fimUtcMs) {
        desligado = true;
        st = STATUS.manutencao;
      }
      if (sol && alarmeAtivo) {
        const a = alarmeAtivo.f;
        const primeiroDia = chave === alarmeAtivo.j.inicio;
        let emAlarme = false;
        if (a.categoria === "isolamento") emAlarme = h < (a.horaFim ?? 9.5);
        else if (a.categoria === "rede") emAlarme = h >= (a.horaInicio ?? 11) && h < (a.horaFim ?? 13) && Math.floor(k / 2 + fase) % 6 < 2;
        else if (a.categoria === "arco") emAlarme = !primeiroDia || h >= 10;
        else if (a.categoria === "sobretemperatura") {
          const limite = p.limiteTermicoFracao * inv.potenciaCaW;
          emAlarme = h >= (a.horaInicio ?? 12) && h < (a.horaFim ?? 15) && saida > limite;
          if (emAlarme) saida = limite;
        }
        if (emAlarme) {
          abrirAlarme(k, a.categoria);
          st = STATUS.alarme;
          if (a.categoria !== "sobretemperatura") desligado = true;
        } else fecharAlarme(k);
      }
      pacLivre[k] = desligado ? 0 : saida;
      if (desligado) {
        saida = 0;
        for (const m of mppts) m.pdcW[k] = 0;
      }
      pac[k] = saida;
      tempInt[k] = tempAr[k] + 6 + 18 * (saida / inv.potenciaCaW) + (st === STATUS.alarme && alarmeAtivo?.f.categoria === "sobretemperatura" ? 12 : 0);
      status[k] = st;
    }
    fecharAlarme(n - 1);

    // Tensões e correntes por MPPT só na visão detalhada (MPP à temperatura de célula; circuito
    // aberto quando desligado). Fluxo aleatório próprio: a potência CA é idêntica nos dois modos.
    if (opcoes.detalhe) {
      const aleatorioVi = criarAleatorio(`vi|${usina.id}|${chave}|${inv.id}`);
      inv.mppts.forEach((m, idxM) => {
        const mp = mppts[idxM];
        for (let k = 0; k < n; k++) {
          if (poaReal[k] <= 0) continue;
          const desligado = pac[k] === 0;
          const tensao = desligado
            ? m.modulosEmSerie * tensaoNaTemperatura(usina.modulo.vocV, usina.modulo.coefVocPctC, tcReal[k])
            : m.modulosEmSerie * tensaoNaTemperatura(usina.modulo.vmpV, usina.modulo.coefVmpPctC, tcReal[k]) * (1 + 0.03 * Math.log(Math.max(poaReal[k], 20) / 1000));
          mp.vV[k] = tensao * (1 + 0.003 * normal(aleatorioVi));
          mp.iA[k] = desligado ? 0 : (mp.pdcW[k] / tensao) * (1 + 0.005 * normal(aleatorioVi));
          mp.pdcW[k] = mp.vV[k] * mp.iA[k];
        }
      });
    }
    const aleatorioPac = criarAleatorio(`pac|${usina.id}|${chave}|${inv.id}`);
    for (let k = 0; k < n; k++) if (pac[k] > 0) pac[k] *= 1 + 0.004 * normalRapida(aleatorioPac);
    return { id: inv.id, pacW: pac, pacEsperadaW: pacEsp, pacSemRestricaoW: pacLivre, tempInternaC: tempInt, status, mppts };
  });

  // Restrição de geração (SCADA): limite de potência da usina, rateado proporcionalmente.
  for (const r of restricoes) {
    for (let k = 0; k < n; k++) {
      const t = instante(k);
      if (t < r.inicioUtcMs || t >= r.fimUtcMs) continue;
      const total = inversores.reduce((s, inv) => s + inv.pacW[k], 0);
      if (total <= r.limiteW) continue;
      const escala = total > 0 ? r.limiteW / total : 0;
      for (const inv of inversores) {
        inv.pacW[k] *= escala;
        inv.status[k] = STATUS.restricao;
        for (const m of inv.mppts) {
          m.pdcW[k] *= escala;
          m.iA[k] *= escala;
        }
      }
    }
  }

  // Recebimento (datalogger)
  const recebimento = new Uint8Array(n);
  for (let k = 0; k < n; k++) if (instante(k) > ctx.agoraUtcMs) recebimento[k] = RECEBIMENTO.futuro;
  for (const { f, j } of janelas) {
    if (f.tipo !== "perdaComunicacao") continue;
    const ini = chaveParaUtcMs(j.inicio) + f.horaInicio * MS_POR_HORA;
    const fimReal = f.duracaoHoras === null ? Infinity : ini + f.duracaoHoras * MS_POR_HORA;
    // Reparo registrado pelo usuário encerra a falha na data do evento.
    const fim = j.fim !== null && f.duracaoHoras === null ? chaveParaUtcMs(j.fim) : fimReal;
    const reconectado = fim <= ctx.agoraUtcMs;
    const limiteBuffer = fim - p.bufferDataloggerHoras * MS_POR_HORA;
    for (let k = 0; k < n; k++) {
      const t = instante(k);
      if (t < ini || t >= fim || recebimento[k] === RECEBIMENTO.futuro) continue;
      if (!reconectado) recebimento[k] = RECEBIMENTO.ausente;
      else recebimento[k] = t >= limiteBuffer && fim + p.atrasoReenvioMin * MS_POR_MINUTO <= ctx.agoraUtcMs ? RECEBIMENTO.reenviado : RECEBIMENTO.ausente;
    }
  }

  // Estação meteorológica (somente SCADA)
  let poaMedida: Float32Array | null = null;
  let ghiMedida: Float32Array | null = null;
  let tempModulo: Float32Array | null = null;
  if (usina.tipo === "scada") {
    poaMedida = Float32Array.from(poaReal, (v) => v * (1 + 0.01 * normal(aleatorio)));
    ghiMedida = Float32Array.from(clima.ghi, (v) => v * fatorLocal * (1 + 0.01 * normal(aleatorio)));
    tempModulo = Float32Array.from(tcReal, (v) => v + 0.5 * normal(aleatorio));
  }

  return {
    usinaId: usina.id,
    chave,
    inicioUtcMs,
    passoMin: PASSO_MIN,
    ghiModeladaWM2: ghiModelada,
    poaModeladaWM2: poaModelada,
    poaMedidaWM2: poaMedida,
    ghiMedidaWM2: ghiMedida,
    tempModuloMedidaC: tempModulo,
    tempCelulaModeladaC: tcModelo,
    tempArC: tempAr,
    recebimento,
    inversores,
    alarmes,
    restricoes,
    manutencao,
    chuvaMm: clima.chuvaMm,
    verdade: { sujidadeFracao: sujidade, falhasAtivas: ativas.map(({ f }) => f.id) },
  };
}
