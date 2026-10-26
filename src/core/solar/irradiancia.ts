/**
 * Modelos de irradiância: céu claro, decomposição e transposição para o plano inclinado.
 * Cada função reproduz a formulação da pvlib indicada no comentário, verificada por fixtures.
 */
import { cos, cosAnguloIncidencia } from "./geometria";

/** Céu claro de Haurwitz (1945): GHI = 1098·cosZ·exp(−0,059/cosZ). pvlib.clearsky.haurwitz. */
export function ghiCeuClaroHaurwitzWM2(zenitalGraus: number): number {
  const c = cos(zenitalGraus);
  return c > 0 ? 1098 * c * Math.exp(-0.059 / c) : 0;
}

/** Índice de claridade horário kt = GHI / (E0·max(cosZ, 0,065)), limitado a [0, kMax]. */
export function indiceClaridade(ghiWM2: number, zenitalGraus: number, extraterrestreWM2: number, kMax = 2): number {
  const kt = ghiWM2 / (extraterrestreWM2 * Math.max(cos(zenitalGraus), 0.065));
  return Math.min(Math.max(kt, 0), kMax);
}

export type Decomposicao = { dniWM2: number; dhiWM2: number; kt: number };

/**
 * Decomposição de Erbs, Klein e Duffie (1982): fração difusa em função de kt.
 * Mesma formulação de pvlib.irradiance.erbs (zênite máximo de 87° para DNI).
 */
export function decomporErbs(ghiWM2: number, zenitalGraus: number, extraterrestreWM2: number): Decomposicao {
  const kt = indiceClaridade(ghiWM2, zenitalGraus, extraterrestreWM2, 1);
  let fracaoDifusa: number;
  if (kt <= 0.22) fracaoDifusa = 1 - 0.09 * kt;
  else if (kt <= 0.8) fracaoDifusa = 0.9511 - 0.1604 * kt + 4.388 * kt ** 2 - 16.638 * kt ** 3 + 12.336 * kt ** 4;
  else fracaoDifusa = 0.165;
  let dhi = fracaoDifusa * ghiWM2;
  let dni = (ghiWM2 - dhi) / cos(zenitalGraus);
  if (zenitalGraus > 87 || ghiWM2 < 0 || dni < 0) {
    dni = 0;
    dhi = ghiWM2;
  }
  return { dniWM2: dni, dhiWM2: dhi, kt };
}

export type ModeloTransposicao = "isotropico" | "hayDavies";

export type EntradaTransposicao = {
  modelo: ModeloTransposicao;
  inclinacaoGraus: number;
  azimutePlanoGraus: number;
  zenitalGraus: number;
  azimuteSolGraus: number;
  ghiWM2: number;
  dniWM2: number;
  dhiWM2: number;
  extraterrestreWM2: number;
  albedo: number;
};

export type IrradianciaPlano = {
  globalWM2: number;
  diretaWM2: number;
  difusaCeuWM2: number;
  soloWM2: number;
};

/**
 * Irradiância no plano dos módulos (POA) = direta + difusa do céu + refletida pelo solo.
 * - Isotrópico (Liu e Jordan, 1963): difusa = DHI·(1+cosβ)/2.
 * - Hay e Davies (1980): difusa = DHI·[(1−A)·(1+cosβ)/2 + A·Rb], com A = DNI/E0 e
 *   Rb = max(cosθ, 0)/max(cosZ, 0,01745). Padrão do aplicativo.
 * Solo: GHI·ρ·(1−cosβ)/2. Formulação de pvlib.irradiance.get_total_irradiance.
 */
export function transpor(e: EntradaTransposicao): IrradianciaPlano {
  const cosTheta = cosAnguloIncidencia(e.inclinacaoGraus, e.azimutePlanoGraus, e.zenitalGraus, e.azimuteSolGraus);
  const diretaWM2 = Math.max(e.dniWM2 * cosTheta, 0);
  const fatorVisaoCeu = 0.5 * (1 + cos(e.inclinacaoGraus));
  let difusaCeuWM2: number;
  if (e.modelo === "isotropico") {
    difusaCeuWM2 = e.dhiWM2 * fatorVisaoCeu;
  } else {
    const rb = Math.max(cosTheta, 0) / Math.max(cos(e.zenitalGraus), 0.01745);
    const anisotropia = e.dniWM2 / e.extraterrestreWM2;
    difusaCeuWM2 = Math.max(e.dhiWM2 * (1 - anisotropia) * fatorVisaoCeu, 0) + Math.max(e.dhiWM2 * anisotropia * rb, 0);
  }
  const soloWM2 = e.ghiWM2 * e.albedo * (1 - cos(e.inclinacaoGraus)) * 0.5;
  return { globalWM2: diretaWM2 + difusaCeuWM2 + soloWM2, diretaWM2, difusaCeuWM2, soloWM2 };
}
