/**
 * Decomposição da tarifa homologada (dados abertos ANEEL, "Componentes Tarifárias") e tarifa
 * cobrada sobre a energia compensada por categoria de GD.
 *
 * O conjunto aberto não traz os descontos por categoria (GD I/II/III), publicados nas Resoluções
 * Homologatórias. O aplicativo aplica diretamente os percentuais da Lei 14.300 sobre as componentes:
 *   - GD I (art. 26): nenhuma componente sobre a energia compensada até 2045.
 *   - GD II (art. 27, I a VI): % do ano × TUSD Fio B.
 *   - GD III (art. 27 §1º, até 2028): 100 % Fio B + 40 % das componentes de transmissão
 *     + 100 % de P&D/EE e TFSEE.
 *   - A partir do ano da regra do art. 17: cenário escolhido (regra ainda não regulamentada).
 * Esta interpretação é premissa documentada na metodologia.
 */
import config from "@/data/config-regulatoria.json";
import type { CategoriaGd } from "./enquadramento";

/** Agrupamento das componentes (R$/kWh, sem tributos). */
export type TarifaDecomposta = {
  teEnergia: number;
  teTransporte: number;
  teEncargos: number;
  teOutros: number;
  tusdFioA: number;
  tusdFioB: number;
  tusdEncargos: number;
  tusdPerdas: number;
  tusdOutros: number;
  /** Subconjuntos usados pela regra da GD III. */
  tusdTransmissao: number;
  pedEeTfsee: number;
  totalTe: number;
  totalTusd: number;
};

const GRUPOS: Record<string, keyof TarifaDecomposta> = {
  TE_ENERGIA: "teEnergia",
  TE_ANGRA: "teEnergia",
  TE_TRANSPORTE_ITAIPU: "teTransporte",
  TE_TUST_ITAIPU: "teTransporte",
  TE_TUST_CI: "teTransporte",
  TE_Per_RB: "teTransporte",
  TE_ESSERR: "teEncargos",
  TE_PeD: "teEncargos",
  TE_CDE_COVID: "teEncargos",
  TE_CDE_ELET: "teEncargos",
  TE_CDE_GD: "teEncargos",
  TE_CFURH: "teEncargos",
  TE_SUBSIDIO: "teEncargos",
  TE_BENEFICIO_L14299: "teEncargos",
  TE_Liminar: "teOutros",
  TUSD_FioB: "tusdFioB",
  TUSD_RB: "tusdFioA",
  TUSD_FR: "tusdFioA",
  TUSD_CCT: "tusdFioA",
  TUSD_CUSD: "tusdFioA",
  TUSD_CCD: "tusdFioA",
  TUSD_Per_RB_D: "tusdFioA",
  TUSD_ONS: "tusdFioA",
  TUSDG_ONS: "tusdFioA",
  TUSDG_T: "tusdFioA",
  TUSD_CDE: "tusdEncargos",
  TUSD_CDE_COVID: "tusdEncargos",
  TUSD_PROINFA: "tusdEncargos",
  TUSD_PeD: "tusdEncargos",
  TUSD_TFSEE: "tusdEncargos",
  TUSD_CCC: "tusdEncargos",
  TUSD_RGR: "tusdEncargos",
  TUSD_SUBSIDIO: "tusdEncargos",
  "TUSD BENEFICIO_L14299": "tusdEncargos",
  TUSD_PT: "tusdPerdas",
  TUSD_PNT: "tusdPerdas",
  TUSD_RI: "tusdPerdas",
  TUSD_Liminar: "tusdOutros",
  TUSD_OUTROS: "tusdOutros",
};

/** Componentes de uso da transmissão/conexão (Lei 14.300, art. 27 §1º, II). */
const TRANSMISSAO = ["TUSD_RB", "TUSD_FR", "TUSD_CCT", "TUSD_CUSD", "TUSD_CCD"];
/** Encargos de P&D/EE e TFSEE (Lei 14.300, art. 27 §1º, III). */
const PED_EE_TFSEE = ["TUSD_PeD", "TE_PeD", "TUSD_TFSEE"];

export function decomporTarifa(componentesRMWh: Record<string, number>): TarifaDecomposta {
  const t: TarifaDecomposta = {
    teEnergia: 0, teTransporte: 0, teEncargos: 0, teOutros: 0, tusdFioA: 0, tusdFioB: 0, tusdEncargos: 0,
    tusdPerdas: 0, tusdOutros: 0, tusdTransmissao: 0, pedEeTfsee: 0,
    totalTe: (componentesRMWh.TE ?? 0) / 1000,
    totalTusd: (componentesRMWh.TUSD ?? 0) / 1000,
  };
  for (const [nome, valor] of Object.entries(componentesRMWh)) {
    const grupo = GRUPOS[nome];
    if (grupo) t[grupo] += valor / 1000;
    if (TRANSMISSAO.includes(nome)) t.tusdTransmissao += valor / 1000;
    if (PED_EE_TFSEE.includes(nome)) t.pedEeTfsee += valor / 1000;
  }
  // O resíduo (arredondamentos e componentes não mapeadas) vai para "outros", fechando com o total homologado.
  t.teOutros += t.totalTe - (t.teEnergia + t.teTransporte + t.teEncargos + t.teOutros);
  t.tusdOutros += t.totalTusd - (t.tusdFioA + t.tusdFioB + t.tusdEncargos + t.tusdPerdas + t.tusdOutros);
  return t;
}

export type Tributos = { icmsPct: number; pisPct: number; cofinsPct: number };

/** Tributos "por dentro": valor bruto = valor líquido / (1 − ICMS − PIS − COFINS). */
export function fatorTributos(t: Tributos): number {
  const soma = (t.icmsPct + t.pisPct + t.cofinsPct) / 100;
  if (soma >= 1) throw new Error("Soma de alíquotas ≥ 100 %");
  return 1 / (1 - soma);
}

export type CenarioPos2029 = "fioB100" | "somenteTe" | "teMaisBeneficios";

export type RegraCompensacao = {
  categoria: CategoriaGd;
  anoRegraArt17: number;
  cenarioPos2029: CenarioPos2029;
  beneficioPctTusd: number;
};

/** Percentual do Fio B no ano (Lei 14.300, art. 27). Antes de 2023, 0; após 2028, mantém 90 % até o art. 17. */
export function percentualFioB(ano: number): number {
  const cronograma = config.fioB.cronogramaPct as Record<string, number>;
  if (ano < 2023) return 0;
  if (cronograma[String(ano)] !== undefined) return cronograma[String(ano)];
  return cronograma["2028"];
}

export type ComposicaoCompensada = { valorRKWh: number; fundamento: "art26" | "art27" | "art27par1" | "art17" };

/**
 * Valor (R$/kWh, sem tributos) cobrado sobre cada kWh de energia compensada no ano.
 */
export function tarifaSobreCompensada(t: TarifaDecomposta, regra: RegraCompensacao, ano: number): ComposicaoCompensada {
  if (regra.categoria === "GD1" && ano < regra.anoRegraArt17) return { valorRKWh: 0, fundamento: "art26" };
  if (ano >= regra.anoRegraArt17) {
    switch (regra.cenarioPos2029) {
      case "fioB100":
        return { valorRKWh: t.tusdFioB, fundamento: "art17" };
      case "somenteTe":
        return { valorRKWh: t.totalTusd, fundamento: "art17" };
      case "teMaisBeneficios":
        return { valorRKWh: t.totalTusd * (1 - regra.beneficioPctTusd / 100), fundamento: "art17" };
    }
  }
  if (regra.categoria === "GD3" && ano <= config.fioB.gd3AteAno) {
    const g = config.fioB.gd3;
    return {
      valorRKWh: (g.fioBPct / 100) * t.tusdFioB + (g.transmissaoPct / 100) * t.tusdTransmissao + (g.encargosPeDTfseePct / 100) * t.pedEeTfsee,
      fundamento: "art27par1",
    };
  }
  return { valorRKWh: (percentualFioB(ano) / 100) * t.tusdFioB, fundamento: "art27" };
}
