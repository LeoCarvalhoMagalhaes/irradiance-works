"use client";

import { ArrowLeft, ArrowRight, Calculator, FileDown, FileSpreadsheet, Loader2, Pencil, Plus, Save } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useSearchParams } from "next/navigation";
import { useCallback, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { PREMISSAS_PADRAO, TRIBUTOS_EXEMPLO, type Premissas } from "@/core/simulador/premissas";
import { calcularProposta, type EntradaProposta, entradaPadrao, esquemaEntradaProposta, type Proposta } from "@/core/simulador/proposta";
import { preencher } from "@/i18n/config";
import { useIdioma, useTextos } from "@/i18n/cliente";
import { baixar } from "@/lib/baixar";
import { salvarProposta, useEstado } from "@/lib/estado";
import { criarFormatadores } from "@/lib/formatacao";
import { hojeLocal } from "@/lib/hoje";
import type { PropostaSalva } from "@/lib/persistencia";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AbaCenarios } from "./aba-cenarios";
import { AbaEletrica } from "./aba-eletrica";
import { AbaFatura } from "./aba-fatura";
import { AbaFinanceiro } from "./aba-financeiro";
import { AbaGeracao } from "./aba-geracao";
import { AbaPerdas } from "./aba-perdas";
import { AbaPremissas } from "./aba-premissas";
import { AbaResumo } from "./aba-resumo";
import { DialogoComissionar } from "./comissionar";
import { EtapaConsumo } from "./etapa-consumo";
import { EtapaInstalacao } from "./etapa-instalacao";
import { EtapaLocal } from "./etapa-local";
import { PropostasSalvas } from "./propostas-salvas";

const CAMPOS_ETAPA: string[][] = [
  ["cliente", "coordenadas", "maiorParticipacaoPct", "dataProtocolo", "cidadeId"],
  ["consumoMensalKWh", "tarifaPersonalizada", "tributos", "cargaCsv", "distribuidoraId"],
  ["instalacao", "moduloPersonalizado", "inversorPersonalizado", "dimensionamento", "moduloId", "inversorId"],
];

function errosDe(entrada: EntradaProposta, mensagem: string): Record<string, string> {
  const r = esquemaEntradaProposta.safeParse(entrada);
  if (r.success) return {};
  return Object.fromEntries(r.error.issues.map((i) => [i.path.join("."), mensagem]));
}

export function Simulador() {
  const t = useTextos("simulador");
  const tPdf = useTextos("pdf");
  const tComum = useTextos("comum");
  const idioma = useIdioma();
  const estado = useEstado();
  const parametros = useSearchParams();
  const [entrada, setEntrada] = useState<EntradaProposta | null>(null);
  const [etapa, setEtapaEstado] = useState(0);
  const [erros, setErros] = useState<Record<string, string>>({});
  const [proposta, setProposta] = useState<Proposta | null>(null);
  const [calculando, setCalculando] = useState(false);
  const [idSalvo, setIdSalvo] = useState<string | undefined>(undefined);
  const [exportando, setExportando] = useState<"pdf" | "excel" | null>(null);

  // Navegar entre etapas pede foco no título da nova etapa, aplicado quando ele monta (depois da
  // animação de saída da anterior). No carregamento da página o foco fica no início do documento.
  const focarTitulo = useRef(false);
  const setEtapa = useCallback((n: number) => {
    focarTitulo.current = true;
    setEtapaEstado(n);
  }, []);
  const aoMontarTitulo = useCallback((el: HTMLHeadingElement | null) => {
    if (el && focarTitulo.current) {
      focarTitulo.current = false;
      el.focus();
    }
  }, []);

  // Entrada inicial (após hidratar o armazenamento): proposta salva (?proposta=) ou padrão.
  if (estado && !entrada) {
    const id = parametros.get("proposta");
    const salva = id ? estado.estado.propostas.find((p) => p.id === id) : undefined;
    setEntrada(salva ? salva.entrada : entradaPadrao(hojeLocal(), estado.estado.premissasPersonalizadas ?? PREMISSAS_PADRAO, TRIBUTOS_EXEMPLO));
    if (salva) setIdSalvo(salva.id);
  }

  const atualizar = useCallback((mudanca: Partial<EntradaProposta>) => setEntrada((e) => (e ? { ...e, ...mudanca } : e)), []);

  const calcular = useCallback(
    (e: EntradaProposta) => {
      setCalculando(true);
      // Libera um quadro para o indicador de progresso antes do cálculo de 8.760 h.
      setTimeout(() => {
        try {
          setProposta(calcularProposta(e));
          setEtapa(3);
        } catch (erro) {
          toast.error(`${tComum.erro} ${erro instanceof Error ? erro.message : ""}`);
        } finally {
          setCalculando(false);
        }
      }, 30);
    },
    [tComum.erro, setEtapa],
  );

  const etapas = [t.etapas.local, t.etapas.consumo, t.etapas.instalacao, t.etapas.resultado];
  const avancar = () => {
    if (!entrada) return;
    const todos = errosDe(entrada, t.erroEntrada);
    const daEtapa = Object.fromEntries(Object.entries(todos).filter(([k]) => CAMPOS_ETAPA[etapa]?.some((c) => k === c || k.startsWith(`${c}.`))));
    setErros(todos);
    if (Object.keys(daEtapa).length) {
      toast.error(t.erroEntrada);
      return;
    }
    if (etapa === 2) {
      if (Object.keys(todos).length) {
        toast.error(t.erroEntrada);
        return;
      }
      calcular(entrada);
    } else setEtapa(etapa + 1);
  };

  const garantirSalva = () => {
    if (!proposta || !entrada) return idSalvo ?? "";
    const id = salvarProposta(entrada, proposta, entrada.cliente, idSalvo);
    setIdSalvo(id);
    return id;
  };

  const exportar = async (tipo: "pdf" | "excel") => {
    if (!proposta) return;
    setExportando(tipo);
    try {
      const nome = `proposta-${(proposta.entrada.cliente || proposta.cidade.nome).normalize("NFD").replace(/[^\w]+/g, "-").toLowerCase()}`;
      const textos = { simulador: t, pdf: tPdf, comum: tComum };
      if (tipo === "pdf") {
        const { gerarPdf } = await import("./proposta-pdf");
        baixar(await gerarPdf(proposta, textos, idioma), `${nome}.pdf`);
      } else {
        const { gerarPlanilha } = await import("@/lib/exportar-excel");
        const f = criarFormatadores(idioma);
        baixar(await gerarPlanilha(proposta, textos, Array.from({ length: 12 }, (_, i) => f.mes(i))), `${nome}.xlsx`);
      }
    } catch (erro) {
      toast.error(`${tComum.erro} ${erro instanceof Error ? erro.message : ""}`);
    } finally {
      setExportando(null);
    }
  };

  const abrirSalva = (p: PropostaSalva) => {
    setEntrada(p.entrada);
    setIdSalvo(p.id);
    calcular(p.entrada);
  };

  const propostas = useMemo(() => estado?.estado.propostas ?? [], [estado]);

  if (!entrada) {
    return (
      <div className="grid gap-4" aria-busy="true">
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-[480px] w-full" />
      </div>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
      <div className="min-w-0 space-y-6">
        <nav aria-label={preencher(t.etapas.etapaDe, { atual: etapa + 1, total: 4 })}>
          <ol className="grid grid-cols-4 gap-2">
            {etapas.map((rotulo, i) => (
              <li key={rotulo}>
                <button
                  type="button"
                  disabled={i === 3 ? !proposta : i > etapa && !proposta}
                  onClick={() => setEtapa(i)}
                  aria-current={i === etapa ? "step" : undefined}
                  className={cn(
                    "w-full rounded-lg border-b-2 px-1 pt-1 pb-2 text-left text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-50 sm:text-sm",
                    i === etapa ? "border-solar font-semibold" : i < etapa ? "border-ok/60 text-muted-foreground" : "border-border text-muted-foreground",
                  )}
                >
                  <span className="block font-mono text-[0.7rem] text-muted-foreground">0{i + 1}</span>
                  {rotulo}
                </button>
              </li>
            ))}
          </ol>
        </nav>

        <AnimatePresence mode="wait" initial={false}>
          <motion.div key={etapa} initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }} transition={{ duration: 0.2, ease: [0.2, 0.8, 0.2, 1] }}>
            <h2 ref={aoMontarTitulo} tabIndex={-1} className="mb-4 text-lg font-semibold outline-none">
              {etapas[etapa]}
            </h2>
            {etapa < 3 && (
              <Card>
                <CardContent className="pt-2">
                  {etapa === 0 && <EtapaLocal entrada={entrada} atualizar={atualizar} erros={erros} />}
                  {etapa === 1 && <EtapaConsumo entrada={entrada} atualizar={atualizar} erros={erros} />}
                  {etapa === 2 && <EtapaInstalacao entrada={entrada} atualizar={atualizar} erros={erros} />}
                </CardContent>
              </Card>
            )}
            {etapa === 3 && proposta && (
              <Resultado
                proposta={proposta}
                exportando={exportando}
                aoExportar={exportar}
                aoSalvar={() => {
                  const id = garantirSalva();
                  toast.success(preencher(t.resultado.acoes.salva, { id }));
                }}
                aoAplicarPremissas={(premissas) => {
                  const nova = { ...entrada, premissas };
                  setEntrada(nova);
                  calcular(nova);
                }}
                garantirSalva={garantirSalva}
                aoEditar={() => setEtapa(0)}
                aoNova={() => {
                  setProposta(null);
                  setIdSalvo(undefined);
                  setEntrada(entradaPadrao(hojeLocal(), estado?.estado.premissasPersonalizadas ?? PREMISSAS_PADRAO, TRIBUTOS_EXEMPLO));
                  setEtapa(0);
                }}
              />
            )}
          </motion.div>
        </AnimatePresence>

        {etapa < 3 && (
          <div className="flex justify-between gap-2">
            <Button variant="outline" disabled={etapa === 0} onClick={() => setEtapa(etapa - 1)}>
              <ArrowLeft aria-hidden="true" /> {tComum.acoes.anterior}
            </Button>
            <Button onClick={avancar} disabled={calculando} className="min-w-40">
              {calculando ? (
                <>
                  <Loader2 className="animate-spin" aria-hidden="true" /> {t.calculando}
                </>
              ) : etapa === 2 ? (
                <>
                  <Calculator aria-hidden="true" /> {t.calcular}
                </>
              ) : (
                <>
                  {tComum.acoes.proximo} <ArrowRight aria-hidden="true" />
                </>
              )}
            </Button>
          </div>
        )}
        <p className="sr-only" aria-live="polite">
          {calculando ? t.calculando : ""}
        </p>
      </div>
      <aside className="space-y-4">
        <PropostasSalvas propostas={propostas} abrir={abrirSalva} />
      </aside>
    </div>
  );
}

function Resultado({
  proposta,
  exportando,
  aoExportar,
  aoSalvar,
  aoAplicarPremissas,
  garantirSalva,
  aoEditar,
  aoNova,
}: {
  proposta: Proposta;
  exportando: "pdf" | "excel" | null;
  aoExportar: (t: "pdf" | "excel") => void;
  aoSalvar: () => void;
  aoAplicarPremissas: (p: Premissas) => void;
  garantirSalva: () => string;
  aoEditar: () => void;
  aoNova: () => void;
}) {
  const t = useTextos("simulador").resultado;
  const abas = ["resumo", "geracao", "fatura", "financeiro", "cenarios", "eletrica", "perdas", "premissas"] as const;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Button onClick={aoSalvar}>
          <Save aria-hidden="true" /> {t.acoes.salvar}
        </Button>
        <Button variant="outline" onClick={() => aoExportar("pdf")} disabled={exportando !== null}>
          {exportando === "pdf" ? <Loader2 className="animate-spin" aria-hidden="true" /> : <FileDown aria-hidden="true" />}
          {exportando === "pdf" ? t.acoes.gerandoPdf : t.acoes.pdf}
        </Button>
        <Button variant="outline" onClick={() => aoExportar("excel")} disabled={exportando !== null}>
          {exportando === "excel" ? <Loader2 className="animate-spin" aria-hidden="true" /> : <FileSpreadsheet aria-hidden="true" />}
          {exportando === "excel" ? t.acoes.gerandoExcel : t.acoes.excel}
        </Button>
        <DialogoComissionar proposta={proposta} garantirSalva={garantirSalva} />
        <Button variant="ghost" onClick={aoEditar}>
          <Pencil aria-hidden="true" /> {t.acoes.editar}
        </Button>
        <Button variant="ghost" onClick={aoNova}>
          <Plus aria-hidden="true" /> {t.acoes.nova}
        </Button>
      </div>
      <Tabs defaultValue="resumo">
        <div className="overflow-x-auto pb-1">
          <TabsList className="w-max">
            {abas.map((a) => (
              <TabsTrigger key={a} value={a}>
                {t.abas[a]}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
        <TabsContent value="resumo" className="pt-4"><AbaResumo p={proposta} /></TabsContent>
        <TabsContent value="geracao" className="pt-4"><AbaGeracao p={proposta} /></TabsContent>
        <TabsContent value="fatura" className="pt-4"><AbaFatura p={proposta} /></TabsContent>
        <TabsContent value="financeiro" className="pt-4"><AbaFinanceiro p={proposta} /></TabsContent>
        <TabsContent value="cenarios" className="pt-4"><AbaCenarios p={proposta} /></TabsContent>
        <TabsContent value="eletrica" className="pt-4"><AbaEletrica p={proposta} /></TabsContent>
        <TabsContent value="perdas" className="pt-4"><AbaPerdas cascata={proposta.simulacao.cascata} /></TabsContent>
        <TabsContent value="premissas" className="pt-4"><AbaPremissas premissas={proposta.entrada.premissas} aplicar={aoAplicarPremissas} /></TabsContent>
      </Tabs>
    </div>
  );
}
