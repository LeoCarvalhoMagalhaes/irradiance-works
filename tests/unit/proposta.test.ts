import { describe, expect, it } from "vitest";
import { calcularProposta, entradaPadrao } from "@/core/simulador/proposta";
import { PREMISSAS_PADRAO, TRIBUTOS_EXEMPLO } from "@/core/simulador/premissas";

describe("proposta completa (simulador)", () => {
  const entrada = entradaPadrao("2026-10-26", PREMISSAS_PADRAO, TRIBUTOS_EXEMPLO);

  it("dimensiona por energia, passa nas verificações e fica coerente", () => {
    const inicio = performance.now();
    const p = calcularProposta(entrada);
    const duracao = performance.now() - inicio;
    expect(duracao).toBeLessThan(8000);
    expect(p.verificacoes.filter((v) => v.tipo === "bloqueante").every((v) => v.aprovado)).toBe(true);
    expect(p.simulacao.performanceRatio).toBeGreaterThan(0.7);
    expect(p.simulacao.performanceRatio).toBeLessThan(0.86);
    // Cobertura de energia próxima de 100 % do consumo líquido do custo de disponibilidade.
    const consumo = entrada.consumoMensalKWh.reduce((a, b) => a + b, 0);
    const alvo = consumo - 12 * 50;
    expect(Math.abs(p.projecao.anos[0].geracaoKWh / alvo - 1)).toBeLessThan(0.12);
    expect(p.enquadramento.porte).toBe("micro");
    expect(p.enquadramento.categoria).toBe("GD2");
    expect(p.projecao.anos).toHaveLength(25);
    expect(p.financeiro.cenarios).toHaveLength(3);
    // A fatura residual mínima é positiva: cobrir 100 % da energia não zera a fatura (Lei 14.300).
    expect(p.dimensionamento.faturaResidualMinimaAno1R).toBeGreaterThan(0);
    expect(p.dimensionamento.coberturaMaximaValorPct).toBeLessThan(100);
    const c = p.simulacao.cascata;
    expect(c.entregueKWh).toBeCloseTo(p.simulacao.energiaAnualKWh, 6);
  });

  it("dimensiona por valor e respeita a cobertura máxima possível", () => {
    const p = calcularProposta({ ...entrada, dimensionamento: { modo: "valor", coberturaPct: 99 } });
    expect(p.avisos.some((a) => a.codigo === "coberturaAcimaMaxima")).toBe(true);
    const meio = calcularProposta({ ...entrada, dimensionamento: { modo: "valor", coberturaPct: 50 } });
    // Discretização em módulos inteiros: tolerância de 8 pontos percentuais.
    expect(Math.abs(meio.dimensionamento.coberturaAlcancadaValorPct - 50)).toBeLessThan(8);
  });

  it("é determinística", () => {
    const a = calcularProposta(entrada);
    const b = calcularProposta(entrada);
    expect(a.simulacao.geracaoMensalKWh).toEqual(b.simulacao.geracaoMensalKWh);
    expect(a.financeiro.cenarios[0].vplR).toBe(b.financeiro.cenarios[0].vplR);
  });
});
