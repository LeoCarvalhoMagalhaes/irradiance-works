"use client";

import { CheckCircle2, PlugZap } from "lucide-react";
import { motion } from "motion/react";
import Link from "next/link";
import { useState } from "react";
import { temVizinhasNaFrota } from "@/core/integracao/comissionamento";
import type { Proposta } from "@/core/simulador/proposta";
import { somarDias } from "@/core/util/tempo";
import { preencher } from "@/i18n/config";
import { useIdioma, useTextos } from "@/i18n/cliente";
import { comissionar } from "@/lib/estado";
import { hojeLocal } from "@/lib/hoje";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { CampoData, CampoTexto } from "./campos";

/** Confirmação animada com Motion (alternativa leve a uma animação Lottie). */
function Confirmacao({ texto }: { texto: string }) {
  return (
    <div className="flex flex-col items-center gap-3 py-4 text-center" role="status">
      <motion.div initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", stiffness: 260, damping: 18 }}>
        <CheckCircle2 className="size-14 text-ok" aria-hidden="true" />
      </motion.div>
      <p className="font-medium">{texto}</p>
    </div>
  );
}

export function DialogoComissionar({ proposta, garantirSalva }: { proposta: Proposta; garantirSalva: () => string }) {
  const t = useTextos("simulador").comissionar;
  const idioma = useIdioma();
  const hoje = hojeLocal();
  const [aberto, setAberto] = useState(false);
  const [nome, setNome] = useState(proposta.entrada.cliente || `${proposta.cidade.nome} ${proposta.arranjo.potenciaCcKWp.toFixed(1)} kWp`);
  const [data, setData] = useState(somarDias(hoje, -183));
  const [sujidade, setSujidade] = useState(true);
  const [string, setString] = useState(false);
  const [criada, setCriada] = useState<string | null>(null);

  const confirmar = () => {
    const propostaId = garantirSalva();
    const falhasDemo = [
      ...(sujidade ? [{ tipo: "sujidade" as const, inicio: somarDias(hoje, -40) }] : []),
      ...(string ? [{ tipo: "stringDesligada" as const, inicio: somarDias(hoje, -20) }] : []),
    ];
    const id = comissionar({ nome: nome.trim() || propostaId, propostaId, entrada: proposta.entrada, dataComissionamento: data > hoje ? hoje : data, falhasDemo });
    setCriada(id);
  };

  return (
    <Dialog
      open={aberto}
      onOpenChange={(v) => {
        setAberto(v);
        if (!v) setCriada(null);
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline">
          <PlugZap aria-hidden="true" /> {t.titulo}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t.titulo}</DialogTitle>
          <DialogDescription>{t.descricao}</DialogDescription>
        </DialogHeader>
        {criada ? (
          <>
            <Confirmacao texto={preencher(t.sucesso, { id: criada })} />
            <DialogFooter>
              <Button asChild>
                <Link href={`/${idioma}/monitoramento/usina/?id=${criada}`}>{t.verUsina}</Link>
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <div className="grid gap-4">
              <CampoTexto rotulo={t.nome} valor={nome} aoMudar={setNome} />
              <CampoData rotulo={t.data} dica={t.historicoSimulado} valor={data} aoMudar={setData} />
              <div className="flex gap-2">
                <Button size="sm" variant="secondary" onClick={() => setData(somarDias(hoje, -183))}>
                  {t.atalhos.seis}
                </Button>
                <Button size="sm" variant="secondary" onClick={() => setData(somarDias(hoje, -365))}>
                  {t.atalhos.doze}
                </Button>
              </div>
              <fieldset className="space-y-2">
                <legend className="text-sm font-medium">{t.falhas}</legend>
                <div className="flex items-start gap-2">
                  <Checkbox id="falha-sujidade" checked={sujidade} onCheckedChange={(v) => setSujidade(v === true)} />
                  <Label htmlFor="falha-sujidade" className="font-normal">{t.falhaSujidade}</Label>
                </div>
                <div className="flex items-start gap-2">
                  <Checkbox id="falha-string" checked={string} onCheckedChange={(v) => setString(v === true)} />
                  <Label htmlFor="falha-string" className="font-normal">{t.falhaString}</Label>
                </div>
              </fieldset>
              {sujidade && !temVizinhasNaFrota(proposta.cidade.id) && (
                <p className="rounded-md bg-atencao-suave/50 p-2 text-xs">{preencher(t.semVizinhas, { cidade: proposta.cidade.nome })}</p>
              )}
              <p className="text-xs text-muted-foreground">{t.precisaSalvar}</p>
            </div>
            <DialogFooter>
              <Button onClick={confirmar}>{t.confirmar}</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
