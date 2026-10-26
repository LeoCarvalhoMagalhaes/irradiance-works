"use client";

import { FileDown, FileUp, ShieldCheck } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { CartesianGrid, Legend, Line, LineChart, ReferenceArea, ReferenceLine, XAxis, YAxis } from "recharts";
import type { ResultadoUsina } from "@/core/monitoramento/analise";
import type { UsinaMonitorada } from "@/core/monitoramento/frota";
import type { ContextoGeracao } from "@/core/monitoramento/gerador";
import { analisarRestricoes, compararInversores, exportarHistoricoScadaCsv, importarHistoricoScada, type ResumoImportacaoScada, serieUmMinuto } from "@/core/monitoramento/scada";
import { preencher } from "@/i18n/config";
import { useFormato, useTextos } from "@/i18n/cliente";
import { baixar } from "@/lib/baixar";
import { DicaGrafico, EIXO, GRADE } from "@/components/charts/base";
import { GraficoAcessivel } from "@/components/shared/grafico-acessivel";
import { Kpi } from "@/components/shared/indicadores";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChartContainer, ChartLegendContent, ChartTooltip } from "@/components/ui/chart";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SeletorDia } from "./aba-visao";
import { useDiaGerado } from "./curva-dia";

export function AbaScada({ usina, resultado, ctx }: { usina: UsinaMonitorada; resultado: ResultadoUsina; ctx: ContextoGeracao }) {
  const t = useTextos("monitoramento").usina.scada;
  const tu = useTextos("monitoramento").usina;
  const f = useFormato();
  const restricoes = useMemo(() => analisarRestricoes(usina, resultado.agregados), [usina, resultado]);
  const comparacao = useMemo(() => compararInversores(usina, resultado.agregados.slice(-30)), [usina, resultado]);
  const [dia, setDia] = useState(restricoes.eventos[0]?.chave ?? ctx.hoje);
  const dados = useDiaGerado(usina, dia, ctx);
  const umMinuto = useMemo(() => (dados ? serieUmMinuto(usina, dados) : null), [usina, dados]);
  const pontos = useMemo(
    () =>
      umMinuto
        ? Array.from(umMinuto.pacKW, (p, m) => ({ minuto: m, potencia: p / 1000, limite: Number.isFinite(umMinuto.setpointKW[m]) ? umMinuto.setpointKW[m] / 1000 : null })).filter((p) => p.minuto >= 330 && p.minuto <= 1140)
        : [],
    [umMinuto],
  );
  const faixasLimite = useMemo(() => {
    const faixas: Array<{ de: number; ate: number; valor: number }> = [];
    for (const p of pontos) {
      if (p.limite === null) continue;
      const ultima = faixas[faixas.length - 1];
      if (ultima && ultima.ate === p.minuto - 1 && ultima.valor === p.limite) ultima.ate = p.minuto;
      else faixas.push({ de: p.minuto, ate: p.minuto, valor: p.limite });
    }
    return faixas;
  }, [pontos]);
  const arquivo = useRef<HTMLInputElement>(null);
  const [importado, setImportado] = useState<ResumoImportacaoScada | null>(null);
  const k = resultado.kpis12Meses;

  return (
    <div className="grid gap-6">
      <Alert className="border-ok/40 bg-ok-suave/40">
        <ShieldCheck aria-hidden="true" className="text-ok" />
        <AlertDescription className="text-foreground">
          {t.somenteLeitura} {t.estacao}
        </AlertDescription>
      </Alert>

      <section className="rounded-xl border bg-card p-4" aria-labelledby="inversores">
        <h3 id="inversores" className="font-semibold">{t.inversoresTitulo}</h3>
        <div className="mt-3 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead scope="col">{t.inversor}</TableHead>
                <TableHead scope="col" className="text-right">{t.produtividade}</TableHead>
                <TableHead scope="col" className="text-right">{t.pr}</TableHead>
                <TableHead scope="col" className="text-right">{t.desvio}</TableHead>
                <TableHead scope="col" className="text-right">{t.disponibilidade}</TableHead>
                <TableHead scope="col" className="text-right">{t.posicao}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {comparacao.map((c) => (
                <TableRow key={c.inversorId} className={c.desvioMedianaPct < -3 ? "bg-critico-suave/50" : undefined}>
                  <TableCell className="font-mono text-xs">{c.inversorId}</TableCell>
                  <TableCell className="text-right">{f.numero(c.produtividadeKWhKWp, 1)}</TableCell>
                  <TableCell className="text-right">{f.numero(c.performanceRatio, 3)}</TableCell>
                  <TableCell className="text-right font-medium">{f.pct(c.desvioMedianaPct)}</TableCell>
                  <TableCell className="text-right">{f.pct(c.disponibilidadePct, 2)}</TableCell>
                  <TableCell className="text-right">{c.posicao}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </section>

      <section className="grid gap-3" aria-labelledby="disponibilidades">
        <h3 id="disponibilidades" className="font-semibold">{t.disponibilidadesTitulo}</h3>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Kpi rotulo={tu.kpis.disponibilidade} valor={f.pct(k.disponibilidadeTecnicaPct, 3)} />
          <Kpi rotulo={tu.kpis.disponibilidadeContratual} valor={f.pct(k.disponibilidadeContratualPct, 3)} />
          <Kpi rotulo={tu.kpis.pr} valor={f.numero(k.performanceRatio, 3)} detalhe={tu.prMedidoAviso} />
          <Kpi rotulo={tu.kpis.prCorrigido} valor={f.numero(k.performanceRatioCorrigido, 3)} />
        </div>
        <p className="text-sm text-muted-foreground">{t.disponibilidadesTexto}</p>
      </section>

      <section className="rounded-xl border bg-card p-4" aria-labelledby="restricoes">
        <h3 id="restricoes" className="font-semibold">{t.restricoesTitulo}</h3>
        <p className="mt-1 text-sm text-muted-foreground">{t.restricoesTexto}</p>
        <div className="mt-3 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead scope="col" />
                <TableHead scope="col" className="text-right">{t.eventos}</TableHead>
                <TableHead scope="col" className="text-right">{t.energia}</TableHead>
                <TableHead scope="col" className="text-right">{t.valor}</TableHead>
                <TableHead scope="col">{t.ressarcimento}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {restricoes.porMotivo.map((m) => (
                <TableRow key={m.motivo}>
                  <TableHead scope="row" className="font-normal">{t.motivos[m.motivo]}</TableHead>
                  <TableCell className="text-right">{m.eventos}</TableCell>
                  <TableCell className="text-right">{f.energia(m.energiaKWh)}</TableCell>
                  <TableCell className="text-right">{f.moedaInteira(m.valorR)}</TableCell>
                  <TableCell>
                    <Badge variant={m.ressarcivel === "sim" ? "default" : m.ressarcivel === "condicional" ? "secondary" : "outline"}>{t.ressarcivel[m.ressarcivel]}</Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <ul className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
          {restricoes.eventos.map((e) => (
            <li key={e.id}>
              <button type="button" onClick={() => setDia(e.chave)} className="w-full rounded-lg border px-3 py-2 text-left hover:bg-muted">
                <span className="font-medium">{f.data(e.chave)}</span> · {t.motivos[e.motivo]}
                <span className="block text-xs text-muted-foreground tabular-nums">
                  {t.janela}: {f.hora(e.inicioUtcMs)}–{f.hora(e.fimUtcMs)} · {t.limite}: {f.potenciaKW(e.limiteKW)} · {f.energia(e.energiaRestritaKWh)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </section>

      {umMinuto && (
        <GraficoAcessivel
          titulo={t.umMinutoTitulo}
          descricao={t.umMinutoDescricao}
          acoes={<SeletorDia chave={dia} aoMudar={setDia} min={resultado.agregados[0]?.chave ?? ctx.hoje} max={ctx.hoje} />}
          linhas={pontos.filter((p) => p.minuto % 15 === 0)}
          colunas={[
            { chave: "h", rotulo: tu.dia, valor: (p) => `${String(Math.floor(p.minuto / 60)).padStart(2, "0")}:${String(p.minuto % 60).padStart(2, "0")}` },
            { chave: "p", rotulo: t.potenciaMW, valor: (p) => f.numero(p.potencia, 2), numerica: true },
            { chave: "l", rotulo: t.setpoint, valor: (p) => (p.limite === null ? "—" : f.numero(p.limite, 2)), numerica: true },
          ]}
        >
          <ChartContainer config={{ potencia: { label: tu.real, color: "var(--chart-2)" }, limite: { label: t.setpoint, color: "var(--chart-5)" } }} className="aspect-auto h-full w-full">
            <LineChart accessibilityLayer={false} data={pontos}>
              <CartesianGrid {...GRADE} />
              <XAxis dataKey="minuto" type="number" domain={["dataMin", "dataMax"]} {...EIXO} tickFormatter={(m) => `${Math.floor(m / 60)}h`} />
              <YAxis {...EIXO} width={48} tickFormatter={(v) => f.numero(v, 0)} />
              <ChartTooltip content={<DicaGrafico formatar={(v) => `${f.numero(v, 2)} MW`} rotulo={(m) => `${String(Math.floor(Number(m) / 60)).padStart(2, "0")}:${String(Number(m) % 60).padStart(2, "0")}`} />} />
              <Legend content={<ChartLegendContent />} />
              <Line dataKey="potencia" stroke="var(--color-potencia)" strokeWidth={1.5} dot={false} isAnimationActive={false} />
              {/* Janela de restrição sombreada e limite tracejado por cima da potência (que fica colada ao limite). */}
              {faixasLimite.map((fx) => (
                <ReferenceArea key={`a${fx.de}`} x1={fx.de} x2={fx.ate} className="fill-chart-5/10" />
              ))}
              {faixasLimite.map((fx) => (
                <ReferenceLine key={`l${fx.de}`} segment={[{ x: fx.de, y: fx.valor }, { x: fx.ate, y: fx.valor }]} stroke="var(--color-limite)" strokeWidth={2.5} strokeDasharray="6 4" ifOverflow="extendDomain" />
              ))}
              <Line dataKey="limite" stroke="var(--color-limite)" strokeWidth={0} dot={false} legendType="plainline" isAnimationActive={false} />
            </LineChart>
          </ChartContainer>
        </GraficoAcessivel>
      )}

      <section className="rounded-xl border border-dashed bg-card p-4" aria-labelledby="importar-scada">
        <h3 id="importar-scada" className="font-semibold">{t.importarTitulo}</h3>
        <p className="text-sm text-muted-foreground">{t.importarDescricao}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => dados && baixar(exportarHistoricoScadaCsv(usina, dados), `${usina.id}-${dia}-scada.csv`, "text/csv;charset=utf-8")}>
            <FileDown aria-hidden="true" /> {t.exportar}
          </Button>
          <input
            ref={arquivo}
            type="file"
            accept=".csv,text/csv"
            className="sr-only"
            aria-label={t.importarTitulo}
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (file) setImportado(importarHistoricoScada(await file.text(), usina.potenciaCcW / 1000));
              e.target.value = "";
            }}
          />
          <Button variant="outline" size="sm" onClick={() => arquivo.current?.click()}>
            <FileUp aria-hidden="true" /> {t.importarTitulo}
          </Button>
        </div>
        {importado && (
          <p role="status" className="mt-2 text-sm">
            {importado.ok
              ? preencher(t.importarResultado, {
                  linhas: f.numero(importado.linhas),
                  inicio: f.dataHora(Date.parse(importado.inicio)),
                  fim: f.dataHora(Date.parse(importado.fim)),
                  energia: f.energia(importado.energiaTotalKWh),
                  pr: importado.performanceRatio === null ? "—" : f.numero(importado.performanceRatio, 3),
                  disp: importado.disponibilidadeTecnicaPct === null ? "—" : f.pct(importado.disponibilidadeTecnicaPct, 2),
                })
              : preencher(t.importarErro[importado.erro], { linha: importado.linha ?? 0 })}
          </p>
        )}
      </section>
    </div>
  );
}
