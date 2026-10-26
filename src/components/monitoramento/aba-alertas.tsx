"use client";

import { ClipboardPlus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import type { Alerta } from "@/core/monitoramento/detectores";
import type { UsinaMonitorada } from "@/core/monitoramento/frota";
import type { ContextoGeracao } from "@/core/monitoramento/gerador";
import { criarOsDeAlerta } from "@/core/manutencao/ordens";
import { preencher } from "@/i18n/config";
import { useFormato, useTextos } from "@/i18n/cliente";
import { adicionarOrdens, useEstado } from "@/lib/estado";
import { SeloSeveridade } from "@/components/shared/indicadores";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useCausaAcao, useTituloAlerta } from "./comum";
import { CurvaDia, useDiaGerado } from "./curva-dia";

function Evidencia({ usina, alerta, ctx }: { usina: UsinaMonitorada; alerta: Alerta; ctx: ContextoGeracao }) {
  const t = useTextos("monitoramento").usina.alertas;
  const dia = useDiaGerado(usina, alerta.diaEvidencia, ctx);
  if (!dia) return null;
  const janela: [number, number] | undefined =
    alerta.tipo === "sombreamento" ? [Math.max(0, (alerta.parametros.horaInicio - 3) * 60), Math.min(1435, (alerta.parametros.horaFim + 2) * 60)] : undefined;
  return <CurvaDia dia={dia} titulo={`${t.evidencia} — ${alerta.diaEvidencia}`} descricao={t.evidenciaDescricao} inversor={alerta.ativo.inversorId} janela={janela} />;
}

export function AbaAlertas({ usina, alertas, ctx }: { usina: UsinaMonitorada; alertas: Alerta[]; ctx: ContextoGeracao }) {
  const t = useTextos("monitoramento");
  const ta = t.usina.alertas;
  const f = useFormato();
  const titulo = useTituloAlerta();
  const causaAcao = useCausaAcao();
  const estado = useEstado();
  const [aberto, setAberto] = useState<string | undefined>(alertas.find((a) => a.fim === null)?.id);

  if (alertas.length === 0) return <p className="text-sm text-muted-foreground">{ta.vazio}</p>;

  const criarOs = (a: Alerta) => {
    const existente = estado?.estado.ordens.find((o) => o.alertaId === a.id && o.status !== "cancelada");
    if (existente) {
      toast.info(preencher(ta.osExistente, { id: existente.id }));
      return;
    }
    const [os] = adicionarOrdens((proxima) => [criarOsDeAlerta(a, new Date(), proxima())]);
    toast.success(preencher(ta.osCriada, { id: os.id }));
  };

  return (
    <div className="grid gap-4">
      <h3 className="text-sm font-medium">{ta.linhaTempo}</h3>
      <Accordion type="single" collapsible value={aberto} onValueChange={setAberto} className="rounded-xl border bg-card">
        {alertas.map((a) => {
          const { causa, acao } = causaAcao(a);
          return (
            <AccordionItem key={a.id} value={a.id} className="px-4">
              <AccordionTrigger className="hover:no-underline">
                <div className="flex flex-1 flex-wrap items-center gap-2 text-left">
                  <SeloSeveridade severidade={a.severidade} />
                  <span className="font-medium">{titulo(a)}</span>
                  {a.ativo.inversorId && <span className="font-mono text-xs text-muted-foreground">{[a.ativo.inversorId, a.ativo.mpptId].filter(Boolean).join("/")}</span>}
                  <Badge variant={a.fim === null ? "default" : "secondary"}>{a.fim === null ? ta.emAndamento : `${ta.fim}: ${f.data(a.fim)}`}</Badge>
                  <span className="ml-auto text-xs text-muted-foreground tabular-nums">
                    {ta.deteccao}: {f.data(a.deteccao)}
                  </span>
                </div>
              </AccordionTrigger>
              <AccordionContent className="space-y-4">
                <dl className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
                  <div>
                    <dt className="text-xs text-muted-foreground">{t.origens[a.origem]}</dt>
                    <dd>{a.codigoFabricante ? `${a.codigoFabricante} → ${t.categorias[a.categoriaAlarme!]}` : "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">{ta.inicio}</dt>
                    <dd className="tabular-nums">{f.data(a.inicio)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">{ta.perda}</dt>
                    <dd className="tabular-nums">
                      {f.energia(a.perdaKWh)} · {f.moeda(a.perdaR)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">{ta.perdaDia}</dt>
                    <dd className="tabular-nums">{preencher(t.kpis.porDia, { valor: f.moeda(a.perdaRDia) })}</dd>
                  </div>
                  {Object.entries(a.parametros).map(([k, v]) => (
                    <div key={k}>
                      <dt className="text-xs text-muted-foreground">{ta.parametros[k as keyof typeof ta.parametros] ?? k}</dt>
                      <dd className="tabular-nums">{f.numeroAte(v, 3)}</dd>
                    </div>
                  ))}
                </dl>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-lg bg-muted/60 p-3">
                    <p className="text-xs font-medium text-muted-foreground uppercase">{ta.causa}</p>
                    <p className="mt-1 text-sm">{causa}</p>
                  </div>
                  <div className="rounded-lg bg-solar-suave/50 p-3">
                    <p className="text-xs font-medium text-muted-foreground uppercase">{ta.acao}</p>
                    <p className="mt-1 text-sm">{acao}</p>
                  </div>
                </div>
                {aberto === a.id && <Evidencia usina={usina} alerta={a} ctx={ctx} />}
                <Button onClick={() => criarOs(a)}>
                  <ClipboardPlus aria-hidden="true" /> {ta.criarOs}
                </Button>
              </AccordionContent>
            </AccordionItem>
          );
        })}
      </Accordion>
    </div>
  );
}
