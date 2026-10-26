/**
 * Indicadores de desempenho (nomenclatura da IEC 61724-1):
 *   Yr = H_poa / G_ref (h), com G_ref = 1 kW/m²       — rendimento de referência
 *   Yf = E_ca / P0 (kWh/kWp)                         — rendimento final (produtividade específica)
 *   PR = Yf / Yr                                     — Performance Ratio
 *   PR₂₅ = E_ca / Σ[P0·(G_poa/G_ref)·(1 + γ·(Tc − 25))·Δt] — PR corrigido para 25 °C
 *
 * Em usinas de GD sem piranômetro, H_poa é MODELADA (irradiância estimada + transposição): o PR
 * resultante é um "PR estimado" e não o PR medido da IEC 61724-1, que exige estação meteorológica.
 * Usinas SCADA usam a irradiância medida no plano.
 */
import fatorEmissao from "@/data/fator-emissao.json";
import type { AgregadoDia } from "./agregados";
import type { Alerta, TipoAlerta } from "./detectores";
import type { UsinaMonitorada } from "./frota";

export type Kpis = {
  energiaKWh: number;
  esperadaKWh: number;
  desvioPct: number;
  produtividadeKWhKWp: number;
  rendimentoReferenciaH: number;
  performanceRatio: number;
  performanceRatioCorrigido: number;
  prMedido: boolean;
  disponibilidadeTecnicaPct: number;
  disponibilidadeContratualPct: number;
  co2EvitadoT: number;
  minutosSemDados: number;
};

export const FATOR_EMISSAO = fatorEmissao.padrao;

export function calcularKpis(usina: UsinaMonitorada, dias: AgregadoDia[]): Kpis {
  const p0KWp = usina.potenciaCcW / 1000;
  let energia = 0;
  let esperada = 0;
  let hPoa = 0;
  let hCorrigida = 0;
  let minutosSol = 0;
  let indisponivel = 0;
  let manutencao = 0;
  let semDados = 0;
  for (const d of dias) {
    energia += d.energiaKWh;
    esperada += d.esperadaVisivelKWh;
    // A irradiação entra apenas na fração do dia com dados, para não penalizar o PR por lacunas.
    const fracaoVisivel = d.minutosSol > 0 ? 1 - d.minutosAusentes / d.minutosSol : 1;
    hPoa += (d.irradiacaoMedidaKWhM2 ?? d.irradiacaoModeladaKWhM2) * fracaoVisivel;
    hCorrigida += d.irradiacaoCorrigidaKWhM2 * fracaoVisivel;
    semDados += d.minutosAusentes;
    for (const inv of d.inversores) {
      minutosSol += inv.minutosSol;
      indisponivel += inv.minutosIndisponivel;
      manutencao += inv.minutosManutencao;
    }
  }
  const yr = hPoa;
  const yf = energia / p0KWp;
  return {
    energiaKWh: energia,
    esperadaKWh: esperada,
    desvioPct: esperada > 0 ? (energia / esperada - 1) * 100 : 0,
    produtividadeKWhKWp: yf,
    rendimentoReferenciaH: yr,
    performanceRatio: yr > 0 ? yf / yr : 0,
    performanceRatioCorrigido: hCorrigida > 0 ? yf / hCorrigida : 0,
    prMedido: usina.tipo === "scada",
    disponibilidadeTecnicaPct: minutosSol > 0 ? (1 - (indisponivel + manutencao) / minutosSol) * 100 : 100,
    disponibilidadeContratualPct: minutosSol - manutencao > 0 ? (1 - indisponivel / (minutosSol - manutencao)) * 100 : 100,
    co2EvitadoT: (energia / 1000) * (FATOR_EMISSAO.fatorTCO2MWh ?? 0),
    minutosSemDados: semDados,
  };
}

export type CategoriaPerda = TipoAlerta | `alarme:${string}` | "restricaoExterna" | "naoExplicada";

export type CascataMensal = {
  mes: string;
  esperadaKWh: number;
  medidaKWh: number;
  perdas: Array<{ categoria: CategoriaPerda; kWh: number; r: number }>;
};

/**
 * Cascata de perdas mensal: energia esperada → perdas atribuídas pelos alertas (por tipo) →
 * restrição externa (SCADA) → resíduo não explicado (inclui o erro da irradiância modelada) → medida.
 */
export function cascataMensal(usina: UsinaMonitorada, dias: AgregadoDia[], alertas: Alerta[], mes: string): CascataMensal {
  const doMes = dias.filter((d) => d.chave.startsWith(mes));
  const esperada = doMes.reduce((s, d) => s + d.esperadaVisivelKWh, 0);
  const medida = doMes.reduce((s, d) => s + d.energiaKWh, 0);
  const porCategoria = new Map<CategoriaPerda, number>();
  for (const a of alertas) {
    if (a.tipo === "perdaComunicacao") continue;
    const categoria: CategoriaPerda = a.tipo === "alarme" ? `alarme:${a.categoriaAlarme}` : a.tipo;
    const soma = a.perdasDiarias.filter(([c]) => c.startsWith(mes)).reduce((s, [, v]) => s + v, 0);
    if (soma > 0) porCategoria.set(categoria, (porCategoria.get(categoria) ?? 0) + soma);
  }
  const restrita = doMes.reduce((s, d) => s + d.inversores.reduce((a, i) => a + i.energiaRestritaKWh, 0), 0);
  if (restrita > 0) porCategoria.set("restricaoExterna", restrita);
  const explicada = [...porCategoria.values()].reduce((a, b) => a + b, 0);
  porCategoria.set("naoExplicada", esperada - medida - explicada);
  return {
    mes,
    esperadaKWh: esperada,
    medidaKWh: medida,
    perdas: [...porCategoria.entries()].map(([categoria, kWh]) => ({ categoria, kWh, r: kWh * usina.valorEnergiaRKWh })),
  };
}
