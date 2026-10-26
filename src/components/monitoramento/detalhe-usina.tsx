"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { statusUsina } from "@/core/monitoramento/status";
import { useIdioma, useTextos } from "@/i18n/cliente";
import { eventosDoEstado } from "@/lib/estado";
import { hojeLocal } from "@/lib/hoje";
import { useAnaliseAtual } from "@/lib/use-analise";
import { SeloStatus } from "@/components/shared/indicadores";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AbaAlertas } from "./aba-alertas";
import { AbaCadastro } from "./aba-cadastro";
import { AbaLimpeza, AbaPerdasUsina } from "./aba-perdas-limpeza";
import { AbaPrometido } from "./aba-prometido";
import { AbaScada } from "./aba-scada";
import { AbaTelemetria } from "./aba-telemetria";
import { AbaVisao } from "./aba-visao";
import { EstadoCarregamento } from "./comum";

export function DetalheUsina() {
  const t = useTextos("monitoramento");
  const tc = useTextos("comum");
  const idioma = useIdioma();
  const id = useSearchParams().get("id") ?? "";
  const { estado, analise } = useAnaliseAtual();
  const [aba, setAba] = useState(() => (typeof window !== "undefined" && window.location.hash === "#alertas" ? "alertas" : "visao"));
  // Instante de referência fixado na montagem (múltiplo de 5 min, como na análise da frota).
  const [agoraUtcMs] = useState(() => Math.floor(Date.now() / 300_000) * 300_000);

  const ctx = useMemo(
    () => (estado ? { hoje: hojeLocal(), agoraUtcMs, eventos: eventosDoEstado(estado.estado) } : null),
    [estado, agoraUtcMs],
  );

  if (analise?.situacao !== "pronto" || !ctx) return <EstadoCarregamento analise={analise} />;
  const usina = analise.usinas.find((u) => u.id === id);
  const resultado = analise.resultado.usinas.find((r) => r.usinaId === id);
  if (!usina || !resultado) {
    return (
      <div className="space-y-4">
        <p>{t.usina.naoEncontrada}</p>
        <Button asChild variant="outline">
          <Link href={`/${idioma}/monitoramento/`}>{t.usina.voltar}</Link>
        </Button>
      </div>
    );
  }
  const fator = new Map(resultado.fatorCidade);
  const abas = [
    "visao",
    "alertas",
    "perdas",
    ...(usina.tipo === "gd" ? ["limpeza"] : []),
    ...(usina.origem === "comissionada" ? ["prometido"] : []),
    "telemetria",
    ...(usina.tipo === "scada" ? ["scada"] : []),
    "cadastro",
  ] as Array<keyof typeof t.usina.abas>;

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Link href={`/${idioma}/monitoramento/`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" aria-hidden="true" /> {t.usina.voltar}
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{usina.nome}</h1>
          <SeloStatus status={statusUsina(resultado)} />
          <Badge variant="outline" className="font-mono">{usina.id}</Badge>
          {usina.tipo === "scada" && <Badge variant="secondary">{t.tabela.scada}</Badge>}
          <span className="rounded-full border border-dashed px-2 py-0.5 text-xs text-muted-foreground">{tc.dadosSinteticos}</span>
        </div>
        <p className="text-muted-foreground">
          {tc.segmentos[usina.segmento]} · {usina.cidade.nome}/{usina.cidade.uf}
        </p>
      </div>
      <Tabs value={aba} onValueChange={setAba}>
        <div className="overflow-x-auto pb-1">
          <TabsList className="w-max">
            {abas.map((a) => (
              <TabsTrigger key={a} value={a}>
                {t.usina.abas[a]}
                {a === "alertas" && resultado.alertas.filter((x) => x.fim === null).length > 0 && (
                  <span className="ml-1 rounded-full bg-critico px-1.5 text-[0.65rem] text-white tabular-nums">{resultado.alertas.filter((x) => x.fim === null).length}</span>
                )}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
        <TabsContent value="visao" className="pt-4"><AbaVisao usina={usina} resultado={resultado} ctx={ctx} fator={fator} /></TabsContent>
        <TabsContent value="alertas" className="pt-4" id="alertas"><AbaAlertas usina={usina} alertas={resultado.alertas} ctx={ctx} /></TabsContent>
        <TabsContent value="perdas" className="pt-4"><AbaPerdasUsina usina={usina} resultado={resultado} /></TabsContent>
        <TabsContent value="limpeza" className="pt-4"><AbaLimpeza usina={usina} resultado={resultado} fator={fator} /></TabsContent>
        <TabsContent value="prometido" className="pt-4"><AbaPrometido usina={usina} resultado={resultado} /></TabsContent>
        <TabsContent value="telemetria" className="pt-4"><AbaTelemetria usina={usina} ctx={ctx} primeiroDia={resultado.agregados[0]?.chave ?? ctx.hoje} /></TabsContent>
        <TabsContent value="scada" className="pt-4"><AbaScada usina={usina} resultado={resultado} ctx={ctx} /></TabsContent>
        <TabsContent value="cadastro" className="pt-4"><AbaCadastro usina={usina} /></TabsContent>
      </Tabs>
    </div>
  );
}
