/**
 * Validação do modelo solar contra a pvlib-python (fixtures em tests/fixtures/pvlib-referencia.json,
 * geradas por scripts/referencia/gerar_fixtures.py).
 */
import { describe, expect, it } from "vitest";
import ref from "../fixtures/pvlib-referencia.json";
import { irradianciaExtraterrestreWM2, posicaoSolar } from "@/core/solar/geometria";
import { decomporErbs, ghiCeuClaroHaurwitzWM2, transpor } from "@/core/solar/irradiancia";
import { inversorPvwatts, potenciaCcPvwattsW, temperaturaCelulaNoctC } from "@/core/solar/potencia";

const diferencaAngular = (a: number, b: number) => Math.abs(((a - b + 540) % 360) - 180);

describe("posição solar (NOAA × SPA/pvlib)", () => {
  it.each(ref.posicaoSolar)("$instanteUtc em ($latitude, $longitude)", (caso) => {
    const p = posicaoSolar(Date.parse(caso.instanteUtc), caso.latitude, caso.longitude);
    // Tolerância de 0,05°: diferença esperada entre o algoritmo NOAA e o SPA.
    expect(Math.abs(p.zenitalGraus - caso.zenitalGraus)).toBeLessThan(0.05);
    // Para o azimute, compara-se o deslocamento sobre a esfera (Δaz·sen Z): perto do zênite o
    // azimute é mal condicionado e uma diferença de posição ínfima vira um ângulo grande.
    const deslocamento = diferencaAngular(p.azimuteGraus, caso.azimuteGraus) * Math.sin((caso.zenitalGraus * Math.PI) / 180);
    expect(deslocamento).toBeLessThan(0.05);
  });
});

describe("irradiância extraterrestre (Spencer)", () => {
  it.each(ref.irradianciaExtraterrestre)("dia $diaDoAno", (caso) => {
    expect(irradianciaExtraterrestreWM2(caso.diaDoAno)).toBeCloseTo(caso.wM2, 6);
  });
});

describe("decomposição de Erbs", () => {
  it.each(ref.erbs)("GHI $ghiWM2, Z $zenitalGraus°, dia $diaDoAno", (caso) => {
    const r = decomporErbs(caso.ghiWM2, caso.zenitalGraus, irradianciaExtraterrestreWM2(caso.diaDoAno));
    expect(r.kt).toBeCloseTo(caso.kt, 9);
    expect(r.dhiWM2).toBeCloseTo(caso.dhiWM2, 6);
    expect(r.dniWM2).toBeCloseTo(caso.dniWM2, 6);
  });
});

describe("transposição (isotrópico e Hay-Davies)", () => {
  it.each(ref.transposicao)("$modelo β=$inclinacaoGraus γ=$azimutePlanoGraus Z=$zenitalGraus", (caso) => {
    const r = transpor({
      modelo: caso.modelo === "isotropic" ? "isotropico" : "hayDavies",
      inclinacaoGraus: caso.inclinacaoGraus,
      azimutePlanoGraus: caso.azimutePlanoGraus,
      zenitalGraus: caso.zenitalGraus,
      azimuteSolGraus: caso.azimuteSolGraus,
      ghiWM2: caso.ghiWM2,
      dniWM2: caso.dniWM2,
      dhiWM2: caso.dhiWM2,
      extraterrestreWM2: caso.dniExtraWM2,
      albedo: caso.albedo,
    });
    expect(r.globalWM2).toBeCloseTo(caso.poaGlobalWM2, 6);
    expect(r.diretaWM2).toBeCloseTo(caso.poaDiretaWM2, 6);
    expect(r.difusaCeuWM2).toBeCloseTo(caso.poaDifusaCeuWM2, 6);
    expect(r.soloWM2).toBeCloseTo(caso.poaSoloWM2, 6);
  });
});

describe("temperatura, potência CC, inversor e céu claro", () => {
  it.each(ref.temperaturaRoss)("Ross G=$poaWM2 Tar=$tempArC NOCT=$noctC", (c) => {
    expect(temperaturaCelulaNoctC(c.poaWM2, c.tempArC, c.noctC)).toBeCloseTo(c.tempCelulaC, 9);
  });
  it.each(ref.pvwattsCc)("PVWatts CC G=$irradianciaWM2 Tc=$tempCelulaC γ=$gamma", (c) => {
    expect(potenciaCcPvwattsW(c.irradianciaWM2, c.tempCelulaC, c.potenciaNominalW, c.gamma)).toBeCloseTo(c.potenciaCcW, 6);
  });
  it.each(ref.pvwattsInversor)("inversor Pcc=$potenciaCcW η=$etaNominal", (c) => {
    expect(inversorPvwatts(c.potenciaCcW, c.potenciaCaNominalW, c.etaNominal).potenciaCaW).toBeCloseTo(c.potenciaCaW, 6);
  });
  it.each(ref.haurwitz)("Haurwitz Z=$zenitalGraus", (c) => {
    expect(ghiCeuClaroHaurwitzWM2(c.zenitalGraus)).toBeCloseTo(c.ghiCeuClaroWM2, 6);
  });
});
