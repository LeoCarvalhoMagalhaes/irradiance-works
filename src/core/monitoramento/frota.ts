/**
 * Modelo das usinas monitoradas (frota de demonstração + usinas comissionadas pelo simulador).
 * A configuração elétrica (strings por MPPT) é derivada de forma determinística pelo mesmo
 * núcleo do simulador, garantindo que os dois módulos usem as mesmas regras.
 */
import equipamentos from "@/data/equipamentos.json";
import frotaJson from "@/data/frota.json";
import type { Inversor, Modulo } from "../eletrica/equipamentos";
import { sugerirConfiguracao } from "../eletrica/strings";
import { type Cidade, cidadePorId } from "../simulador/cidades";
import { obterTarifa } from "../simulador/proposta";
import { TRIBUTOS_EXEMPLO } from "../simulador/premissas";
import { fatorTributos } from "../regulacao/tarifa";

export type SegmentoUsina = "residencial" | "comercial" | "industrial" | "agronegocio" | "geracaoCentralizada";
export type CategoriaAlarme = "isolamento" | "rede" | "sobretemperatura" | "arco" | "comunicacao";

export type Falha =
  | {
      id: string;
      tipo: "sujidade";
      inicioDiasAtras: number;
      fimDiasAtras: number | null;
      taxaPctDia: number;
      /** Fração removida por chuva ≥ 5 mm (sujidade aderente, como poeira industrial, é pouco lavada). */
      remocaoChuva: number;
    }
  | { id: string; tipo: "stringDesligada"; inversor: number; mppt: number; inicioDiasAtras: number; fimDiasAtras: number | null }
  | { id: string; tipo: "inversorOffline"; inversor: number; inicioDiasAtras: number; fimDiasAtras: number | null }
  | { id: string; tipo: "clipping"; inicioDiasAtras: number; fimDiasAtras: number | null }
  | { id: string; tipo: "sombreamento"; horaInicio: number; horaFim: number; perdaPct: number; inicioDiasAtras: number; fimDiasAtras: number | null }
  | { id: string; tipo: "degradacaoAcelerada"; taxaPctAno: number; inicioDiasAtras: number; fimDiasAtras: number | null }
  | { id: string; tipo: "perdaComunicacao"; inicioDiasAtras: number; horaInicio: number; duracaoHoras: number | null }
  | {
      id: string;
      tipo: "alarme";
      categoria: CategoriaAlarme;
      inversor: number;
      inicioDiasAtras: number;
      fimDiasAtras: number | null;
      horaInicio?: number;
      horaFim?: number;
    }
  | { id: string; tipo: "subdesempenhoInversor"; inversor: number; perdaPct: number; inicioDiasAtras: number; fimDiasAtras: number | null };

export type TipoFalha = Falha["tipo"];

export type MpptMonitorado = { id: string; strings: number; modulosEmSerie: number; potenciaCcW: number };
export type InversorMonitorado = { id: string; potenciaCaW: number; etaNominal: number; mppts: MpptMonitorado[] };

export type RestricaoScada = {
  id: string;
  motivo: "razaoEnergetica" | "confiabilidadeEletrica" | "indisponibilidadeExterna";
  inicioDiasAtras: number;
  horaInicio: number;
  horaFim: number;
  limitePct: number;
};

export type UsinaMonitorada = {
  id: string;
  nome: string;
  segmento: SegmentoUsina;
  tipo: "gd" | "scada";
  origem: "demonstracao" | "comissionada";
  cidade: Cidade;
  distribuidoraId: string | null;
  /** Valor da energia (R$/kWh) para converter perdas em reais. */
  valorEnergiaRKWh: number;
  valorEnergiaPremissa: boolean;
  comissionamento: string;
  inclinacaoGraus: number;
  azimuteGraus: number;
  modulo: Modulo;
  fabricante: "A" | "B";
  inversores: InversorMonitorado[];
  potenciaCcW: number;
  potenciaCaW: number;
  custoLimpezaR: number;
  falhas: Falha[];
  scada: { manutencaoProgramada: Array<{ inversor: number; inicioDiasAtras: number; horaInicio: number; horaFim: number }>; restricoes: RestricaoScada[] } | null;
  /** Usinas comissionadas: proposta de origem e geração mensal prometida (ano 1). */
  propostaId: string | null;
  geracaoPrometidaMensalKWh: number[] | null;
};

const MODULOS = equipamentos.modulos as Modulo[];
const INVERSORES = equipamentos.inversores as Inversor[];

/** Valor da energia: tarifa plena da distribuidora com tributos de exemplo (premissa) ou valor informado. */
export function valorEnergia(distribuidoraId: string | null, segmento: SegmentoUsina, valorInformado: number | null, valorScadaRMWh: number) {
  if (segmento === "geracaoCentralizada") return { valor: valorScadaRMWh / 1000, premissa: true };
  if (distribuidoraId) {
    const subgrupo = segmento === "residencial" ? "B1" : segmento === "agronegocio" ? "B2" : "B3";
    const { tarifa } = obterTarifa({ distribuidoraId, subgrupo, tarifaPersonalizada: null });
    return { valor: (tarifa.totalTe + tarifa.totalTusd) * fatorTributos(TRIBUTOS_EXEMPLO), premissa: true };
  }
  return { valor: valorInformado ?? 0.9, premissa: true };
}

/** Monta inversores e MPPTs a partir de potência alvo, módulo e inversor do catálogo. */
export function montarArranjo(p: {
  cidade: Cidade;
  modulo: Modulo;
  inversor: Inversor;
  potenciaCcKWpAlvo: number;
  relacaoCcCaAlvo: number;
}): InversorMonitorado[] {
  const tempMin = Math.min(...p.cidade.tempMinC) - 5;
  const tempMaxCelula = Math.max(...p.cidade.tempMaxC) + ((p.modulo.noctC - 20) / 800) * 1000;
  const config = sugerirConfiguracao({
    modulo: p.modulo,
    inversor: p.inversor,
    modulosDesejados: Math.round((p.potenciaCcKWpAlvo * 1000) / p.modulo.potenciaWp),
    tempMinProjetoC: tempMin,
    tempMaxCelulaC: tempMaxCelula,
    fatorSegurancaCorrente: 1.25,
    relacaoCcCaAlvo: p.relacaoCcCaAlvo,
  });
  if (!config) throw new Error("Configuração elétrica inviável para a usina de demonstração");
  return Array.from({ length: config.quantidadeInversores }, (_, i) => ({
    id: `INV${i + 1}`,
    potenciaCaW: p.inversor.potenciaCaW,
    etaNominal: p.inversor.etaNominal,
    mppts: config.stringsPorMppt
      .map((strings, k) => ({
        id: `MPPT${k + 1}`,
        strings,
        modulosEmSerie: config.modulosEmSerie,
        potenciaCcW: strings * config.modulosEmSerie * p.modulo.potenciaWp,
      }))
      .filter((m) => m.strings > 0),
  }));
}

let cacheFrota: UsinaMonitorada[] | null = null;

export function frotaDemonstracao(): UsinaMonitorada[] {
  if (cacheFrota) return cacheFrota;
  cacheFrota = frotaJson.usinas.map((u) => {
    const cidade = cidadePorId(u.cidadeId);
    if (!cidade) throw new Error(`Cidade ${u.cidadeId} ausente da base de irradiação`);
    const modulo = MODULOS.find((m) => m.id === u.moduloId)!;
    const segmento = u.segmento as SegmentoUsina;
    const energia = valorEnergia(u.distribuidoraId, segmento, u.valorEnergiaRKWh, frotaJson.premissas.valorEnergiaScadaRMWh);
    let inversores: InversorMonitorado[];
    if (u.tipo === "scada" && u.scada) {
      // Usinas centralizadas: inversores centrais (skids) com um MPPT cada; 28 módulos por string (sistema 1.500 V).
      const ccPorInversor = (u.potenciaCcKWpAlvo * 1000) / u.scada.quantidadeInversores;
      const strings = Math.round(ccPorInversor / (28 * modulo.potenciaWp));
      inversores = Array.from({ length: u.scada.quantidadeInversores }, (_, i) => ({
        id: `INV${String(i + 1).padStart(2, "0")}`,
        potenciaCaW: u.scada!.potenciaCaInversorKW * 1000,
        etaNominal: 0.985,
        mppts: [{ id: "MPPT1", strings, modulosEmSerie: 28, potenciaCcW: strings * 28 * modulo.potenciaWp }],
      }));
    } else {
      const inversor = INVERSORES.find((i) => i.id === u.inversorId)!;
      inversores = montarArranjo({ cidade, modulo, inversor, potenciaCcKWpAlvo: u.potenciaCcKWpAlvo, relacaoCcCaAlvo: u.relacaoCcCaAlvo });
    }
    return {
      id: u.id,
      nome: u.nome,
      segmento,
      tipo: u.tipo as "gd" | "scada",
      origem: "demonstracao" as const,
      cidade,
      distribuidoraId: u.distribuidoraId,
      valorEnergiaRKWh: energia.valor,
      valorEnergiaPremissa: energia.premissa,
      comissionamento: u.comissionamento,
      inclinacaoGraus: u.inclinacaoGraus,
      azimuteGraus: u.azimuteGraus,
      modulo,
      fabricante: u.fabricante as "A" | "B",
      inversores,
      potenciaCcW: inversores.reduce((s, i) => s + i.mppts.reduce((a, m) => a + m.potenciaCcW, 0), 0),
      potenciaCaW: inversores.reduce((s, i) => s + i.potenciaCaW, 0),
      custoLimpezaR: u.custoLimpezaR,
      falhas: u.falhas as Falha[],
      scada: u.tipo === "scada" && u.scada ? { manutencaoProgramada: u.scada.manutencaoProgramada, restricoes: u.scada.restricoes as RestricaoScada[] } : null,
      propostaId: null,
      geracaoPrometidaMensalKWh: null,
    };
  });
  return cacheFrota;
}
