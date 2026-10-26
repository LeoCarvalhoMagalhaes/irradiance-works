"use client";

import { Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { UsinaMonitorada } from "@/core/monitoramento/frota";
import { preencher } from "@/i18n/config";
import { useFormato, useIdioma, useTextos } from "@/i18n/cliente";
import { removerComissionamento, useEstado } from "@/lib/estado";
import { MarcaPremissa } from "@/components/shared/indicadores";
import { Button } from "@/components/ui/button";
import { nomeModulo } from "@/lib/nome-equipamento";

export function AbaCadastro({ usina }: { usina: UsinaMonitorada }) {
  const t = useTextos("monitoramento");
  const tc = t.usina.cadastro;
  const tcomum = useTextos("comum");
  const f = useFormato();
  const idioma = useIdioma();
  const roteador = useRouter();
  const estado = useEstado();
  const proposta = estado?.estado.propostas.find((p) => p.id === usina.propostaId);
  const linhas: Array<[string, React.ReactNode]> = [
    [tc.id, <span key="id" className="font-mono">{usina.id}</span>],
    [tc.origem, t.tabela.origem[usina.origem]],
    [tc.cidade, `${usina.cidade.nome}/${usina.cidade.uf}`],
    [tc.coordenadas, `${f.numero(usina.cidade.latitude, 3)}°, ${f.numero(usina.cidade.longitude, 3)}°`],
    [tc.comissionamento, f.data(usina.comissionamento)],
    [tc.orientacao, `${f.numero(usina.inclinacaoGraus)}° / ${f.numero(usina.azimuteGraus)}°`],
    [tc.modulo, `${nomeModulo(usina.modulo, tcomum)} (${usina.modulo.potenciaWp} Wp)`],
    [tc.potenciaCc, f.potenciaKWp(usina.potenciaCcW / 1000)],
    [tc.potenciaCa, f.potenciaKW(usina.potenciaCaW / 1000)],
    [tc.inversores, String(usina.inversores.length)],
    [tc.fabricante, preencher(tc.fabricanteFicticio, { f: usina.fabricante })],
    [
      tc.valorEnergia,
      <span key="v" className="inline-flex items-center">
        {f.moeda(usina.valorEnergiaRKWh)}/kWh
        {usina.valorEnergiaPremissa && <MarcaPremissa />}
      </span>,
    ],
    [tcomum.segmentos[usina.segmento], usina.tipo === "scada" ? t.tabela.scada : "GD"],
  ];
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <section className="rounded-xl border bg-card p-4" aria-labelledby="cadastro">
        <h3 id="cadastro" className="font-semibold">{tc.titulo}</h3>
        <dl className="mt-3 divide-y text-sm">
          {linhas.map(([r, v]) => (
            <div key={r} className="flex justify-between gap-4 py-2">
              <dt className="text-muted-foreground">{r}</dt>
              <dd className="text-right">{v}</dd>
            </div>
          ))}
        </dl>
        {proposta && (
          <Button asChild variant="outline" size="sm" className="mt-3">
            <Link href={`/${idioma}/simulador/?proposta=${proposta.id}`}>
              {tc.proposta}: {proposta.id}
            </Link>
          </Button>
        )}
        {usina.origem === "comissionada" && (
          <Button
            variant="destructive"
            size="sm"
            className="mt-3 ml-2"
            onClick={() => {
              if (!window.confirm(preencher(tc.removerConfirma, { id: usina.id }))) return;
              removerComissionamento(usina.id);
              roteador.push(`/${idioma}/monitoramento/`);
            }}
          >
            <Trash2 aria-hidden="true" /> {tc.removerComissionada}
          </Button>
        )}
      </section>
      <section className="rounded-xl border bg-card p-4" aria-labelledby="arvore">
        <h3 id="arvore" className="font-semibold">{tc.arvore}</h3>
        <ul className="mt-3 space-y-1 font-mono text-xs" role="tree" aria-labelledby="arvore">
          <li role="treeitem" aria-expanded="true" aria-selected="false">
            {usina.id}
            <ul role="group" className="ml-4 border-l pl-3">
              {usina.inversores.map((inv) => (
                <li key={inv.id} role="treeitem" aria-expanded="true" aria-selected="false">
                  {usina.id}/{inv.id} · {f.potenciaKW(inv.potenciaCaW / 1000)}
                  <ul role="group" className="ml-4 border-l pl-3 text-muted-foreground">
                    {inv.mppts.map((m) => (
                      <li key={m.id} role="treeitem" aria-selected="false">
                        {usina.id}/{inv.id}/{m.id} · {m.strings} × {m.modulosEmSerie} · {f.potenciaKWp(m.potenciaCcW / 1000)}
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          </li>
        </ul>
      </section>
    </div>
  );
}
