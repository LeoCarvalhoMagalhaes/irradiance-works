/**
 * Módulo B: gerador sintético, detectores, validação, limpeza, ordens de serviço e SCADA.
 * Data de referência fixa para que os resultados sejam determinísticos.
 */
import { beforeAll, describe, expect, it } from "vitest";
import irradiacao from "@/data/irradiacao.json";
import { agregarUsina } from "@/core/monitoramento/agregados";
import { analisarUsinas, type ResultadoFrota } from "@/core/monitoramento/analise";
import { fatoresSensorVirtual } from "@/core/monitoramento/detectores";
import { frotaDemonstracao } from "@/core/monitoramento/frota";
import { type ContextoGeracao, gerarDia, PASSOS_DIA, RECEBIMENTO } from "@/core/monitoramento/gerador";
import { intervaloOtimoDias } from "@/core/monitoramento/limpeza";
import { analisarRestricoes, compararInversores, exportarHistoricoScadaCsv, importarHistoricoScada, serieUmMinuto } from "@/core/monitoramento/scada";
import {
  aplicarConclusoes,
  criarOsDeAlerta,
  eventoDaOs,
  exportarCsv,
  exportarJson,
  importarConclusoes,
  prioridade,
  verificarResultado,
} from "@/core/manutencao/ordens";
import { somarDias } from "@/core/util/tempo";

const HOJE = "2026-10-26";
const CTX: ContextoGeracao = { hoje: HOJE, agoraUtcMs: Date.parse("2026-10-26T18:00:00Z"), eventos: [] };
const frota = frotaDemonstracao();
const usina = (id: string) => frota.find((u) => u.id === id)!;

let resultado: ResultadoFrota;
beforeAll(() => {
  resultado = analisarUsinas(frota, CTX);
}, 120_000);

describe("gerador sintético", () => {
  it("determinismo: mesma usina, dia e eventos → mesmas leituras", () => {
    const a = gerarDia(usina("UFV-02"), "2026-09-15", CTX);
    const b = gerarDia(usina("UFV-02"), "2026-09-15", CTX);
    expect(Array.from(a.inversores[0].pacW)).toEqual(Array.from(b.inversores[0].pacW));
    expect(Array.from(a.inversores[0].mppts[1].pdcW)).toEqual(Array.from(b.inversores[0].mppts[1].pdcW));
  });

  it("modo detalhado e agregado produzem a mesma potência CA", () => {
    const a = gerarDia(usina("UFV-05"), "2026-07-02", CTX);
    const b = gerarDia(usina("UFV-05"), "2026-07-02", CTX, { detalhe: true });
    expect(Array.from(a.inversores[0].pacW)).toEqual(Array.from(b.inversores[0].pacW));
    expect(b.inversores[0].mppts[0].vV.length).toBe(PASSOS_DIA);
  });

  it("calibração: irradiação horizontal mensal reproduz a base (tolerância 3 % com o erro de modelagem)", () => {
    const u = usina("UFV-12");
    const cidade = irradiacao.cidades.find((c) => c.id === u.cidade.id)!;
    for (const [ano, mes] of [[2026, 1], [2026, 4], [2026, 7], [2025, 11]]) {
      const dias = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
      let soma = 0;
      for (let d = 1; d <= dias; d++) {
        const chave = `${ano}-${String(mes).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
        const g = gerarDia(u, chave, CTX);
        g.ghiModeladaWM2.forEach((v) => (soma += (v * 5) / 60 / 1000));
      }
      expect(Math.abs(soma / dias / cidade.ghiKWhM2Dia[mes - 1] - 1)).toBeLessThan(0.03);
    }
  });

  it("perda de comunicação: dados ausentes (≠ geração zero) e reenvio após reconexão", () => {
    const ausente = gerarDia(usina("UFV-11"), HOJE, CTX);
    expect(Array.from(ausente.recebimento).filter((r) => r === RECEBIMENTO.ausente).length).toBeGreaterThan(0);
    const reenviado = gerarDia(usina("UFV-07"), somarDias(HOJE, -50), CTX);
    expect(Array.from(reenviado.recebimento).some((r) => r === RECEBIMENTO.reenviado)).toBe(true);
  });

  it("instantes em UTC: o dia local começa às 03:00 UTC (America/Sao_Paulo)", () => {
    expect(new Date(gerarDia(usina("UFV-01"), HOJE, CTX).inicioUtcMs).toISOString()).toBe("2026-10-26T03:00:00.000Z");
  });
});

describe("detectores × rótulos verdadeiros", () => {
  it("cada tipo de falha injetada é detectado (revocação 100 % na data de referência)", () => {
    for (const m of resultado.validacao.porTipo) {
      if (m.falhas > 0) expect(m.revocacao, m.tipo).toBe(1);
    }
  });

  it("usinas saudáveis não geram alertas", () => {
    for (const id of ["UFV-05", "UFV-08", "UFV-12", "UFV-14", "UFV-S2"]) {
      const r = resultado.usinas.find((u) => u.usinaId === id)!;
      expect(r.alertas.map((a) => a.tipo), id).toEqual([]);
    }
  });

  it("precisão global de pelo menos 85 % (métrica calculada, nunca escrita à mão)", () => {
    expect(resultado.validacao.global.precisao!).toBeGreaterThanOrEqual(0.85);
  });

  it("string desligada aponta o MPPT correto e a razão ≈ (n−1)/n", () => {
    const a = resultado.usinas.find((u) => u.usinaId === "UFV-02")!.alertas.find((x) => x.tipo === "stringDesligada")!;
    expect(a.ativo).toEqual({ inversorId: "INV1", mpptId: "MPPT2" });
    expect(a.parametros.razaoRelativa).toBeCloseTo(0.5, 1);
  });

  it("alarme de arco é crítico e vem do inversor (origem alarme)", () => {
    const a = resultado.usinas.find((u) => u.usinaId === "UFV-10")!.alertas.find((x) => x.categoriaAlarme === "arco")!;
    expect(a.origem).toBe("alarme");
    expect(a.severidade).toBe("critico");
  });
});

describe("recomendação de limpeza", () => {
  it("T* = √(2C/r): C = R$ 1.000, r = 0,5 R$/dia² → 63,25 dias", () => {
    expect(intervaloOtimoDias(1000, 0.5)).toBeCloseTo(Math.sqrt(4000), 10);
  });
  it("T* minimiza o custo médio diário (C + r·T²/2)/T", () => {
    const custo = (t: number) => (1000 + (0.5 * t * t) / 2) / t;
    const t = intervaloOtimoDias(1000, 0.5);
    expect(custo(t)).toBeLessThan(custo(t * 0.9));
    expect(custo(t)).toBeLessThan(custo(t * 1.1));
  });
  it("sem tendência de sujidade, não há data recomendada", () => {
    expect(intervaloOtimoDias(1000, 0)).toBe(Infinity);
  });
  it("usina com sujidade aderente recebe taxa significativa e data recomendada", () => {
    const l = resultado.usinas.find((u) => u.usinaId === "UFV-16")!.limpeza!;
    expect(l.tendenciaSignificativa).toBe(true);
    expect(l.dataRecomendada).not.toBeNull();
  });
});

describe("ordens de serviço e fechamento do ciclo", () => {
  it("prioridade por perda em R$/dia e severidade", () => {
    expect(prioridade(5, "critico")).toBe(1);
    expect(prioridade(250, "atencao")).toBe(1);
    expect(prioridade(60, "atencao")).toBe(2);
    expect(prioridade(12, "info")).toBe(3);
    expect(prioridade(1, "info")).toBe(4);
  });

  it("exportação JSON/CSV e importação de conclusões (ida e volta)", () => {
    const alerta = resultado.usinas.find((u) => u.usinaId === "UFV-02")!.alertas[0];
    const os = criarOsDeAlerta(alerta, new Date("2026-10-26T12:00:00Z"), 1);
    expect(os.ativo.caminho).toBe("UFV-02/INV1/MPPT2");
    const json = JSON.parse(exportarJson([os], new Date()));
    expect(json.schema).toBe("irradiance-works/ordem-servico");
    const csv = exportarCsv([{ ...os, status: "concluida", concluidaEm: "2026-10-26", acaoExecutada: "reparo" }]);
    const importado = importarConclusoes(csv);
    expect(importado.ok).toBe(true);
    if (!importado.ok) return;
    const aplicado = aplicarConclusoes([os], importado.conclusoes);
    expect(aplicado.atualizadas).toBe(1);
    expect(aplicado.ordens[0].status).toBe("concluida");
    expect(importarConclusoes('{"schema":"outro","versao":1,"conclusoes":[]}')).toEqual({ ok: false, erro: "schema" });
  });

  it("concluir a limpeza recupera a sujidade na série simulada e a verificação mede o ganho", () => {
    const u = usina("UFV-16");
    const alerta = resultado.usinas.find((r) => r.usinaId === "UFV-16")!.alertas.find((a) => a.tipo === "sujidade")!;
    const dataLimpeza = somarDias(HOJE, -8);
    const os = { ...criarOsDeAlerta(alerta, new Date("2026-10-18T12:00:00Z"), 2), status: "concluida" as const, concluidaEm: dataLimpeza, acaoExecutada: "limpeza" as const };
    const evento = eventoDaOs(os)!;
    expect(evento.tipo).toBe("limpeza");
    const ctx = { ...CTX, eventos: [evento] };
    const antes = gerarDia(u, somarDias(HOJE, -1), CTX).verdade.sujidadeFracao;
    const depois = gerarDia(u, somarDias(HOJE, -1), ctx).verdade.sujidadeFracao;
    expect(depois).toBeLessThan(antes);
    const vizinhas = frota.filter((x) => x.cidade.id === u.cidade.id);
    const mapa = new Map(vizinhas.map((x) => [x.id, { usina: x, agregados: agregarUsina(x, ctx, 120) }]));
    const v = verificarResultado(os, mapa.get(u.id)!.agregados, fatoresSensorVirtual(mapa).get(u.cidade.id));
    expect(v?.situacao).toBe("efetiva");
  });

  it("reparo de string encerra a falha a partir da data da OS", () => {
    const u = usina("UFV-02");
    const alerta = resultado.usinas.find((r) => r.usinaId === "UFV-02")!.alertas.find((a) => a.tipo === "stringDesligada")!;
    const os = { ...criarOsDeAlerta(alerta, new Date("2026-10-20T12:00:00Z"), 3), status: "concluida" as const, concluidaEm: somarDias(HOJE, -3), acaoExecutada: "reparo" as const };
    const ctx = { ...CTX, eventos: [eventoDaOs(os)!] };
    expect(gerarDia(u, somarDias(HOJE, -1), CTX).verdade.falhasAtivas).toContain("F02");
    expect(gerarDia(u, somarDias(HOJE, -1), ctx).verdade.falhasAtivas).not.toContain("F02");
  });
});

describe("SCADA (somente leitura)", () => {
  it("restrições classificadas por motivo, com elegibilidade a ressarcimento (Lei 15.269/2025)", () => {
    const r = resultado.usinas.find((u) => u.usinaId === "UFV-S1")!;
    const { porMotivo } = analisarRestricoes(usina("UFV-S1"), r.agregados);
    const energetica = porMotivo.find((m) => m.motivo === "razaoEnergetica")!;
    expect(energetica.eventos).toBe(3);
    expect(energetica.ressarcivel).toBe("nao");
    expect(energetica.energiaKWh).toBeGreaterThan(0);
    expect(porMotivo.find((m) => m.motivo === "indisponibilidadeExterna")!.ressarcivel).toBe("sim");
  });

  it("comparação entre inversores identifica o subdesempenho", () => {
    const r = resultado.usinas.find((u) => u.usinaId === "UFV-S1")!;
    const c = compararInversores(usina("UFV-S1"), r.agregados.slice(-20));
    const pior = [...c].sort((a, b) => a.desvioMedianaPct - b.desvioMedianaPct)[0];
    expect(pior.inversorId).toBe("INV07");
    expect(pior.desvioMedianaPct).toBeLessThan(-3);
  });

  it("disponibilidade contratual exclui a manutenção programada", () => {
    const r = resultado.usinas.find((u) => u.usinaId === "UFV-S1")!;
    expect(r.kpis12Meses.disponibilidadeContratualPct).toBeGreaterThan(r.kpis12Meses.disponibilidadeTecnicaPct);
  });

  it("série de 1 minuto respeita o limite de restrição", () => {
    const u = usina("UFV-S1");
    const dia = gerarDia(u, somarDias(HOJE, -3), CTX);
    const s = serieUmMinuto(u, dia);
    expect(s.pacKW.length).toBe(1440);
    for (let t = 0; t < 1440; t++) if (Number.isFinite(s.setpointKW[t])) expect(s.pacKW[t]).toBeLessThanOrEqual(s.setpointKW[t] + 1e-6);
  });

  it("importação do CSV exportado reproduz energia e PR medido", () => {
    const u = usina("UFV-S1");
    const dia = gerarDia(u, somarDias(HOJE, -5), CTX);
    const csv = exportarHistoricoScadaCsv(u, dia);
    const resumo = importarHistoricoScada(csv, u.potenciaCcW / 1000);
    expect(resumo.ok).toBe(true);
    if (!resumo.ok) return;
    const energia = dia.inversores.reduce((s, inv) => s + inv.pacW.reduce((a, b) => a + b, 0), 0) * (5 / 60) / 1000;
    expect(resumo.energiaTotalKWh).toBeCloseTo(energia, -1);
    expect(resumo.performanceRatio!).toBeGreaterThan(0.7);
    expect(resumo.performanceRatio!).toBeLessThan(0.95);
    expect(importarHistoricoScada("a,b\n1,2", 1)).toEqual({ ok: false, erro: "cabecalho" });
  });
});
