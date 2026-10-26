/**
 * Ponte com o CMMS: alerta → OS pré-preenchida → exportação → importação da OS concluída →
 * verificação do resultado pela geração. O aplicativo não substitui o CMMS: o contrato abaixo
 * (schema versionado) é o formato de troca.
 */
import { z } from "zod";
import { chaveDiaLocal, diferencaDias } from "../util/tempo";
import type { AgregadoDia } from "../monitoramento/agregados";
import { type Alerta, piCorrigidoSerie, type TipoAlerta } from "../monitoramento/detectores";
import type { CategoriaAlarme, UsinaMonitorada } from "../monitoramento/frota";
import type { EventoUsuario } from "../monitoramento/gerador";
import { distanciaKm } from "../simulador/cidades";

export const SCHEMA_OS = "irradiance-works/ordem-servico";
export const VERSAO_OS = 1;

export const esquemaAtivo = z.object({
  usinaId: z.string(),
  inversorId: z.string().optional(),
  mpptId: z.string().optional(),
  /** Caminho estável na árvore de ativos: usina › inversor › MPPT (compatível com a hierarquia do CMMS). */
  caminho: z.string(),
});

export const TIPOS_ALERTA = [
  "inversorOffline", "perdaComunicacao", "stringDesligada", "sombreamento", "sujidade",
  "clipping", "degradacaoAcelerada", "subdesempenhoInversor", "alarme",
] as const;

export const esquemaOrdemServico = z.object({
  schema: z.literal(SCHEMA_OS),
  versao: z.literal(VERSAO_OS),
  id: z.string().regex(/^OS-[A-Z0-9-]+$/),
  criadaEm: z.string().datetime(),
  origem: z.enum(["analise", "alarme", "preventiva"]),
  alertaId: z.string().nullable(),
  tipoAlerta: z.enum(TIPOS_ALERTA).nullable(),
  categoriaAlarme: z.enum(["isolamento", "rede", "sobretemperatura", "arco", "comunicacao"]).nullable(),
  ativo: esquemaAtivo,
  tipo: z.enum(["corretiva", "preventiva", "preditiva"]),
  prioridade: z.number().int().min(1).max(4),
  perdaRDia: z.number().min(0),
  severidade: z.enum(["info", "atencao", "critico"]),
  dataDeteccao: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  dataRecomendada: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  checklist: z.array(z.object({ id: z.string(), feito: z.boolean() })),
  status: z.enum(["aberta", "emAndamento", "concluida", "cancelada"]),
  abertaEm: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  iniciadaEm: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  concluidaEm: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  acaoExecutada: z.enum(["limpeza", "reparo", "substituicao", "ajusteConfiguracao", "inspecaoSemAcao"]).nullable(),
  observacoes: z.string().max(2000),
  rotaId: z.string().nullable(),
});

export type OrdemServico = z.infer<typeof esquemaOrdemServico>;

/** Checklist sugerido por tipo de problema (os rótulos são traduzidos na interface). */
export const CHECKLISTS: Record<string, string[]> = {
  sujidade: ["inspecaoVisual", "lavagemAguaDesmineralizada", "semAbrasivos", "registroFotografico", "conferirProducao"],
  stringDesligada: ["bloqueioSeguranca", "medirVocIsc", "verificarFusiveisConectores", "termografia", "religarConferir"],
  inversorOffline: ["verificarDisjuntorCa", "lerDisplayHistorico", "reiniciarInversor", "verificarTensaoRede", "conferirProducao"],
  perdaComunicacao: ["verificarDatalogger", "verificarRedeInternet", "reiniciarDatalogger", "confirmarReenvio"],
  sombreamento: ["identificarObstaculo", "registroFotografico", "podaOuRemocao", "avaliarOtimizadores"],
  clipping: ["avaliarRelacaoCcCa", "avaliarExpansaoInversor", "registrarDecisao"],
  degradacaoAcelerada: ["curvaIV", "termografia", "inspecaoVisualDelaminacao", "acionarGarantia"],
  subdesempenhoInversor: ["compararInversores", "verificarVentilacao", "medirStrings", "verificarFusiveisConectores"],
  "alarme:isolamento": ["bloqueioSeguranca", "medirResistenciaIsolamento", "verificarCaixasJuncao", "religarConferir"],
  "alarme:rede": ["medirTensaoRede", "verificarAjustesProtecao", "acionarDistribuidora", "registrarOcorrencias"],
  "alarme:sobretemperatura": ["verificarVentilacao", "limparFiltros", "verificarSombreamentoInversor", "conferirProducao"],
  "alarme:arco": ["bloqueioSeguranca", "inspecaoConectores", "termografia", "rearmeAfci", "religarConferir"],
  "alarme:comunicacao": ["verificarDatalogger", "verificarCabeamento"],
  limpezaPreventiva: ["inspecaoVisual", "lavagemAguaDesmineralizada", "semAbrasivos", "registroFotografico", "conferirProducao"],
};

const TIPO_POR_ALERTA: Record<TipoAlerta, OrdemServico["tipo"]> = {
  inversorOffline: "corretiva",
  perdaComunicacao: "corretiva",
  stringDesligada: "corretiva",
  alarme: "corretiva",
  sujidade: "preditiva",
  sombreamento: "preditiva",
  clipping: "preditiva",
  degradacaoAcelerada: "preditiva",
  subdesempenhoInversor: "preditiva",
};

const PESO_SEVERIDADE = { info: 1, atencao: 2, critico: 3 } as const;

/** Prioridade 1 (urgente) a 4: severidade crítica ou perda ≥ R$ 200/dia → P1; ≥ 50 → P2; ≥ 10 → P3. */
export function prioridade(perdaRDia: number, severidade: OrdemServico["severidade"]): number {
  if (severidade === "critico" || perdaRDia >= 200) return 1;
  if (perdaRDia >= 50) return 2;
  if (perdaRDia >= 10 || PESO_SEVERIDADE[severidade] >= 2) return 3;
  return 4;
}

export const caminhoAtivo = (usinaId: string, inversorId?: string, mpptId?: string) => [usinaId, inversorId, mpptId].filter(Boolean).join("/");

function novoId(usinaId: string, sequencia: number) {
  return `OS-${usinaId.replace(/[^A-Z0-9]/gi, "").toUpperCase()}-${String(sequencia).padStart(4, "0")}`;
}

export function criarOsDeAlerta(alerta: Alerta, agora: Date, sequencia: number): OrdemServico {
  const hoje = chaveDiaLocal(agora.getTime());
  const chaveChecklist = alerta.tipo === "alarme" ? `alarme:${alerta.categoriaAlarme}` : alerta.tipo;
  return {
    schema: SCHEMA_OS,
    versao: VERSAO_OS,
    id: novoId(alerta.usinaId, sequencia),
    criadaEm: agora.toISOString(),
    origem: alerta.origem,
    alertaId: alerta.id,
    tipoAlerta: alerta.tipo,
    categoriaAlarme: alerta.categoriaAlarme ?? null,
    ativo: { usinaId: alerta.usinaId, inversorId: alerta.ativo.inversorId, mpptId: alerta.ativo.mpptId, caminho: caminhoAtivo(alerta.usinaId, alerta.ativo.inversorId, alerta.ativo.mpptId) },
    tipo: TIPO_POR_ALERTA[alerta.tipo],
    prioridade: prioridade(alerta.perdaRDia, alerta.severidade),
    perdaRDia: alerta.perdaRDia,
    severidade: alerta.severidade,
    dataDeteccao: alerta.deteccao,
    dataRecomendada: null,
    checklist: (CHECKLISTS[chaveChecklist] ?? []).map((id) => ({ id, feito: false })),
    status: "aberta",
    abertaEm: hoje,
    iniciadaEm: null,
    concluidaEm: null,
    acaoExecutada: null,
    observacoes: "",
    rotaId: null,
  };
}

export function criarOsLimpezaPreventiva(usina: UsinaMonitorada, dataRecomendada: string, perdaRDia: number, agora: Date, sequencia: number, rotaId: string | null): OrdemServico {
  const hoje = chaveDiaLocal(agora.getTime());
  return {
    schema: SCHEMA_OS,
    versao: VERSAO_OS,
    id: novoId(usina.id, sequencia),
    criadaEm: agora.toISOString(),
    origem: "preventiva",
    alertaId: null,
    tipoAlerta: null,
    categoriaAlarme: null,
    ativo: { usinaId: usina.id, caminho: usina.id },
    tipo: "preventiva",
    prioridade: prioridade(perdaRDia, "atencao"),
    perdaRDia,
    severidade: "atencao",
    dataDeteccao: null,
    dataRecomendada,
    checklist: CHECKLISTS.limpezaPreventiva.map((id) => ({ id, feito: false })),
    status: "aberta",
    abertaEm: hoje,
    iniciadaEm: null,
    concluidaEm: null,
    acaoExecutada: null,
    observacoes: "",
    rotaId,
  };
}

/** Evento para o gerador quando a OS é concluída (fecha o ciclo na série simulada). */
export function eventoDaOs(os: OrdemServico): EventoUsuario | null {
  if (os.status !== "concluida" || !os.concluidaEm || !os.acaoExecutada || os.acaoExecutada === "inspecaoSemAcao") return null;
  if (os.acaoExecutada === "limpeza" || os.tipoAlerta === "sujidade" || os.origem === "preventiva") {
    return { id: os.id, usinaId: os.ativo.usinaId, tipo: "limpeza", chave: os.concluidaEm };
  }
  if (!os.tipoAlerta) return null;
  return {
    id: os.id,
    usinaId: os.ativo.usinaId,
    tipo: "reparo",
    chave: os.concluidaEm,
    alvo: {
      tipo: os.tipoAlerta,
      categoria: (os.categoriaAlarme ?? undefined) as CategoriaAlarme | undefined,
      inversorId: os.ativo.inversorId,
      mpptId: os.ativo.mpptId,
    },
  };
}

// ---------------------------------------------------------------------------------------------
// Exportação e importação (CSV e JSON)
// ---------------------------------------------------------------------------------------------

export const COLUNAS_CSV = [
  "id", "schema", "versao", "criadaEm", "origem", "alertaId", "tipoAlerta", "categoriaAlarme", "caminhoAtivo", "usinaId",
  "inversorId", "mpptId", "tipo", "prioridade", "perdaRDia", "severidade", "dataDeteccao", "dataRecomendada", "status",
  "abertaEm", "iniciadaEm", "concluidaEm", "acaoExecutada", "checklist", "observacoes", "rotaId",
] as const;

const escaparCsv = (v: unknown) => {
  const texto = v === null || v === undefined ? "" : String(v);
  return /[",;\n]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
};

export function exportarJson(ordens: OrdemServico[], agora: Date): string {
  return JSON.stringify({ schema: SCHEMA_OS, versao: VERSAO_OS, geradoEm: agora.toISOString(), ordens }, null, 2);
}

export function exportarCsv(ordens: OrdemServico[]): string {
  const linhas = ordens.map((o) =>
    [
      o.id, o.schema, o.versao, o.criadaEm, o.origem, o.alertaId, o.tipoAlerta, o.categoriaAlarme, o.ativo.caminho, o.ativo.usinaId,
      o.ativo.inversorId, o.ativo.mpptId, o.tipo, o.prioridade, o.perdaRDia.toFixed(2), o.severidade, o.dataDeteccao, o.dataRecomendada,
      o.status, o.abertaEm, o.iniciadaEm, o.concluidaEm, o.acaoExecutada, o.checklist.map((c) => `${c.id}:${c.feito ? 1 : 0}`).join("|"),
      o.observacoes, o.rotaId,
    ]
      .map(escaparCsv)
      .join(","),
  );
  return [COLUNAS_CSV.join(","), ...linhas].join("\n");
}

function lerLinhaCsv(linha: string): string[] {
  const campos: string[] = [];
  let atual = "";
  let aspas = false;
  for (let i = 0; i < linha.length; i++) {
    const c = linha[i];
    if (aspas) {
      if (c === '"' && linha[i + 1] === '"') {
        atual += '"';
        i++;
      } else if (c === '"') aspas = false;
      else atual += c;
    } else if (c === '"') aspas = true;
    else if (c === ",") {
      campos.push(atual);
      atual = "";
    } else atual += c;
  }
  campos.push(atual);
  return campos;
}

export const esquemaConclusao = z.object({
  id: z.string().regex(/^OS-[A-Z0-9-]+$/),
  status: z.enum(["emAndamento", "concluida", "cancelada"]),
  concluidaEm: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  acaoExecutada: z.enum(["limpeza", "reparo", "substituicao", "ajusteConfiguracao", "inspecaoSemAcao"]).nullable(),
  observacoes: z.string().max(2000).optional(),
});
export type Conclusao = z.infer<typeof esquemaConclusao>;

export type ResultadoImportacao = { ok: true; conclusoes: Conclusao[]; ignoradas: number } | { ok: false; erro: "formato" | "schema" | "versao" | "linha"; linha?: number };

/**
 * Importa OS concluídas devolvidas pelo CMMS: JSON no envelope do schema (com "ordens" ou
 * "conclusoes") ou CSV com as colunas id, status, concluidaEm, acaoExecutada[, observacoes].
 */
export function importarConclusoes(texto: string): ResultadoImportacao {
  const conteudo = texto.trim();
  if (conteudo.startsWith("{")) {
    let dados: unknown;
    try {
      dados = JSON.parse(conteudo);
    } catch {
      return { ok: false, erro: "formato" };
    }
    const envelope = z.object({ schema: z.string(), versao: z.number(), ordens: z.array(z.unknown()).optional(), conclusoes: z.array(z.unknown()).optional() }).safeParse(dados);
    if (!envelope.success) return { ok: false, erro: "formato" };
    if (envelope.data.schema !== SCHEMA_OS) return { ok: false, erro: "schema" };
    if (envelope.data.versao !== VERSAO_OS) return { ok: false, erro: "versao" };
    const itens = envelope.data.conclusoes ?? envelope.data.ordens ?? [];
    const conclusoes: Conclusao[] = [];
    let ignoradas = 0;
    for (const item of itens) {
      const r = esquemaConclusao.safeParse(item);
      if (r.success) conclusoes.push(r.data);
      else ignoradas++;
    }
    return { ok: true, conclusoes, ignoradas };
  }
  const linhas = conteudo.split(/\r?\n/).filter((l) => l.trim());
  if (linhas.length < 2) return { ok: false, erro: "formato" };
  const cabecalho = lerLinhaCsv(linhas[0]).map((c) => c.trim());
  const idx = (nome: string) => cabecalho.indexOf(nome);
  if (idx("id") < 0 || idx("status") < 0) return { ok: false, erro: "formato" };
  const conclusoes: Conclusao[] = [];
  for (let i = 1; i < linhas.length; i++) {
    const c = lerLinhaCsv(linhas[i]);
    const valor = (nome: string) => (idx(nome) >= 0 && c[idx(nome)] !== "" ? c[idx(nome)] : null);
    if (valor("status") === "aberta") continue;
    const r = esquemaConclusao.safeParse({
      id: valor("id"),
      status: valor("status"),
      concluidaEm: valor("concluidaEm"),
      acaoExecutada: valor("acaoExecutada"),
      observacoes: valor("observacoes") ?? undefined,
    });
    if (!r.success) return { ok: false, erro: "linha", linha: i + 1 };
    conclusoes.push(r.data);
  }
  return { ok: true, conclusoes, ignoradas: 0 };
}

export function aplicarConclusoes(ordens: OrdemServico[], conclusoes: Conclusao[]): { ordens: OrdemServico[]; atualizadas: number; desconhecidas: string[] } {
  const porId = new Map(conclusoes.map((c) => [c.id, c]));
  let atualizadas = 0;
  const conhecidas = new Set(ordens.map((o) => o.id));
  const resultado = ordens.map((o) => {
    const c = porId.get(o.id);
    if (!c) return o;
    atualizadas++;
    return {
      ...o,
      status: c.status,
      iniciadaEm: o.iniciadaEm ?? (c.status !== "cancelada" ? (c.concluidaEm ?? o.abertaEm) : null),
      concluidaEm: c.status === "concluida" ? c.concluidaEm : null,
      acaoExecutada: c.status === "concluida" ? c.acaoExecutada : null,
      observacoes: c.observacoes ?? o.observacoes,
    };
  });
  return { ordens: resultado, atualizadas, desconhecidas: conclusoes.filter((c) => !conhecidas.has(c.id)).map((c) => c.id) };
}

// ---------------------------------------------------------------------------------------------
// Fechamento do ciclo: o CMMS não enxerga a geração; o aplicativo mede se a OS resolveu.
// ---------------------------------------------------------------------------------------------

export type Verificacao =
  | { situacao: "aguardandoDados"; diasDepois: number; diasNecessarios: number }
  | { situacao: "efetiva" | "naoEfetiva"; indiceAntes: number; indiceDepois: number; ganhoPct: number; energiaRecuperadaKWhDia: number; diasDepois: number };

const mediana = (v: number[]) => {
  const o = v.filter(Number.isFinite).sort((a, b) => a - b);
  if (o.length === 0) return NaN;
  const m = Math.floor(o.length / 2);
  return o.length % 2 ? o[m] : (o[m - 1] + o[m]) / 2;
};

const LIMIAR_GANHO_EFETIVO = 0.01;

/**
 * Compara a mediana do índice de desempenho (corrigido pelo sensor virtual) nos 7 dias antes e
 * depois da conclusão. Para falhas de inversor, usa a razão medida/esperada do próprio ativo.
 */
export function verificarResultado(os: OrdemServico, dias: AgregadoDia[], fatorCidade: Map<string, number> | undefined): Verificacao | null {
  if (os.status !== "concluida" || !os.concluidaEm) return null;
  const necessarios = 3;
  const idx = dias.findIndex((d) => d.chave >= os.concluidaEm!);
  const depois = idx < 0 ? [] : dias.slice(idx + 1, idx + 8);
  if (depois.length < necessarios) return { situacao: "aguardandoDados", diasDepois: depois.length, diasNecessarios: necessarios };
  const antes = dias.slice(Math.max(0, idx - 7), idx);
  const serieIndice = (lista: AgregadoDia[]) => {
    if (os.ativo.inversorId && (os.tipoAlerta === "inversorOffline" || os.tipoAlerta === "alarme" || os.tipoAlerta === "subdesempenhoInversor")) {
      return lista.map((d) => {
        const inv = d.inversores.find((i) => i.id === os.ativo.inversorId);
        return inv && inv.esperadaVisivelKWh > 0 ? inv.energiaKWh / inv.esperadaVisivelKWh : NaN;
      });
    }
    return piCorrigidoSerie(lista, fatorCidade);
  };
  const indiceAntes = mediana(serieIndice(antes));
  const indiceDepois = mediana(serieIndice(depois));
  const esperadaDia = mediana(depois.map((d) => d.esperadaVisivelKWh));
  const ganho = indiceDepois - indiceAntes;
  const energiaRecuperadaKWhDia = Math.max(0, ganho) * esperadaDia;
  // Efetiva: ganho de pelo menos 1 ponto percentual no índice (acima do ruído do índice suavizado).
  const efetiva = ganho > LIMIAR_GANHO_EFETIVO;
  return {
    situacao: efetiva ? "efetiva" : "naoEfetiva",
    indiceAntes,
    indiceDepois,
    ganhoPct: ganho * 100,
    energiaRecuperadaKWhDia,
    diasDepois: depois.length,
  };
}

// ---------------------------------------------------------------------------------------------
// Indicadores de manutenção (visão de energia; MTTR/MTBF continuam no CMMS)
// ---------------------------------------------------------------------------------------------

export type IndicadoresManutencao = {
  tempoDeteccaoAberturaDias: number | null;
  tempoAberturaConclusaoDias: number | null;
  perdaComOsAbertaR: number;
  perdaEvitadaR: number;
  parcelaAnalisePct: number | null;
  parcelaAlarmePct: number | null;
  abertas: number;
  emAndamento: number;
  concluidas: number;
};

export function indicadoresManutencao(
  ordens: OrdemServico[],
  hoje: string,
  verificacoes: Map<string, Verificacao | null>,
  valorEnergia: (usinaId: string) => number,
): IndicadoresManutencao {
  const media = (v: number[]) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : null);
  const deteccaoAbertura = ordens.filter((o) => o.dataDeteccao).map((o) => Math.max(0, diferencaDias(o.dataDeteccao!, o.abertaEm)));
  const aberturaConclusao = ordens.filter((o) => o.concluidaEm).map((o) => Math.max(0, diferencaDias(o.abertaEm, o.concluidaEm!)));
  const perdaAberta = ordens
    .filter((o) => o.status === "aberta" || o.status === "emAndamento")
    .reduce((s, o) => s + o.perdaRDia * Math.max(1, diferencaDias(o.abertaEm, hoje)), 0);
  let evitada = 0;
  for (const o of ordens) {
    const v = verificacoes.get(o.id);
    if (v && v.situacao === "efetiva" && o.concluidaEm) evitada += v.energiaRecuperadaKWhDia * valorEnergia(o.ativo.usinaId) * Math.max(0, diferencaDias(o.concluidaEm, hoje));
  }
  const corretivas = ordens.filter((o) => o.origem !== "preventiva");
  return {
    tempoDeteccaoAberturaDias: media(deteccaoAbertura),
    tempoAberturaConclusaoDias: media(aberturaConclusao),
    perdaComOsAbertaR: perdaAberta,
    perdaEvitadaR: evitada,
    parcelaAnalisePct: corretivas.length ? (corretivas.filter((o) => o.origem === "analise").length / corretivas.length) * 100 : null,
    parcelaAlarmePct: corretivas.length ? (corretivas.filter((o) => o.origem === "alarme").length / corretivas.length) * 100 : null,
    abertas: ordens.filter((o) => o.status === "aberta").length,
    emAndamento: ordens.filter((o) => o.status === "emAndamento").length,
    concluidas: ordens.filter((o) => o.status === "concluida").length,
  };
}

// ---------------------------------------------------------------------------------------------
// Rotas de limpeza: agrupa usinas próximas com datas recomendadas próximas.
// ---------------------------------------------------------------------------------------------

export type Rota = { id: string; usinas: string[]; data: string; distanciaMaxKm: number; custoTotalR: number };

export function agruparRotas(
  candidatas: Array<{ usina: UsinaMonitorada; dataRecomendada: string }>,
  raioKm = 80,
  janelaDias = 15,
): Rota[] {
  const restantes = [...candidatas].sort((a, b) => a.dataRecomendada.localeCompare(b.dataRecomendada));
  const rotas: Rota[] = [];
  while (restantes.length) {
    const base = restantes.shift()!;
    const grupo = [base];
    for (let i = restantes.length - 1; i >= 0; i--) {
      const c = restantes[i];
      const d = distanciaKm(base.usina.cidade.latitude, base.usina.cidade.longitude, c.usina.cidade.latitude, c.usina.cidade.longitude);
      if (d <= raioKm && Math.abs(diferencaDias(base.dataRecomendada, c.dataRecomendada)) <= janelaDias) {
        grupo.push(c);
        restantes.splice(i, 1);
      }
    }
    const datas = grupo.map((g) => g.dataRecomendada).sort();
    const distancias = grupo.map((g) => distanciaKm(base.usina.cidade.latitude, base.usina.cidade.longitude, g.usina.cidade.latitude, g.usina.cidade.longitude));
    rotas.push({
      id: `ROTA-${datas[0].replace(/-/g, "")}-${base.usina.cidade.id}`,
      usinas: grupo.map((g) => g.usina.id),
      // A rota vai na data mais cedo do grupo (nenhuma usina passa do ponto ótimo).
      data: datas[0],
      distanciaMaxKm: Math.max(...distancias),
      custoTotalR: grupo.reduce((s, g) => s + g.usina.custoLimpezaR, 0),
    });
  }
  return rotas;
}
