"use client";

import { ArrowDown, ArrowUp, ArrowUpDown, Map as IconeMapa } from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import type { ResultadoUsina } from "@/core/monitoramento/analise";
import type { UsinaMonitorada } from "@/core/monitoramento/frota";
import { calcularKpis, FATOR_EMISSAO } from "@/core/monitoramento/kpis";
import { alertasAtivos, type StatusUsina, statusUsina } from "@/core/monitoramento/status";
import { preencher } from "@/i18n/config";
import { useFormato, useIdioma, useTextos } from "@/i18n/cliente";
import { useAnaliseAtual } from "@/lib/use-analise";
import { Kpi, SeloSeveridade, SeloStatus } from "@/components/shared/indicadores";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CampoSelecao } from "@/components/simulador/campos";
import { EstadoCarregamento, useTituloAlerta } from "./comum";

const MapaFrota = dynamic(() => import("./mapa-frota"), { ssr: false, loading: () => <Skeleton className="h-[420px] w-full" /> });

type Linha = {
  usina: UsinaMonitorada;
  resultado: ResultadoUsina;
  status: StatusUsina;
  energiaHoje: number;
  pr30: number;
  desvio30: number;
  alertas: number;
  perdaDia: number;
};

type Coluna = "nome" | "segmento" | "cidade" | "potencia" | "status" | "energiaHoje" | "pr30" | "desvio30" | "alertas" | "perdaDia";
const ORDEM_STATUS: Record<StatusUsina, number> = { critico: 0, semDados: 1, atencao: 2, normal: 3 };

export function Frota() {
  const t = useTextos("monitoramento");
  const tc = useTextos("comum");
  const f = useFormato();
  const idioma = useIdioma();
  const roteador = useRouter();
  const tituloAlerta = useTituloAlerta();
  const { analise } = useAnaliseAtual();
  const [busca, setBusca] = useState("");
  const [status, setStatus] = useState("todos");
  const [segmento, setSegmento] = useState("todos");
  const [cidade, setCidade] = useState("todas");
  const [ordem, setOrdem] = useState<{ coluna: Coluna; desc: boolean }>({ coluna: "status", desc: false });
  const [mostrarMapa, setMostrarMapa] = useState(false);

  const linhas = useMemo<Linha[]>(() => {
    if (analise?.situacao !== "pronto") return [];
    return analise.usinas.map((usina) => {
      const resultado = analise.resultado.usinas.find((r) => r.usinaId === usina.id)!;
      const k30 = calcularKpis(usina, resultado.agregados.slice(-30));
      const ativos = alertasAtivos(resultado);
      return {
        usina,
        resultado,
        status: statusUsina(resultado),
        energiaHoje: resultado.kpisHoje.energiaKWh,
        pr30: k30.performanceRatio,
        desvio30: k30.desvioPct,
        alertas: ativos.length,
        perdaDia: ativos.reduce((s, a) => s + a.perdaRDia, 0),
      };
    });
  }, [analise]);

  if (analise?.situacao !== "pronto") return <EstadoCarregamento analise={analise} />;

  const resultado = analise.resultado;
  const p0 = linhas.reduce((s, l) => s + l.usina.potenciaCcW, 0);
  const prMedio = linhas.reduce((s, l) => s + l.resultado.kpis12Meses.performanceRatio * l.usina.potenciaCcW, 0) / p0;
  const cidades = [...new Map(linhas.map((l) => [l.usina.cidade.id, l.usina.cidade])).values()].sort((a, b) => a.nome.localeCompare(b.nome));
  const filtradas = linhas
    .filter((l) => (status === "todos" || l.status === status) && (segmento === "todos" || l.usina.segmento === segmento) && (cidade === "todas" || l.usina.cidade.id === cidade))
    .filter((l) => !busca || `${l.usina.id} ${l.usina.nome} ${l.usina.cidade.nome}`.toLowerCase().includes(busca.toLowerCase()))
    .sort((a, b) => {
      const valor = (l: Linha): string | number =>
        ordem.coluna === "nome" ? l.usina.nome : ordem.coluna === "segmento" ? tc.segmentos[l.usina.segmento] : ordem.coluna === "cidade" ? l.usina.cidade.nome : ordem.coluna === "potencia" ? l.usina.potenciaCcW : ordem.coluna === "status" ? ORDEM_STATUS[l.status] * 1e9 - l.perdaDia : l[ordem.coluna];
      const va = valor(a);
      const vb = valor(b);
      const r = typeof va === "string" ? va.localeCompare(vb as string) : (va as number) - (vb as number);
      return ordem.desc ? -r : r;
    });
  const feed = linhas.flatMap((l) => alertasAtivos(l.resultado).map((a) => ({ a, usina: l.usina }))).sort((x, y) => y.a.perdaRDia - x.a.perdaRDia);
  const hrefUsina = (id: string) => `/${idioma}/monitoramento/usina/?id=${encodeURIComponent(id)}`;

  const cabecalho = (coluna: Coluna, rotulo: string, numerica = false) => {
    const ativa = ordem.coluna === coluna;
    const Icone = !ativa ? ArrowUpDown : ordem.desc ? ArrowDown : ArrowUp;
    return (
      <TableHead scope="col" aria-sort={ativa ? (ordem.desc ? "descending" : "ascending") : "none"} className={numerica ? "text-right" : undefined}>
        <button
          type="button"
          className="inline-flex items-center gap-1 rounded hover:text-foreground"
          onClick={() => setOrdem((o) => ({ coluna, desc: o.coluna === coluna ? !o.desc : numerica }))}
          aria-label={preencher(t.tabela.ordenarPor, { coluna: rotulo })}
        >
          {rotulo}
          <Icone className="size-3.5" aria-hidden="true" />
        </button>
      </TableHead>
    );
  };

  return (
    <div className="grid gap-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Kpi rotulo={t.kpis.energiaHoje} valor={f.energia(linhas.reduce((s, l) => s + l.energiaHoje, 0))} />
        <Kpi rotulo={t.kpis.energiaMes} valor={f.energia(linhas.reduce((s, l) => s + l.resultado.kpisMes.energiaKWh, 0))} />
        <Kpi rotulo={t.kpis.prMedio} valor={f.numero(prMedio, 3)} detalhe={t.kpis.prEstimado} />
        <Kpi rotulo={t.kpis.usinasComAlerta} valor={`${linhas.filter((l) => l.status !== "normal").length} / ${linhas.length}`} />
        <Kpi
          destaque
          rotulo={t.kpis.perdaDia}
          valor={preencher(t.kpis.porDia, { valor: f.moedaInteira(linhas.reduce((s, l) => s + l.perdaDia, 0)) })}
          detalhe={`${t.kpis.co2}: ${f.numero(linhas.reduce((s, l) => s + l.resultado.kpis12Meses.co2EvitadoT, 0))} t`}
        />
      </div>
      <p className="-mt-3 text-xs text-muted-foreground">{preencher(t.kpis.co2Fonte, { ano: FATOR_EMISSAO.ano, fator: f.numero(FATOR_EMISSAO.fatorTCO2MWh ?? 0, 4) })}</p>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t.tabela.titulo}</CardTitle>
          <CardDescription>{t.tabela.descricao}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1fr_auto] lg:items-end">
            <div className="space-y-1.5">
              <Label htmlFor="busca-usina">{t.filtros.busca}</Label>
              <Input id="busca-usina" type="search" value={busca} onChange={(e) => setBusca(e.target.value)} />
            </div>
            <CampoSelecao
              rotulo={t.filtros.status}
              valor={status}
              aoMudar={setStatus}
              opcoes={[{ valor: "todos", rotulo: t.filtros.todos }, ...(["normal", "atencao", "critico", "semDados"] as const).map((s) => ({ valor: s, rotulo: tc.status[s] }))]}
            />
            <CampoSelecao
              rotulo={t.filtros.segmento}
              valor={segmento}
              aoMudar={setSegmento}
              opcoes={[{ valor: "todos", rotulo: t.filtros.todos }, ...(["residencial", "comercial", "industrial", "agronegocio", "geracaoCentralizada"] as const).map((s) => ({ valor: s, rotulo: tc.segmentos[s] }))]}
            />
            <CampoSelecao rotulo={t.filtros.cidade} valor={cidade} aoMudar={setCidade} opcoes={[{ valor: "todas", rotulo: t.filtros.todas }, ...cidades.map((c) => ({ valor: c.id, rotulo: `${c.nome}/${c.uf}` }))]} />
            <Button
              variant="ghost"
              onClick={() => {
                setBusca("");
                setStatus("todos");
                setSegmento("todos");
                setCidade("todas");
              }}
            >
              {t.filtros.limpar}
            </Button>
          </div>
          <div className="overflow-x-auto rounded-lg border">
            <Table className="min-w-[960px]">
              <TableHeader>
                <TableRow>
                  {cabecalho("nome", t.tabela.usina)}
                  {cabecalho("segmento", t.tabela.segmento)}
                  {cabecalho("cidade", t.tabela.cidade)}
                  {cabecalho("potencia", t.tabela.potencia, true)}
                  {cabecalho("status", t.tabela.status)}
                  {cabecalho("energiaHoje", t.tabela.energiaHoje, true)}
                  {cabecalho("pr30", t.tabela.pr, true)}
                  {cabecalho("desvio30", t.tabela.desvio, true)}
                  {cabecalho("alertas", t.tabela.alertas, true)}
                  {cabecalho("perdaDia", t.tabela.perdaDia, true)}
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtradas.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={10} className="py-8 text-center text-muted-foreground">
                      {t.tabela.vazio}
                    </TableCell>
                  </TableRow>
                )}
                {filtradas.map((l) => (
                  <TableRow key={l.usina.id}>
                    <TableCell className="max-w-72 whitespace-normal">
                      <Link href={hrefUsina(l.usina.id)} className="font-medium underline-offset-4 hover:underline">
                        <span className="font-mono text-xs text-muted-foreground">{l.usina.id}</span> {l.usina.nome}
                      </Link>
                      <div className="mt-0.5 flex gap-1">
                        {l.usina.tipo === "scada" && <Badge variant="secondary">{t.tabela.scada}</Badge>}
                        {l.usina.origem === "comissionada" && <Badge variant="outline">{t.tabela.origem.comissionada}</Badge>}
                      </div>
                    </TableCell>
                    <TableCell>{tc.segmentos[l.usina.segmento]}</TableCell>
                    <TableCell>
                      {l.usina.cidade.nome}/{l.usina.cidade.uf}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{f.potenciaKWp(l.usina.potenciaCcW / 1000)}</TableCell>
                    <TableCell>
                      <SeloStatus status={l.status} />
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{f.energia(l.energiaHoje)}</TableCell>
                    <TableCell className="text-right tabular-nums">{f.numero(l.pr30, 3)}</TableCell>
                    <TableCell className="text-right tabular-nums">{f.pct(l.desvio30)}</TableCell>
                    <TableCell className="text-right tabular-nums">{l.alertas}</TableCell>
                    <TableCell className="text-right tabular-nums">{f.moedaInteira(l.perdaDia)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-[1.3fr_1fr] lg:items-start">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t.mapa.titulo}</CardTitle>
            <CardDescription>{t.mapa.aviso}</CardDescription>
          </CardHeader>
          <CardContent>
            {mostrarMapa ? (
              <MapaFrota
                atribuicao={t.mapa.atribuicao}
                aoAbrir={(href) => roteador.push(href)}
                pontos={filtradas.map((l) => ({ id: l.usina.id, nome: l.usina.nome, latitude: l.usina.cidade.latitude, longitude: l.usina.cidade.longitude, status: l.status, rotuloStatus: tc.status[l.status], href: hrefUsina(l.usina.id) }))}
              />
            ) : (
              <Button variant="outline" onClick={() => setMostrarMapa(true)}>
                <IconeMapa aria-hidden="true" /> {t.mapa.mostrar}
              </Button>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t.feed.titulo}</CardTitle>
          </CardHeader>
          <CardContent>
            {feed.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t.feed.vazio}</p>
            ) : (
              <ul className="max-h-[420px] divide-y overflow-y-auto">
                {feed.map(({ a, usina }) => (
                  <li key={a.id} className="flex items-start gap-3 py-2.5">
                    <SeloSeveridade severidade={a.severidade} />
                    <div className="min-w-0 flex-1">
                      <Link href={`${hrefUsina(usina.id)}#alertas`} className="text-sm font-medium underline-offset-4 hover:underline">
                        {tituloAlerta(a)}
                      </Link>
                      <p className="truncate text-xs text-muted-foreground">
                        {usina.id} · {usina.nome}
                        {a.ativo.inversorId ? ` · ${[a.ativo.inversorId, a.ativo.mpptId].filter(Boolean).join("/")}` : ""}
                      </p>
                    </div>
                    <span className="text-right text-xs tabular-nums text-muted-foreground">{preencher(t.kpis.porDia, { valor: f.moedaInteira(a.perdaRDia) })}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t.validacao.titulo}</CardTitle>
          <CardDescription>{t.validacao.descricao}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-6">
          <div>
            <p className="text-xs text-muted-foreground uppercase">{t.validacao.precisao}</p>
            <p className="text-2xl font-semibold tabular-nums">{f.pct((resultado.validacao.global.precisao ?? 0) * 100, 0)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground uppercase">{t.validacao.revocacao}</p>
            <p className="text-2xl font-semibold tabular-nums">{f.pct((resultado.validacao.global.revocacao ?? 0) * 100, 0)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground uppercase">{t.validacao.atraso}</p>
            <p className="text-2xl font-semibold tabular-nums">{f.numero(resultado.validacao.global.atrasoMedioDias ?? 0, 1)} d</p>
          </div>
          <Link href={`/${idioma}/metodologia/#validacao`} className="ml-auto text-sm underline underline-offset-4">
            {t.validacao.link}
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
