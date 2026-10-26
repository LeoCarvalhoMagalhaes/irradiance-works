import { describe, expect, it } from "vitest";
import ref from "../fixtures/pvlib-referencia.json";
import irradiacao from "@/data/irradiacao.json";
import { gerarAnoTipico, gerarClimaMes, type SerieClima } from "@/core/solar/clima";
import { posicaoSolar } from "@/core/solar/geometria";
import { simularSerie } from "@/core/solar/simulacao";

describe("cadeia horária completa × pvlib (ano de 8.760 h)", () => {
  const cadeia = ref.cadeiaHoraria;
  const n = cadeia.entradas.ghiWM2.length;
  const inicio = Date.parse("2025-01-01T00:00:00Z");
  const zen = new Float64Array(n);
  const az = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const p = posicaoSolar(inicio + (i + 0.5) * 3_600_000, cadeia.local.lat, cadeia.local.lon);
    zen[i] = p.zenitalGraus;
    az[i] = p.azimuteGraus;
  }
  const clima: SerieClima = {
    inicioUtcMs: inicio,
    passoMin: 60,
    ghiWM2: Float64Array.from(cadeia.entradas.ghiWM2),
    tempArC: Float64Array.from(cadeia.entradas.tempArC),
    zenitalGraus: zen,
    azimuteSolGraus: az,
    dias: [],
  };
  const p = cadeia.parametros;
  // A fixture aplica sujidade 3 %, mismatch 2 % e cabos CC 1,5 % como fator único sobre a potência CC.
  const r = simularSerie(clima, {
    inclinacaoGraus: p.inclinacaoGraus,
    azimuteGraus: p.azimuteGraus,
    albedo: p.albedo,
    modeloTransposicao: "hayDavies",
    potenciaCcW: p.potenciaCcW,
    potenciaCaW: p.potenciaCaW,
    etaInversor: p.etaInversor,
    noctC: p.noctC,
    gammaPorC: p.gamma,
    perdas: { sujidadePct: 3, sombreamentoPct: 0, mismatchPct: 2, cabosCcPct: 1.5, cabosCaPct: 0, disponibilidadePct: 100 },
  });

  // Tolerância de 0,3 %: a única diferença de modelo é a posição solar (NOAA × SPA, < 0,05°).
  it("irradiação anual no plano", () => {
    expect(Math.abs(r.irradiacaoPoaKWhM2 / cadeia.resultado.irradiacaoPoaKWhM2 - 1)).toBeLessThan(0.003);
  });
  it("energia CC anual", () => {
    expect(Math.abs(r.energiaCcKWh / cadeia.resultado.energiaCcKWh - 1)).toBeLessThan(0.003);
  });
  it("energia CA anual e mensal", () => {
    expect(Math.abs(r.energiaCaKWh / cadeia.resultado.energiaCaKWh - 1)).toBeLessThan(0.003);
    const mensal = new Array(12).fill(0);
    r.potenciaCaW.forEach((w, i) => (mensal[new Date(inicio + (i + 0.5) * 3_600_000).getUTCMonth()] += w / 1000));
    mensal.forEach((v, m) => expect(Math.abs(v / cadeia.resultado.energiaCaMensalKWh[m] - 1)).toBeLessThan(0.005));
  });
  it("a cascata de perdas fecha com a energia entregue", () => {
    const c = r.cascata;
    const soma =
      c.referenciaHorizontalKWh + c.transposicaoKWh + c.sujidadeKWh + c.sombreamentoKWh + c.temperaturaKWh + c.mismatchKWh +
      c.cabosCcKWh + c.inversorKWh + c.clippingKWh + c.cabosCaKWh + c.disponibilidadeKWh;
    expect(soma).toBeCloseTo(c.entregueKWh, 6);
  });
});

describe("gerador climático sintético", () => {
  const cidades = irradiacao.cidades;
  const amostra = [cidades.find((c) => c.nome === "São Paulo")!, cidades.find((c) => c.nome === "Porto Alegre")!, cidades.find((c) => c.nome === "Petrolina")!];

  it.each(amostra)("calibração mensal da GHI em $nome (tolerância 1 %)", (cidade) => {
    for (const passoMin of [60, 5]) {
      const ano = gerarAnoTipico(cidade, passoMin, `teste|${cidade.id}`);
      for (let m = 0; m < 12; m++) {
        const dias = ano.dias.filter((d) => Number(d.chave.slice(5, 7)) === m + 1);
        const media = dias.reduce((s, d) => s + d.irradiacaoKWhM2, 0) / dias.length;
        expect(Math.abs(media / cidade.ghiKWhM2Dia[m] - 1)).toBeLessThan(0.01);
      }
    }
  });

  it("determinismo: mesma semente → mesma série; semente diferente → série diferente", () => {
    const c = amostra[0];
    const a = gerarClimaMes({ climatologia: c, ano: 2026, mes: 3, passoMin: 5, semente: "x" });
    const b = gerarClimaMes({ climatologia: c, ano: 2026, mes: 3, passoMin: 5, semente: "x" });
    const d = gerarClimaMes({ climatologia: c, ano: 2026, mes: 3, passoMin: 5, semente: "y" });
    expect(Array.from(a.ghiWM2)).toEqual(Array.from(b.ghiWM2));
    expect(Array.from(a.tempArC)).toEqual(Array.from(b.tempArC));
    expect(Array.from(a.ghiWM2)).not.toEqual(Array.from(d.ghiWM2));
  });

  it("temperatura média mensal próxima da climatologia (±1 °C)", () => {
    const c = amostra[0];
    const ano = gerarAnoTipico(c, 60, "temp");
    let i = 0;
    for (let m = 0; m < 12; m++) {
      const horas = ano.dias.filter((d) => Number(d.chave.slice(5, 7)) === m + 1).length * 24;
      let soma = 0;
      for (let k = 0; k < horas; k++) soma += ano.tempArC[i++];
      expect(Math.abs(soma / horas - c.tempMediaC[m])).toBeLessThan(1);
    }
  });
});
