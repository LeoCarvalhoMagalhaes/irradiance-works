/**
 * Premissas editáveis do simulador. Nenhum valor aqui vem de fonte oficial: todos são
 * PREMISSAS (sinalizadas na interface e no relatório) que o usuário deve revisar. Os valores de
 * fonte oficial (tarifas, irradiação, regras) ficam em src/data com fonte e data.
 */
import { z } from "zod";

export const esquemaPremissas = z.object({
  tecnicas: z.object({
    albedo: z.number().min(0).max(0.9),
    modeloTransposicao: z.enum(["isotropico", "hayDavies"]),
    sujidadePct: z.number().min(0).max(30),
    mismatchPct: z.number().min(0).max(10),
    cabosCcPct: z.number().min(0).max(10),
    cabosCaPct: z.number().min(0).max(10),
    disponibilidadePct: z.number().min(80).max(100),
    degradacaoPrimeiroAnoPct: z.number().min(0).max(10),
    degradacaoAnualPct: z.number().min(0).max(3),
    faixaPr: z.tuple([z.number().min(0.3).max(1), z.number().min(0.3).max(1)]),
    faixaRelacaoCcCa: z.tuple([z.number().min(0.5).max(2), z.number().min(0.5).max(2)]),
    relacaoCcCaAlvo: z.number().min(0.8).max(1.8),
    fatorOcupacao: z.number().min(0.2).max(1),
    margemTempMinC: z.number().min(0).max(20),
    fatorSegurancaCorrente: z.number().min(1).max(1.6),
  }),
  financeiras: z.object({
    horizonteAnos: z.number().int().min(5).max(40),
    taxaDescontoAnualPct: z.number().min(0).max(40),
    reajusteTarifaAnualPct: z.number().min(-5).max(25),
    custoRWp: z.number().min(0.5).max(20),
    omAnualPctInvestimento: z.number().min(0).max(10),
    reajusteOmAnualPct: z.number().min(0).max(20),
    trocaInversorAno: z.number().int().min(0).max(40),
    trocaInversorCustoRKWca: z.number().min(0).max(5000),
    financiamento: z.object({
      entradaPct: z.number().min(0).max(90),
      taxaMensalPct: z.number().min(0).max(10),
      meses: z.number().int().min(6).max(96),
    }),
    custoMaisTaxa: z.object({
      custoEquipamentosPctInvestimento: z.number().min(10).max(100),
      taxaPctEconomia: z.number().min(0).max(100),
      meses: z.number().int().min(1).max(240),
    }),
  }),
  regulatorias: z.object({
    cenarioPos2029: z.enum(["fioB100", "somenteTe", "teMaisBeneficios"]),
    beneficioPctTusd: z.number().min(0).max(100),
  }),
});

export type Premissas = z.infer<typeof esquemaPremissas>;

export const PREMISSAS_PADRAO: Premissas = {
  tecnicas: {
    albedo: 0.2,
    modeloTransposicao: "hayDavies",
    sujidadePct: 2,
    mismatchPct: 2,
    cabosCcPct: 1.5,
    cabosCaPct: 1,
    disponibilidadePct: 99.5,
    degradacaoPrimeiroAnoPct: 2,
    degradacaoAnualPct: 0.5,
    faixaPr: [0.7, 0.86],
    faixaRelacaoCcCa: [1.0, 1.35],
    relacaoCcCaAlvo: 1.2,
    fatorOcupacao: 0.75,
    margemTempMinC: 5,
    fatorSegurancaCorrente: 1.25,
  },
  financeiras: {
    horizonteAnos: 25,
    taxaDescontoAnualPct: 10,
    reajusteTarifaAnualPct: 5,
    custoRWp: 3.2,
    omAnualPctInvestimento: 1,
    reajusteOmAnualPct: 4,
    trocaInversorAno: 12,
    trocaInversorCustoRKWca: 900,
    financiamento: { entradaPct: 0, taxaMensalPct: 1.6, meses: 72 },
    custoMaisTaxa: { custoEquipamentosPctInvestimento: 70, taxaPctEconomia: 30, meses: 48 },
  },
  regulatorias: { cenarioPos2029: "fioB100", beneficioPctTusd: 25 },
};

/** Alíquotas de exemplo (NÃO verificadas): o usuário deve substituí-las pelas da própria fatura. */
export const TRIBUTOS_EXEMPLO = { icmsPct: 18, pisPct: 1, cofinsPct: 4.5 };
