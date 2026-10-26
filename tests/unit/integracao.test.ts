import { describe, expect, it } from "vitest";
import { analisarUsinas } from "@/core/monitoramento/analise";
import { frotaDemonstracao } from "@/core/monitoramento/frota";
import { prometidoVsReal, usinaDeProposta } from "@/core/integracao/comissionamento";
import { calcularProposta, entradaPadrao } from "@/core/simulador/proposta";
import { PREMISSAS_PADRAO, TRIBUTOS_EXEMPLO } from "@/core/simulador/premissas";

describe("comissionamento e prometido × real", () => {
  const hoje = "2026-10-26";
  const entrada = { ...entradaPadrao(hoje, PREMISSAS_PADRAO, TRIBUTOS_EXEMPLO), cidadeId: "3509502", consumoMensalKWh: new Array(12).fill(900) };
  const proposta = calcularProposta(entrada);
  const usina = usinaDeProposta(
    proposta,
    { id: "UFV-C01", nome: "Teste", propostaId: "P-1", entrada, dataComissionamento: "2026-04-26", falhasDemo: [{ tipo: "sujidade", inicio: "2026-08-20" }], criadoEm: hoje },
    hoje,
  );

  it("a usina comissionada herda arranjo, potência e local da proposta", () => {
    expect(usina.potenciaCcW / 1000).toBeCloseTo(proposta.arranjo.potenciaCcKWp, 6);
    expect(usina.cidade.id).toBe("3509502");
    expect(usina.propostaId).toBe("P-1");
    expect(usina.geracaoPrometidaMensalKWh).toHaveLength(12);
  });

  it("monitoramento com vizinhas da frota, desvio coerente e perda atribuída à sujidade", () => {
    const vizinhas = frotaDemonstracao().filter((u) => u.cidade.id === usina.cidade.id);
    const r = analisarUsinas([...vizinhas, usina], { hoje, agoraUtcMs: Date.parse("2026-10-26T18:00:00Z"), eventos: [] });
    const resultado = r.usinas.find((u) => u.usinaId === "UFV-C01")!;
    expect(resultado.agregados[0].chave).toBe("2026-04-26");
    expect(resultado.alertas.some((a) => a.tipo === "sujidade")).toBe(true);
    const pr = prometidoVsReal(usina, resultado.agregados, resultado.alertas, PREMISSAS_PADRAO.tecnicas.degradacaoAnualPct);
    expect(pr.meses.length).toBeGreaterThanOrEqual(6);
    // Prometido usa o ano típico com perdas de projeto; a diferença fica dentro de ±15 %.
    expect(Math.abs(pr.acumulado.desvioPct)).toBeLessThan(15);
    const outubro = pr.meses.find((m) => m.mes === "2026-10")!;
    expect(outubro.perdasOperacionaisKWh).toBeGreaterThan(0);
    for (const m of pr.meses) expect(m.prometidoKWh + m.efeitoClimaKWh - m.perdasOperacionaisKWh + m.naoExplicadoKWh).toBeCloseTo(m.medidoKWh, 6);
  });
});
