/**
 * Temperatura de célula e conversão de potência.
 */

/**
 * Temperatura de célula pelo modelo NOCT (Ross, 1980): Tc = Tar + (NOCT − 20)/800 · G_poa.
 * pvlib.temperature.ross(noct=...).
 */
export function temperaturaCelulaNoctC(poaWM2: number, tempArC: number, noctC: number): number {
  return tempArC + ((noctC - 20) / 800) * poaWM2;
}

/**
 * Potência CC pelo modelo PVWatts: P = G/1000 · P0 · [1 + γ·(Tc − 25)], com γ em 1/°C
 * (coeficiente de potência do datasheet, ex.: −0,0035 = −0,35 %/°C). pvlib.pvsystem.pvwatts_dc.
 */
export function potenciaCcPvwattsW(irradianciaWM2: number, tempCelulaC: number, potenciaNominalW: number, gammaPorC: number): number {
  return irradianciaWM2 * 0.001 * potenciaNominalW * (1 + gammaPorC * (tempCelulaC - 25));
}

export type SaidaInversor = { potenciaCaW: number; perdaClippingW: number };

/**
 * Inversor PVWatts (Dobos, 2014): η(ζ) = η_nom/η_ref · (−0,0162ζ − 0,0059/ζ + 0,9858), ζ = Pcc/Pcc0,
 * com Pcc0 = Pca_nom/η_nom e η_ref = 0,9637. A saída é limitada à potência CA nominal (clipping).
 * pvlib.inverter.pvwatts.
 */
export function inversorPvwatts(potenciaCcW: number, potenciaCaNominalW: number, etaNominal: number): SaidaInversor {
  if (potenciaCcW <= 0) return { potenciaCaW: 0, perdaClippingW: 0 };
  const potenciaCc0 = potenciaCaNominalW / etaNominal;
  const zeta = potenciaCcW / potenciaCc0;
  const eta = (etaNominal / 0.9637) * (-0.0162 * zeta - 0.0059 / zeta + 0.9858);
  const semLimite = Math.max(eta * potenciaCcW, 0);
  const potenciaCaW = Math.min(semLimite, potenciaCaNominalW);
  return { potenciaCaW, perdaClippingW: semLimite - potenciaCaW };
}
