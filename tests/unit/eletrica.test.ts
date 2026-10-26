/**
 * Verificação de strings: casos aprovados e reprovados para cada critério.
 * Valores de referência calculados à mão a partir das fórmulas documentadas.
 */
import { describe, expect, it } from "vitest";
import type { Inversor, Modulo } from "@/core/eletrica/equipamentos";
import { faixaModulosEmSerie, sugerirConfiguracao, tensaoNaTemperatura, verificarArranjo } from "@/core/eletrica/strings";

const modulo: Modulo = {
  id: "t", nome: "teste", potenciaWp: 500, vocV: 50, vmpV: 42, iscA: 12, impA: 11.5,
  coefVocPctC: -0.3, coefVmpPctC: -0.4, coefIscPctC: 0.05, coefPotenciaPctC: -0.35, noctC: 45, comprimentoM: 2, larguraM: 1,
};
const inversor: Inversor = {
  id: "i", nome: "inv", potenciaCaW: 5000, tensaoCcMaxV: 600, mpptMinV: 120, mpptMaxV: 550,
  correnteMaxMpptA: 16, correnteCurtoMaxMpptA: 20, numMppt: 2, etaNominal: 0.97, fases: 1,
};
const base = {
  modulo, inversor, tempMinProjetoC: 0, tempMaxCelulaC: 70, fatorSegurancaCorrente: 1.25,
  faixaRelacaoCcCa: [1, 1.35] as [number, number], fatorOcupacao: 0.8,
};
const verificacao = (codigo: string, ns: number, strings: number[], extra: Partial<typeof base> & { areaDisponivelM2?: number } = {}) =>
  verificarArranjo({ ...base, ...extra, configuracao: { modulosEmSerie: ns, stringsPorMppt: strings, quantidadeInversores: 1 } }).find(
    (v) => v.codigo === codigo,
  )!;

describe("tensões corrigidas pela temperatura", () => {
  it("Voc a 0 °C: 50·[1 − 0,003·(0 − 25)] = 53,75 V", () => {
    expect(tensaoNaTemperatura(50, -0.3, 0)).toBeCloseTo(53.75, 12);
  });
  it("Vmp a 70 °C: 42·[1 − 0,004·45] = 34,44 V", () => {
    expect(tensaoNaTemperatura(42, -0.4, 70)).toBeCloseTo(34.44, 12);
  });
});

describe("Voc na temperatura mínima ≤ Vcc,máx", () => {
  it("11 módulos: 591,25 V ≤ 600 V → aprovado", () => {
    const v = verificacao("vocTempMin", 11, [1, 1]);
    expect(v.valor).toBeCloseTo(591.25, 9);
    expect(v.aprovado).toBe(true);
  });
  it("12 módulos: 645 V > 600 V → reprovado", () => {
    expect(verificacao("vocTempMin", 12, [1, 1]).aprovado).toBe(false);
  });
});

describe("Vmp na temperatura máxima de célula ≥ VMPPT,mín", () => {
  it("4 módulos: 137,76 V ≥ 120 V → aprovado", () => {
    expect(verificacao("vmpTempMax", 4, [1, 1]).valor).toBeCloseTo(137.76, 9);
    expect(verificacao("vmpTempMax", 4, [1, 1]).aprovado).toBe(true);
  });
  it("3 módulos: 103,32 V < 120 V → reprovado", () => {
    expect(verificacao("vmpTempMax", 3, [1, 1]).aprovado).toBe(false);
  });
});

describe("Vmp na temperatura mínima ≤ VMPPT,máx", () => {
  // Vmp(0 °C) = 42·1,1 = 46,2 V.
  it("11 módulos: 508,2 V ≤ 550 V → aprovado", () => {
    expect(verificacao("vmpTempMin", 11, [1, 1]).valor).toBeCloseTo(508.2, 9);
    expect(verificacao("vmpTempMin", 11, [1, 1]).aprovado).toBe(true);
  });
  it("12 módulos: 554,4 V > 550 V → reprovado", () => {
    expect(verificacao("vmpTempMin", 12, [1, 1]).aprovado).toBe(false);
  });
});

describe("correntes por MPPT", () => {
  // Fator térmico: 1 + 0,0005·(70 − 25) = 1,0225.
  it("operação: 1 string → Imp = 11,5·1,0225 = 11,75875 A ≤ 16 A → aprovado", () => {
    expect(verificacao("correnteMppt", 10, [1, 1]).valor).toBeCloseTo(11.75875, 9);
    expect(verificacao("correnteMppt", 10, [1, 1]).aprovado).toBe(true);
  });
  it("operação: 2 strings no mesmo MPPT → 23,5175 A > 16 A → reprovado", () => {
    expect(verificacao("correnteMppt", 10, [2, 0]).aprovado).toBe(false);
  });
  it("curto-circuito: 1 string → 12·1,0225·1,25 = 15,3375 A ≤ 20 A → aprovado", () => {
    expect(verificacao("correnteCurtoMppt", 10, [1, 1]).valor).toBeCloseTo(15.3375, 9);
    expect(verificacao("correnteCurtoMppt", 10, [1, 1]).aprovado).toBe(true);
  });
  it("curto-circuito: 2 strings → 30,675 A > 20 A → reprovado", () => {
    expect(verificacao("correnteCurtoMppt", 10, [2, 0]).valor).toBeCloseTo(30.675, 9);
    expect(verificacao("correnteCurtoMppt", 10, [2, 0]).aprovado).toBe(false);
  });
});

describe("relação CC/CA e área", () => {
  it("20 módulos de 500 Wp em 5 kW = 2,0 → fora da faixa (aviso, não bloqueante)", () => {
    const v = verificacao("relacaoCcCa", 10, [1, 1]);
    expect(v.valor).toBeCloseTo(2, 12);
    expect(v.aprovado).toBe(false);
    expect(v.tipo).toBe("aviso");
  });
  it("área: 20·2 m² / 0,8 = 50 m²", () => {
    expect(verificacao("area", 10, [1, 1], { areaDisponivelM2: 50 }).aprovado).toBe(true);
    expect(verificacao("area", 10, [1, 1], { areaDisponivelM2: 49 }).aprovado).toBe(false);
  });
});

describe("sugestão de configuração", () => {
  it("faixa de módulos em série respeita as três tensões", () => {
    expect(faixaModulosEmSerie(modulo, inversor, 0, 70)).toEqual([4, 11]);
  });
  it("a configuração sugerida passa em todas as verificações bloqueantes", () => {
    const c = sugerirConfiguracao({
      modulo, inversor, modulosDesejados: 12, tempMinProjetoC: 0, tempMaxCelulaC: 70, fatorSegurancaCorrente: 1.25, relacaoCcCaAlvo: 1.2,
    })!;
    expect(c).not.toBeNull();
    const lista = verificarArranjo({ ...base, configuracao: c });
    expect(lista.filter((v) => v.tipo === "bloqueante").every((v) => v.aprovado)).toBe(true);
  });
});
