/**
 * Integração entre os módulos: uma proposta do simulador vira usina monitorada ("comissionar") e
 * a geração prometida é comparada à monitorada ("prometido × real").
 */
import { z } from "zod";
import { diferencaDias } from "../util/tempo";
import type { AgregadoDia } from "../monitoramento/agregados";
import type { Alerta } from "../monitoramento/detectores";
import type { Falha, UsinaMonitorada } from "../monitoramento/frota";
import { esquemaEntradaProposta, type Proposta } from "../simulador/proposta";

export const esquemaComissionamento = z.object({
  id: z.string().regex(/^UFV-C\d{2,}$/),
  nome: z.string().min(1).max(120),
  propostaId: z.string(),
  entrada: esquemaEntradaProposta,
  dataComissionamento: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  /** Falhas de demonstração opcionais, com datas absolutas (o histórico é simulado). */
  falhasDemo: z.array(z.object({ tipo: z.enum(["sujidade", "stringDesligada"]), inicio: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) })),
  criadoEm: z.string(),
});

export type Comissionamento = z.infer<typeof esquemaComissionamento>;

/** Custo de limpeza por kWp (PREMISSA editável, sem fonte oficial), com mínimo por visita. */
export const CUSTO_LIMPEZA_PREMISSA = { rPorKWp: 40, minimoR: 250 };

export function usinaDeProposta(proposta: Proposta, c: Comissionamento, hoje: string): UsinaMonitorada {
  const cfg = proposta.arranjo.configuracao ?? { modulosEmSerie: proposta.arranjo.numeroModulos, stringsPorMppt: [1], quantidadeInversores: 1 };
  const inversores = Array.from({ length: cfg.quantidadeInversores }, (_, i) => ({
    id: `INV${i + 1}`,
    potenciaCaW: proposta.inversor.potenciaCaW,
    etaNominal: proposta.inversor.etaNominal,
    mppts: cfg.stringsPorMppt
      .map((strings, k) => ({ id: `MPPT${k + 1}`, strings, modulosEmSerie: cfg.modulosEmSerie, potenciaCcW: strings * cfg.modulosEmSerie * proposta.modulo.potenciaWp }))
      .filter((m) => m.strings > 0),
  }));
  const falhas: Falha[] = c.falhasDemo.map((f, i) => {
    const diasAtras = Math.max(0, diferencaDias(f.inicio, hoje));
    if (f.tipo === "sujidade") {
      return { id: `${c.id}-F${i + 1}`, tipo: "sujidade", inicioDiasAtras: diasAtras, fimDiasAtras: null, taxaPctDia: 0.3, remocaoChuva: 0.15 };
    }
    const mppt = inversores[0].mppts.findIndex((m) => m.strings >= 2);
    return { id: `${c.id}-F${i + 1}`, tipo: "stringDesligada", inversor: 1, mppt: Math.max(0, mppt) + 1, inicioDiasAtras: diasAtras, fimDiasAtras: null };
  });
  const segmento = proposta.entrada.segmento === "agro" ? "agronegocio" : proposta.entrada.segmento.startsWith("industrial") ? "industrial" : (proposta.entrada.segmento as "residencial" | "comercial");
  const potenciaCcW = inversores.reduce((s, i) => s + i.mppts.reduce((a, m) => a + m.potenciaCcW, 0), 0);
  const fatorAno1 = 1 - proposta.entrada.premissas.tecnicas.degradacaoPrimeiroAnoPct / 100;
  return {
    id: c.id,
    nome: c.nome,
    segmento,
    tipo: "gd",
    origem: "comissionada",
    cidade: proposta.cidade,
    distribuidoraId: proposta.entrada.distribuidoraId === "personalizada" ? null : proposta.entrada.distribuidoraId,
    valorEnergiaRKWh: proposta.tarifaCheiaComTributosRKWh,
    valorEnergiaPremissa: true,
    comissionamento: c.dataComissionamento,
    inclinacaoGraus: proposta.entrada.instalacao.inclinacaoGraus,
    azimuteGraus: proposta.entrada.instalacao.azimuteGraus,
    modulo: proposta.modulo,
    fabricante: "A",
    inversores,
    potenciaCcW,
    potenciaCaW: inversores.reduce((s, i) => s + i.potenciaCaW, 0),
    custoLimpezaR: Math.max(CUSTO_LIMPEZA_PREMISSA.minimoR, CUSTO_LIMPEZA_PREMISSA.rPorKWp * (potenciaCcW / 1000)),
    falhas,
    scada: null,
    propostaId: c.propostaId,
    geracaoPrometidaMensalKWh: proposta.simulacao.geracaoMensalKWh.map((v) => v * fatorAno1),
  };
}

export type MesPrometidoReal = {
  mes: string;
  diasComDados: number;
  diasNoMes: number;
  prometidoKWh: number;
  esperadoKWh: number;
  medidoKWh: number;
  /** Esperado − prometido: clima real do período e diferenças de premissa do projeto. */
  efeitoClimaKWh: number;
  /** Perdas atribuídas pelos alertas (sujidade, strings, alarmes...). */
  perdasOperacionaisKWh: number;
  /** Medido − esperado + perdas atribuídas: o que nenhum alerta explica. */
  naoExplicadoKWh: number;
};

export function prometidoVsReal(
  usina: UsinaMonitorada,
  dias: AgregadoDia[],
  alertas: Alerta[],
  degradacaoAnualPct: number,
): { meses: MesPrometidoReal[]; acumulado: { prometidoKWh: number; medidoKWh: number; desvioPct: number } } {
  if (!usina.geracaoPrometidaMensalKWh) return { meses: [], acumulado: { prometidoKWh: 0, medidoKWh: 0, desvioPct: 0 } };
  const porMes = new Map<string, AgregadoDia[]>();
  for (const d of dias) {
    if (d.chave < usina.comissionamento) continue;
    const m = d.chave.slice(0, 7);
    porMes.set(m, [...(porMes.get(m) ?? []), d]);
  }
  const meses: MesPrometidoReal[] = [];
  for (const [mes, lista] of porMes) {
    const [ano, m] = mes.split("-").map(Number);
    const diasNoMes = new Date(Date.UTC(ano, m, 0)).getUTCDate();
    const anoOperacao = Math.floor(diferencaDias(usina.comissionamento, `${mes}-15`) / 365.25);
    // A promessa é proporcional aos dias com dados no mês (meses parciais e lacunas de comunicação).
    const fracao = lista.reduce((s, d) => s + (d.minutosSol > 0 ? 1 - d.minutosAusentes / d.minutosSol : 1), 0) / diasNoMes;
    const prometido = usina.geracaoPrometidaMensalKWh[m - 1] * (1 - degradacaoAnualPct / 100) ** Math.max(0, anoOperacao) * fracao;
    const esperado = lista.reduce((s, d) => s + d.esperadaVisivelKWh, 0);
    const medido = lista.reduce((s, d) => s + d.energiaKWh, 0);
    const perdas = alertas
      .filter((a) => a.tipo !== "perdaComunicacao")
      .reduce((s, a) => s + a.perdasDiarias.filter(([c]) => c.startsWith(mes)).reduce((x, [, v]) => x + v, 0), 0);
    meses.push({
      mes,
      diasComDados: lista.length,
      diasNoMes,
      prometidoKWh: prometido,
      esperadoKWh: esperado,
      medidoKWh: medido,
      efeitoClimaKWh: esperado - prometido,
      perdasOperacionaisKWh: perdas,
      naoExplicadoKWh: medido - esperado + perdas,
    });
  }
  const prometidoKWh = meses.reduce((s, m) => s + m.prometidoKWh, 0);
  const medidoKWh = meses.reduce((s, m) => s + m.medidoKWh, 0);
  return { meses, acumulado: { prometidoKWh, medidoKWh, desvioPct: prometidoKWh > 0 ? (medidoKWh / prometidoKWh - 1) * 100 : 0 } };
}
