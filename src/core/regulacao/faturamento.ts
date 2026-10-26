/**
 * Faturamento mensal do Grupo B no SCEE (REN ANEEL 1.000/2021, arts. 290, 291 e 655-G a 655-L).
 */
import config from "@/data/config-regulatoria.json";

export type Ligacao = "monofasico" | "bifasico2" | "bifasico3" | "trifasico";

/** Custo de disponibilidade em kWh (REN 1.000, art. 291), com redução CadÚnico opcional. */
export function custoDisponibilidadeKWh(ligacao: Ligacao, cadUnico = false): number {
  const base = config.custoDisponibilidadeKWh.valores[ligacao];
  return cadUnico ? base * (1 - config.custoDisponibilidadeKWh.reducaoCadUnicoPct / 100) : base;
}

export type LoteCredito = { mesOrigem: number; kWh: number };

export type EntradaMes = {
  /** Índice absoluto do mês (ano·12 + mês−1), usado para a validade dos créditos. */
  mesIndice: number;
  consumoRedeKWh: number;
  injetadaKWh: number;
  creditos: LoteCredito[];
  custoDisponibilidadeKWh: number;
  /** Tarifa plena do consumo (R$/kWh, com tributos). */
  tarifaCheiaRKWh: number;
  /** Valor cobrado por kWh compensado (R$/kWh, com tributos). */
  tarifaCompensadaRKWh: number;
};

export type ResultadoMes = {
  energiaCompensadaKWh: number;
  compensadaDaInjecaoKWh: number;
  compensadaDeCreditosKWh: number;
  creditosGeradosKWh: number;
  creditosExpiradosKWh: number;
  creditos: LoteCredito[];
  saldoCreditosKWh: number;
  valorCompensadaR: number;
  valorNaoCompensadaR: number;
  valorCustoDisponibilidadeR: number;
  aplicouCustoDisponibilidade: boolean;
  faturaR: number;
};

/** Fatura sem geração (REN 1.000, art. 290): maior valor entre consumo e custo de disponibilidade. */
export function faturaSemGeracaoR(consumoKWh: number, custoDispKWh: number, tarifaCheiaRKWh: number): number {
  return Math.max(consumoKWh, custoDispKWh) * tarifaCheiaRKWh;
}

export function faturarMes(e: EntradaMes): ResultadoMes {
  const validade = config.creditos.validadeMeses;
  // Expiração (art. 655-L): créditos expiram 60 meses após o faturamento em que foram gerados.
  let creditosExpiradosKWh = 0;
  const vigentes: LoteCredito[] = [];
  for (const lote of e.creditos) {
    if (e.mesIndice - lote.mesOrigem >= validade) creditosExpiradosKWh += lote.kWh;
    else if (lote.kWh > 0) vigentes.push({ ...lote });
  }
  vigentes.sort((a, b) => a.mesOrigem - b.mesOrigem);
  const saldoAntes = vigentes.reduce((s, l) => s + l.kWh, 0);

  const r = e.consumoRedeKWh;
  const tc = e.tarifaCheiaRKWh;
  const tg = e.tarifaCompensadaRKWh;
  const cd = e.custoDisponibilidadeKWh * tc;

  // Limites da energia compensada (art. 655-I §2º): (I) a fatura não fica abaixo do custo de
  // disponibilidade; (II) não ultrapassa o consumo do ciclo.
  let limiteDisponibilidade: number;
  if (tc <= tg) limiteDisponibilidade = r;
  else limiteDisponibilidade = Math.max(0, (r * tc - cd) / (tc - tg));
  const compensavel = Math.min(r, limiteDisponibilidade, e.injetadaKWh + saldoAntes);

  // Usa primeiro a energia injetada no ciclo e depois os créditos mais antigos (art. 655-G §9º).
  const daInjecao = Math.min(compensavel, e.injetadaKWh);
  let restante = compensavel - daInjecao;
  const deCreditos = restante;
  for (const lote of vigentes) {
    if (restante <= 0) break;
    const uso = Math.min(lote.kWh, restante);
    lote.kWh -= uso;
    restante -= uso;
  }
  const excedente = e.injetadaKWh - daInjecao;
  const creditos = vigentes.filter((l) => l.kWh > 1e-9);
  if (excedente > 1e-9) creditos.push({ mesOrigem: e.mesIndice, kWh: excedente });

  const valorNaoCompensadaR = (r - compensavel) * tc;
  const valorCompensadaR = compensavel * tg;
  const parcela = valorNaoCompensadaR + valorCompensadaR;
  const aplicouCustoDisponibilidade = cd > parcela + 1e-9;
  return {
    energiaCompensadaKWh: compensavel,
    compensadaDaInjecaoKWh: daInjecao,
    compensadaDeCreditosKWh: deCreditos,
    creditosGeradosKWh: Math.max(0, excedente),
    creditosExpiradosKWh,
    creditos,
    saldoCreditosKWh: creditos.reduce((s, l) => s + l.kWh, 0),
    valorCompensadaR,
    valorNaoCompensadaR,
    valorCustoDisponibilidadeR: cd,
    aplicouCustoDisponibilidade,
    faturaR: Math.max(cd, parcela),
  };
}
