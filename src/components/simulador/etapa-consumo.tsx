"use client";

import { AlertTriangle, FileUp, X } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import tarifas from "@/data/tarifas.json";
import { importarCargaCsv, PERFIS_CARGA, SEGMENTOS } from "@/core/simulador/carga";
import { obterTarifa } from "@/core/simulador/proposta";
import { fatorTributos } from "@/core/regulacao/tarifa";
import { preencher } from "@/i18n/config";
import { useFormato, useTextos } from "@/i18n/cliente";
import { MarcaPremissa } from "@/components/shared/indicadores";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CampoNumero, CampoSelecao } from "./campos";
import type { PropsEtapa } from "./etapa-local";

export function EtapaConsumo({ entrada, atualizar, erros }: PropsEtapa) {
  const t = useTextos("simulador");
  const f = useFormato();
  const [colar, setColar] = useState("");
  const [erroColar, setErroColar] = useState<string | null>(null);
  const arquivo = useRef<HTMLInputElement>(null);
  const total = entrada.consumoMensalKWh.reduce((a, b) => a + b, 0);

  const importacao = useMemo(
    () => (entrada.cargaCsv ? importarCargaCsv(entrada.cargaCsv, entrada.consumoMensalKWh, PERFIS_CARGA[entrada.segmento]) : null),
    [entrada.cargaCsv, entrada.consumoMensalKWh, entrada.segmento],
  );
  const { tarifa, fonte } = useMemo(() => obterTarifa(entrada), [entrada]);
  let tarifaFinal = NaN;
  try {
    tarifaFinal = (tarifa.totalTe + tarifa.totalTusd) * fatorTributos(entrada.tributos);
  } catch {
    tarifaFinal = NaN;
  }

  const aplicarColagem = () => {
    const numeros = colar
      .split(/[\s;\t]+/)
      .map((x) => x.trim())
      .filter(Boolean)
      .map((x) => Number(x.replace(/\.(?=\d{3}\b)/g, "").replace(",", ".")));
    if (numeros.length !== 12 || numeros.some((n) => !Number.isFinite(n) || n < 0)) {
      setErroColar(preencher(t.consumo.colarErro, { n: numeros.length }));
      return;
    }
    setErroColar(null);
    atualizar({ consumoMensalKWh: numeros });
  };

  const lerArquivo = async (file: File) => {
    const texto = await file.text();
    atualizar({ cargaCsv: texto });
  };

  const componentes = ["teEnergia", "teTransporte", "teEncargos", "teOutros", "tusdFioA", "tusdFioB", "tusdEncargos", "tusdPerdas", "tusdOutros"] as const;

  return (
    <div className="grid gap-8">
      <section className="space-y-3" aria-labelledby="consumo-mensal">
        <h3 id="consumo-mensal" className="text-sm font-medium">
          {t.consumo.mensal}
        </h3>
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6">
          {entrada.consumoMensalKWh.map((v, i) => (
            <CampoNumero
              key={i}
              rotulo={f.mes(i)}
              valor={v}
              min={0}
              erro={erros[`consumoMensalKWh.${i}`]}
              aoMudar={(n) => {
                if (n === null) return;
                const lista = [...entrada.consumoMensalKWh];
                lista[i] = n;
                atualizar({ consumoMensalKWh: lista });
              }}
            />
          ))}
        </div>
        <p className="text-sm text-muted-foreground" aria-live="polite">
          {preencher(t.consumo.total, { kwh: f.energia(total) })}
        </p>
        <details className="rounded-lg border px-3 py-2">
          <summary className="cursor-pointer text-sm font-medium">{t.consumo.colar}</summary>
          <div className="mt-2 space-y-2">
            <Label htmlFor="colar-consumo" className="text-xs font-normal text-muted-foreground">
              {t.consumo.colarDica}
            </Label>
            <Textarea id="colar-consumo" value={colar} onChange={(e) => setColar(e.target.value)} rows={3} className="font-mono text-xs" />
            {erroColar && (
              <p role="alert" className="text-xs font-medium text-destructive">
                {erroColar}
              </p>
            )}
            <Button size="sm" variant="secondary" onClick={aplicarColagem}>
              {t.consumo.colarAplicar}
            </Button>
          </div>
        </details>
      </section>

      <section className="grid gap-4" aria-labelledby="perfil-carga">
        <h3 id="perfil-carga" className="sr-only">
          {t.consumo.perfil}
        </h3>
        <CampoSelecao
          rotulo={t.consumo.perfil}
          dica={t.consumo.perfilDica}
          premissa
          valor={entrada.segmento}
          aoMudar={(v) => atualizar({ segmento: v as typeof entrada.segmento })}
          opcoes={SEGMENTOS.map((s) => ({ valor: s, rotulo: t.consumo.segmentos[s] }))}
        />
        <div className="space-y-2 rounded-lg border border-dashed p-3">
          <p className="text-sm font-medium">{t.consumo.csv}</p>
          <p className="text-xs text-muted-foreground">{t.consumo.csvDica}</p>
          <input
            ref={arquivo}
            type="file"
            accept=".csv,text/csv,text/plain"
            className="sr-only"
            id="csv-carga"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void lerArquivo(file);
              e.target.value = "";
            }}
          />
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => arquivo.current?.click()}>
              <FileUp aria-hidden="true" /> {t.consumo.csvArquivo}
            </Button>
            {entrada.cargaCsv && (
              <Button size="sm" variant="ghost" onClick={() => atualizar({ cargaCsv: null })}>
                <X aria-hidden="true" /> {t.consumo.csvRemover}
              </Button>
            )}
          </div>
          {importacao && (
            <p role="status" className={importacao.ok ? "text-xs text-ok" : "text-xs font-medium text-destructive"}>
              {importacao.ok
                ? preencher(t.consumo.csvOk, { linhas: f.numero(importacao.linhas), intervalo: importacao.intervaloMin, meses: importacao.mesesCobertos.map((m) => f.mes(m - 1)).join(", ") || "—" })
                : preencher(t.consumo.csvErro[importacao.erro], { linha: importacao.linha ?? 0 })}
            </p>
          )}
        </div>
      </section>

      <section className="grid gap-4" aria-labelledby="tarifa">
        <h3 id="tarifa" className="text-sm font-medium">
          {t.consumo.distribuidora}
        </h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <CampoSelecao
            rotulo={t.consumo.distribuidora}
            valor={entrada.distribuidoraId}
            aoMudar={(v) =>
              atualizar({ distribuidoraId: v, tarifaPersonalizada: v === "personalizada" ? (entrada.tarifaPersonalizada ?? { teRMWh: 300, tusdRMWh: 550, fioBRMWh: 250 }) : entrada.tarifaPersonalizada })
            }
            opcoes={[...tarifas.distribuidoras.map((d) => ({ valor: d.id, rotulo: `${d.sigla} (${d.uf})` })), { valor: "personalizada", rotulo: t.consumo.personalizada }]}
          />
          <CampoSelecao
            rotulo={t.consumo.subgrupo}
            valor={entrada.subgrupo}
            aoMudar={(v) => atualizar({ subgrupo: v as typeof entrada.subgrupo })}
            opcoes={(["B1", "B2", "B3"] as const).map((s) => ({ valor: s, rotulo: t.consumo.subgrupos[s] }))}
          />
        </div>
        {fonte && <p className="text-xs text-muted-foreground">{preencher(t.consumo.fonteTarifa, { resolucao: fonte.resolucao, inicio: f.data(fonte.vigencia.inicio), fim: f.data(fonte.vigencia.fim) })}</p>}
        {entrada.distribuidoraId === "personalizada" && entrada.tarifaPersonalizada && (
          <div className="grid gap-4 sm:grid-cols-3">
            {(["teRMWh", "tusdRMWh", "fioBRMWh"] as const).map((campo) => (
              <CampoNumero
                key={campo}
                rotulo={campo === "teRMWh" ? t.consumo.te : campo === "tusdRMWh" ? t.consumo.tusd : t.consumo.fioB}
                valor={entrada.tarifaPersonalizada![campo]}
                min={0}
                premissa
                erro={erros[`tarifaPersonalizada.${campo}`]}
                aoMudar={(v) => v !== null && atualizar({ tarifaPersonalizada: { ...entrada.tarifaPersonalizada!, [campo]: v } })}
              />
            ))}
          </div>
        )}

        <fieldset className="space-y-3 rounded-lg border p-3">
          <legend className="px-1 text-sm font-medium">
            {t.consumo.tributos}
            <MarcaPremissa />
          </legend>
          <Alert className="border-atencao/40 bg-atencao-suave/50">
            <AlertTriangle aria-hidden="true" className="text-atencao" />
            <AlertDescription>{t.consumo.tributosAviso}</AlertDescription>
          </Alert>
          <div className="grid gap-4 sm:grid-cols-3">
            {(["icmsPct", "pisPct", "cofinsPct"] as const).map((campo) => (
              <CampoNumero
                key={campo}
                rotulo={campo === "icmsPct" ? t.consumo.icms : campo === "pisPct" ? t.consumo.pis : t.consumo.cofins}
                valor={entrada.tributos[campo]}
                min={0}
                max={40}
                sufixo="%"
                erro={erros[`tributos.${campo}`]}
                aoMudar={(v) => v !== null && atualizar({ tributos: { ...entrada.tributos, [campo]: v } })}
              />
            ))}
          </div>
          <p className="text-sm font-medium" aria-live="polite">
            {preencher(t.consumo.tarifaFinal, { valor: f.moeda(tarifaFinal) })}
          </p>
        </fieldset>

        <details className="rounded-lg border px-3 py-2">
          <summary className="cursor-pointer text-sm font-medium">{t.consumo.decomposicao}</summary>
          <dl className="mt-2 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
            {componentes.map((c) => (
              <div key={c} className="flex justify-between gap-4 border-b border-dashed py-1">
                <dt className="text-muted-foreground">{t.consumo.componentes[c]}</dt>
                <dd className="tabular-nums">{f.numero(tarifa[c], 4)}</dd>
              </div>
            ))}
          </dl>
        </details>
      </section>
    </div>
  );
}
