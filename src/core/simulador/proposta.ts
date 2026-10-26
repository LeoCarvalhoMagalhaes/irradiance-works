/**
 * Orquestração do simulador: da entrada do assistente à proposta completa. Função pura e
 * determinística (o ano típico usa a semente da cidade).
 */
import { z } from "zod";
import equipamentos from "@/data/equipamentos.json";
import tarifas from "@/data/tarifas.json";
import { esquemaInversor, esquemaModulo, type Inversor, type Modulo } from "../eletrica/equipamentos";
import { type ConfiguracaoArranjo, escolherInversor, sugerirConfiguracao, totalModulos, type Verificacao, verificarArranjo } from "../eletrica/strings";
import { calcularCenarios, type ResultadoCenario } from "../financeiro/cenarios";
import { type Enquadramento, enquadrar } from "../regulacao/enquadramento";
import { custoDisponibilidadeKWh, type Ligacao } from "../regulacao/faturamento";
import { type CenarioPos2029, decomporTarifa, fatorTributos, type TarifaDecomposta, type Tributos } from "../regulacao/tarifa";
import { gerarAnoTipico, type SerieClima } from "../solar/clima";
import { type CascataPerdas, simularSerie, type SistemaFv } from "../solar/simulacao";
import { cargaHorariaPorPerfil, importarCargaCsv, PERFIS_CARGA, type Segmento } from "./carga";
import { type Cidade, cidadeMaisProxima, cidadePorId } from "./cidades";
import { esquemaPremissas, type Premissas } from "./premissas";
import { balancoMensal, type Projecao, projetar } from "./projecao";

export const esquemaEntradaProposta = z.object({
  versao: z.literal(1),
  cliente: z.string().max(120),
  cidadeId: z.string(),
  coordenadas: z.object({ latitude: z.number().min(-34).max(6), longitude: z.number().min(-75).max(-28) }).nullable(),
  ligacao: z.enum(["monofasico", "bifasico2", "bifasico3", "trifasico"]),
  cadUnico: z.boolean(),
  dataProtocolo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  modalidade: z.enum(["autoconsumoLocal", "autoconsumoRemoto", "geracaoCompartilhada", "multiplasUnidades"]),
  maiorParticipacaoPct: z.number().min(0).max(100),
  consumoMensalKWh: z.array(z.number().min(0).max(5e6)).length(12),
  segmento: z.enum(["residencial", "comercial", "industrial1t", "industrial2t", "industrial3t", "agro"]),
  cargaCsv: z.string().max(3_000_000).nullable(),
  distribuidoraId: z.string(),
  subgrupo: z.enum(["B1", "B2", "B3"]),
  tarifaPersonalizada: z.object({ teRMWh: z.number().min(0), tusdRMWh: z.number().min(0), fioBRMWh: z.number().min(0) }).nullable(),
  tributos: z.object({ icmsPct: z.number().min(0).max(40), pisPct: z.number().min(0).max(5), cofinsPct: z.number().min(0).max(15) }),
  instalacao: z.object({
    tipo: z.enum(["telhadoCeramico", "telhadoMetalico", "laje", "solo"]),
    areaM2: z.number().positive().nullable(),
    inclinacaoGraus: z.number().min(0).max(90),
    azimuteGraus: z.number().min(0).max(360),
    sombreamentoPct: z.number().min(0).max(50),
  }),
  dimensionamento: z.object({ modo: z.enum(["energia", "valor"]), coberturaPct: z.number().min(5).max(150) }),
  moduloId: z.string(),
  inversorId: z.string(),
  moduloPersonalizado: esquemaModulo.nullable(),
  inversorPersonalizado: esquemaInversor.nullable(),
  inicio: z.object({ ano: z.number().int().min(2023).max(2060), mes: z.number().int().min(1).max(12) }),
  premissas: esquemaPremissas,
});

export type EntradaProposta = z.infer<typeof esquemaEntradaProposta>;

export type CodigoAviso =
  | "prForaFaixa"
  | "relacaoCcCaForaFaixa"
  | "verificacaoReprovada"
  | "areaInsuficiente"
  | "coberturaAcimaMaxima"
  | "creditosExpirando"
  | "foraScee"
  | "gd3"
  | "distanciaCidade"
  | "semConfiguracao"
  | "tarifaPersonalizadaGd3"
  | "cargaCsvInvalida"
  | "art17Indefinido";

export type Aviso = { codigo: CodigoAviso; parametros?: Record<string, number | string> };

export type Proposta = {
  entrada: EntradaProposta;
  cidade: Cidade;
  distanciaCidadeKm: number | null;
  modulo: Modulo;
  inversor: Inversor;
  tarifa: TarifaDecomposta;
  tarifaCheiaComTributosRKWh: number;
  fonteTarifa: { distribuidora: string; resolucao: string; vigencia: { inicio: string; fim: string } } | null;
  enquadramento: Enquadramento;
  dimensionamento: {
    potenciaAlvoKWp: number;
    rendimentoEspecificoKWhKWp: number;
    faturaOriginalAno1R: number;
    faturaResidualMinimaAno1R: number;
    coberturaMaximaValorPct: number;
    coberturaAlcancadaValorPct: number;
    coberturaAlcancadaEnergiaPct: number;
  };
  arranjo: {
    configuracao: ConfiguracaoArranjo | null;
    numeroModulos: number;
    potenciaCcKWp: number;
    potenciaCaKW: number;
    relacaoCcCa: number;
    areaNecessariaM2: number;
  };
  temperaturasProjeto: { tempMinC: number; tempMaxCelulaC: number };
  verificacoes: Verificacao[];
  simulacao: {
    geracaoMensalKWh: number[];
    energiaAnualKWh: number;
    irradiacaoPoaKWhM2: number;
    irradiacaoGhiKWhM2: number;
    performanceRatio: number;
    cascata: CascataPerdas;
    perfilDiarioMedioW: { geracao: number[]; carga: number[] }[];
  };
  simultaneidade: { autoconsumoMensalKWh: number[]; injetadaMensalKWh: number[]; consumoMensalKWh: number[]; fracaoAutoconsumoPct: number };
  projecao: Projecao;
  financeiro: { cenarios: ResultadoCenario[]; lcoeRKWh: number; investimentoR: number };
  pos2029: Array<{ cenario: CenarioPos2029; vplR: number; paybackAnos: number | null; tir: number | null; economia25AnosR: number }>;
  /**
   * Tornado do VPL à vista. A variação de cada premissa vem como número (formatado pela interface):
   * "relativa" = variação percentual sobre o valor base; "absoluta" = valor do parâmetro em %;
   * "cenario" = código do cenário pós-2029.
   */
  sensibilidade: Array<{
    parametro: string;
    baixoVplR: number;
    altoVplR: number;
    tipoVariacao: "relativa" | "absoluta" | "cenario";
    variacaoBaixo: number | CenarioPos2029;
    variacaoAlto: number | CenarioPos2029;
  }>;
  avisos: Aviso[];
};

/** Tarifa da distribuidora (componentes ANEEL) ou informada pelo usuário. */
export function obterTarifa(entrada: Pick<EntradaProposta, "distribuidoraId" | "subgrupo" | "tarifaPersonalizada">): {
  tarifa: TarifaDecomposta;
  fonte: Proposta["fonteTarifa"];
} {
  if (entrada.distribuidoraId === "personalizada" && entrada.tarifaPersonalizada) {
    const p = entrada.tarifaPersonalizada;
    return {
      tarifa: {
        teEnergia: 0, teTransporte: 0, teEncargos: 0, teOutros: p.teRMWh / 1000,
        tusdFioA: 0, tusdFioB: p.fioBRMWh / 1000, tusdEncargos: 0, tusdPerdas: 0, tusdOutros: (p.tusdRMWh - p.fioBRMWh) / 1000,
        tusdTransmissao: 0, pedEeTfsee: 0, totalTe: p.teRMWh / 1000, totalTusd: p.tusdRMWh / 1000,
      },
      fonte: null,
    };
  }
  const d = tarifas.distribuidoras.find((x) => x.id === entrada.distribuidoraId) ?? tarifas.distribuidoras[0];
  const sub = d.subgrupos[entrada.subgrupo as keyof typeof d.subgrupos];
  return {
    tarifa: decomporTarifa(sub.componentesRMWh as Record<string, number>),
    fonte: { distribuidora: d.sigla, resolucao: d.resolucao, vigencia: d.vigencia },
  };
}

export const INVERSOR_AUTOMATICO = "auto";
const CATALOGO_INVERSORES = equipamentos.inversores as Inversor[];

function resolverEquipamentos(e: EntradaProposta): { modulo: Modulo; inversor: Inversor | null } {
  const modulo = e.moduloPersonalizado ?? equipamentos.modulos.find((m) => m.id === e.moduloId) ?? equipamentos.modulos[1];
  if (e.inversorPersonalizado) return { modulo, inversor: e.inversorPersonalizado };
  if (e.inversorId === INVERSOR_AUTOMATICO) return { modulo, inversor: null };
  return { modulo, inversor: CATALOGO_INVERSORES.find((i) => i.id === e.inversorId) ?? CATALOGO_INVERSORES[1] };
}

function sistema(e: EntradaProposta, potenciaCcW: number, potenciaCaW: number, inversor: Inversor, modulo: Modulo): SistemaFv {
  const t = e.premissas.tecnicas;
  return {
    inclinacaoGraus: e.instalacao.inclinacaoGraus,
    azimuteGraus: e.instalacao.azimuteGraus,
    albedo: t.albedo,
    modeloTransposicao: t.modeloTransposicao,
    potenciaCcW,
    potenciaCaW,
    etaInversor: inversor.etaNominal,
    noctC: modulo.noctC,
    gammaPorC: modulo.coefPotenciaPctC / 100,
    perdas: {
      sujidadePct: t.sujidadePct,
      sombreamentoPct: e.instalacao.sombreamentoPct,
      mismatchPct: t.mismatchPct,
      cabosCcPct: t.cabosCcPct,
      cabosCaPct: t.cabosCaPct,
      disponibilidadePct: t.disponibilidadePct,
    },
  };
}

const kWhPorPasso = (serieW: Float64Array, passoMin: number) => Float64Array.from(serieW, (w) => (w * passoMin) / 60 / 1000);

/** Cache do ano típico por cidade: a geração do clima é a etapa mais cara e não depende do sistema. */
const cacheClima = new Map<string, SerieClima>();
function anoTipico(cidade: Cidade): SerieClima {
  const existente = cacheClima.get(cidade.id);
  if (existente) return existente;
  const serie = gerarAnoTipico(cidade, 60, `cidade|${cidade.id}`);
  cacheClima.set(cidade.id, serie);
  return serie;
}

export function calcularProposta(entradaBruta: EntradaProposta): Proposta {
  const e = esquemaEntradaProposta.parse(entradaBruta);
  const avisos: Aviso[] = [];
  let cidade = cidadePorId(e.cidadeId);
  let distanciaCidadeKm: number | null = null;
  if (e.coordenadas) {
    const proxima = cidadeMaisProxima(e.coordenadas.latitude, e.coordenadas.longitude);
    cidade = proxima.cidade;
    distanciaCidadeKm = proxima.distanciaKm;
    if (proxima.distanciaKm > 50) avisos.push({ codigo: "distanciaCidade", parametros: { km: Math.round(proxima.distanciaKm), cidade: cidade.nome } });
  }
  if (!cidade) throw new Error(`Cidade desconhecida: ${e.cidadeId}`);

  const { modulo, inversor: inversorEscolhido } = resolverEquipamentos(e);
  // Para o rendimento específico, o modo automático usa a eficiência mediana do catálogo.
  const etaReferencia = [...CATALOGO_INVERSORES].sort((a, b) => a.etaNominal - b.etaNominal)[Math.floor(CATALOGO_INVERSORES.length / 2)];
  let inversor: Inversor = inversorEscolhido ?? etaReferencia;
  const { tarifa, fonte } = obterTarifa(e);
  if (!fonte) avisos.push({ codigo: "tarifaPersonalizadaGd3" });
  const tributos: Tributos = e.tributos;
  const ft = fatorTributos(tributos);
  const tarifaCheiaComTributosRKWh = (tarifa.totalTe + tarifa.totalTusd) * ft;
  const p = e.premissas;

  // Carga horária
  const perfil = PERFIS_CARGA[e.segmento as Segmento];
  let carga = cargaHorariaPorPerfil(e.consumoMensalKWh, perfil);
  if (e.cargaCsv) {
    const importada = importarCargaCsv(e.cargaCsv, e.consumoMensalKWh, perfil);
    if (importada.ok) carga = importada.cargaHorariaKWh;
    else avisos.push({ codigo: "cargaCsvInvalida", parametros: { erro: importada.erro, linha: importada.linha ?? 0 } });
  }
  const consumoAnual = carga.reduce((a, b) => a + b, 0);

  // Geração por kWp (inversor dimensionado pela relação CC/CA alvo)
  const clima = anoTipico(cidade);
  const unitario = simularSerie(clima, sistema(e, 1000, 1000 / p.tecnicas.relacaoCcCaAlvo, inversor, modulo));
  const geracaoPorKWp = kWhPorPasso(unitario.potenciaCaW, clima.passoMin);
  const fatorAno1 = 1 - p.tecnicas.degradacaoPrimeiroAnoPct / 100;
  const rendimento = geracaoPorKWp.reduce((a, b) => a + b, 0);

  // Enquadramento preliminar para a regra de compensação (refeito com a potência final).
  const enquadramentoPara = (potenciaCaKW: number) =>
    enquadrar({ potenciaCaKW, despachavel: false, dataProtocolo: e.dataProtocolo, modalidade: e.modalidade, maiorParticipacaoPct: e.maiorParticipacaoPct });
  const regraDe = (enq: Enquadramento, cenario: CenarioPos2029 = p.regulatorias.cenarioPos2029) => ({
    categoria: enq.categoria ?? "GD2",
    anoRegraArt17: enq.anoRegraArt17 ?? 2029,
    cenarioPos2029: cenario,
    beneficioPctTusd: p.regulatorias.beneficioPctTusd,
  });
  const projetarCom = (geracaoHoraria: Float64Array, enq: Enquadramento, anos: number, ajustes: Partial<{ cenario: CenarioPos2029; reajuste: number; degradacao: number; tarifaFator: number }> = {}) =>
    projetar({
      cargaHorariaKWh: carga,
      geracaoHorariaKWh: geracaoHoraria,
      anoInicio: e.inicio.ano,
      mesInicio: e.inicio.mes,
      horizonteAnos: anos,
      degradacaoPrimeiroAnoPct: p.tecnicas.degradacaoPrimeiroAnoPct,
      degradacaoAnualPct: ajustes.degradacao ?? p.tecnicas.degradacaoAnualPct,
      reajusteTarifaAnualPct: ajustes.reajuste ?? p.financeiras.reajusteTarifaAnualPct,
      tarifa: ajustes.tarifaFator ? escalarTarifa(tarifa, ajustes.tarifaFator) : tarifa,
      tributos,
      ligacao: e.ligacao as Ligacao,
      cadUnico: e.cadUnico,
      regra: regraDe(enq, ajustes.cenario),
    });
  const escalar = (kWp: number) => Float64Array.from(geracaoPorKWp, (v) => v * kWp);
  const faturaAno1 = (kWp: number) => {
    const enq = enquadramentoPara((kWp / p.tecnicas.relacaoCcCaAlvo) || 0.001);
    const proj = projetarCom(escalar(kWp), enq, 1);
    return { com: proj.anos[0].faturaComR, sem: proj.anos[0].faturaSemR };
  };

  // Dimensionamento
  const dispKWh = custoDisponibilidadeKWh(e.ligacao as Ligacao, e.cadUnico);
  const faturaOriginal = faturaAno1(0).sem;
  const kWpGrande = Math.max(1, ((consumoAnual / rendimento) * 20) / fatorAno1);
  const faturaResidualMinima = faturaAno1(kWpGrande).com;
  const coberturaMaximaValorPct = faturaOriginal > 0 ? (1 - faturaResidualMinima / faturaOriginal) * 100 : 0;
  let potenciaAlvoKWp: number;
  if (e.dimensionamento.modo === "energia") {
    const liquido = Math.max(0, consumoAnual - 12 * dispKWh);
    potenciaAlvoKWp = (liquido * (e.dimensionamento.coberturaPct / 100)) / (rendimento * fatorAno1);
  } else {
    let alvoPct = e.dimensionamento.coberturaPct;
    if (alvoPct > coberturaMaximaValorPct) {
      avisos.push({ codigo: "coberturaAcimaMaxima", parametros: { maxima: Math.round(coberturaMaximaValorPct * 10) / 10 } });
      alvoPct = coberturaMaximaValorPct * 0.999;
    }
    const alvoFatura = faturaOriginal * (1 - alvoPct / 100);
    let a = 0;
    let b = kWpGrande;
    for (let i = 0; i < 50; i++) {
      const m = (a + b) / 2;
      if (faturaAno1(m).com > alvoFatura) a = m;
      else b = m;
    }
    potenciaAlvoKWp = b;
  }

  // Arranjo
  const tempMinC = Math.min(...cidade.tempMinC) - p.tecnicas.margemTempMinC;
  const tempMaxCelulaC = Math.max(...cidade.tempMaxC) + ((modulo.noctC - 20) / 800) * 1000;
  const modulosDesejados = Math.max(1, Math.round((potenciaAlvoKWp * 1000) / modulo.potenciaWp));
  const parametrosArranjo = {
    modulo,
    modulosDesejados,
    tempMinProjetoC: tempMinC,
    tempMaxCelulaC,
    fatorSegurancaCorrente: p.tecnicas.fatorSegurancaCorrente,
    relacaoCcCaAlvo: p.tecnicas.relacaoCcCaAlvo,
  };
  let configuracao: ConfiguracaoArranjo | null;
  if (inversorEscolhido) {
    configuracao = sugerirConfiguracao({ ...parametrosArranjo, inversor });
  } else {
    const escolha = escolherInversor(CATALOGO_INVERSORES, parametrosArranjo);
    configuracao = escolha?.configuracao ?? null;
    if (escolha) inversor = escolha.inversor;
  }
  if (!configuracao) avisos.push({ codigo: "semConfiguracao" });
  const config: ConfiguracaoArranjo = configuracao ?? { modulosEmSerie: modulosDesejados, stringsPorMppt: [1], quantidadeInversores: 1 };
  const numeroModulos = configuracao ? totalModulos(config) : modulosDesejados;
  const potenciaCcW = numeroModulos * modulo.potenciaWp;
  const potenciaCaW = config.quantidadeInversores * inversor.potenciaCaW;
  const areaModulo = modulo.comprimentoM * modulo.larguraM;
  const verificacoes = verificarArranjo({
    modulo,
    inversor,
    configuracao: config,
    tempMinProjetoC: tempMinC,
    tempMaxCelulaC,
    fatorSegurancaCorrente: p.tecnicas.fatorSegurancaCorrente,
    faixaRelacaoCcCa: p.tecnicas.faixaRelacaoCcCa,
    areaDisponivelM2: e.instalacao.areaM2 ?? undefined,
    fatorOcupacao: p.tecnicas.fatorOcupacao,
  });
  for (const v of verificacoes) {
    if (v.aprovado) continue;
    if (v.codigo === "relacaoCcCa") avisos.push({ codigo: "relacaoCcCaForaFaixa", parametros: { valor: Math.round(v.valor * 100) / 100 } });
    else if (v.codigo === "area") avisos.push({ codigo: "areaInsuficiente", parametros: { necessaria: Math.round(v.valor), disponivel: Math.round(v.limite) } });
    else avisos.push({ codigo: "verificacaoReprovada", parametros: { verificacao: v.codigo } });
  }

  // Simulação final
  const sim = simularSerie(clima, sistema(e, potenciaCcW, potenciaCaW, inversor, modulo));
  const geracaoHoraria = kWhPorPasso(sim.potenciaCaW, clima.passoMin);
  const geracaoMensal = balancoMensal(carga, geracaoHoraria, 1).map((b) => b.geracaoKWh);
  const [prMin, prMax] = p.tecnicas.faixaPr;
  if (sim.performanceRatio < prMin || sim.performanceRatio > prMax) {
    avisos.push({ codigo: "prForaFaixa", parametros: { pr: Math.round(sim.performanceRatio * 1000) / 1000, min: prMin, max: prMax } });
  }
  let somaGhi = 0;
  clima.ghiWM2.forEach((g) => (somaGhi += g));

  // Perfil diário médio por mês (W), para o gráfico de simultaneidade.
  const perfilDiarioMedioW = Array.from({ length: 12 }, (_, m) => {
    const ger = new Array(24).fill(0);
    const car = new Array(24).fill(0);
    let dias = 0;
    clima.dias.forEach((d, i) => {
      if (Number(d.chave.slice(5, 7)) !== m + 1) return;
      dias++;
      for (let h = 0; h < 24; h++) {
        ger[h] += geracaoHoraria[i * 24 + h] * 1000;
        car[h] += carga[i * 24 + h] * 1000;
      }
    });
    return { geracao: ger.map((v) => v / dias), carga: car.map((v) => v / dias) };
  });

  const enquadramento = enquadramentoPara(potenciaCaW / 1000);
  if (enquadramento.porte === "foraScee") avisos.push({ codigo: "foraScee", parametros: { limite: enquadramento.limiteAplicavelKW } });
  if (enquadramento.categoria === "GD3") avisos.push({ codigo: "gd3" });
  avisos.push({ codigo: "art17Indefinido", parametros: { ano: enquadramento.anoRegraArt17 ?? 2029 } });

  const horizonte = p.financeiras.horizonteAnos;
  const projecao = projetarCom(geracaoHoraria, enquadramento, horizonte);
  const ano1 = projecao.anos[0];
  const balanco1 = balancoMensal(carga, geracaoHoraria, fatorAno1);
  if (projecao.anos.some((a) => a.creditosExpiradosKWh > 0)) {
    const totalExpirado = projecao.anos.reduce((s, a) => s + a.creditosExpiradosKWh, 0);
    avisos.push({ codigo: "creditosExpirando", parametros: { kWh: Math.round(totalExpirado) } });
  }

  // Financeiro
  const investimentoR = p.financeiras.custoRWp * potenciaCcW;
  const premissasFin = (invest: number) => ({
    investimentoR: invest,
    omAnualPctInvestimento: p.financeiras.omAnualPctInvestimento,
    reajusteOmAnualPct: p.financeiras.reajusteOmAnualPct,
    trocaInversorAno: p.financeiras.trocaInversorAno,
    trocaInversorCustoR: (p.financeiras.trocaInversorCustoRKWca * potenciaCaW) / 1000,
    taxaDescontoAnualPct: p.financeiras.taxaDescontoAnualPct,
    financiamento: p.financeiras.financiamento,
    custoMaisTaxa: {
      custoEquipamentosR: (invest * p.financeiras.custoMaisTaxa.custoEquipamentosPctInvestimento) / 100,
      taxaPctEconomia: p.financeiras.custoMaisTaxa.taxaPctEconomia,
      meses: p.financeiras.custoMaisTaxa.meses,
    },
  });
  const cenariosDe = (proj: Projecao, invest = investimentoR, taxaDescontoPct?: number) => {
    const prem = premissasFin(invest);
    if (taxaDescontoPct !== undefined) prem.taxaDescontoAnualPct = taxaDescontoPct;
    return calcularCenarios({
      economiaAnualR: proj.anos.map((a) => a.economiaR),
      economiaMensalAno1R: proj.meses.slice(0, 12).map((m) => m.faturaSemR - m.faturaComR),
      geracaoAnualKWh: proj.anos.map((a) => a.geracaoKWh),
      premissas: prem,
    });
  };
  const financeiro = cenariosDe(projecao);

  // Pós-2029: três cenários, compra à vista
  const pos2029 = (["fioB100", "somenteTe", "teMaisBeneficios"] as CenarioPos2029[]).map((cenario) => {
    const proj = projetarCom(geracaoHoraria, enquadramento, horizonte, { cenario });
    const c = cenariosDe(proj).cenarios[0];
    return { cenario, vplR: c.vplR, paybackAnos: c.paybackAnos, tir: c.tir.tir, economia25AnosR: c.economiaAcumuladaR };
  });

  // Sensibilidade (tornado) do VPL à vista
  const vplCom = (ajuste: Parameters<typeof projetarCom>[3], geracaoFator = 1, investFator = 1, taxaDesconto?: number) =>
    cenariosDe(projetarCom(Float64Array.from(geracaoHoraria, (v) => v * geracaoFator), enquadramento, horizonte, ajuste), investimentoR * investFator, taxaDesconto)
      .cenarios[0].vplR;
  const r = p.financeiras.reajusteTarifaAnualPct;
  const td = p.financeiras.taxaDescontoAnualPct;
  const dg = p.tecnicas.degradacaoAnualPct;
  const sensibilidade = [
    { parametro: "tarifa", baixoVplR: vplCom({ tarifaFator: 0.8 }), altoVplR: vplCom({ tarifaFator: 1.2 }), tipoVariacao: "relativa" as const, variacaoBaixo: -20, variacaoAlto: 20 },
    { parametro: "geracao", baixoVplR: vplCom({}, 0.9), altoVplR: vplCom({}, 1.1), tipoVariacao: "relativa" as const, variacaoBaixo: -10, variacaoAlto: 10 },
    { parametro: "investimento", baixoVplR: vplCom({}, 1, 1.2), altoVplR: vplCom({}, 1, 0.8), tipoVariacao: "relativa" as const, variacaoBaixo: 20, variacaoAlto: -20 },
    { parametro: "reajuste", baixoVplR: vplCom({ reajuste: r - 2 }), altoVplR: vplCom({ reajuste: r + 2 }), tipoVariacao: "absoluta" as const, variacaoBaixo: r - 2, variacaoAlto: r + 2 },
    { parametro: "taxaDesconto", baixoVplR: vplCom({}, 1, 1, td + 3), altoVplR: vplCom({}, 1, 1, Math.max(0, td - 3)), tipoVariacao: "absoluta" as const, variacaoBaixo: td + 3, variacaoAlto: Math.max(0, td - 3) },
    { parametro: "degradacao", baixoVplR: vplCom({ degradacao: dg + 0.25 }), altoVplR: vplCom({ degradacao: Math.max(0, dg - 0.25) }), tipoVariacao: "absoluta" as const, variacaoBaixo: dg + 0.25, variacaoAlto: Math.max(0, dg - 0.25) },
    {
      parametro: "pos2029",
      baixoVplR: pos2029.find((x) => x.cenario === "somenteTe")!.vplR,
      altoVplR: pos2029.find((x) => x.cenario === "fioB100")!.vplR,
      tipoVariacao: "cenario" as const,
      variacaoBaixo: "somenteTe" as CenarioPos2029,
      variacaoAlto: "fioB100" as CenarioPos2029,
    },
  ].sort((a, b) => Math.abs(b.altoVplR - b.baixoVplR) - Math.abs(a.altoVplR - a.baixoVplR));

  const consumoMensal = balanco1.map((b) => b.consumoKWh);
  const autoconsumoMensal = balanco1.map((b) => b.autoconsumoKWh);
  const geracaoAno1 = balanco1.reduce((s, b) => s + b.geracaoKWh, 0);
  return {
    entrada: e,
    cidade,
    distanciaCidadeKm,
    modulo,
    inversor,
    tarifa,
    tarifaCheiaComTributosRKWh,
    fonteTarifa: fonte,
    enquadramento,
    dimensionamento: {
      potenciaAlvoKWp,
      rendimentoEspecificoKWhKWp: rendimento,
      faturaOriginalAno1R: faturaOriginal,
      faturaResidualMinimaAno1R: faturaResidualMinima,
      coberturaMaximaValorPct,
      coberturaAlcancadaValorPct: ano1.faturaSemR > 0 ? (1 - ano1.faturaComR / ano1.faturaSemR) * 100 : 0,
      coberturaAlcancadaEnergiaPct: consumoAnual > 0 ? (ano1.geracaoKWh / consumoAnual) * 100 : 0,
    },
    arranjo: {
      configuracao,
      numeroModulos,
      potenciaCcKWp: potenciaCcW / 1000,
      potenciaCaKW: potenciaCaW / 1000,
      relacaoCcCa: potenciaCcW / potenciaCaW,
      areaNecessariaM2: (numeroModulos * areaModulo) / p.tecnicas.fatorOcupacao,
    },
    temperaturasProjeto: { tempMinC, tempMaxCelulaC },
    verificacoes,
    simulacao: {
      geracaoMensalKWh: geracaoMensal,
      energiaAnualKWh: sim.energiaCaKWh,
      irradiacaoPoaKWhM2: sim.irradiacaoPoaKWhM2,
      irradiacaoGhiKWhM2: (somaGhi * clima.passoMin) / 60 / 1000,
      performanceRatio: sim.performanceRatio,
      cascata: sim.cascata,
      perfilDiarioMedioW,
    },
    simultaneidade: {
      autoconsumoMensalKWh: autoconsumoMensal,
      injetadaMensalKWh: balanco1.map((b) => b.injetadaKWh),
      consumoMensalKWh: consumoMensal,
      fracaoAutoconsumoPct: geracaoAno1 > 0 ? (autoconsumoMensal.reduce((a, b) => a + b, 0) / geracaoAno1) * 100 : 0,
    },
    projecao,
    financeiro: { ...financeiro, investimentoR },
    pos2029,
    sensibilidade,
    avisos,
  };
}

function escalarTarifa(t: TarifaDecomposta, fator: number): TarifaDecomposta {
  return Object.fromEntries(Object.entries(t).map(([k, v]) => [k, v * fator])) as TarifaDecomposta;
}

/** Entrada padrão do assistente (início no mês seguinte à data informada). */
export function entradaPadrao(hojeIso: string, premissas: Premissas, tributos: Tributos): EntradaProposta {
  const [ano, mes] = hojeIso.split("-").map(Number);
  const inicio = mes === 12 ? { ano: ano + 1, mes: 1 } : { ano, mes: mes + 1 };
  return {
    versao: 1,
    cliente: "",
    cidadeId: "3550308",
    coordenadas: null,
    ligacao: "bifasico3",
    cadUnico: false,
    dataProtocolo: hojeIso,
    modalidade: "autoconsumoLocal",
    maiorParticipacaoPct: 100,
    consumoMensalKWh: [520, 500, 510, 470, 430, 400, 410, 430, 450, 480, 500, 530],
    segmento: "residencial",
    cargaCsv: null,
    distribuidoraId: "cpfl-paulista",
    subgrupo: "B1",
    tarifaPersonalizada: null,
    tributos,
    instalacao: { tipo: "telhadoCeramico", areaM2: 60, inclinacaoGraus: 20, azimuteGraus: 0, sombreamentoPct: 0 },
    dimensionamento: { modo: "energia", coberturaPct: 100 },
    moduloId: "mod-generico-550",
    inversorId: INVERSOR_AUTOMATICO,
    moduloPersonalizado: null,
    inversorPersonalizado: null,
    inicio,
    premissas,
  };
}
