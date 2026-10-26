import { describe, expect, it } from "vitest";
import ref from "../fixtures/pvlib-referencia.json";
import paridade from "../fixtures/paridade-planilha.json";
import { calcularCenarios } from "@/core/financeiro/cenarios";
import { lcoe, paybackDescontado, paybackSimples, tabelaPrice, tir, vpl } from "@/core/financeiro/indicadores";
import { decomporTarifa } from "@/core/regulacao/tarifa";
import { projetar } from "@/core/simulador/projecao";

describe("indicadores × referência independente (Python/scipy)", () => {
  it.each(ref.financeiro.fluxos.map((c, i) => [i, c] as const))("fluxo %i", (_i, c) => {
    expect(vpl(c.fluxos, c.taxaDesconto)).toBeCloseTo(c.vpl, 6);
    const r = tir(c.fluxos);
    if (c.tir === null) expect(r.tir).toBeNull();
    else expect(r.tir!).toBeCloseTo(c.tir, 8);
    if (c.paybackAnos === null) expect(paybackSimples(c.fluxos)).toBeNull();
    else expect(paybackSimples(c.fluxos)!).toBeCloseTo(c.paybackAnos, 9);
    if (c.paybackDescontadoAnos === null) expect(paybackDescontado(c.fluxos, c.taxaDesconto)).toBeNull();
    else expect(paybackDescontado(c.fluxos, c.taxaDesconto)!).toBeCloseTo(c.paybackDescontadoAnos, 9);
  });

  it.each(ref.financeiro.price)("Price P=$principal i=$taxaMensal n=$meses", (c) => {
    const r = tabelaPrice(c.principal, c.taxaMensal, c.meses);
    expect(r.parcela).toBeCloseTo(c.parcela, 8);
    expect(r.jurosTotais).toBeCloseTo(c.jurosTotais, 6);
    expect(r.linhas[r.linhas.length - 1].saldo).toBeCloseTo(0, 6);
  });

  it("TIR com múltiplas raízes é sinalizada", () => {
    // Fluxo não convencional com raízes em 10 % e 20 %: (−1)(1,1)(1,2) expandido.
    const r = tir([-100, 230, -132]);
    expect(r.situacao).toBe("multiplas");
    expect(r.raizes.map((x) => Math.round(x * 1000) / 1000)).toEqual([0.1, 0.2]);
  });

  it("TIR inexistente quando o fluxo nunca muda de sinal", () => {
    expect(tir([-100, -10, -5]).situacao).toBe("nenhuma");
  });

  it("LCOE: custo constante e energia constante", () => {
    // Sem desconto: (1000 + 10·100) / (10·500) = 0,4 R$/kWh.
    expect(lcoe([1000, ...new Array(10).fill(100)], [0, ...new Array(10).fill(500)], 0)).toBeCloseTo(0.4, 12);
  });
});

describe("paridade com a planilha de referência (faturamento + fluxo de caixa)", () => {
  it.each(paridade.casos.map((c) => [c.nome, c] as const))("%s", (_nome, caso) => {
    const p = caso.parametros;
    const fioB = p.fioB * 1000;
    const tarifa = decomporTarifa({ TE: p.te * 1000, TUSD: p.tusd * 1000, TUSD_FioB: fioB, TE_ENERGIA: p.te * 1000 });
    const proj = projetar({
      cargaHorariaKWh: Float64Array.from(caso.cargaHorariaKWh),
      geracaoHorariaKWh: Float64Array.from(caso.geracaoHorariaKWh),
      anoInicio: p.anoInicio,
      mesInicio: p.mesInicio,
      horizonteAnos: p.horizonte,
      degradacaoPrimeiroAnoPct: p.degPrimeiro,
      degradacaoAnualPct: p.degAnual,
      reajusteTarifaAnualPct: p.reajuste,
      tarifa,
      tributos: { icmsPct: p.icms, pisPct: p.pis, cofinsPct: p.cofins },
      ligacao: "bifasico3",
      cadUnico: false,
      regra: { categoria: p.categoria as "GD1" | "GD2", anoRegraArt17: p.anoArt17, cenarioPos2029: "fioB100", beneficioPctTusd: 25 },
    });
    proj.anos.forEach((a, i) => {
      expect(a.economiaR).toBeCloseTo(caso.anos[i].economiaR, 4);
      expect(a.creditosExpiradosKWh).toBeCloseTo(caso.anos[i].creditosExpiradosKWh, 4);
      expect(a.geracaoKWh).toBeCloseTo(caso.anos[i].geracaoKWh, 4);
    });
    const { cenarios } = calcularCenarios({
      economiaAnualR: proj.anos.map((a) => a.economiaR),
      economiaMensalAno1R: [],
      geracaoAnualKWh: proj.anos.map((a) => a.geracaoKWh),
      premissas: {
        investimentoR: p.investimento,
        omAnualPctInvestimento: p.omPct,
        reajusteOmAnualPct: p.omReajuste,
        trocaInversorAno: p.trocaAno,
        trocaInversorCustoR: p.trocaCusto,
        taxaDescontoAnualPct: p.taxaDesconto,
        financiamento: { entradaPct: 0, taxaMensalPct: 1.5, meses: 60 },
        custoMaisTaxa: { custoEquipamentosR: 20000, taxaPctEconomia: 30, meses: 36 },
      },
    });
    const aVista = cenarios[0];
    expect(aVista.vplR).toBeCloseTo(caso.aVista.vpl, 3);
    expect(aVista.tir.tir!).toBeCloseTo(caso.aVista.tir!, 7);
    expect(aVista.paybackAnos!).toBeCloseTo(caso.aVista.payback!, 7);
    expect(aVista.paybackDescontadoAnos!).toBeCloseTo(caso.aVista.paybackDescontado!, 7);
  });
});
