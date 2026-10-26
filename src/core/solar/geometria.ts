/**
 * Geometria solar.
 *
 * Posição do Sol pelo algoritmo da NOAA (Solar Calculator), baseado em Meeus, "Astronomical
 * Algorithms" (1991). Validado em tests/unit contra o SPA (NREL) da pvlib com tolerância de 0,05°.
 *
 * Convenção de ângulos (igual à pvlib): azimute medido a partir do norte geográfico, no sentido
 * horário (0° = norte, 90° = leste, 180° = sul, 270° = oeste). No hemisfério sul, módulos voltados
 * para o norte têm azimute 0°.
 */

const RAD = Math.PI / 180;
const GRAU = 180 / Math.PI;

export const sen = (graus: number) => Math.sin(graus * RAD);
export const cos = (graus: number) => Math.cos(graus * RAD);

export type PosicaoSolar = {
  zenitalGraus: number;
  azimuteGraus: number;
  declinacaoGraus: number;
  anguloHorarioGraus: number;
  equacaoTempoMin: number;
};

export function posicaoSolar(instanteUtcMs: number, latitudeGraus: number, longitudeGraus: number): PosicaoSolar {
  const diaJuliano = instanteUtcMs / 86_400_000 + 2440587.5;
  const t = (diaJuliano - 2451545) / 36525;

  const longMedia = (((280.46646 + t * (36000.76983 + t * 0.0003032)) % 360) + 360) % 360;
  const anomaliaMedia = 357.52911 + t * (35999.05029 - 0.0001537 * t);
  const excentricidade = 0.016708634 - t * (0.000042037 + 0.0000001267 * t);
  const centro =
    sen(anomaliaMedia) * (1.914602 - t * (0.004817 + 0.000014 * t)) +
    sen(2 * anomaliaMedia) * (0.019993 - 0.000101 * t) +
    sen(3 * anomaliaMedia) * 0.000289;
  const longVerdadeira = longMedia + centro;
  const omega = 125.04 - 1934.136 * t;
  const longAparente = longVerdadeira - 0.00569 - 0.00478 * sen(omega);
  const obliquidadeMedia = 23 + (26 + (21.448 - t * (46.815 + t * (0.00059 - t * 0.001813))) / 60) / 60;
  const obliquidade = obliquidadeMedia + 0.00256 * cos(omega);
  const declinacao = Math.asin(sen(obliquidade) * sen(longAparente)) * GRAU;

  const y = Math.tan((obliquidade / 2) * RAD) ** 2;
  const equacaoTempoMin =
    4 *
    GRAU *
    (y * sen(2 * longMedia) -
      2 * excentricidade * sen(anomaliaMedia) +
      4 * excentricidade * y * sen(anomaliaMedia) * cos(2 * longMedia) -
      0.5 * y * y * sen(4 * longMedia) -
      1.25 * excentricidade * excentricidade * sen(2 * anomaliaMedia));

  const minutosUtc = (((instanteUtcMs / 60_000) % 1440) + 1440) % 1440;
  const tempoSolarVerdadeiroMin = (((minutosUtc + equacaoTempoMin + 4 * longitudeGraus) % 1440) + 1440) % 1440;
  let anguloHorario = tempoSolarVerdadeiroMin / 4 - 180;
  if (anguloHorario < -180) anguloHorario += 360;

  const cosZenital = Math.min(
    1,
    Math.max(-1, sen(latitudeGraus) * sen(declinacao) + cos(latitudeGraus) * cos(declinacao) * cos(anguloHorario)),
  );
  const zenitalGraus = Math.acos(cosZenital) * GRAU;

  // Meeus (13.5): azimute a partir do sul, positivo para oeste; +180° converte para a convenção norte-horário.
  const azimuteSul = Math.atan2(sen(anguloHorario), cos(anguloHorario) * sen(latitudeGraus) - Math.tan(declinacao * RAD) * cos(latitudeGraus)) * GRAU;
  const azimuteGraus = (azimuteSul + 180 + 360) % 360;

  return { zenitalGraus, azimuteGraus, declinacaoGraus: declinacao, anguloHorarioGraus: anguloHorario, equacaoTempoMin };
}

/**
 * Irradiância extraterrestre normal (W/m²) pelo método de Spencer (1971), com constante solar
 * de 1366,1 W/m² — mesma formulação de pvlib.irradiance.get_extra_radiation(method='spencer').
 */
export function irradianciaExtraterrestreWM2(diaDoAno: number, constanteSolarWM2 = 1366.1): number {
  const b = ((2 * Math.PI) / 365) * (diaDoAno - 1);
  const fator = 1.00011 + 0.034221 * Math.cos(b) + 0.00128 * Math.sin(b) + 0.000719 * Math.cos(2 * b) + 0.000077 * Math.sin(2 * b);
  return constanteSolarWM2 * fator;
}

/** Cosseno do ângulo de incidência sobre um plano inclinado, limitado a [−1, 1]. */
export function cosAnguloIncidencia(
  inclinacaoGraus: number,
  azimutePlanoGraus: number,
  zenitalGraus: number,
  azimuteSolGraus: number,
): number {
  const projecao =
    cos(inclinacaoGraus) * cos(zenitalGraus) + sen(inclinacaoGraus) * sen(zenitalGraus) * cos(azimuteSolGraus - azimutePlanoGraus);
  return Math.min(1, Math.max(-1, projecao));
}
