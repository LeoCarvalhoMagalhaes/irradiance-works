/**
 * Detectores de falhas por regras transparentes (sem modelos de caixa-preta).
 *
 * Duas origens de alerta:
 *   - "alarme": alarmes reportados pelo inversor (códigos do fabricante → categoria padronizada);
 *   - "analise": anomalias sem alarme, identificadas pelo padrão característico de cada falha.
 *
 * A avaliação é causal: cada dia é avaliado apenas com dados até aquele dia, o que permite medir
 * o atraso de detecção. Os limiares são configuráveis (LIMIARES_PADRAO).
 */
import type { AgregadoDia } from "./agregados";
import type { CategoriaAlarme, UsinaMonitorada } from "./frota";

export type TipoAlerta =
  | "inversorOffline"
  | "perdaComunicacao"
  | "stringDesligada"
  | "sombreamento"
  | "sujidade"
  | "clipping"
  | "degradacaoAcelerada"
  | "subdesempenhoInversor"
  | "alarme";

export const TIPOS_ANALISE: TipoAlerta[] = [
  "inversorOffline",
  "perdaComunicacao",
  "stringDesligada",
  "sombreamento",
  "sujidade",
  "clipping",
  "degradacaoAcelerada",
  "subdesempenhoInversor",
];

export type Severidade = "info" | "atencao" | "critico";

export type Alerta = {
  id: string;
  usinaId: string;
  tipo: TipoAlerta;
  origem: "analise" | "alarme";
  categoriaAlarme?: CategoriaAlarme;
  codigoFabricante?: string;
  ativo: { inversorId?: string; mpptId?: string };
  inicio: string;
  deteccao: string;
  /** Primeiro dia sem a anomalia; null = em andamento. */
  fim: string | null;
  severidade: Severidade;
  perdaKWh: number;
  perdaR: number;
  /** Perda diária recente, em R$/dia — usada para priorizar ordens de serviço. */
  perdaRDia: number;
  /** Dia sugerido para exibir a evidência (gráfico do trecho). */
  diaEvidencia: string;
  /** Perda estimada por dia do evento (kWh), base da cascata de perdas mensal. */
  perdasDiarias: Array<[string, number]>;
  parametros: Record<string, number>;
};

export const LIMIARES_PADRAO = {
  offline: { fracaoEnergiaMax: 0.1, minutosZeroMin: 120 },
  comunicacao: { minutosMin: 60 },
  string: { fatorTolerancia: 0.6, diasConfirmacao: 2 },
  sombreamento: { razaoMax: 0.85, razaoForaMin: 0.93, janelaDias: 10, diasValidosMin: 6, horasMax: 4, fracaoHoraMin: 0.04 },
  alarme: { lacunaMaxDias: 3 },
  sujidade: {
    perdaMinPct: 5,
    perdaSaidaPct: 3,
    janelaRecenteComVizinhos: 7,
    janelaRecenteSemVizinhos: 14,
    janelaReferenciaDias: 120,
    percentilReferencia: 0.75,
    diasConfirmacao: 4,
    multiplicadorRuido: 3,
    nivelLimpoPct: 1,
    janelaTendenciaMinDias: 14,
    tMax: -3,
  },
  clipping: { perdaMinPct: 1.5, janelaDias: 30, diasValidosMin: 10 },
  degradacao: { taxaMinPctAno: 4, taxaMaxPctAno: 20, janelaDias: 240, extensaoMinDias: 180, amostrasMin: 25, tMax: -5, mesesConsecutivos: 2, diasAposChuva: 3, chuvaMm: 5 },
  subdesempenho: { razaoMax: 0.97, diasConfirmacao: 3 },
};

export type Limiares = typeof LIMIARES_PADRAO;

const mediana = (v: number[]) => {
  if (v.length === 0) return NaN;
  const o = [...v].sort((a, b) => a - b);
  const m = Math.floor(o.length / 2);
  return o.length % 2 ? o[m] : (o[m - 1] + o[m]) / 2;
};

type EventoBruto = { inicio: number; deteccao: number; fim: number | null; perdaKWh: number; perdasDiarias: number[] };

/**
 * Converte uma condição diária em eventos: um evento começa no primeiro dia verdadeiro e é
 * detectado quando a condição completa `confirmacao` dias consecutivos; termina no primeiro dia falso.
 */
function eventosDeCondicao(cond: boolean[], perda: number[], confirmacao: number): EventoBruto[] {
  const eventos: EventoBruto[] = [];
  let i = 0;
  while (i < cond.length) {
    if (!cond[i]) {
      i++;
      continue;
    }
    let j = i;
    while (j < cond.length && cond[j]) j++;
    if (j - i >= confirmacao) {
      const perdas = perda.slice(i, j);
      eventos.push({ inicio: i, deteccao: i + confirmacao - 1, fim: j < cond.length ? j : null, perdaKWh: perdas.reduce((a, b) => a + b, 0), perdasDiarias: perdas });
    }
    i = j;
  }
  return eventos;
}

/** Índice de desempenho por MPPT na janela de alta irradiância e em operação normal. */
function razoesMppt(d: AgregadoDia) {
  return d.inversores.flatMap((inv) =>
    inv.mppts.filter((m) => m.dcEsperadaKWh > 0).map((m) => ({ inversorId: inv.id, mpptId: m.id, strings: m.strings, razao: m.dcKWh / m.dcEsperadaKWh, esperadaKWh: m.dcEsperadaKWh })),
  );
}

/** Índice de desempenho diário robusto (mediana das razões por MPPT). */
export function indiceDesempenhoDiario(d: AgregadoDia): number {
  return mediana(razoesMppt(d).map((r) => r.razao));
}

/**
 * Sensor virtual: fator diário da cidade = mediana, entre as usinas vizinhas (GD e SCADA), de PI_d / PI_ref,
 * com PI_ref = mediana móvel de 30 dias de cada usina. Corrige o erro comum da irradiância
 * modelada. Cidades com uma única usina recebem fator 1 (sem correção).
 */
export function fatoresSensorVirtual(porUsina: Map<string, { usina: UsinaMonitorada; agregados: AgregadoDia[] }>): Map<string, Map<string, number>> {
  const porCidade = new Map<string, Array<Map<string, number>>>();
  for (const { usina, agregados } of porUsina.values()) {
    const pis = agregados.map(indiceDesempenhoDiario);
    const normalizado = new Map<string, number>();
    agregados.forEach((d, i) => {
      const janela = pis.slice(Math.max(0, i - 29), i + 1).filter(Number.isFinite);
      const ref = mediana(janela);
      if (Number.isFinite(pis[i]) && ref > 0) normalizado.set(d.chave, pis[i] / ref);
    });
    const lista = porCidade.get(usina.cidade.id) ?? [];
    lista.push(normalizado);
    porCidade.set(usina.cidade.id, lista);
  }
  const fatores = new Map<string, Map<string, number>>();
  for (const [cidade, series] of porCidade) {
    const f = new Map<string, number>();
    if (series.length >= 2) {
      const chaves = new Set(series.flatMap((s) => [...s.keys()]));
      for (const c of chaves) {
        const valores = series.map((s) => s.get(c)).filter((v): v is number => v !== undefined);
        if (valores.length >= 2) f.set(c, mediana(valores));
      }
    }
    fatores.set(cidade, f);
  }
  return fatores;
}

/** Regressão linear simples com erro-padrão da inclinação. */
function regressao(x: number[], y: number[]) {
  const n = x.length;
  const mx = x.reduce((a, b) => a + b, 0) / n;
  const my = y.reduce((a, b) => a + b, 0) / n;
  let sxx = 0;
  let sxy = 0;
  for (let i = 0; i < n; i++) {
    sxx += (x[i] - mx) ** 2;
    sxy += (x[i] - mx) * (y[i] - my);
  }
  const b = sxx > 0 ? sxy / sxx : 0;
  const a = my - b * mx;
  let sse = 0;
  for (let i = 0; i < n; i++) sse += (y[i] - a - b * x[i]) ** 2;
  const ep = n > 2 && sxx > 0 ? Math.sqrt(sse / (n - 2) / sxx) : Infinity;
  return { a, b, ep, t: ep > 0 && Number.isFinite(ep) ? b / ep : 0, mx, my };
}

const percentil = (v: number[], q: number) => {
  if (v.length === 0) return NaN;
  const o = [...v].sort((a, b) => a - b);
  return o[Math.min(o.length - 1, Math.max(0, Math.round(q * (o.length - 1))))];
};

/**
 * Nível de sujidade estimado no dia `i`: 1 − m(i) / P75(m na referência), em que m é a mediana
 * móvel do índice (7 dias com vizinhas, 14 sem vizinhas, cujo índice tem mais ruído) e a referência
 * cobre os últimos 120 dias, limitada ao período após a última limpeza registrada. Usar o P75 da
 * série já suavizada evita o viés do percentil sobre valores diários ruidosos.
 */
export function nivelSujidadePct(
  dias: AgregadoDia[],
  piCorrigido: number[],
  i: number,
  limpezas: Set<string>,
  temVizinhos: boolean,
  L = LIMIARES_PADRAO.sujidade,
): number {
  let inicioRef = Math.max(0, i - L.janelaReferenciaDias + 1);
  for (let k = i; k >= inicioRef; k--) {
    if (limpezas.has(dias[k].chave)) {
      inicioRef = k;
      break;
    }
  }
  const janela = temVizinhos ? L.janelaRecenteComVizinhos : L.janelaRecenteSemVizinhos;
  const suavizada = (k: number) => {
    const v = piCorrigido.slice(Math.max(inicioRef, k - janela + 1), k + 1).filter(Number.isFinite);
    return v.length >= Math.ceil(janela / 2) ? mediana(v) : NaN;
  };
  const ref: number[] = [];
  for (let k = inicioRef; k <= i; k++) {
    const v = suavizada(k);
    if (Number.isFinite(v)) ref.push(v);
  }
  const atual = suavizada(i);
  if (ref.length < 20 || !Number.isFinite(atual)) return NaN;
  return Math.max(0, (1 - atual / percentil(ref, L.percentilReferencia)) * 100);
}

/**
 * Ruído do índice suavizado (%), estimado pela variabilidade diária: σ_d = 1,4826·MAD(ΔPI)/√2 e
 * σ_suavizado ≈ 1,25·σ_d/√janela (mediana móvel). Usado para tornar o limiar adaptativo.
 */
export function ruidoIndicePct(piCorrigido: number[], i: number, temVizinhos: boolean, L = LIMIARES_PADRAO.sujidade): number {
  const v = piCorrigido.slice(Math.max(0, i - L.janelaReferenciaDias + 1), i + 1).filter(Number.isFinite);
  if (v.length < 20) return Infinity;
  const diferencas = v.slice(1).map((x, k) => x - v[k]);
  const med = mediana(diferencas);
  const mad = mediana(diferencas.map((d) => Math.abs(d - med)));
  const sigmaDiario = (1.4826 * mad) / Math.SQRT2;
  const janela = temVizinhos ? L.janelaRecenteComVizinhos : L.janelaRecenteSemVizinhos;
  return ((1.25 * sigmaDiario) / Math.sqrt(janela)) * 100;
}

/** Taxa de crescimento da sujidade (%/dia) desde a última vez em que a usina estava limpa; null se não significativa. */
export function taxaSujidadePctDia(
  dias: AgregadoDia[],
  piCorrigido: number[],
  i: number,
  limpezas: Set<string>,
  temVizinhos: boolean,
  L = LIMIARES_PADRAO.sujidade,
): number | null {
  // Início: última limpeza registrada ou último dia com nível abaixo de 1 % (usina limpa).
  let inicio = Math.max(0, i - L.janelaReferenciaDias + 1);
  for (let k = i - L.janelaTendenciaMinDias; k >= inicio; k--) {
    if (limpezas.has(dias[k].chave) || nivelSujidadePct(dias, piCorrigido, k, limpezas, temVizinhos, L) < L.nivelLimpoPct) {
      inicio = k;
      break;
    }
  }
  const x: number[] = [];
  const y: number[] = [];
  for (let k = inicio; k <= i; k++) {
    if (!Number.isFinite(piCorrigido[k])) continue;
    x.push(k - inicio);
    y.push(piCorrigido[k]);
  }
  if (x.length < 10) return null;
  const r = regressao(x, y);
  return r.t <= L.tMax && r.b < 0 ? (-r.b / r.a) * 100 : null;
}

/** Índice de desempenho diário corrigido pelo sensor virtual (fator 1 sem vizinhos). */
export function piCorrigidoSerie(dias: AgregadoDia[], fatorCidade: Map<string, number> | undefined): number[] {
  return dias.map((d) => {
    const pi = indiceDesempenhoDiario(d);
    return Number.isFinite(pi) ? pi / (fatorCidade?.get(d.chave) ?? 1) : NaN;
  });
}

function severidadePor(tipo: TipoAlerta, perdaFracao: number, categoria?: CategoriaAlarme): Severidade {
  if (tipo === "inversorOffline" || categoria === "arco") return "critico";
  if (tipo === "clipping") return "info";
  if (perdaFracao >= 0.1) return "critico";
  return "atencao";
}

export function detectar(
  usina: UsinaMonitorada,
  dias: AgregadoDia[],
  fatorCidade: Map<string, number> | undefined,
  limiares: Limiares = LIMIARES_PADRAO,
  limpezas: Set<string> = new Set(),
): Alerta[] {
  const alertas: Alerta[] = [];
  const valor = usina.valorEnergiaRKWh;
  const ultimoIndice = dias.length - 1;
  const adicionar = (
    tipo: TipoAlerta,
    ev: EventoBruto,
    extra: Partial<Alerta> & { esperadaRef: number[] },
    origem: "analise" | "alarme" = "analise",
  ) => {
    const recentes = ev.perdasDiarias.slice(-7);
    const perdaDia = recentes.reduce((a, b) => a + b, 0) / Math.max(1, recentes.length);
    const esperadaMedia = extra.esperadaRef.slice(ev.inicio, (ev.fim ?? dias.length)).reduce((a, b) => a + b, 0) / Math.max(1, (ev.fim ?? dias.length) - ev.inicio);
    const { esperadaRef: _ignorado, ...resto } = extra;
    void _ignorado;
    const alvo = [resto.ativo?.inversorId, resto.ativo?.mpptId, resto.categoriaAlarme].filter(Boolean).join("-");
    alertas.push({
      id: `${usina.id}|${tipo}|${alvo}|${dias[ev.inicio].chave}`,
      usinaId: usina.id,
      tipo,
      origem,
      ativo: {},
      inicio: dias[ev.inicio].chave,
      deteccao: dias[ev.deteccao].chave,
      fim: ev.fim === null ? null : dias[ev.fim].chave,
      severidade: severidadePor(tipo, esperadaMedia > 0 ? perdaDia / esperadaMedia : 0, resto.categoriaAlarme),
      perdaKWh: ev.perdaKWh,
      perdaR: ev.perdaKWh * valor,
      perdaRDia: ev.fim === null ? perdaDia * valor : 0,
      diaEvidencia: dias[Math.min(ultimoIndice, ev.deteccao)].chave,
      perdasDiarias: ev.perdasDiarias.map((v, k) => [dias[ev.inicio + k].chave, v] as [string, number]),
      parametros: {},
      ...resto,
    });
  };
  const esperadaUsina = dias.map((d) => d.esperadaVisivelKWh);

  // 1. Alarmes do inversor (agrupados por inversor e categoria; tolera lacunas curtas sem alarme).
  const chavesAlarme = new Set(dias.flatMap((d) => d.alarmes.map((a) => `${a.inversorId}|${a.categoria}|${a.codigo}`)));
  for (const chave of chavesAlarme) {
    const [inversorId, categoria, codigo] = chave.split("|");
    const idxInv = usina.inversores.findIndex((i) => i.id === inversorId);
    const cond = dias.map((d) => d.alarmes.some((a) => a.inversorId === inversorId && a.categoria === categoria));
    let ultimoVerdadeiro = -Infinity;
    for (let i = 0; i < cond.length; i++) {
      if (!cond[i]) continue;
      if (i - ultimoVerdadeiro > 1 && i - ultimoVerdadeiro <= limiares.alarme.lacunaMaxDias + 1) for (let k = ultimoVerdadeiro + 1; k < i; k++) cond[k] = true;
      ultimoVerdadeiro = i;
    }
    const perda = dias.map((d) => d.inversores[idxInv].perdaAlarmeKWh);
    for (const ev of eventosDeCondicao(cond, perda, 1)) {
      adicionar("alarme", ev, {
        ativo: { inversorId },
        categoriaAlarme: categoria as CategoriaAlarme,
        codigoFabricante: codigo,
        esperadaRef: dias.map((d) => d.inversores[idxInv].esperadaVisivelKWh),
      }, "alarme");
    }
  }

  // 2. Inversor desligado sem alarme: geração ~zero com irradiância e dados presentes.
  usina.inversores.forEach((inv, idx) => {
    const cond = dias.map((d) => {
      const a = d.inversores[idx];
      return a.minutosAlarme === 0 && a.minutosManutencao === 0 && a.minutosZeroComSol >= limiares.offline.minutosZeroMin && a.esperadaVisivelKWh > 0 && a.energiaKWh < limiares.offline.fracaoEnergiaMax * a.esperadaVisivelKWh;
    });
    const perda = dias.map((d) => Math.max(0, d.inversores[idx].esperadaVisivelKWh - d.inversores[idx].energiaKWh));
    for (const ev of eventosDeCondicao(cond, perda, 1)) {
      adicionar("inversorOffline", ev, { ativo: { inversorId: inv.id }, esperadaRef: dias.map((d) => d.inversores[idx].esperadaVisivelKWh) });
    }
  });

  // 3. Perda de comunicação: ausência de dados (≠ geração zero), inclusive trechos reenviados depois.
  {
    const cond = dias.map((d) => d.minutosAusentes + d.minutosReenviados >= limiares.comunicacao.minutosMin);
    for (const ev of eventosDeCondicao(cond, cond.map(() => 0), 1)) {
      const trecho = dias.slice(ev.inicio, ev.fim ?? dias.length);
      adicionar("perdaComunicacao", ev, {
        esperadaRef: esperadaUsina,
        parametros: {
          minutosAusentes: trecho.reduce((s, d) => s + d.minutosAusentes, 0),
          minutosReenviados: trecho.reduce((s, d) => s + d.minutosReenviados, 0),
        },
        severidade: trecho.some((d) => d.minutosAusentes > 0) ? "critico" : "info",
      });
    }
  }

  // 4. String desligada: perda proporcional constante em um MPPT (≈ 1/n das strings).
  if (usina.tipo === "gd") {
    const mpptsUsina = usina.inversores.flatMap((inv) => inv.mppts.map((m) => ({ inversorId: inv.id, mpptId: m.id, strings: m.strings })));
    for (const alvo of mpptsUsina) {
      const limite = 1 - limiares.string.fatorTolerancia / alvo.strings;
      const rel = dias.map((d) => {
        const razoes = razoesMppt(d);
        const ref = mediana(razoes.map((r) => r.razao));
        const r = razoes.find((x) => x.inversorId === alvo.inversorId && x.mpptId === alvo.mpptId);
        return r && ref > 0 ? { rel: r.razao / ref, esperadaKWh: r.esperadaKWh, ref } : null;
      });
      const cond = rel.map((r) => r !== null && r.rel < limite);
      const perda = rel.map((r) => (r ? Math.max(0, (1 - r.rel) * r.esperadaKWh * r.ref) : 0));
      for (const ev of eventosDeCondicao(cond, perda, limiares.string.diasConfirmacao)) {
        const amostra = rel.slice(ev.inicio, ev.fim ?? rel.length).filter((r): r is NonNullable<typeof r> => r !== null);
        adicionar("stringDesligada", ev, {
          ativo: { inversorId: alvo.inversorId, mpptId: alvo.mpptId },
          esperadaRef: esperadaUsina,
          parametros: { razaoRelativa: mediana(amostra.map((r) => r.rel)), stringsNoMppt: alvo.strings },
        });
      }
    }
  }

  // 5. Sombreamento recorrente: perda concentrada em uma faixa horária fixa.
  if (usina.tipo === "gd") {
    const L = limiares.sombreamento;
    const perfilDia = dias.map((d) => {
      const total = d.horarioEsperadoKWh.reduce((a, b) => a + b, 0);
      if (total <= 0) return null;
      const razoes = d.horarioRealKWh.map((r, h) => (d.horarioEsperadoKWh[h] >= L.fracaoHoraMin * total ? r / d.horarioEsperadoKWh[h] : NaN));
      const nucleo = mediana(razoes.filter((r, h) => h >= 9 && h <= 13 && Number.isFinite(r)));
      return nucleo > 0 ? razoes.map((r) => r / nucleo) : null;
    });
    const banda: Array<{ horas: number[] } | null> = dias.map((_, i) => {
      const janela = perfilDia.slice(Math.max(0, i - L.janelaDias + 1), i + 1).filter((p): p is number[] => p !== null);
      if (janela.length < L.diasValidosMin) return null;
      const med = Array.from({ length: 24 }, (_, h) => mediana(janela.map((p) => p[h]).filter(Number.isFinite)));
      const baixas = med.map((v, h) => (Number.isFinite(v) && v < L.razaoMax ? h : -1)).filter((h) => h >= 0);
      if (baixas.length === 0 || baixas.length > L.horasMax) return null;
      if (baixas[baixas.length - 1] - baixas[0] !== baixas.length - 1) return null;
      const fora = med.filter((v, h) => Number.isFinite(v) && !baixas.includes(h));
      if (fora.length < 4 || mediana(fora) < L.razaoForaMin) return null;
      return { horas: baixas };
    });
    const cond = banda.map((b) => b !== null);
    const perda = dias.map((d, i) => {
      const b = banda[i];
      if (!b || !perfilDia[i]) return 0;
      return b.horas.reduce((s, h) => s + Math.max(0, (1 - (perfilDia[i]![h] || 1)) * d.horarioEsperadoKWh[h]), 0);
    });
    for (const ev of eventosDeCondicao(cond, perda, 1)) {
      const horas = banda[ev.deteccao]!.horas;
      adicionar("sombreamento", ev, { esperadaRef: esperadaUsina, parametros: { horaInicio: horas[0], horaFim: horas[horas.length - 1] + 1 } });
    }
  }

  // 6. Sujidade: perda gradual em relação à linha de base limpa, que se recupera com chuva
  //    (sujidade comum) ou só com limpeza (sujidade aderente).
  const piCorrigido = piCorrigidoSerie(dias, fatorCidade);
  const temVizinhos = (fatorCidade?.size ?? 0) > 0;
  const eventosSujidade: EventoBruto[] = [];
  if (usina.tipo === "gd") {
    const L = limiares.sujidade;
    const nivel = dias.map((_, i) => nivelSujidadePct(dias, piCorrigido, i, limpezas, temVizinhos, L));
    const cond: boolean[] = [];
    let emEvento = false;
    nivel.forEach((n, i) => {
      // Limiar adaptativo: máx(5 %, 3σ do índice suavizado); saída 2 pontos abaixo da entrada.
      const entrada = Math.max(L.perdaMinPct, L.multiplicadorRuido * ruidoIndicePct(piCorrigido, i, temVizinhos, L));
      const saida = Math.max(L.perdaSaidaPct, entrada - (L.perdaMinPct - L.perdaSaidaPct));
      emEvento = Number.isFinite(n) && (emEvento ? n >= saida : n >= entrada);
      cond.push(emEvento);
    });
    const perda = dias.map((d, i) => (cond[i] ? (nivel[i] / 100) * d.esperadaVisivelKWh : 0));
    for (const ev of eventosDeCondicao(cond, perda, L.diasConfirmacao)) {
      eventosSujidade.push(ev);
      const ultimo = (ev.fim ?? dias.length) - 1;
      const taxa = taxaSujidadePctDia(dias, piCorrigido, ultimo, limpezas, temVizinhos, L);
      adicionar("sujidade", ev, {
        esperadaRef: esperadaUsina,
        parametros: { perdaAtualPct: nivel[ultimo], ...(taxa !== null ? { taxaPctDia: taxa } : {}) },
      });
    }
  }

  // 7. Clipping relevante: patamar na potência CA nominal com perda ≥ limiar na média de 30 dias.
  {
    const L = limiares.clipping;
    const perdaDia = dias.map((d) => d.inversores.reduce((s, a) => s + a.perdaClippingKWh, 0));
    const fracao = dias.map((_, i) => {
      const janela = dias.slice(Math.max(0, i - L.janelaDias + 1), i + 1);
      if (janela.length < L.diasValidosMin) return 0;
      const perdida = perdaDia.slice(Math.max(0, i - L.janelaDias + 1), i + 1).reduce((a, b) => a + b, 0);
      const gerada = janela.reduce((s, d) => s + d.energiaKWh, 0);
      return gerada > 0 ? (perdida / (gerada + perdida)) * 100 : 0;
    });
    const cond = fracao.map((f) => f >= L.perdaMinPct);
    for (const ev of eventosDeCondicao(cond, perdaDia, 1)) {
      adicionar("clipping", ev, { esperadaRef: esperadaUsina, parametros: { perdaMediaPct: fracao[(ev.fim ?? dias.length) - 1] } });
    }
  }

  // 8. Degradação acelerada: tendência do índice em "dias limpos" (até 3 dias após chuva ≥ 5 mm),
  //    avaliada no fim de cada mês. Janelas com sujidade detectada são ignoradas e taxas acima de
  //    20 %/ano não são atribuídas a degradação (a degradação nominal já está no modelo esperado).
  {
    const L = limiares.degradacao;
    const limpo = dias.map((_, i) => {
      for (let k = 1; k <= L.diasAposChuva; k++) if (i - k >= 0 && dias[i - k].chuvaMm >= L.chuvaMm) return true;
      return false;
    });
    let detectado: { inicio: number; deteccao: number; taxa: number } | null = null;
    let consecutivos = 0;
    for (let i = 0; i < dias.length && !detectado; i++) {
      const fimDeMes = i === dias.length - 1 || dias[i + 1].chave.slice(0, 7) !== dias[i].chave.slice(0, 7);
      if (!fimDeMes) continue;
      const ini = Math.max(0, i - L.janelaDias + 1);
      if (i - ini + 1 < L.extensaoMinDias || eventosSujidade.some((ev) => ev.inicio <= i && (ev.fim ?? dias.length) > ini)) {
        consecutivos = 0;
        continue;
      }
      const x: number[] = [];
      const y: number[] = [];
      for (let k = ini; k <= i; k++) {
        if (!limpo[k] || !Number.isFinite(piCorrigido[k])) continue;
        x.push((k - ini) / 365.25);
        y.push(piCorrigido[k]);
      }
      if (x.length < L.amostrasMin) {
        consecutivos = 0;
        continue;
      }
      const r = regressao(x, y);
      const taxaPctAno = (r.b / r.my) * 100;
      const atende = taxaPctAno <= -L.taxaMinPctAno && taxaPctAno >= -L.taxaMaxPctAno && r.t <= L.tMax;
      consecutivos = atende ? consecutivos + 1 : 0;
      if (consecutivos >= L.mesesConsecutivos) detectado = { inicio: ini, deteccao: i, taxa: taxaPctAno };
    }
    if (detectado) {
      const perdas = dias.map((d, i) => (i >= detectado!.inicio ? Math.max(0, ((-detectado!.taxa / 100) * (i - detectado!.inicio)) / 365.25) * d.esperadaVisivelKWh : 0));
      adicionar(
        "degradacaoAcelerada",
        { inicio: detectado.inicio, deteccao: detectado.deteccao, fim: null, perdaKWh: perdas.reduce((a, b) => a + b, 0), perdasDiarias: perdas.slice(detectado.inicio) },
        { esperadaRef: esperadaUsina, parametros: { taxaPctAno: detectado.taxa } },
      );
    }
  }

  // 9. Subdesempenho de inversor (SCADA): rendimento específico abaixo da mediana dos demais.
  if (usina.tipo === "scada") {
    const L = limiares.subdesempenho;
    usina.inversores.forEach((inv, idx) => {
      const rel = dias.map((d) => {
        const especificos = d.inversores.map((a, j) => {
          const dc = a.mppts.reduce((s, m) => s + m.dcKWh, 0);
          return dc > 0 ? dc / (usina.inversores[j].mppts.reduce((s, m) => s + m.potenciaCcW, 0) / 1000) : NaN;
        });
        const ref = mediana(especificos.filter(Number.isFinite));
        return Number.isFinite(especificos[idx]) && ref > 0 ? especificos[idx] / ref : NaN;
      });
      const cond = rel.map((r) => Number.isFinite(r) && r < L.razaoMax);
      const perda = dias.map((d, i) => (cond[i] ? (1 - rel[i]) * d.inversores[idx].esperadaVisivelKWh : 0));
      for (const ev of eventosDeCondicao(cond, perda, L.diasConfirmacao)) {
        adicionar("subdesempenhoInversor", ev, {
          ativo: { inversorId: inv.id },
          esperadaRef: dias.map((d) => d.inversores[idx].esperadaVisivelKWh),
          parametros: { razaoRelativa: mediana(rel.slice(ev.inicio, ev.fim ?? rel.length).filter(Number.isFinite)) },
        });
      }
    });
  }

  return alertas.sort((a, b) => (a.deteccao < b.deteccao ? 1 : a.deteccao > b.deteccao ? -1 : 0));
}

