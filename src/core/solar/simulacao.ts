/**
 * Simulação da cadeia de conversão sobre uma série temporal (horária ou de 5 min), com
 * contabilização de cada perda para a cascata de perdas.
 *
 * Cadeia (por passo):
 *   GHI → (Erbs) DNI/DHI → (transposição) POA → (sujidade, sombreamento) POA efetiva
 *   → (NOCT + γ) potência CC → (mismatch, cabos CC) → (inversor PVWatts) → (clipping)
 *   → (cabos CA) → (disponibilidade) energia CA entregue.
 */
import { diaDoAnoUtc, MS_POR_MINUTO } from "../util/tempo";
import type { SerieClima } from "./clima";
import { irradianciaExtraterrestreWM2 } from "./geometria";
import { decomporErbs, type ModeloTransposicao, transpor } from "./irradiancia";
import { inversorPvwatts, potenciaCcPvwattsW, temperaturaCelulaNoctC } from "./potencia";

export type Perdas = {
  sujidadePct: number;
  sombreamentoPct: number;
  mismatchPct: number;
  cabosCcPct: number;
  cabosCaPct: number;
  disponibilidadePct: number; // fração do tempo disponível, em %
};

export type SistemaFv = {
  inclinacaoGraus: number;
  azimuteGraus: number;
  albedo: number;
  modeloTransposicao: ModeloTransposicao;
  potenciaCcW: number;
  potenciaCaW: number;
  etaInversor: number;
  noctC: number;
  gammaPorC: number;
  perdas: Perdas;
};

/** Etapas da cascata de perdas, em kWh (positivo = ganho, negativo = perda). */
export type CascataPerdas = {
  referenciaHorizontalKWh: number; // Σ GHI·P0/1000·Δt
  transposicaoKWh: number;
  sujidadeKWh: number;
  sombreamentoKWh: number;
  temperaturaKWh: number;
  mismatchKWh: number;
  cabosCcKWh: number;
  inversorKWh: number;
  clippingKWh: number;
  cabosCaKWh: number;
  disponibilidadeKWh: number;
  entregueKWh: number;
};

export type ResultadoSimulacao = {
  passoMin: number;
  inicioUtcMs: number;
  poaWM2: Float64Array;
  tempCelulaC: Float64Array;
  potenciaCcW: Float64Array;
  potenciaCaW: Float64Array;
  cascata: CascataPerdas;
  irradiacaoPoaKWhM2: number;
  energiaCcKWh: number;
  energiaCaKWh: number;
  /** Performance Ratio = Yf / Yr = (E_ca/P0) / (H_poa/1 kW·m⁻²). */
  performanceRatio: number;
};

export function simularSerie(clima: SerieClima, sistema: SistemaFv): ResultadoSimulacao {
  const n = clima.ghiWM2.length;
  const horas = clima.passoMin / 60;
  const p0 = sistema.potenciaCcW;
  const fatorSuj = 1 - sistema.perdas.sujidadePct / 100;
  const fatorSomb = 1 - sistema.perdas.sombreamentoPct / 100;
  const fatorMis = 1 - sistema.perdas.mismatchPct / 100;
  const fatorCc = 1 - sistema.perdas.cabosCcPct / 100;
  const fatorCa = 1 - sistema.perdas.cabosCaPct / 100;
  const fatorDisp = sistema.perdas.disponibilidadePct / 100;

  const poa = new Float64Array(n);
  const tc = new Float64Array(n);
  const pcc = new Float64Array(n);
  const pca = new Float64Array(n);
  const c: CascataPerdas = {
    referenciaHorizontalKWh: 0, transposicaoKWh: 0, sujidadeKWh: 0, sombreamentoKWh: 0, temperaturaKWh: 0,
    mismatchKWh: 0, cabosCcKWh: 0, inversorKWh: 0, clippingKWh: 0, cabosCaKWh: 0, disponibilidadeKWh: 0, entregueKWh: 0,
  };
  let somaPoa = 0;
  let somaCc = 0;
  let somaCa = 0;
  const kwh = (w: number) => (w * horas) / 1000;

  for (let i = 0; i < n; i++) {
    const ghi = clima.ghiWM2[i];
    const zen = clima.zenitalGraus[i];
    if (ghi <= 0 || zen >= 90) {
      tc[i] = clima.tempArC[i];
      continue;
    }
    const instante = clima.inicioUtcMs + (i + 0.5) * clima.passoMin * MS_POR_MINUTO;
    const e0 = irradianciaExtraterrestreWM2(diaDoAnoUtc(instante));
    const dec = decomporErbs(ghi, zen, e0);
    const plano = transpor({
      modelo: sistema.modeloTransposicao,
      inclinacaoGraus: sistema.inclinacaoGraus,
      azimutePlanoGraus: sistema.azimuteGraus,
      zenitalGraus: zen,
      azimuteSolGraus: clima.azimuteSolGraus[i],
      ghiWM2: ghi,
      dniWM2: dec.dniWM2,
      dhiWM2: dec.dhiWM2,
      extraterrestreWM2: e0,
      albedo: sistema.albedo,
    });
    const g = plano.globalWM2;
    poa[i] = g;
    tc[i] = temperaturaCelulaNoctC(g, clima.tempArC[i], sistema.noctC);

    const pRefHoriz = ghi * 0.001 * p0;
    const pPoa = g * 0.001 * p0;
    const pSuj = pPoa * fatorSuj;
    const pSomb = pSuj * fatorSomb;
    const pTemp = potenciaCcPvwattsW(g, tc[i], p0, sistema.gammaPorC) * fatorSuj * fatorSomb;
    const pMis = pTemp * fatorMis;
    const pCc = pMis * fatorCc;
    const inv = inversorPvwatts(pCc, sistema.potenciaCaW, sistema.etaInversor);
    const semClipping = inv.potenciaCaW + inv.perdaClippingW;
    const pCa = inv.potenciaCaW * fatorCa;
    const pEntregue = pCa * fatorDisp;

    pcc[i] = pCc;
    pca[i] = pEntregue;
    c.referenciaHorizontalKWh += kwh(pRefHoriz);
    c.transposicaoKWh += kwh(pPoa - pRefHoriz);
    c.sujidadeKWh += kwh(pSuj - pPoa);
    c.sombreamentoKWh += kwh(pSomb - pSuj);
    c.temperaturaKWh += kwh(pTemp - pSomb);
    c.mismatchKWh += kwh(pMis - pTemp);
    c.cabosCcKWh += kwh(pCc - pMis);
    c.inversorKWh += kwh(semClipping - pCc);
    c.clippingKWh += kwh(inv.potenciaCaW - semClipping);
    c.cabosCaKWh += kwh(pCa - inv.potenciaCaW);
    c.disponibilidadeKWh += kwh(pEntregue - pCa);
    somaPoa += g;
    somaCc += pCc;
    somaCa += pEntregue;
  }
  c.entregueKWh = kwh(somaCa);
  const irradiacaoPoaKWhM2 = (somaPoa * horas) / 1000;
  const energiaCaKWh = kwh(somaCa);
  return {
    passoMin: clima.passoMin,
    inicioUtcMs: clima.inicioUtcMs,
    poaWM2: poa,
    tempCelulaC: tc,
    potenciaCcW: pcc,
    potenciaCaW: pca,
    cascata: c,
    irradiacaoPoaKWhM2,
    energiaCcKWh: kwh(somaCc),
    energiaCaKWh,
    performanceRatio: irradiacaoPoaKWhM2 > 0 ? energiaCaKWh / (p0 / 1000) / irradiacaoPoaKWhM2 : 0,
  };
}

/** Soma uma série de potência (W) por mês civil local, devolvendo kWh por mês (índice 0 = janeiro). */
export function energiaMensalKWh(serieW: Float64Array, inicioUtcMs: number, passoMin: number): number[] {
  const meses = new Array(12).fill(0);
  const horas = passoMin / 60;
  for (let i = 0; i < serieW.length; i++) {
    const instante = inicioUtcMs + (i + 0.5) * passoMin * MS_POR_MINUTO;
    const mes = new Date(instante - 3 * 3_600_000).getUTCMonth();
    meses[mes] += (serieW[i] * horas) / 1000;
  }
  return meses;
}
