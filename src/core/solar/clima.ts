/**
 * Gerador climático sintético, determinístico por semente e calibrado pela climatologia mensal.
 *
 * Modelo:
 * 1. Céu claro de Haurwitz em cada passo de tempo; H_cc(d) é a irradiação diária de céu claro.
 * 2. Índice diário relativo k_d = K̄ + σ·z_d, com z_d um processo AR(1) (φ = 0,6) e
 *    σ = min(0,25; 1,1·K̄·(1−K̄)). K̄ = H̄_mês / média(H_cc).
 * 3. Calibração: k_d é reescalado iterativamente para que a média mensal de k_d·H_cc(d)
 *    reproduza exatamente a climatologia (respeitando o limite físico k_d ≤ 1,08).
 * 4. Variabilidade intradiária: fator multiplicativo AR(1) com constante de tempo de 30 min e
 *    amplitude proporcional à nebulosidade (1 − k_d); a integral do dia é renormalizada.
 * 5. Temperatura do ar: média mensal + senoide diária com amplitude (Tmáx − Tmín)/2 e pico às 15 h
 *    solares, mais anomalia diária correlacionada com k_d.
 * 6. Chuva: número de eventos = ⌊precipitação do mês / 15 mm⌋ (premissa), atribuídos aos dias de
 *    menor k_d; meses secos ficam sem eventos. Usada pelo modelo de sujidade (lavagem natural).
 */
import { criarAleatorio, normal } from "../util/aleatorio";
import { diasNoMes, inicioDiaLocalUtcMs, MS_POR_MINUTO } from "../util/tempo";
import { posicaoSolar } from "./geometria";
import { ghiCeuClaroHaurwitzWM2 } from "./irradiancia";

export type Climatologia = {
  latitude: number;
  longitude: number;
  ghiKWhM2Dia: number[];
  tempMediaC: number[];
  tempMaxC: number[];
  tempMinC: number[];
  precipitacaoMmDia: number[];
};

export type DiaClimatico = {
  chave: string;
  indiceRelativo: number;
  irradiacaoKWhM2: number;
  chuvaMm: number;
};

export type SerieClima = {
  inicioUtcMs: number;
  passoMin: number;
  ghiWM2: Float64Array;
  tempArC: Float64Array;
  zenitalGraus: Float64Array;
  azimuteSolGraus: Float64Array;
  dias: DiaClimatico[];
};

export const PREMISSAS_CLIMA = {
  phiDiario: 0.6,
  indiceMaximo: 1.08,
  indiceMinimo: 0.06,
  constanteTempoNuvensMin: 30,
  milimetrosPorEventoChuva: 15,
};

/** Geometria solar por passo, compartilhada entre usinas da mesma cidade (cache em memória). */
const cacheGeometria = new Map<string, { zen: Float64Array; az: Float64Array; ceu: Float64Array }>();

function geometriaDoMes(lat: number, lon: number, ano: number, mes: number, passoMin: number) {
  const chave = `${lat}|${lon}|${ano}|${mes}|${passoMin}`;
  const existente = cacheGeometria.get(chave);
  if (existente) return existente;
  const passosPorDia = Math.round(1440 / passoMin);
  const n = diasNoMes(ano, mes) * passosPorDia;
  const inicio = inicioDiaLocalUtcMs(ano, mes, 1);
  const zen = new Float64Array(n);
  const az = new Float64Array(n);
  const ceu = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const p = posicaoSolar(inicio + (i + 0.5) * passoMin * MS_POR_MINUTO, lat, lon);
    zen[i] = p.zenitalGraus;
    az[i] = p.azimuteGraus;
    ceu[i] = ghiCeuClaroHaurwitzWM2(p.zenitalGraus);
  }
  const resultado = { zen, az, ceu };
  if (cacheGeometria.size > 400) cacheGeometria.clear();
  cacheGeometria.set(chave, resultado);
  return resultado;
}

export function gerarClimaMes(params: {
  climatologia: Climatologia;
  ano: number;
  mes: number;
  passoMin: number;
  semente: string;
}): SerieClima {
  const { climatologia: c, ano, mes, passoMin } = params;
  const aleatorio = criarAleatorio(`${params.semente}|${ano}-${mes}`);
  const passosPorDia = Math.round(1440 / passoMin);
  const nDias = diasNoMes(ano, mes);
  const { zen, az, ceu } = geometriaDoMes(c.latitude, c.longitude, ano, mes, passoMin);
  const horasPorPasso = passoMin / 60;

  // 1. irradiação diária de céu claro (kWh/m²)
  const ceuDiario = new Float64Array(nDias);
  for (let d = 0; d < nDias; d++) {
    let soma = 0;
    for (let k = 0; k < passosPorDia; k++) soma += ceu[d * passosPorDia + k];
    ceuDiario[d] = (soma * horasPorPasso) / 1000;
  }
  const mediaCeu = ceuDiario.reduce((a, b) => a + b, 0) / nDias;
  const alvo = c.ghiKWhM2Dia[mes - 1];
  const indiceMedio = Math.min(alvo / mediaCeu, PREMISSAS_CLIMA.indiceMaximo);
  const sigma = Math.min(0.25, 1.1 * indiceMedio * (1 - Math.min(indiceMedio, 1)));

  // 2. processo AR(1) diário
  const z = new Float64Array(nDias);
  const phi = PREMISSAS_CLIMA.phiDiario;
  let anterior = normal(aleatorio);
  for (let d = 0; d < nDias; d++) {
    anterior = phi * anterior + Math.sqrt(1 - phi * phi) * normal(aleatorio);
    z[d] = anterior;
  }
  const indices = Array.from(z, (v) =>
    Math.min(PREMISSAS_CLIMA.indiceMaximo, Math.max(PREMISSAS_CLIMA.indiceMinimo, indiceMedio + sigma * v)),
  );

  // 3. calibração da média mensal
  for (let iteracao = 0; iteracao < 30; iteracao++) {
    let soma = 0;
    for (let d = 0; d < nDias; d++) soma += indices[d] * ceuDiario[d];
    const fator = alvo / (soma / nDias);
    if (Math.abs(fator - 1) < 1e-6) break;
    for (let d = 0; d < nDias; d++) {
      indices[d] = Math.min(PREMISSAS_CLIMA.indiceMaximo, Math.max(PREMISSAS_CLIMA.indiceMinimo, indices[d] * fator));
    }
  }

  // 4. série intradiária
  const n = nDias * passosPorDia;
  const ghi = new Float64Array(n);
  const temp = new Float64Array(n);
  const phiPasso = Math.exp(-passoMin / PREMISSAS_CLIMA.constanteTempoNuvensMin);
  let nuvem = 0;
  const amplitudeTemp = (c.tempMaxC[mes - 1] - c.tempMinC[mes - 1]) / 2;
  for (let d = 0; d < nDias; d++) {
    const kd = indices[d];
    const amplitudeNuvem = 0.9 * Math.max(0, 1 - kd);
    let somaDia = 0;
    for (let k = 0; k < passosPorDia; k++) {
      const i = d * passosPorDia + k;
      nuvem = phiPasso * nuvem + Math.sqrt(1 - phiPasso * phiPasso) * normal(aleatorio);
      const fator = Math.max(0.05, 1 + amplitudeNuvem * nuvem);
      ghi[i] = ceu[i] * kd * fator;
      somaDia += ghi[i];
    }
    const alvoDia = (kd * ceuDiario[d] * 1000) / horasPorPasso;
    for (let passada = 0; passada < 3 && somaDia > 0; passada++) {
      const escala = alvoDia / somaDia;
      somaDia = 0;
      for (let k = 0; k < passosPorDia; k++) {
        const i = d * passosPorDia + k;
        ghi[i] = Math.min(ghi[i] * escala, ceu[i] * 1.25);
        somaDia += ghi[i];
      }
    }
    const anomalia = 1.2 * z[d];
    for (let k = 0; k < passosPorDia; k++) {
      const i = d * passosPorDia + k;
      const instante = inicioDiaLocalUtcMs(ano, mes, d + 1) + (k + 0.5) * passoMin * MS_POR_MINUTO;
      const horaSolar = ((instante / 3_600_000 + c.longitude / 15) % 24 + 24) % 24;
      temp[i] = c.tempMediaC[mes - 1] + amplitudeTemp * Math.sin(((horaSolar - 9) / 24) * 2 * Math.PI) + anomalia;
    }
  }

  // 6. chuva nos dias de menor índice
  const totalChuva = c.precipitacaoMmDia[mes - 1] * nDias;
  const eventos = Math.min(Math.round(nDias * 0.8), Math.floor(totalChuva / PREMISSAS_CLIMA.milimetrosPorEventoChuva));
  const ordem = indices.map((v, d) => [v, d] as const).sort((a, b) => a[0] - b[0]);
  const chuva = new Float64Array(nDias);
  for (let e = 0; e < eventos; e++) chuva[ordem[e][1]] = totalChuva / eventos;

  const dias: DiaClimatico[] = [];
  for (let d = 0; d < nDias; d++) {
    let soma = 0;
    for (let k = 0; k < passosPorDia; k++) soma += ghi[d * passosPorDia + k];
    dias.push({
      chave: `${ano}-${String(mes).padStart(2, "0")}-${String(d + 1).padStart(2, "0")}`,
      indiceRelativo: indices[d],
      irradiacaoKWhM2: (soma * horasPorPasso) / 1000,
      chuvaMm: chuva[d],
    });
  }

  return {
    inicioUtcMs: inicioDiaLocalUtcMs(ano, mes, 1),
    passoMin,
    ghiWM2: ghi,
    tempArC: temp,
    zenitalGraus: zen,
    azimuteSolGraus: az,
    dias,
  };
}

/** Ano típico: 12 meses de um ano civil não bissexto de referência, concatenados. */
export const ANO_REFERENCIA_TIPICO = 2025;

export function gerarAnoTipico(climatologia: Climatologia, passoMin: number, semente: string): SerieClima {
  const meses = Array.from({ length: 12 }, (_, m) =>
    gerarClimaMes({ climatologia, ano: ANO_REFERENCIA_TIPICO, mes: m + 1, passoMin, semente: `${semente}|tipico` }),
  );
  const juntar = (campo: "ghiWM2" | "tempArC" | "zenitalGraus" | "azimuteSolGraus") => {
    const total = meses.reduce((s, m) => s + m[campo].length, 0);
    const saida = new Float64Array(total);
    let deslocamento = 0;
    for (const m of meses) {
      saida.set(m[campo], deslocamento);
      deslocamento += m[campo].length;
    }
    return saida;
  };
  return {
    inicioUtcMs: meses[0].inicioUtcMs,
    passoMin,
    ghiWM2: juntar("ghiWM2"),
    tempArC: juntar("tempArC"),
    zenitalGraus: juntar("zenitalGraus"),
    azimuteSolGraus: juntar("azimuteSolGraus"),
    dias: meses.flatMap((m) => m.dias),
  };
}
