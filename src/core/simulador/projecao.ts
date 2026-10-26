/**
 * Projeção mês a mês do faturamento com e sem geração, ao longo do horizonte.
 *
 * - Simultaneidade horária: autoconsumo instantâneo A_h = min(carga_h, geração_h); a parcela
 *   autoconsumida não passa pelo medidor e não paga Fio B (Lei 14.300, art. 27: a cobrança incide
 *   sobre a energia compensada).
 * - Degradação: fator_y = (1 − d₁)·(1 − dₐ)^y aplicado à geração horária do ano típico.
 * - Reajuste: todas as componentes tarifárias são reajustadas pelo mesmo índice anual (premissa).
 * - Créditos: expiração em 60 meses e uso dos mais antigos primeiro (ver faturamento.ts).
 */
import { custoDisponibilidadeKWh, faturarMes, faturaSemGeracaoR, type Ligacao, type LoteCredito } from "../regulacao/faturamento";
import { fatorTributos, type RegraCompensacao, type TarifaDecomposta, tarifaSobreCompensada, type Tributos } from "../regulacao/tarifa";
import { limitesMensaisHorarios } from "./carga";

export type EntradaProjecao = {
  cargaHorariaKWh: Float64Array;
  geracaoHorariaKWh: Float64Array;
  anoInicio: number;
  mesInicio: number;
  horizonteAnos: number;
  degradacaoPrimeiroAnoPct: number;
  degradacaoAnualPct: number;
  reajusteTarifaAnualPct: number;
  tarifa: TarifaDecomposta;
  tributos: Tributos;
  ligacao: Ligacao;
  cadUnico: boolean;
  regra: RegraCompensacao;
};

export type MesProjetado = {
  ano: number;
  mes: number;
  anoOperacao: number;
  consumoKWh: number;
  geracaoKWh: number;
  autoconsumoKWh: number;
  injetadaKWh: number;
  consumoRedeKWh: number;
  compensadaKWh: number;
  creditosGeradosKWh: number;
  creditosExpiradosKWh: number;
  saldoCreditosKWh: number;
  tarifaCheiaRKWh: number;
  tarifaCompensadaRKWh: number;
  faturaSemR: number;
  faturaComR: number;
  valorCompensadaR: number;
  aplicouCustoDisponibilidade: boolean;
};

export type AnoProjetado = {
  anoOperacao: number;
  geracaoKWh: number;
  autoconsumoKWh: number;
  injetadaKWh: number;
  compensadaKWh: number;
  creditosExpiradosKWh: number;
  saldoCreditosFinalKWh: number;
  faturaSemR: number;
  faturaComR: number;
  economiaR: number;
  valorCompensadaR: number;
};

export type Projecao = { meses: MesProjetado[]; anos: AnoProjetado[] };

/** Somatórios mensais de geração, autoconsumo e injeção para um fator de escala da geração. */
export function balancoMensal(carga: Float64Array, geracao: Float64Array, fator: number) {
  const limites = limitesMensaisHorarios();
  return limites.map(([ini, fim]) => {
    let consumo = 0;
    let gerado = 0;
    let auto = 0;
    for (let h = ini; h < fim; h++) {
      const g = geracao[h] * fator;
      consumo += carga[h];
      gerado += g;
      auto += Math.min(carga[h], g);
    }
    return { consumoKWh: consumo, geracaoKWh: gerado, autoconsumoKWh: auto, injetadaKWh: gerado - auto, consumoRedeKWh: consumo - auto };
  });
}

export function projetar(e: EntradaProjecao): Projecao {
  const ft = fatorTributos(e.tributos);
  const dispKWh = custoDisponibilidadeKWh(e.ligacao, e.cadUnico);
  const meses: MesProjetado[] = [];
  let creditos: LoteCredito[] = [];
  for (let y = 0; y < e.horizonteAnos; y++) {
    const fatorDeg = (1 - e.degradacaoPrimeiroAnoPct / 100) * (1 - e.degradacaoAnualPct / 100) ** y;
    const balanco = balancoMensal(e.cargaHorariaKWh, e.geracaoHorariaKWh, fatorDeg);
    const reajuste = (1 + e.reajusteTarifaAnualPct / 100) ** y;
    for (let k = 0; k < 12; k++) {
      const absoluto = e.mesInicio - 1 + y * 12 + k;
      const ano = e.anoInicio + Math.floor(absoluto / 12);
      const mes = (absoluto % 12) + 1;
      const b = balanco[mes - 1];
      const tarifaCheia = (e.tarifa.totalTe + e.tarifa.totalTusd) * reajuste * ft;
      const tarifaComp = tarifaSobreCompensada(e.tarifa, e.regra, ano).valorRKWh * reajuste * ft;
      const r = faturarMes({
        mesIndice: ano * 12 + mes - 1,
        consumoRedeKWh: b.consumoRedeKWh,
        injetadaKWh: b.injetadaKWh,
        creditos,
        custoDisponibilidadeKWh: dispKWh,
        tarifaCheiaRKWh: tarifaCheia,
        tarifaCompensadaRKWh: tarifaComp,
      });
      creditos = r.creditos;
      meses.push({
        ano,
        mes,
        anoOperacao: y + 1,
        consumoKWh: b.consumoKWh,
        geracaoKWh: b.geracaoKWh,
        autoconsumoKWh: b.autoconsumoKWh,
        injetadaKWh: b.injetadaKWh,
        consumoRedeKWh: b.consumoRedeKWh,
        compensadaKWh: r.energiaCompensadaKWh,
        creditosGeradosKWh: r.creditosGeradosKWh,
        creditosExpiradosKWh: r.creditosExpiradosKWh,
        saldoCreditosKWh: r.saldoCreditosKWh,
        tarifaCheiaRKWh: tarifaCheia,
        tarifaCompensadaRKWh: tarifaComp,
        faturaSemR: faturaSemGeracaoR(b.consumoKWh, dispKWh, tarifaCheia),
        faturaComR: r.faturaR,
        valorCompensadaR: r.valorCompensadaR,
        aplicouCustoDisponibilidade: r.aplicouCustoDisponibilidade,
      });
    }
  }
  const anos: AnoProjetado[] = [];
  for (let y = 1; y <= e.horizonteAnos; y++) {
    const doAno = meses.filter((m) => m.anoOperacao === y);
    const soma = (f: (m: MesProjetado) => number) => doAno.reduce((s, m) => s + f(m), 0);
    anos.push({
      anoOperacao: y,
      geracaoKWh: soma((m) => m.geracaoKWh),
      autoconsumoKWh: soma((m) => m.autoconsumoKWh),
      injetadaKWh: soma((m) => m.injetadaKWh),
      compensadaKWh: soma((m) => m.compensadaKWh),
      creditosExpiradosKWh: soma((m) => m.creditosExpiradosKWh),
      saldoCreditosFinalKWh: doAno[doAno.length - 1].saldoCreditosKWh,
      faturaSemR: soma((m) => m.faturaSemR),
      faturaComR: soma((m) => m.faturaComR),
      economiaR: soma((m) => m.faturaSemR - m.faturaComR),
      valorCompensadaR: soma((m) => m.valorCompensadaR),
    });
  }
  return { meses, anos };
}
