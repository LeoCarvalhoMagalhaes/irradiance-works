import { describe, expect, it } from "vitest";
import tarifas from "@/data/tarifas.json";
import { enquadrar } from "@/core/regulacao/enquadramento";
import { custoDisponibilidadeKWh, faturarMes } from "@/core/regulacao/faturamento";
import { decomporTarifa, fatorTributos, percentualFioB, tarifaSobreCompensada } from "@/core/regulacao/tarifa";

describe("custo de disponibilidade (REN 1.000, art. 291)", () => {
  it.each([
    ["monofasico", 30],
    ["bifasico2", 30],
    ["bifasico3", 50],
    ["trifasico", 100],
  ] as const)("%s → %i kWh", (ligacao, kwh) => {
    expect(custoDisponibilidadeKWh(ligacao)).toBe(kwh);
  });
  it("redução de 50 % para CadÚnico (art. 291, parágrafo único)", () => {
    expect(custoDisponibilidadeKWh("trifasico", true)).toBe(50);
  });
});

describe("cronograma do Fio B (Lei 14.300, art. 27)", () => {
  it.each([
    [2022, 0], [2023, 15], [2024, 30], [2025, 45], [2026, 60], [2027, 75], [2028, 90],
  ])("%i → %i %%", (ano, pct) => {
    expect(percentualFioB(ano)).toBe(pct);
  });
});

describe("enquadramento", () => {
  const base = { despachavel: false, modalidade: "autoconsumoLocal" as const };
  it("microgeração até 75 kW CA", () => {
    expect(enquadrar({ ...base, potenciaCaKW: 75, dataProtocolo: "2026-05-01" }).porte).toBe("micro");
    expect(enquadrar({ ...base, potenciaCaKW: 75.1, dataProtocolo: "2026-05-01" }).porte).toBe("mini");
  });
  it("minigeração não despachável até 3 MW; acima disso, fora do SCEE", () => {
    expect(enquadrar({ ...base, potenciaCaKW: 3000, dataProtocolo: "2026-05-01" }).porte).toBe("mini");
    const fora = enquadrar({ ...base, potenciaCaKW: 3001, dataProtocolo: "2026-05-01" });
    expect(fora.porte).toBe("foraScee");
    expect(fora.categoria).toBeNull();
  });
  it("unidade do art. 26 mantém 5 MW até 2045", () => {
    expect(enquadrar({ ...base, potenciaCaKW: 4500, dataProtocolo: "2022-06-01" }).porte).toBe("mini");
  });
  it("usina de 30 MW (SCADA) fica fora do sistema de compensação", () => {
    expect(enquadrar({ ...base, potenciaCaKW: 30000, dataProtocolo: "2020-01-01" }).porte).toBe("foraScee");
  });
  it("GD I com protocolo até 07/01/2023; regra do art. 17 só após 2045", () => {
    const r = enquadrar({ ...base, potenciaCaKW: 10, dataProtocolo: "2023-01-07" });
    expect(r.categoria).toBe("GD1");
    expect(r.anoRegraArt17).toBe(2046);
  });
  it("GD II com protocolo na janela de 08/01 a 07/07/2023 vai para o art. 17 em 2031", () => {
    expect(enquadrar({ ...base, potenciaCaKW: 10, dataProtocolo: "2023-01-08" }).anoRegraArt17).toBe(2031);
    expect(enquadrar({ ...base, potenciaCaKW: 10, dataProtocolo: "2023-07-07" }).anoRegraArt17).toBe(2031);
    expect(enquadrar({ ...base, potenciaCaKW: 10, dataProtocolo: "2023-07-08" }).anoRegraArt17).toBe(2029);
  });
  it("GD III: > 500 kW, autoconsumo remoto ou compartilhada com beneficiário ≥ 25 %", () => {
    expect(enquadrar({ ...base, potenciaCaKW: 900, dataProtocolo: "2024-03-01", modalidade: "autoconsumoRemoto" }).categoria).toBe("GD3");
    expect(enquadrar({ ...base, potenciaCaKW: 900, dataProtocolo: "2024-03-01", modalidade: "geracaoCompartilhada", maiorParticipacaoPct: 25 }).categoria).toBe("GD3");
    expect(enquadrar({ ...base, potenciaCaKW: 900, dataProtocolo: "2024-03-01", modalidade: "geracaoCompartilhada", maiorParticipacaoPct: 24 }).categoria).toBe("GD2");
    expect(enquadrar({ ...base, potenciaCaKW: 900, dataProtocolo: "2024-03-01" }).categoria).toBe("GD2");
    expect(enquadrar({ ...base, potenciaCaKW: 500, dataProtocolo: "2024-03-01", modalidade: "autoconsumoRemoto" }).categoria).toBe("GD2");
  });
});

describe("decomposição tarifária (dados abertos ANEEL)", () => {
  it.each(tarifas.distribuidoras.flatMap((d) => (["B1", "B2", "B3"] as const).map((s) => [d.sigla, s, d] as const)))(
    "%s %s: grupos fecham com os totais homologados",
    (_sigla, sub, d) => {
      const c = d.subgrupos[sub].componentesRMWh as Record<string, number>;
      const t = decomporTarifa(c);
      expect(t.teEnergia + t.teTransporte + t.teEncargos + t.teOutros).toBeCloseTo(c.TE / 1000, 9);
      expect(t.tusdFioA + t.tusdFioB + t.tusdEncargos + t.tusdPerdas + t.tusdOutros).toBeCloseTo(c.TUSD / 1000, 9);
      expect(t.tusdFioB).toBeCloseTo(c.TUSD_FioB / 1000, 9);
      // Resíduo não mapeado deve ser desprezível (< 0,5 % do total).
      expect(Math.abs(t.teOutros)).toBeLessThan(0.005 * t.totalTe);
      expect(Math.abs(t.tusdOutros)).toBeLessThan(0.005 * t.totalTusd);
    },
  );
  it("tributos por dentro", () => {
    expect(fatorTributos({ icmsPct: 18, pisPct: 1, cofinsPct: 4.5 })).toBeCloseTo(1 / 0.765, 12);
  });
  it("valor sobre a energia compensada por categoria e ano", () => {
    const t = decomporTarifa(tarifas.distribuidoras[1].subgrupos.B1.componentesRMWh as Record<string, number>);
    const gd2 = { categoria: "GD2" as const, anoRegraArt17: 2029, cenarioPos2029: "fioB100" as const, beneficioPctTusd: 25 };
    expect(tarifaSobreCompensada(t, gd2, 2026).valorRKWh).toBeCloseTo(0.6 * t.tusdFioB, 12);
    expect(tarifaSobreCompensada(t, gd2, 2028).valorRKWh).toBeCloseTo(0.9 * t.tusdFioB, 12);
    expect(tarifaSobreCompensada(t, gd2, 2029).valorRKWh).toBeCloseTo(t.tusdFioB, 12);
    expect(tarifaSobreCompensada(t, { ...gd2, cenarioPos2029: "somenteTe" }, 2030).valorRKWh).toBeCloseTo(t.totalTusd, 12);
    expect(tarifaSobreCompensada(t, { ...gd2, cenarioPos2029: "teMaisBeneficios" }, 2030).valorRKWh).toBeCloseTo(0.75 * t.totalTusd, 12);
    expect(tarifaSobreCompensada(t, { ...gd2, categoria: "GD1", anoRegraArt17: 2046 }, 2040).valorRKWh).toBe(0);
    const gd3 = tarifaSobreCompensada(t, { ...gd2, categoria: "GD3" }, 2027).valorRKWh;
    expect(gd3).toBeCloseTo(t.tusdFioB + 0.4 * t.tusdTransmissao + t.pedEeTfsee, 12);
  });
});

describe("faturamento mensal (REN 1.000, art. 655-I)", () => {
  const base = { mesIndice: 2026 * 12, creditos: [], custoDisponibilidadeKWh: 50, tarifaCheiaRKWh: 1.0, tarifaCompensadaRKWh: 0.2 };

  it("compensa até a fatura igualar o custo de disponibilidade; excedente vira crédito", () => {
    // R = 400 kWh, I = 500 kWh. Limite: (400·1 − 50)/(1 − 0,2) = 437,5 > R → compensa 400.
    const r = faturarMes({ ...base, consumoRedeKWh: 400, injetadaKWh: 500 });
    expect(r.energiaCompensadaKWh).toBeCloseTo(400, 9);
    expect(r.faturaR).toBeCloseTo(Math.max(50, 400 * 0.2), 9); // 80
    expect(r.creditosGeradosKWh).toBeCloseTo(100, 9);
  });

  it("aplica o custo de disponibilidade quando a parcela calculada é menor", () => {
    // R = 100, limite = (100 − 50)/0,8 = 62,5 → fatura = 37,5·1 + 62,5·0,2 = 50 = CD.
    const r = faturarMes({ ...base, consumoRedeKWh: 100, injetadaKWh: 300 });
    expect(r.energiaCompensadaKWh).toBeCloseTo(62.5, 9);
    expect(r.faturaR).toBeCloseTo(50, 9);
    expect(r.creditosGeradosKWh).toBeCloseTo(237.5, 9);
  });

  it("usa a injeção do mês antes dos créditos e os créditos mais antigos primeiro", () => {
    const creditos = [
      { mesOrigem: base.mesIndice - 3, kWh: 40 },
      { mesOrigem: base.mesIndice - 10, kWh: 30 },
    ];
    const r = faturarMes({ ...base, consumoRedeKWh: 400, injetadaKWh: 340, creditos });
    expect(r.compensadaDaInjecaoKWh).toBeCloseTo(340, 9);
    expect(r.compensadaDeCreditosKWh).toBeCloseTo(60, 9);
    // O lote mais antigo (−10) é consumido inteiro; sobram 10 kWh do lote de −3.
    expect(r.creditos).toEqual([{ mesOrigem: base.mesIndice - 3, kWh: 10 }]);
  });

  it("créditos expiram após 60 meses", () => {
    const creditos = [
      { mesOrigem: base.mesIndice - 60, kWh: 100 },
      { mesOrigem: base.mesIndice - 59, kWh: 20 },
    ];
    const r = faturarMes({ ...base, consumoRedeKWh: 0, injetadaKWh: 0, creditos });
    expect(r.creditosExpiradosKWh).toBe(100);
    expect(r.saldoCreditosKWh).toBe(20);
    expect(r.faturaR).toBeCloseTo(50, 9);
  });

  it("GD I: tarifa compensada nula, paga apenas o custo de disponibilidade", () => {
    const r = faturarMes({ ...base, tarifaCompensadaRKWh: 0, consumoRedeKWh: 300, injetadaKWh: 400 });
    expect(r.energiaCompensadaKWh).toBeCloseTo(250, 9);
    expect(r.faturaR).toBeCloseTo(50, 9);
  });
});
