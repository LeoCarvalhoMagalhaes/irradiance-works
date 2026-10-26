/**
 * Indicadores financeiros sobre fluxos periódicos (índice 0 = investimento inicial).
 */

export function vpl(fluxos: number[], taxa: number): number {
  return fluxos.reduce((s, v, t) => s + v / (1 + taxa) ** t, 0);
}

export type ResultadoTir =
  | { situacao: "unica"; tir: number; raizes: number[] }
  | { situacao: "multiplas"; tir: null; raizes: number[] }
  | { situacao: "nenhuma"; tir: null; raizes: [] };

/**
 * TIR: procura todas as mudanças de sinal do VPL em uma grade de taxas em (−99 %, 1000 %) e
 * refina cada uma por bisseção. Mais de uma raiz (fluxos não convencionais) é reportada como
 * "multiplas" — nesse caso a TIR não é um critério de decisão confiável e o VPL deve prevalecer.
 */
export function tir(fluxos: number[]): ResultadoTir {
  const grade: number[] = [];
  for (let r = -0.99; r < 0.5; r += 0.0025) grade.push(r);
  for (let r = 0.5; r <= 10; r += 0.02) grade.push(r);
  const raizes: number[] = [];
  let anterior = vpl(fluxos, grade[0]);
  for (let k = 1; k < grade.length; k++) {
    const atual = vpl(fluxos, grade[k]);
    if (anterior === 0) raizes.push(grade[k - 1]);
    else if (anterior * atual < 0) {
      let a = grade[k - 1];
      let b = grade[k];
      let fa = anterior;
      for (let i = 0; i < 200 && b - a > 1e-12; i++) {
        const m = (a + b) / 2;
        const fm = vpl(fluxos, m);
        if (fa * fm <= 0) b = m;
        else {
          a = m;
          fa = fm;
        }
      }
      raizes.push((a + b) / 2);
    }
    anterior = atual;
  }
  if (raizes.length === 0) return { situacao: "nenhuma", tir: null, raizes: [] };
  if (raizes.length > 1) return { situacao: "multiplas", tir: null, raizes };
  return { situacao: "unica", tir: raizes[0], raizes };
}

/** Payback com interpolação linear dentro do período em que o acumulado cruza zero. */
function paybackDe(valores: number[]): number | null {
  let acumulado = 0;
  for (let t = 0; t < valores.length; t++) {
    const anterior = acumulado;
    acumulado += valores[t];
    if (t > 0 && anterior < 0 && acumulado >= 0) return t - 1 + -anterior / valores[t];
  }
  return null;
}

export function paybackSimples(fluxos: number[]): number | null {
  return paybackDe(fluxos);
}

export function paybackDescontado(fluxos: number[], taxa: number): number | null {
  return paybackDe(fluxos.map((v, t) => v / (1 + taxa) ** t));
}

export type LinhaPrice = { mes: number; parcela: number; juros: number; amortizacao: number; saldo: number };

/** Tabela Price: parcela constante PMT = P·i / (1 − (1+i)^−n). */
export function tabelaPrice(principal: number, taxaMensal: number, meses: number): { parcela: number; linhas: LinhaPrice[]; jurosTotais: number } {
  const parcela = taxaMensal === 0 ? principal / meses : (principal * taxaMensal) / (1 - (1 + taxaMensal) ** -meses);
  const linhas: LinhaPrice[] = [];
  let saldo = principal;
  let jurosTotais = 0;
  for (let mes = 1; mes <= meses; mes++) {
    const juros = saldo * taxaMensal;
    const amortizacao = parcela - juros;
    saldo -= amortizacao;
    jurosTotais += juros;
    linhas.push({ mes, parcela, juros, amortizacao, saldo: Math.abs(saldo) < 1e-6 ? 0 : saldo });
  }
  return { parcela, linhas, jurosTotais };
}

/** Converte taxa anual efetiva em mensal equivalente. */
export const taxaMensalEquivalente = (taxaAnual: number) => (1 + taxaAnual) ** (1 / 12) - 1;

/**
 * LCOE = Σ custos_t/(1+r)^t / Σ energia_t/(1+r)^t (R$/kWh), com custos no índice 0 (investimento)
 * e energia a partir do índice 1.
 */
export function lcoe(custos: number[], energiaKWh: number[], taxa: number): number {
  const pvCustos = custos.reduce((s, v, t) => s + v / (1 + taxa) ** t, 0);
  const pvEnergia = energiaKWh.reduce((s, v, t) => s + v / (1 + taxa) ** t, 0);
  return pvEnergia > 0 ? pvCustos / pvEnergia : NaN;
}
