"use client";

import { RotateCcw } from "lucide-react";
import { useState } from "react";
import { esquemaPremissas, PREMISSAS_PADRAO, type Premissas } from "@/core/simulador/premissas";
import { preencher } from "@/i18n/config";
import { useTextos } from "@/i18n/cliente";
import { Button } from "@/components/ui/button";
import { CampoNumero, CampoSelecao } from "./campos";

type Num = { chave: string; caminho: string; ler: (p: Premissas) => number; gravar: (p: Premissas, v: number) => Premissas; sufixo?: string; passo?: number };

const tec = (k: keyof Premissas["tecnicas"]): Pick<Num, "ler" | "gravar" | "caminho"> => ({
  caminho: `tecnicas.${k}`,
  ler: (p) => p.tecnicas[k] as number,
  gravar: (p, v) => ({ ...p, tecnicas: { ...p.tecnicas, [k]: v } }),
});
const fin = (k: keyof Premissas["financeiras"]): Pick<Num, "ler" | "gravar" | "caminho"> => ({
  caminho: `financeiras.${k}`,
  ler: (p) => p.financeiras[k] as number,
  gravar: (p, v) => ({ ...p, financeiras: { ...p.financeiras, [k]: v } }),
});

const TECNICAS: Num[] = [
  { chave: "albedo", ...tec("albedo"), passo: 0.01 },
  { chave: "sujidadePct", ...tec("sujidadePct"), sufixo: "%" },
  { chave: "mismatchPct", ...tec("mismatchPct"), sufixo: "%" },
  { chave: "cabosCcPct", ...tec("cabosCcPct"), sufixo: "%" },
  { chave: "cabosCaPct", ...tec("cabosCaPct"), sufixo: "%" },
  { chave: "disponibilidadePct", ...tec("disponibilidadePct"), sufixo: "%" },
  { chave: "degradacaoPrimeiroAnoPct", ...tec("degradacaoPrimeiroAnoPct"), sufixo: "%" },
  { chave: "degradacaoAnualPct", ...tec("degradacaoAnualPct"), sufixo: "%" },
  { chave: "faixaPrMin", caminho: "tecnicas.faixaPr.0", ler: (p) => p.tecnicas.faixaPr[0], gravar: (p, v) => ({ ...p, tecnicas: { ...p.tecnicas, faixaPr: [v, p.tecnicas.faixaPr[1]] } }), passo: 0.01 },
  { chave: "faixaPrMax", caminho: "tecnicas.faixaPr.1", ler: (p) => p.tecnicas.faixaPr[1], gravar: (p, v) => ({ ...p, tecnicas: { ...p.tecnicas, faixaPr: [p.tecnicas.faixaPr[0], v] } }), passo: 0.01 },
  { chave: "faixaRelacaoMin", caminho: "tecnicas.faixaRelacaoCcCa.0", ler: (p) => p.tecnicas.faixaRelacaoCcCa[0], gravar: (p, v) => ({ ...p, tecnicas: { ...p.tecnicas, faixaRelacaoCcCa: [v, p.tecnicas.faixaRelacaoCcCa[1]] } }), passo: 0.01 },
  { chave: "faixaRelacaoMax", caminho: "tecnicas.faixaRelacaoCcCa.1", ler: (p) => p.tecnicas.faixaRelacaoCcCa[1], gravar: (p, v) => ({ ...p, tecnicas: { ...p.tecnicas, faixaRelacaoCcCa: [p.tecnicas.faixaRelacaoCcCa[0], v] } }), passo: 0.01 },
  { chave: "relacaoCcCaAlvo", ...tec("relacaoCcCaAlvo"), passo: 0.01 },
  { chave: "fatorOcupacao", ...tec("fatorOcupacao"), passo: 0.01 },
  { chave: "margemTempMinC", ...tec("margemTempMinC"), sufixo: "°C" },
  { chave: "fatorSegurancaCorrente", ...tec("fatorSegurancaCorrente"), passo: 0.01 },
];

const FINANCEIRAS: Num[] = [
  { chave: "horizonteAnos", ...fin("horizonteAnos"), passo: 1 },
  { chave: "taxaDescontoAnualPct", ...fin("taxaDescontoAnualPct"), sufixo: "%" },
  { chave: "reajusteTarifaAnualPct", ...fin("reajusteTarifaAnualPct"), sufixo: "%" },
  { chave: "custoRWp", ...fin("custoRWp"), sufixo: "R$", passo: 0.01 },
  { chave: "omAnualPctInvestimento", ...fin("omAnualPctInvestimento"), sufixo: "%" },
  { chave: "reajusteOmAnualPct", ...fin("reajusteOmAnualPct"), sufixo: "%" },
  { chave: "trocaInversorAno", ...fin("trocaInversorAno"), passo: 1 },
  { chave: "trocaInversorCustoRKWca", ...fin("trocaInversorCustoRKWca"), sufixo: "R$" },
  { chave: "entradaPct", caminho: "financeiras.financiamento.entradaPct", ler: (p) => p.financeiras.financiamento.entradaPct, gravar: (p, v) => ({ ...p, financeiras: { ...p.financeiras, financiamento: { ...p.financeiras.financiamento, entradaPct: v } } }), sufixo: "%" },
  { chave: "taxaMensalPct", caminho: "financeiras.financiamento.taxaMensalPct", ler: (p) => p.financeiras.financiamento.taxaMensalPct, gravar: (p, v) => ({ ...p, financeiras: { ...p.financeiras, financiamento: { ...p.financeiras.financiamento, taxaMensalPct: v } } }), sufixo: "%" },
  { chave: "meses", caminho: "financeiras.financiamento.meses", ler: (p) => p.financeiras.financiamento.meses, gravar: (p, v) => ({ ...p, financeiras: { ...p.financeiras, financiamento: { ...p.financeiras.financiamento, meses: v } } }), passo: 1 },
  { chave: "custoEquipamentosPctInvestimento", caminho: "financeiras.custoMaisTaxa.custoEquipamentosPctInvestimento", ler: (p) => p.financeiras.custoMaisTaxa.custoEquipamentosPctInvestimento, gravar: (p, v) => ({ ...p, financeiras: { ...p.financeiras, custoMaisTaxa: { ...p.financeiras.custoMaisTaxa, custoEquipamentosPctInvestimento: v } } }), sufixo: "%" },
  { chave: "taxaPctEconomia", caminho: "financeiras.custoMaisTaxa.taxaPctEconomia", ler: (p) => p.financeiras.custoMaisTaxa.taxaPctEconomia, gravar: (p, v) => ({ ...p, financeiras: { ...p.financeiras, custoMaisTaxa: { ...p.financeiras.custoMaisTaxa, taxaPctEconomia: v } } }), sufixo: "%" },
  { chave: "mesesTaxa", caminho: "financeiras.custoMaisTaxa.meses", ler: (p) => p.financeiras.custoMaisTaxa.meses, gravar: (p, v) => ({ ...p, financeiras: { ...p.financeiras, custoMaisTaxa: { ...p.financeiras.custoMaisTaxa, meses: v } } }), passo: 1 },
];

/** Painel de premissas: todas editáveis, com validação pelo mesmo esquema do núcleo. */
export function AbaPremissas({ premissas, aplicar }: { premissas: Premissas; aplicar: (p: Premissas) => void }) {
  const tr = useTextos("simulador").resultado;
  const t = tr.premissas;
  const [rascunho, setRascunho] = useState(premissas);
  const validacao = esquemaPremissas.safeParse(rascunho);
  const caminhosInvalidos = new Set(validacao.success ? [] : validacao.error.issues.map((i) => i.path.join(".")));
  const invalido = (n: Num) => (caminhosInvalidos.has(n.caminho) ? t.invalido : undefined);
  const campos = (lista: Num[]) =>
    lista.map((n) => (
      <CampoNumero
        key={n.chave}
        rotulo={t.campos[n.chave as keyof typeof t.campos] as string}
        valor={n.ler(rascunho)}
        sufixo={n.sufixo}
        passo={n.passo ?? 0.1}
        premissa
        erro={invalido(n)}
        aoMudar={(v) => v !== null && setRascunho((r) => n.gravar(r, v))}
      />
    ));
  return (
    <form
      className="grid gap-6"
      onSubmit={(e) => {
        e.preventDefault();
        if (validacao.success) aplicar(validacao.data);
      }}
    >
      <div>
        <h3 className="font-semibold">{t.titulo}</h3>
        <p className="text-sm text-muted-foreground">{t.descricao}</p>
      </div>
      <fieldset className="grid gap-4 rounded-xl border bg-card p-4 sm:grid-cols-2 lg:grid-cols-4">
        <legend className="px-1 font-medium">{t.grupos.tecnicas}</legend>
        <CampoSelecao
          rotulo={t.campos.modeloTransposicao}
          valor={rascunho.tecnicas.modeloTransposicao}
          aoMudar={(v) => setRascunho((r) => ({ ...r, tecnicas: { ...r.tecnicas, modeloTransposicao: v as "hayDavies" | "isotropico" } }))}
          opcoes={[
            { valor: "hayDavies", rotulo: t.campos.modelos.hayDavies },
            { valor: "isotropico", rotulo: t.campos.modelos.isotropico },
          ]}
        />
        {campos(TECNICAS)}
      </fieldset>
      <fieldset className="grid gap-4 rounded-xl border bg-card p-4 sm:grid-cols-2 lg:grid-cols-4">
        <legend className="px-1 font-medium">{t.grupos.financeiras}</legend>
        {campos(FINANCEIRAS)}
      </fieldset>
      <fieldset className="grid gap-4 rounded-xl border bg-card p-4 sm:grid-cols-2">
        <legend className="px-1 font-medium">{t.grupos.regulatorias}</legend>
        <CampoSelecao
          rotulo={t.campos.cenarioPos2029}
          premissa
          valor={rascunho.regulatorias.cenarioPos2029}
          aoMudar={(v) => setRascunho((r) => ({ ...r, regulatorias: { ...r.regulatorias, cenarioPos2029: v as Premissas["regulatorias"]["cenarioPos2029"] } }))}
          opcoes={(["fioB100", "somenteTe", "teMaisBeneficios"] as const).map((c) => ({ valor: c, rotulo: preencher(tr.cenarios.nomes[c], { pct: rascunho.regulatorias.beneficioPctTusd }) }))}
        />
        <CampoNumero
          rotulo={t.campos.beneficioPctTusd}
          premissa
          sufixo="%"
          valor={rascunho.regulatorias.beneficioPctTusd}
          aoMudar={(v) => v !== null && setRascunho((r) => ({ ...r, regulatorias: { ...r.regulatorias, beneficioPctTusd: v } }))}
        />
      </fieldset>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={!validacao.success}>
          {t.recalcular}
        </Button>
        <Button type="button" variant="outline" onClick={() => setRascunho(PREMISSAS_PADRAO)}>
          <RotateCcw aria-hidden="true" /> {t.restaurar}
        </Button>
      </div>
    </form>
  );
}
