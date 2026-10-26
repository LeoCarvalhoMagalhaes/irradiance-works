/**
 * Exportação da proposta para Excel com FÓRMULAS ATIVAS (ExcelJS, MIT), para auditoria na
 * ferramenta em que a equipe comercial já confia. Carregado sob demanda.
 *
 * - "Premissas": entradas (células em azul) referenciadas pelas demais abas.
 * - "Fluxo de caixa": economia anual vem do motor (faturamento mês a mês com créditos); O&M, troca
 *   do inversor, fluxo, acumulado, VPL (NPV), TIR (IRR) e payback são fórmulas.
 * - "Fatura ano 1": faturamento mensal pela regra do art. 655-I em fórmulas, sem saldo de créditos.
 * - "Financiamento": tabela Price com PMT, IPMT e PPMT.
 */
import type ExcelJS from "exceljs";
import type { Proposta } from "@/core/simulador/proposta";
import { custoDisponibilidadeKWh } from "@/core/regulacao/faturamento";
import type { Dicionario } from "@/i18n/tipos";

type Textos = Pick<Dicionario, "simulador" | "pdf">;

const AZUL = { type: "pattern", pattern: "solid", fgColor: { argb: "FFDCE8F8" } } as const;
const NEGRITO = { bold: true } as const;

export async function gerarPlanilha(p: Proposta, t: Textos, mesesRotulos: string[]): Promise<Blob> {
  const { default: Excel } = await import("exceljs");
  const wb: ExcelJS.Workbook = new Excel.Workbook();
  wb.creator = "Irradiance Works";
  wb.created = new Date();
  const tr = t.simulador.resultado;
  const pr = p.entrada.premissas;

  // --- Premissas -------------------------------------------------------------------------
  const ws = wb.addWorksheet(t.pdf.excel.premissas);
  ws.columns = [{ width: 46 }, { width: 18 }];
  ws.addRow([t.pdf.excel.parametro, t.pdf.excel.valor]).font = NEGRITO;
  const entradas: Array<[string, string, number]> = [
    ["investimento", tr.kpis.investimento, p.financeiro.investimentoR],
    ["taxa", tr.premissas.campos.taxaDescontoAnualPct, pr.financeiras.taxaDescontoAnualPct / 100],
    ["om", tr.premissas.campos.omAnualPctInvestimento, pr.financeiras.omAnualPctInvestimento / 100],
    ["omReajuste", tr.premissas.campos.reajusteOmAnualPct, pr.financeiras.reajusteOmAnualPct / 100],
    ["trocaAno", tr.premissas.campos.trocaInversorAno, pr.financeiras.trocaInversorAno],
    ["trocaCusto", tr.premissas.campos.trocaInversorCustoRKWca, (pr.financeiras.trocaInversorCustoRKWca * p.arranjo.potenciaCaKW)],
    ["disp", "kWh", custoDisponibilidadeKWh(p.entrada.ligacao, p.entrada.cadUnico)],
    ["principal", tr.financeiro.cenarios.financiado, p.financeiro.investimentoR * (1 - pr.financeiras.financiamento.entradaPct / 100)],
    ["taxaMensal", tr.premissas.campos.taxaMensalPct, pr.financeiras.financiamento.taxaMensalPct / 100],
    ["meses", tr.premissas.campos.meses, pr.financeiras.financiamento.meses],
  ];
  const celula: Record<string, string> = {};
  entradas.forEach(([chave, rotulo, valor], i) => {
    const linha = ws.addRow([rotulo, valor]);
    linha.getCell(2).fill = AZUL;
    celula[chave] = `'${t.pdf.excel.premissas}'!$B$${i + 2}`;
  });
  ws.addRow([]);
  ws.addRow([t.pdf.excel.notaFormulas]).font = { italic: true };

  // --- Fluxo de caixa -------------------------------------------------------------------
  const wf = wb.addWorksheet(t.pdf.excel.fluxo);
  const cab = [tr.financeiro.colunas.ano, tr.financeiro.colunas.geracao, tr.financeiro.colunas.economia, t.pdf.excel.om, t.pdf.excel.trocaInversor, t.pdf.excel.fluxoAno, t.pdf.excel.acumulado];
  wf.columns = cab.map(() => ({ width: 16 }));
  wf.addRow(cab).font = NEGRITO;
  wf.addRow([0, null, null, null, null, { formula: `-${celula.investimento}` }, { formula: "F2" }]);
  p.projecao.anos.forEach((a, i) => {
    const r = i + 3;
    const linha = wf.addRow([
      a.anoOperacao,
      Math.round(a.geracaoKWh),
      Number(a.economiaR.toFixed(2)),
      { formula: `${celula.investimento}*${celula.om}*(1+${celula.omReajuste})^(A${r}-1)` },
      { formula: `IF(A${r}=${celula.trocaAno},${celula.trocaCusto},0)` },
      { formula: `C${r}-D${r}-E${r}` },
      { formula: `G${r - 1}+F${r}` },
    ]);
    linha.getCell(3).fill = AZUL;
  });
  const ultima = p.projecao.anos.length + 2;
  wf.addRow([]);
  wf.addRow([tr.financeiro.vpl, { formula: `F2+NPV(${celula.taxa},F3:F${ultima})` }]).font = NEGRITO;
  wf.addRow([tr.financeiro.tir, { formula: `IRR(F2:F${ultima})` }]).font = NEGRITO;
  wf.addRow([tr.financeiro.payback, { formula: `IFERROR(INDEX(A3:A${ultima},MATCH(TRUE,INDEX(G3:G${ultima}>=0,0),0))-1-INDEX(G2:G${ultima - 1},MATCH(TRUE,INDEX(G3:G${ultima}>=0,0),0))/INDEX(F3:F${ultima},MATCH(TRUE,INDEX(G3:G${ultima}>=0,0),0)),"—")` }]).font = NEGRITO;
  for (const col of ["C", "D", "E", "F", "G"]) wf.getColumn(col).numFmt = '"R$" #,##0.00';

  // --- Fatura ano 1 (fórmulas do art. 655-I) ----------------------------------------------
  // Entradas por mês (azul): balanço horário do motor e as tarifas do mês (com o percentual do Fio B
  // do ano e os tributos). Fórmulas: consumo da rede, compensada (limitada ao consumo, à injeção e
  // ao custo de disponibilidade) e faturas. Sem saldo de créditos entre meses.
  const wfa = wb.addWorksheet(t.pdf.excel.fatura);
  const cabF = [tr.geracao.mes, tr.geracao.consumo, tr.geracao.autoconsumo, tr.geracao.injetada, t.pdf.excel.tarifaCheia, t.pdf.excel.tarifaCompensada, t.pdf.excel.consumoRede, t.pdf.excel.compensadaKWh, tr.fatura.sem, tr.fatura.com];
  wfa.columns = cabF.map(() => ({ width: 18 }));
  wfa.addRow(cabF).font = NEGRITO;
  p.projecao.meses.slice(0, 12).forEach((m, i) => {
    const r = i + 2;
    const disp = celula.disp;
    const linha = wfa.addRow([
      mesesRotulos[m.mes - 1],
      Number(m.consumoKWh.toFixed(2)),
      Number(m.autoconsumoKWh.toFixed(2)),
      Number(m.injetadaKWh.toFixed(2)),
      Number(m.tarifaCheiaRKWh.toFixed(6)),
      Number(m.tarifaCompensadaRKWh.toFixed(6)),
      { formula: `B${r}-C${r}` },
      { formula: `MAX(0,MIN(G${r},D${r},IF(E${r}>F${r},(G${r}*E${r}-${disp}*E${r})/(E${r}-F${r}),G${r})))` },
      { formula: `MAX(B${r},${disp})*E${r}` },
      { formula: `MAX(${disp}*E${r},(G${r}-H${r})*E${r}+H${r}*F${r})` },
    ]);
    for (const c of [2, 3, 4, 5, 6]) linha.getCell(c).fill = AZUL;
  });
  wfa.getColumn("I").numFmt = '"R$" #,##0.00';
  wfa.getColumn("J").numFmt = '"R$" #,##0.00';
  wfa.addRow([]);
  wfa.addRow([tr.fatura.regra]).font = { italic: true };

  // --- Financiamento (Price) --------------------------------------------------------------
  const wp = wb.addWorksheet(t.pdf.excel.price);
  wp.columns = [{ width: 10 }, { width: 16 }, { width: 16 }, { width: 16 }, { width: 18 }];
  wp.addRow(["#", tr.financeiro.parcela, t.pdf.excel.juros, t.pdf.excel.amortizacao, t.pdf.excel.saldo]).font = NEGRITO;
  for (let n = 1; n <= pr.financeiras.financiamento.meses; n++) {
    const r = n + 1;
    wp.addRow([
      n,
      { formula: `-PMT(${celula.taxaMensal},${celula.meses},${celula.principal})` },
      { formula: `-IPMT(${celula.taxaMensal},A${r},${celula.meses},${celula.principal})` },
      { formula: `-PPMT(${celula.taxaMensal},A${r},${celula.meses},${celula.principal})` },
      { formula: n === 1 ? `${celula.principal}-D${r}` : `E${r - 1}-D${r}` },
    ]);
  }
  for (const col of ["B", "C", "D", "E"]) wp.getColumn(col).numFmt = '"R$" #,##0.00';

  // --- Geração mensal ---------------------------------------------------------------------
  const wg = wb.addWorksheet(t.pdf.excel.geracao);
  wg.columns = [{ width: 12 }, { width: 18 }];
  wg.addRow([tr.geracao.mes, tr.geracao.geracao]).font = NEGRITO;
  p.simulacao.geracaoMensalKWh.forEach((g, i) => wg.addRow([mesesRotulos[i], Math.round(g)]));
  wg.addRow(["Σ", { formula: "SUM(B2:B13)" }]).font = NEGRITO;

  const buffer = await wb.xlsx.writeBuffer();
  return new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}
