/**
 * Três cenários de aquisição sobre a mesma economia projetada:
 *   1. Compra à vista.
 *   2. Financiamento pela tabela Price (até 96 meses), com entrada opcional.
 *   3. Aquisição a preço de custo dos equipamentos + taxa administrativa paga a partir da economia.
 * Fluxos anuais: índice 0 = desembolso inicial; índices 1..N = anos de operação.
 */
import { lcoe, paybackDescontado, paybackSimples, type ResultadoTir, tabelaPrice, tir, vpl } from "./indicadores";

export type PremissasFinanceiras = {
  investimentoR: number;
  omAnualPctInvestimento: number;
  reajusteOmAnualPct: number;
  trocaInversorAno: number;
  trocaInversorCustoR: number;
  taxaDescontoAnualPct: number;
  financiamento: { entradaPct: number; taxaMensalPct: number; meses: number };
  custoMaisTaxa: { custoEquipamentosR: number; taxaPctEconomia: number; meses: number };
};

export type CodigoCenario = "aVista" | "financiado" | "custoMaisTaxa";

export type ResultadoCenario = {
  codigo: CodigoCenario;
  fluxos: number[];
  acumulado: number[];
  vplR: number;
  tir: ResultadoTir;
  paybackAnos: number | null;
  paybackDescontadoAnos: number | null;
  economiaAcumuladaR: number;
  desembolsoInicialR: number;
  /** Comparação mensal no primeiro ano (financiamento): parcela × economia. */
  parcelaMensalR?: number;
  economiaMensalAno1R?: number[];
};

export type EntradaCenarios = {
  economiaAnualR: number[];
  economiaMensalAno1R: number[];
  geracaoAnualKWh: number[];
  premissas: PremissasFinanceiras;
};

function custosOperacionais(p: PremissasFinanceiras, anos: number): number[] {
  return Array.from({ length: anos }, (_, i) => {
    const y = i + 1;
    const om = (p.investimentoR * p.omAnualPctInvestimento) / 100 * (1 + p.reajusteOmAnualPct / 100) ** i;
    const troca = y === p.trocaInversorAno ? p.trocaInversorCustoR : 0;
    return om + troca;
  });
}

function montar(codigo: CodigoCenario, fluxos: number[], taxa: number, economia: number[], extra: Partial<ResultadoCenario> = {}): ResultadoCenario {
  const acumulado: number[] = [];
  fluxos.reduce((s, v) => {
    acumulado.push(s + v);
    return s + v;
  }, 0);
  return {
    codigo,
    fluxos,
    acumulado,
    vplR: vpl(fluxos, taxa),
    tir: tir(fluxos),
    paybackAnos: paybackSimples(fluxos),
    paybackDescontadoAnos: paybackDescontado(fluxos, taxa),
    economiaAcumuladaR: economia.reduce((a, b) => a + b, 0),
    desembolsoInicialR: -fluxos[0],
    ...extra,
  };
}

export function calcularCenarios(e: EntradaCenarios): { cenarios: ResultadoCenario[]; lcoeRKWh: number } {
  const p = e.premissas;
  const anos = e.economiaAnualR.length;
  const taxa = p.taxaDescontoAnualPct / 100;
  const custos = custosOperacionais(p, anos);

  // 1. À vista
  const aVista = [-p.investimentoR, ...e.economiaAnualR.map((v, i) => v - custos[i])];

  // 2. Financiamento (Price): parcelas mensais somadas por ano de operação.
  const entrada = (p.investimentoR * p.financiamento.entradaPct) / 100;
  const price = tabelaPrice(p.investimentoR - entrada, p.financiamento.taxaMensalPct / 100, p.financiamento.meses);
  const parcelasAno = Array.from({ length: anos }, (_, i) => {
    const mesesNoAno = Math.max(0, Math.min(12, p.financiamento.meses - i * 12));
    return mesesNoAno * price.parcela;
  });
  const financiado = [-entrada, ...e.economiaAnualR.map((v, i) => v - custos[i] - parcelasAno[i])];

  // 3. Custo dos equipamentos + taxa administrativa (% da economia durante N meses).
  const c = p.custoMaisTaxa;
  const taxaAno = Array.from({ length: anos }, (_, i) => {
    const mesesNoAno = Math.max(0, Math.min(12, c.meses - i * 12));
    return (e.economiaAnualR[i] * (c.taxaPctEconomia / 100) * mesesNoAno) / 12;
  });
  const custoTaxa = [-c.custoEquipamentosR, ...e.economiaAnualR.map((v, i) => v - custos[i] - taxaAno[i])];

  const cenarios = [
    montar("aVista", aVista, taxa, e.economiaAnualR),
    montar("financiado", financiado, taxa, e.economiaAnualR, {
      parcelaMensalR: price.parcela,
      economiaMensalAno1R: e.economiaMensalAno1R,
    }),
    montar("custoMaisTaxa", custoTaxa, taxa, e.economiaAnualR),
  ];
  const lcoeRKWh = lcoe([p.investimentoR, ...custos], [0, ...e.geracaoAnualKWh], taxa);
  return { cenarios, lcoeRKWh };
}
