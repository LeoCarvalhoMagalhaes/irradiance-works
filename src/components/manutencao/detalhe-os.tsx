"use client";

import { useState } from "react";
import { toast } from "sonner";
import type { OrdemServico } from "@/core/manutencao/ordens";
import { preencher } from "@/i18n/config";
import { useFormato, useTextos } from "@/i18n/cliente";
import { hojeLocal } from "@/lib/hoje";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CampoData, CampoSelecao } from "@/components/simulador/campos";

const ACOES = ["limpeza", "reparo", "substituicao", "ajusteConfiguracao", "inspecaoSemAcao"] as const;

export function DetalheOs({
  os,
  aoFechar,
  problema,
  nomeUsina,
  atualizar,
}: {
  os: OrdemServico | null;
  aoFechar: () => void;
  problema: string;
  nomeUsina: string;
  atualizar: (id: string, mudanca: Partial<OrdemServico>) => void;
}) {
  const t = useTextos("manutencao");
  const f = useFormato();
  const [data, setData] = useState(hojeLocal());
  const [acao, setAcao] = useState<(typeof ACOES)[number]>("reparo");
  const [obs, setObs] = useState("");
  if (!os) return null;
  const encerrada = os.status === "concluida" || os.status === "cancelada";
  return (
    <Dialog open onOpenChange={(v) => !v && aoFechar()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{preencher(t.detalhe.titulo, { id: os.id })}</DialogTitle>
          <DialogDescription>
            {nomeUsina} · {t.tipos[os.tipo]} · {t.prioridades[os.prioridade as 1 | 2 | 3 | 4]} · {t.status[os.status]}
          </DialogDescription>
        </DialogHeader>
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs text-muted-foreground">{t.detalhe.problema}</dt>
            <dd>{problema}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">{t.detalhe.caminho}</dt>
            <dd className="font-mono text-xs">{os.ativo.caminho}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">{t.detalhe.deteccao}</dt>
            <dd>{f.data(os.dataDeteccao)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">{t.detalhe.recomendada}</dt>
            <dd>{f.data(os.dataRecomendada)}</dd>
          </div>
        </dl>
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">{t.detalhe.checklist}</legend>
          {os.checklist.map((item) => (
            <div key={item.id} className="flex items-start gap-2">
              <Checkbox
                id={`chk-${item.id}`}
                checked={item.feito}
                disabled={encerrada}
                onCheckedChange={(v) => atualizar(os.id, { checklist: os.checklist.map((c) => (c.id === item.id ? { ...c, feito: v === true } : c)) })}
              />
              <Label htmlFor={`chk-${item.id}`} className="font-normal leading-snug">
                {t.checklist[item.id as keyof typeof t.checklist] ?? item.id}
              </Label>
            </div>
          ))}
        </fieldset>
        {!encerrada && (
          <div className="grid gap-3 rounded-lg border p-3 sm:grid-cols-2">
            <CampoData rotulo={t.detalhe.dataExecucao} dica={t.detalhe.dataExecucaoDica} valor={data} aoMudar={setData} />
            <CampoSelecao rotulo={t.detalhe.acao} valor={acao} aoMudar={(v) => setAcao(v as typeof acao)} opcoes={ACOES.map((a) => ({ valor: a, rotulo: t.acoesExecutadas[a] }))} />
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="obs-os">{t.detalhe.observacoes}</Label>
              <Textarea id="obs-os" value={obs} onChange={(e) => setObs(e.target.value)} rows={2} />
            </div>
          </div>
        )}
        {encerrada && os.acaoExecutada && (
          <p className="text-sm">
            {t.detalhe.acao}: {t.acoesExecutadas[os.acaoExecutada]} · {f.data(os.concluidaEm)}
          </p>
        )}
        <DialogFooter className="gap-2">
          {!encerrada && (
            <>
              <Button variant="ghost" onClick={() => atualizar(os.id, { status: "cancelada" })}>
                {t.detalhe.cancelar}
              </Button>
              {os.status === "aberta" && (
                <Button variant="outline" onClick={() => atualizar(os.id, { status: "emAndamento", iniciadaEm: hojeLocal() })}>
                  {t.detalhe.iniciar}
                </Button>
              )}
              <Button
                onClick={() => {
                  const concluidaEm = data < os.abertaEm ? os.abertaEm : data;
                  atualizar(os.id, { status: "concluida", concluidaEm, iniciadaEm: os.iniciadaEm ?? concluidaEm, acaoExecutada: acao, observacoes: obs });
                  toast.success(t.detalhe.concluida);
                  aoFechar();
                }}
              >
                {t.detalhe.concluir}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
