"use client";

import { ArrowRight, Bot, FileDown, FileUp, Route } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  agruparRotas,
  criarOsLimpezaPreventiva,
  exportarCsv,
  exportarJson,
  importarConclusoes,
  indicadoresManutencao,
  type OrdemServico,
  SCHEMA_OS,
  VERSAO_OS,
  type Verificacao,
  verificarResultado,
} from "@/core/manutencao/ordens";
import { somarDias } from "@/core/util/tempo";
import { preencher } from "@/i18n/config";
import { useFormato, useTextos } from "@/i18n/cliente";
import { baixar } from "@/lib/baixar";
import { adicionarOrdens, atualizarOrdem, importarConclusoesNoEstado } from "@/lib/estado";
import { hojeLocal } from "@/lib/hoje";
import { useAnaliseAtual } from "@/lib/use-analise";
import { EstadoCarregamento } from "@/components/monitoramento/comum";
import { Kpi } from "@/components/shared/indicadores";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CampoSelecao } from "@/components/simulador/campos";
import { DetalheOs } from "./detalhe-os";

/** Ação típica de cada problema, usada pelo adaptador de demonstração do CMMS. */
const ACAO_TIPICA: Record<string, OrdemServico["acaoExecutada"]> = {
  sujidade: "limpeza",
  stringDesligada: "reparo",
  inversorOffline: "reparo",
  perdaComunicacao: "reparo",
  sombreamento: "reparo",
  alarme: "reparo",
  subdesempenhoInversor: "reparo",
  degradacaoAcelerada: "substituicao",
  clipping: "inspecaoSemAcao",
};

export function Manutencao() {
  const t = useTextos("manutencao");
  const tm = useTextos("monitoramento");
  const f = useFormato();
  const { estado, analise } = useAnaliseAtual();
  const [filtro, setFiltro] = useState("todas");
  const [aberta, setAberta] = useState<string | null>(null);
  const arquivo = useRef<HTMLInputElement>(null);
  const hoje = hojeLocal();
  const ordens = useMemo(() => estado?.estado.ordens ?? [], [estado]);

  const verificacoes = useMemo(() => {
    const m = new Map<string, Verificacao | null>();
    if (analise?.situacao !== "pronto") return m;
    for (const o of ordens) {
      const r = analise.resultado.usinas.find((u) => u.usinaId === o.ativo.usinaId);
      if (r) m.set(o.id, verificarResultado(o, r.agregados, new Map(r.fatorCidade)));
    }
    return m;
  }, [analise, ordens]);

  const rotas = useMemo(() => {
    if (analise?.situacao !== "pronto") return [];
    const candidatas = analise.resultado.usinas
      .filter((r) => r.limpeza?.dataRecomendada && r.limpeza.tendenciaSignificativa && r.limpeza.dataRecomendada <= somarDias(hoje, 30))
      .filter((r) => !ordens.some((o) => o.ativo.usinaId === r.usinaId && o.origem === "preventiva" && (o.status === "aberta" || o.status === "emAndamento")))
      .map((r) => ({ usina: analise.usinas.find((u) => u.id === r.usinaId)!, dataRecomendada: r.limpeza!.dataRecomendada! < hoje ? hoje : r.limpeza!.dataRecomendada! }));
    return agruparRotas(candidatas);
  }, [analise, ordens, hoje]);

  if (analise?.situacao !== "pronto" || !estado) return <EstadoCarregamento analise={analise} altura={360} />;

  const valorEnergia = (id: string) => analise.usinas.find((u) => u.id === id)?.valorEnergiaRKWh ?? 0;
  const k = indicadoresManutencao(ordens, hoje, verificacoes, valorEnergia);
  const filtradas = ordens.filter((o) => filtro === "todas" || o.status === filtro);
  const nomeUsina = (id: string) => analise.usinas.find((u) => u.id === id)?.nome ?? id;
  const problema = (o: OrdemServico) =>
    o.tipoAlerta === "alarme" && o.categoriaAlarme ? `${tm.tipos.alarme}: ${tm.categorias[o.categoriaAlarme]}` : o.tipoAlerta ? tm.tipos[o.tipoAlerta] : t.origens.preventiva;
  const textoVerificacao = (v: Verificacao | null | undefined) =>
    !v
      ? t.verificacao.semVerificacao
      : v.situacao === "aguardandoDados"
        ? preencher(t.verificacao.aguardando, { dias: v.diasDepois, necessarios: v.diasNecessarios })
        : v.situacao === "efetiva"
          ? preencher(t.verificacao.efetiva, { ganho: f.numero(v.ganhoPct, 1), energia: f.energia(v.energiaRecuperadaKWhDia) })
          : preencher(t.verificacao.naoEfetiva, { ganho: f.numero(v.ganhoPct, 1) });

  const importar = async (texto: string) => {
    const r = importarConclusoes(texto);
    if (!r.ok) {
      toast.error(preencher(t.integracao.erros[r.erro], { schema: SCHEMA_OS, linha: r.linha ?? 0 }));
      return;
    }
    const res = importarConclusoesNoEstado(r.conclusoes);
    toast.success(preencher(t.integracao.importado, { n: res.atualizadas }));
    if (res.desconhecidas.length) toast.warning(preencher(t.integracao.desconhecidas, { ids: res.desconhecidas.join(", ") }));
  };

  const simularCmms = () => {
    const abertas = ordens.filter((o) => o.status === "aberta" || o.status === "emAndamento");
    if (!abertas.length) {
      toast.info(t.integracao.nenhumaAberta);
      return;
    }
    const data = somarDias(hoje, -3);
    const conclusoes = abertas.map((o) => ({
      id: o.id,
      status: "concluida" as const,
      concluidaEm: data < o.abertaEm ? o.abertaEm : data,
      acaoExecutada: o.origem === "preventiva" ? ("limpeza" as const) : (ACAO_TIPICA[o.tipoAlerta ?? ""] ?? "reparo"),
    }));
    // O adaptador usa o mesmo formato de importação: JSON no envelope do schema.
    void importar(JSON.stringify({ schema: SCHEMA_OS, versao: VERSAO_OS, conclusoes }));
    toast.success(preencher(t.integracao.simulado, { n: conclusoes.length }));
  };

  const osAberta = ordens.find((o) => o.id === aberta) ?? null;

  return (
    <div className="grid gap-6">
      <ol className="flex flex-wrap items-center gap-2 text-sm" aria-label={t.titulo}>
        {t.fluxo.map((passo, i) => (
          <li key={passo} className="flex items-center gap-2">
            <span className="rounded-full border bg-card px-3 py-1">{passo}</span>
            {i < t.fluxo.length - 1 && <ArrowRight className="size-4 text-muted-foreground" aria-hidden="true" />}
          </li>
        ))}
      </ol>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi rotulo={t.kpis.abertas} valor={String(k.abertas)} detalhe={`${t.kpis.emAndamento}: ${k.emAndamento} · ${t.kpis.concluidas}: ${k.concluidas}`} />
        <Kpi
          rotulo={t.kpis.deteccaoAbertura}
          valor={k.tempoDeteccaoAberturaDias === null ? "—" : preencher(t.kpis.dias, { valor: f.numero(k.tempoDeteccaoAberturaDias, 1) })}
          detalhe={`${t.kpis.aberturaConclusao}: ${k.tempoAberturaConclusaoDias === null ? "—" : preencher(t.kpis.dias, { valor: f.numero(k.tempoAberturaConclusaoDias, 1) })}`}
        />
        <Kpi rotulo={t.kpis.perdaAberta} valor={f.moedaInteira(k.perdaComOsAbertaR)} detalhe={`${t.kpis.perdaEvitada}: ${f.moedaInteira(k.perdaEvitadaR)}`} destaque />
        <Kpi
          rotulo={t.kpis.parcelas}
          valor={k.parcelaAnalisePct === null ? "—" : `${f.pct(k.parcelaAnalisePct, 0)} / ${f.pct(k.parcelaAlarmePct ?? 0, 0)}`}
          detalhe={`${t.kpis.analise} / ${t.kpis.alarme}`}
        />
      </div>
      <p className="-mt-3 text-xs text-muted-foreground">
        {t.kpis.nota} {t.verificacao.norma}
      </p>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t.tabela.titulo}</CardTitle>
          <CardDescription>{preencher(t.integracao.descricao, { schema: SCHEMA_OS, versao: VERSAO_OS })}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end gap-2">
            <div className="w-48">
              <CampoSelecao
                rotulo={t.tabela.filtroStatus}
                valor={filtro}
                aoMudar={setFiltro}
                opcoes={[{ valor: "todas", rotulo: tm.filtros.todas }, ...(["aberta", "emAndamento", "concluida", "cancelada"] as const).map((s) => ({ valor: s, rotulo: t.status[s] }))]}
              />
            </div>
            <Button variant="outline" size="sm" onClick={() => baixar(exportarJson(ordens, new Date()), `ordens-servico-${hoje}.json`, "application/json")}>
              <FileDown aria-hidden="true" /> {t.integracao.exportarJson}
            </Button>
            <Button variant="outline" size="sm" onClick={() => baixar(exportarCsv(ordens), `ordens-servico-${hoje}.csv`, "text/csv;charset=utf-8")}>
              <FileDown aria-hidden="true" /> {t.integracao.exportarCsv}
            </Button>
            <input
              ref={arquivo}
              type="file"
              accept=".json,.csv,application/json,text/csv"
              className="sr-only"
              aria-label={t.integracao.importar}
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (file) await importar(await file.text());
                e.target.value = "";
              }}
            />
            <Button variant="outline" size="sm" onClick={() => arquivo.current?.click()} title={t.integracao.importarDica}>
              <FileUp aria-hidden="true" /> {t.integracao.importar}
            </Button>
            <Button variant="secondary" size="sm" onClick={simularCmms} title={t.integracao.simularDica}>
              <Bot aria-hidden="true" /> {t.integracao.simular}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            {t.integracao.importarDica} {t.integracao.simularDica}
          </p>
          <div className="overflow-x-auto rounded-lg border">
            <Table className="min-w-[900px]">
              <TableHeader>
                <TableRow>
                  <TableHead scope="col">{t.tabela.id}</TableHead>
                  <TableHead scope="col">{t.tabela.ativo}</TableHead>
                  <TableHead scope="col">{t.detalhe.problema}</TableHead>
                  <TableHead scope="col">{t.tabela.tipo}</TableHead>
                  <TableHead scope="col">{t.tabela.prioridade}</TableHead>
                  <TableHead scope="col" className="text-right">{t.tabela.perdaDia}</TableHead>
                  <TableHead scope="col">{t.tabela.status}</TableHead>
                  <TableHead scope="col">{t.tabela.abertaEm}</TableHead>
                  <TableHead scope="col">{t.tabela.verificacao}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtradas.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={9} className="py-8 text-center text-muted-foreground whitespace-normal">
                      {t.tabela.vazio}
                    </TableCell>
                  </TableRow>
                )}
                {filtradas.map((o) => (
                  <TableRow key={o.id}>
                    <TableCell>
                      <button type="button" className="font-mono text-xs underline underline-offset-4" onClick={() => setAberta(o.id)}>
                        {o.id}
                      </button>
                    </TableCell>
                    <TableCell className="max-w-56 whitespace-normal">
                      <span className="block text-sm">{nomeUsina(o.ativo.usinaId)}</span>
                      <span className="font-mono text-xs text-muted-foreground">{o.ativo.caminho}</span>
                    </TableCell>
                    <TableCell className="whitespace-normal">{problema(o)}</TableCell>
                    <TableCell>{t.tipos[o.tipo]}</TableCell>
                    <TableCell>
                      <Badge variant={o.prioridade === 1 ? "destructive" : o.prioridade === 2 ? "default" : "secondary"}>{t.prioridades[o.prioridade as 1 | 2 | 3 | 4]}</Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{f.moeda(o.perdaRDia)}</TableCell>
                    <TableCell>{t.status[o.status]}</TableCell>
                    <TableCell className="tabular-nums">{f.data(o.abertaEm)}</TableCell>
                    <TableCell className="max-w-56 text-xs whitespace-normal">{textoVerificacao(verificacoes.get(o.id))}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Route className="size-4" aria-hidden="true" /> {t.rotas.titulo}
          </CardTitle>
          <CardDescription>{t.rotas.descricao}</CardDescription>
        </CardHeader>
        <CardContent>
          {rotas.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t.rotas.vazio}</p>
          ) : (
            <ul className="grid gap-3 md:grid-cols-2">
              {rotas.map((r) => (
                <li key={r.id} className="space-y-2 rounded-lg border p-3">
                  <p className="font-mono text-xs text-muted-foreground">{preencher(t.rotas.rota, { id: r.id })}</p>
                  <p className="text-sm">
                    <span className="text-muted-foreground">{t.rotas.data}:</span> {f.data(r.data)} · <span className="text-muted-foreground">{t.rotas.custo}:</span> {f.moedaInteira(r.custoTotalR)}
                  </p>
                  <p className="text-sm">
                    <span className="text-muted-foreground">{t.rotas.usinas}:</span> {r.usinas.map(nomeUsina).join(", ")}
                  </p>
                  <Button
                    size="sm"
                    onClick={() => {
                      const criadas = adicionarOrdens((proxima) =>
                        r.usinas.map((id) => {
                          const usina = analise.usinas.find((u) => u.id === id)!;
                          const l = analise.resultado.usinas.find((x) => x.usinaId === id)!.limpeza!;
                          return criarOsLimpezaPreventiva(usina, r.data, (l.perdaAtualPct / 100) * l.energiaDiariaKWh * usina.valorEnergiaRKWh, new Date(), proxima(), r.id);
                        }),
                      );
                      toast.success(preencher(t.rotas.criadas, { n: criadas.length }));
                    }}
                  >
                    {t.rotas.criarOs}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <DetalheOs key={osAberta?.id ?? "nenhuma"} os={osAberta} aoFechar={() => setAberta(null)} problema={osAberta ? problema(osAberta) : ""} nomeUsina={osAberta ? nomeUsina(osAberta.ativo.usinaId) : ""} atualizar={atualizarOrdem} />
    </div>
  );
}
