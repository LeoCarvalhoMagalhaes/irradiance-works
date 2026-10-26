"use client";

import { AlertTriangle, Info } from "lucide-react";
import type { Aviso, Proposta } from "@/core/simulador/proposta";
import { preencher } from "@/i18n/config";
import { useFormato, useTextos } from "@/i18n/cliente";
import { Kpi, MarcaPremissa } from "@/components/shared/indicadores";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { nomeInversor } from "@/lib/nome-equipamento";

export function useTextoAviso() {
  const t = useTextos("simulador");
  const f = useFormato();
  return (a: Aviso) => {
    const p = { ...(a.parametros ?? {}) } as Record<string, string | number>;
    if (a.codigo === "verificacaoReprovada" && typeof p.verificacao === "string") {
      p.verificacao = t.resultado.eletrica.codigos[p.verificacao as keyof typeof t.resultado.eletrica.codigos] ?? p.verificacao;
    }
    for (const k of ["kWh", "necessaria", "disponivel", "km", "limite"]) if (typeof p[k] === "number") p[k] = f.numero(p[k] as number);
    for (const k of ["pr", "min", "max", "valor", "maxima"]) if (typeof p[k] === "number") p[k] = f.numeroAte(p[k] as number, 3);
    return preencher(t.resultado.avisos[a.codigo], p);
  };
}

export function AbaResumo({ p }: { p: Proposta }) {
  const t = useTextos("simulador");
  const tComum = useTextos("comum");
  const f = useFormato();
  const r = t.resultado;
  const textoAviso = useTextoAviso();
  const aVista = p.financeiro.cenarios[0];
  const tir = aVista.tir.situacao === "unica" ? f.pct(aVista.tir.tir * 100) : aVista.tir.situacao === "multiplas" ? r.financeiro.tirMultiplas : r.financeiro.tirNenhuma;
  const avisosImportantes = p.avisos.filter((a) => a.codigo !== "art17Indefinido");
  const nota = p.avisos.find((a) => a.codigo === "art17Indefinido");
  const qtdInv = p.arranjo.configuracao?.quantidadeInversores ?? 1;

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi
          destaque
          rotulo={r.kpis.potencia}
          valor={f.potenciaKWp(p.arranjo.potenciaCcKWp)}
          detalhe={
            <>
              <span className="block">{preencher(r.kpis.modulos, { n: p.arranjo.numeroModulos, wp: p.modulo.potenciaWp })}</span>
              <span className="block">{preencher(r.kpis.inversores, { n: qtdInv, nome: nomeInversor(p.inversor, tComum) })}</span>
            </>
          }
        />
        <Kpi rotulo={r.kpis.energiaAnual} valor={f.energia(p.projecao.anos[0].geracaoKWh)} detalhe={preencher(r.kpis.rendimento, { valor: f.numero(p.dimensionamento.rendimentoEspecificoKWhKWp) })} />
        <Kpi rotulo={r.kpis.pr} valor={f.numero(p.simulacao.performanceRatio, 3)} />
        <Kpi
          rotulo={r.kpis.coberturaValor}
          valor={f.pct(p.dimensionamento.coberturaAlcancadaValorPct)}
          detalhe={
            <>
              <span className="block">
                {r.kpis.coberturaEnergia}: {f.pct(p.dimensionamento.coberturaAlcancadaEnergiaPct)}
              </span>
              <span className="block">{preencher(r.kpis.coberturaMaxima, { valor: f.pct(p.dimensionamento.coberturaMaximaValorPct) })}</span>
            </>
          }
        />
        <Kpi
          rotulo={r.kpis.investimento}
          valor={f.moedaInteira(p.financeiro.investimentoR)}
          detalhe={
            <span className="inline-flex items-center">
              {f.moeda(p.entrada.premissas.financeiras.custoRWp)}/Wp
              <MarcaPremissa />
            </span>
          }
        />
        <Kpi rotulo={r.kpis.payback} valor={aVista.paybackAnos === null ? r.financeiro.naoAtinge : preencher(r.financeiro.anos, { valor: f.anos(aVista.paybackAnos) })} />
        <Kpi rotulo={r.kpis.vpl} valor={f.moedaInteira(aVista.vplR)} detalhe={`${r.kpis.tir}: ${tir}`} />
        <Kpi rotulo={r.kpis.lcoe} valor={`${f.moeda(p.financeiro.lcoeRKWh)}/kWh`} />
      </div>

      <div className="rounded-xl border bg-card p-4">
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{r.kpis.enquadramento}</p>
        <p className="mt-1 text-lg font-semibold">
          {r.portes[p.enquadramento.porte]}
          {p.enquadramento.categoria && ` · ${r.categorias[p.enquadramento.categoria]}`}
        </p>
        {p.enquadramento.anoRegraArt17 && p.enquadramento.categoria !== "GD1" && (
          <p className="text-sm text-muted-foreground">{preencher(r.anoArt17, { ano: p.enquadramento.anoRegraArt17 })}</p>
        )}
      </div>

      {avisosImportantes.length > 0 && (
        <ul className="space-y-2" aria-label={r.kpis.enquadramento}>
          {avisosImportantes.map((a, i) => (
            <li key={i}>
              <Alert className="border-atencao/40 bg-atencao-suave/40">
                <AlertTriangle aria-hidden="true" className="text-atencao" />
                <AlertDescription className="text-foreground">{textoAviso(a)}</AlertDescription>
              </Alert>
            </li>
          ))}
        </ul>
      )}
      {nota && (
        <Alert>
          <Info aria-hidden="true" />
          <AlertDescription>{textoAviso(nota)}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}
