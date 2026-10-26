/**
 * Verificação elétrica do arranjo: limites de tensão e corrente por MPPT com correção de
 * temperatura pelos coeficientes do datasheet. Cada verificação devolve fórmula, valores e
 * resultado para a "memória de cálculo".
 */
import { areaModuloM2, type Inversor, type Modulo } from "./equipamentos";

export type CodigoVerificacao =
  | "vocTempMin"
  | "vmpTempMax"
  | "vmpTempMin"
  | "correnteMppt"
  | "correnteCurtoMppt"
  | "relacaoCcCa"
  | "area";

export type Verificacao = {
  codigo: CodigoVerificacao;
  /** Expressão simbólica (independente de idioma). */
  formula: string;
  /** Substituição numérica da fórmula. */
  substituicao: string;
  valor: number;
  limite: number;
  /** Limite superior (≤) ou inferior (≥). */
  comparador: "<=" | ">=";
  unidade: string;
  aprovado: boolean;
  /** Avisos não bloqueiam: indicam valor fora da faixa típica configurada. */
  tipo: "bloqueante" | "aviso";
};

export type ConfiguracaoArranjo = {
  modulosEmSerie: number;
  stringsPorMppt: number[]; // um elemento por MPPT de um inversor
  quantidadeInversores: number;
};

export type ParametrosVerificacao = {
  modulo: Modulo;
  inversor: Inversor;
  configuracao: ConfiguracaoArranjo;
  tempMinProjetoC: number;
  tempMaxCelulaC: number;
  fatorSegurancaCorrente: number;
  faixaRelacaoCcCa: [number, number];
  areaDisponivelM2?: number;
  fatorOcupacao: number;
};

const fmt = (v: number, casas = 2) => v.toFixed(casas);

export const tensaoNaTemperatura = (tensaoStcV: number, coefPctC: number, tempC: number) =>
  tensaoStcV * (1 + (coefPctC / 100) * (tempC - 25));

export function totalModulos(c: ConfiguracaoArranjo): number {
  return c.modulosEmSerie * c.stringsPorMppt.reduce((a, b) => a + b, 0) * c.quantidadeInversores;
}

export function verificarArranjo(p: ParametrosVerificacao): Verificacao[] {
  const { modulo: m, inversor: inv, configuracao: c } = p;
  const ns = c.modulosEmSerie;
  const vocMin = tensaoNaTemperatura(m.vocV, m.coefVocPctC, p.tempMinProjetoC);
  const vmpMax = tensaoNaTemperatura(m.vmpV, m.coefVmpPctC, p.tempMaxCelulaC);
  const vmpMin = tensaoNaTemperatura(m.vmpV, m.coefVmpPctC, p.tempMinProjetoC);
  const fatorCorrente = 1 + (m.coefIscPctC / 100) * (p.tempMaxCelulaC - 25);
  const iscQuente = m.iscA * fatorCorrente;
  const impQuente = m.impA * fatorCorrente;
  const maxStrings = Math.max(...c.stringsPorMppt);
  const potenciaCcW = totalModulos(c) * m.potenciaWp;
  const potenciaCaW = c.quantidadeInversores * inv.potenciaCaW;
  const relacao = potenciaCcW / potenciaCaW;
  const lista: Verificacao[] = [
    {
      codigo: "vocTempMin",
      formula: "Ns · Voc · [1 + βVoc·(Tmin − 25)] ≤ Vcc,max",
      substituicao: `${ns} · ${fmt(m.vocV)} · [1 + (${m.coefVocPctC}/100)·(${fmt(p.tempMinProjetoC, 1)} − 25)]`,
      valor: ns * vocMin,
      limite: inv.tensaoCcMaxV,
      comparador: "<=",
      unidade: "V",
      aprovado: ns * vocMin <= inv.tensaoCcMaxV,
      tipo: "bloqueante",
    },
    {
      codigo: "vmpTempMax",
      formula: "Ns · Vmp · [1 + βVmp·(Tcél,max − 25)] ≥ VMPPT,min",
      substituicao: `${ns} · ${fmt(m.vmpV)} · [1 + (${m.coefVmpPctC}/100)·(${fmt(p.tempMaxCelulaC, 1)} − 25)]`,
      valor: ns * vmpMax,
      limite: inv.mpptMinV,
      comparador: ">=",
      unidade: "V",
      aprovado: ns * vmpMax >= inv.mpptMinV,
      tipo: "bloqueante",
    },
    {
      codigo: "vmpTempMin",
      formula: "Ns · Vmp · [1 + βVmp·(Tmin − 25)] ≤ VMPPT,max",
      substituicao: `${ns} · ${fmt(m.vmpV)} · [1 + (${m.coefVmpPctC}/100)·(${fmt(p.tempMinProjetoC, 1)} − 25)]`,
      valor: ns * vmpMin,
      limite: inv.mpptMaxV,
      comparador: "<=",
      unidade: "V",
      aprovado: ns * vmpMin <= inv.mpptMaxV,
      tipo: "bloqueante",
    },
    {
      codigo: "correnteMppt",
      formula: "Np · Imp · [1 + αIsc·(Tcél,max − 25)] ≤ IMPPT,max",
      substituicao: `${maxStrings} · ${fmt(m.impA)} · [1 + (${m.coefIscPctC}/100)·(${fmt(p.tempMaxCelulaC, 1)} − 25)]`,
      valor: maxStrings * impQuente,
      limite: inv.correnteMaxMpptA,
      comparador: "<=",
      unidade: "A",
      aprovado: maxStrings * impQuente <= inv.correnteMaxMpptA,
      tipo: "bloqueante",
    },
    {
      codigo: "correnteCurtoMppt",
      formula: "Np · Isc · [1 + αIsc·(Tcél,max − 25)] · k ≤ Isc,MPPT,max",
      substituicao: `${maxStrings} · ${fmt(m.iscA)} · [1 + (${m.coefIscPctC}/100)·(${fmt(p.tempMaxCelulaC, 1)} − 25)] · ${p.fatorSegurancaCorrente}`,
      valor: maxStrings * iscQuente * p.fatorSegurancaCorrente,
      limite: inv.correnteCurtoMaxMpptA,
      comparador: "<=",
      unidade: "A",
      aprovado: maxStrings * iscQuente * p.fatorSegurancaCorrente <= inv.correnteCurtoMaxMpptA,
      tipo: "bloqueante",
    },
    {
      codigo: "relacaoCcCa",
      formula: "Pcc / Pca ∈ [mín; máx]",
      substituicao: `${fmt(potenciaCcW / 1000, 2)} kWp / ${fmt(potenciaCaW / 1000, 2)} kW`,
      valor: relacao,
      limite: relacao < p.faixaRelacaoCcCa[0] ? p.faixaRelacaoCcCa[0] : p.faixaRelacaoCcCa[1],
      comparador: relacao < p.faixaRelacaoCcCa[0] ? ">=" : "<=",
      unidade: "",
      aprovado: relacao >= p.faixaRelacaoCcCa[0] && relacao <= p.faixaRelacaoCcCa[1],
      tipo: "aviso",
    },
  ];
  if (p.areaDisponivelM2 !== undefined) {
    const areaNecessaria = (totalModulos(c) * areaModuloM2(m)) / p.fatorOcupacao;
    lista.push({
      codigo: "area",
      formula: "N · A_mód / f_ocupação ≤ A_disponível",
      substituicao: `${totalModulos(c)} · ${fmt(areaModuloM2(m), 3)} / ${p.fatorOcupacao}`,
      valor: areaNecessaria,
      limite: p.areaDisponivelM2,
      comparador: "<=",
      unidade: "m²",
      aprovado: areaNecessaria <= p.areaDisponivelM2,
      tipo: "bloqueante",
    });
  }
  return lista;
}

/** Faixa de módulos em série que atende às três verificações de tensão. */
export function faixaModulosEmSerie(m: Modulo, inv: Inversor, tempMinC: number, tempMaxCelulaC: number): [number, number] {
  const maxVcc = Math.floor(inv.tensaoCcMaxV / tensaoNaTemperatura(m.vocV, m.coefVocPctC, tempMinC));
  const maxMppt = Math.floor(inv.mpptMaxV / tensaoNaTemperatura(m.vmpV, m.coefVmpPctC, tempMinC));
  const min = Math.ceil(inv.mpptMinV / tensaoNaTemperatura(m.vmpV, m.coefVmpPctC, tempMaxCelulaC));
  return [min, Math.min(maxVcc, maxMppt)];
}

/**
 * Sugere uma configuração para aproximar a quantidade de módulos desejada:
 * escolhe o número de inversores pela relação CC/CA alvo, as strings por MPPT pelo limite de
 * corrente e o número de módulos em série dentro da faixa de tensão.
 */
export function sugerirConfiguracao(p: {
  modulo: Modulo;
  inversor: Inversor;
  modulosDesejados: number;
  tempMinProjetoC: number;
  tempMaxCelulaC: number;
  fatorSegurancaCorrente: number;
  relacaoCcCaAlvo: number;
}): ConfiguracaoArranjo | null {
  const { modulo: m, inversor: inv } = p;
  const [nsMin, nsMax] = faixaModulosEmSerie(m, inv, p.tempMinProjetoC, p.tempMaxCelulaC);
  if (nsMin > nsMax || nsMax < 1) return null;
  const fatorCorrente = 1 + (m.coefIscPctC / 100) * (p.tempMaxCelulaC - 25);
  const stringsMaxPorMppt = Math.max(
    0,
    Math.min(
      Math.floor(inv.correnteMaxMpptA / (m.impA * fatorCorrente)),
      Math.floor(inv.correnteCurtoMaxMpptA / (m.iscA * fatorCorrente * p.fatorSegurancaCorrente)),
    ),
  );
  if (stringsMaxPorMppt < 1) return null;
  const potenciaCcW = p.modulosDesejados * m.potenciaWp;
  const quantidadeInversores = Math.max(1, Math.round(potenciaCcW / (inv.potenciaCaW * p.relacaoCcCaAlvo)));
  const capacidadeStrings = quantidadeInversores * inv.numMppt * stringsMaxPorMppt;

  let melhor: ConfiguracaoArranjo | null = null;
  let melhorErro = Infinity;
  for (let ns = nsMin; ns <= nsMax; ns++) {
    const totalStrings = Math.max(1, Math.round(p.modulosDesejados / ns));
    if (totalStrings > capacidadeStrings) continue;
    // Distribui as strings de um inversor entre os MPPTs (todos os inversores iguais).
    const porInversor = Math.ceil(totalStrings / quantidadeInversores);
    if (porInversor > inv.numMppt * stringsMaxPorMppt) continue;
    const stringsPorMppt = Array.from({ length: inv.numMppt }, (_, k) =>
      Math.floor(porInversor / inv.numMppt) + (k < porInversor % inv.numMppt ? 1 : 0),
    );
    const total = ns * porInversor * quantidadeInversores;
    const erro = Math.abs(total - p.modulosDesejados);
    if (erro < melhorErro) {
      melhorErro = erro;
      melhor = { modulosEmSerie: ns, stringsPorMppt, quantidadeInversores };
    }
  }
  return melhor;
}

/**
 * Escolha automática do inversor no catálogo: entre os modelos com configuração válida, prefere a
 * relação CC/CA mais próxima do alvo, penalizando levemente cada inversor adicional.
 */
export function escolherInversor(
  inversores: Inversor[],
  p: Omit<Parameters<typeof sugerirConfiguracao>[0], "inversor">,
): { inversor: Inversor; configuracao: ConfiguracaoArranjo } | null {
  let melhor: { inversor: Inversor; configuracao: ConfiguracaoArranjo } | null = null;
  let melhorPontuacao = Infinity;
  for (const inversor of inversores) {
    const configuracao = sugerirConfiguracao({ ...p, inversor });
    if (!configuracao) continue;
    const relacao = (totalModulos(configuracao) * p.modulo.potenciaWp) / (configuracao.quantidadeInversores * inversor.potenciaCaW);
    const pontuacao =
      Math.abs(relacao - p.relacaoCcCaAlvo) +
      0.04 * (configuracao.quantidadeInversores - 1) +
      Math.abs(totalModulos(configuracao) - p.modulosDesejados) / Math.max(1, p.modulosDesejados);
    if (pontuacao < melhorPontuacao) {
      melhorPontuacao = pontuacao;
      melhor = { inversor, configuracao };
    }
  }
  return melhor;
}
