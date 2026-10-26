"use client";

import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ReferenceLine, XAxis, YAxis } from "recharts";
import type { ResultadoCenario } from "@/core/financeiro/cenarios";
import type { Proposta } from "@/core/simulador/proposta";
import { preencher } from "@/i18n/config";
import { useFormato, useTextos } from "@/i18n/cliente";
import { DicaGrafico, EIXO, GRADE, RAIO_BARRA } from "@/components/charts/base";
import { GraficoAcessivel } from "@/components/shared/grafico-acessivel";
import { ChartContainer, ChartLegendContent, ChartTooltip } from "@/components/ui/chart";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export function useTextoTir() {
  const t = useTextos("simulador").resultado.financeiro;
  const f = useFormato();
  return (c: ResultadoCenario) => (c.tir.situacao === "unica" ? f.pct(c.tir.tir * 100) : c.tir.situacao === "multiplas" ? t.tirMultiplas : t.tirNenhuma);
}

export function AbaFinanceiro({ p }: { p: Proposta }) {
  const tr = useTextos("simulador").resultado;
  const t = tr.financeiro;
  const f = useFormato();
  const textoTir = useTextoTir();
  const cenarios = p.financeiro.cenarios;
  const anos = (v: number | null, c: ResultadoCenario) =>
    c.desembolsoInicialR <= 0 ? t.semDesembolso : v === null ? t.naoAtinge : preencher(t.anos, { valor: f.anos(v) });
  const acumulado = cenarios[0].acumulado.map((_, i) => ({ ano: i, aVista: cenarios[0].acumulado[i], financiado: cenarios[1].acumulado[i], custoMaisTaxa: cenarios[2].acumulado[i] }));
  const config = {
    aVista: { label: t.cenarios.aVista, color: "var(--chart-1)" },
    financiado: { label: t.cenarios.financiado, color: "var(--chart-2)" },
    custoMaisTaxa: { label: t.cenarios.custoMaisTaxa, color: "var(--chart-3)" },
  };
  const fin = cenarios[1];
  const parcelaEconomia = (fin.economiaMensalAno1R ?? []).map((e, i) => ({
    rotulo: `${f.mes(p.projecao.meses[i].mes - 1)}`,
    parcela: fin.parcelaMensalR ?? 0,
    economia: e,
  }));
  const configParcela = { parcela: { label: t.parcela, color: "var(--chart-2)" }, economia: { label: t.economiaMensal, color: "var(--chart-3)" } };
  const linhas: Array<{ rotulo: string; valor: (c: ResultadoCenario) => string }> = [
    { rotulo: t.desembolso, valor: (c) => f.moedaInteira(c.desembolsoInicialR) },
    { rotulo: t.vpl, valor: (c) => f.moedaInteira(c.vplR) },
    { rotulo: t.tir, valor: textoTir },
    { rotulo: t.payback, valor: (c) => anos(c.paybackAnos, c) },
    { rotulo: t.paybackDescontado, valor: (c) => anos(c.paybackDescontadoAnos, c) },
    { rotulo: t.economia, valor: (c) => f.moedaInteira(c.economiaAcumuladaR) },
  ];

  return (
    <div className="grid gap-6">
      <section aria-labelledby="cenarios-fin" className="rounded-xl border bg-card">
        <h3 id="cenarios-fin" className="px-4 pt-4 text-base font-semibold">
          {t.titulo}
        </h3>
        <div className="overflow-x-auto p-2">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead scope="col" />
                {cenarios.map((c) => (
                  <TableHead key={c.codigo} scope="col" className="text-right">
                    {t.cenarios[c.codigo]}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {linhas.map((l) => (
                <TableRow key={l.rotulo}>
                  <TableHead scope="row" className="font-normal text-muted-foreground">
                    {l.rotulo}
                  </TableHead>
                  {cenarios.map((c) => (
                    <TableCell key={c.codigo} className="text-right font-medium tabular-nums">
                      {l.valor(c)}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <p className="px-4 pb-4 text-xs text-muted-foreground">{preencher(t.lcoe, { valor: f.moeda(p.financeiro.lcoeRKWh) })}</p>
      </section>

      <GraficoAcessivel
        titulo={t.acumulado}
        descricao={t.acumuladoDescricao}
        linhas={acumulado}
        colunas={[
          { chave: "a", rotulo: t.ano, valor: (l) => String(l.ano), numerica: true },
          { chave: "v", rotulo: t.cenarios.aVista, valor: (l) => f.moedaInteira(l.aVista), numerica: true },
          { chave: "f", rotulo: t.cenarios.financiado, valor: (l) => f.moedaInteira(l.financiado), numerica: true },
          { chave: "c", rotulo: t.cenarios.custoMaisTaxa, valor: (l) => f.moedaInteira(l.custoMaisTaxa), numerica: true },
        ]}
      >
        <ChartContainer config={config} className="aspect-auto h-full w-full">
          <LineChart accessibilityLayer={false} data={acumulado}>
            <CartesianGrid {...GRADE} />
            <XAxis dataKey="ano" {...EIXO} />
            <YAxis {...EIXO} width={72} tickFormatter={(v) => f.moedaInteira(v)} />
            <ReferenceLine y={0} className="stroke-foreground/40" />
            <ChartTooltip content={<DicaGrafico formatar={(v) => f.moedaInteira(v)} rotulo={(a) => `${t.ano} ${a}`} />} />
            <Legend content={<ChartLegendContent />} />
            {(["aVista", "financiado", "custoMaisTaxa"] as const).map((k) => (
              <Line key={k} dataKey={k} type="monotone" stroke={`var(--color-${k})`} strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
            ))}
          </LineChart>
        </ChartContainer>
      </GraficoAcessivel>

      {parcelaEconomia.length > 0 && (
        <GraficoAcessivel
          titulo={t.parcelaEconomia}
          descricao={t.parcelaEconomiaDescricao}
          linhas={parcelaEconomia}
          altura={220}
          colunas={[
            { chave: "m", rotulo: tr.geracao.mes, valor: (l) => l.rotulo },
            { chave: "p", rotulo: t.parcela, valor: (l) => f.moeda(l.parcela), numerica: true },
            { chave: "e", rotulo: t.economiaMensal, valor: (l) => f.moeda(l.economia), numerica: true },
          ]}
        >
          <ChartContainer config={configParcela} className="aspect-auto h-full w-full">
            <BarChart accessibilityLayer={false} data={parcelaEconomia} barGap={2}>
              <CartesianGrid {...GRADE} />
              <XAxis dataKey="rotulo" {...EIXO} />
              <YAxis {...EIXO} width={64} tickFormatter={(v) => f.moedaInteira(v)} />
              <ChartTooltip content={<DicaGrafico formatar={(v) => f.moeda(v)} />} />
              <Legend content={<ChartLegendContent />} />
              <Bar dataKey="parcela" fill="var(--color-parcela)" radius={RAIO_BARRA} />
              <Bar dataKey="economia" fill="var(--color-economia)" radius={RAIO_BARRA} />
            </BarChart>
          </ChartContainer>
        </GraficoAcessivel>
      )}

      <details className="rounded-xl border bg-card p-4">
        <summary className="cursor-pointer font-medium">{t.tabelaAnual}</summary>
        <div className="mt-3 max-h-96 overflow-auto">
          <Table>
            <TableHeader className="sticky top-0 bg-card">
              <TableRow>
                {(["ano", "geracao", "faturaSem", "faturaCom", "economia", "fioB", "expirados"] as const).map((c) => (
                  <TableHead key={c} scope="col" className={c === "ano" ? undefined : "text-right"}>
                    {t.colunas[c]}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {p.projecao.anos.map((a) => (
                <TableRow key={a.anoOperacao}>
                  <TableCell>{a.anoOperacao}</TableCell>
                  <TableCell className="text-right">{f.energia(a.geracaoKWh)}</TableCell>
                  <TableCell className="text-right">{f.moedaInteira(a.faturaSemR)}</TableCell>
                  <TableCell className="text-right">{f.moedaInteira(a.faturaComR)}</TableCell>
                  <TableCell className="text-right">{f.moedaInteira(a.economiaR)}</TableCell>
                  <TableCell className="text-right">{f.moedaInteira(a.valorCompensadaR)}</TableCell>
                  <TableCell className="text-right">{f.energia(a.creditosExpiradosKWh)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </details>
    </div>
  );
}
