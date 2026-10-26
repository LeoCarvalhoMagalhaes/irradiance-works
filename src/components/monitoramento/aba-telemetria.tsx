"use client";

import { FileUp } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { z } from "zod";
import alarmes from "@/data/alarmes-fabricantes.json";
import type { UsinaMonitorada } from "@/core/monitoramento/frota";
import { type ContextoGeracao, gerarDia, PASSO_MIN } from "@/core/monitoramento/gerador";
import { chaveDiaLocal, MS_POR_MINUTO } from "@/core/util/tempo";
import { useFormato, useTextos } from "@/i18n/cliente";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useDiaGerado } from "./curva-dia";
import { SeletorDia } from "./aba-visao";

const NOMES_STATUS = ["normal", "alarme", "desligado", "manutencao", "restricao", "noite"] as const;
const NOMES_RECEBIMENTO = ["online", "reenviado", "ausente", "futuro"] as const;

/** Adaptador CSV de telemetria (timestamp_utc, inversor_id, p_ac_kw) comparado ao modelo da usina. */
const esquemaLinha = z.object({ timestamp_utc: z.string().datetime(), inversor_id: z.string().min(1), p_ac_kw: z.number().min(0) });

function importarTelemetria(texto: string, usina: UsinaMonitorada, ctx: ContextoGeracao) {
  const linhas = texto.trim().split(/\r?\n/);
  const cab = linhas[0]?.split(",").map((c) => c.trim()) ?? [];
  const idx = (n: string) => cab.indexOf(n);
  if (idx("timestamp_utc") < 0 || idx("inversor_id") < 0 || idx("p_ac_kw") < 0) return { ok: false as const, linha: 1 };
  let energia = 0;
  let esperada = 0;
  const dias = new Map<string, ReturnType<typeof gerarDia>>();
  for (let i = 1; i < linhas.length; i++) {
    const c = linhas[i].split(",");
    const r = esquemaLinha.safeParse({ timestamp_utc: c[idx("timestamp_utc")], inversor_id: c[idx("inversor_id")], p_ac_kw: Number(c[idx("p_ac_kw")]) });
    if (!r.success) return { ok: false as const, linha: i + 1 };
    const instante = Date.parse(r.data.timestamp_utc);
    const chave = chaveDiaLocal(instante);
    if (!dias.has(chave)) dias.set(chave, gerarDia(usina, chave, ctx));
    const dia = dias.get(chave)!;
    const k = Math.floor((instante - dia.inicioUtcMs) / (PASSO_MIN * MS_POR_MINUTO));
    const inv = dia.inversores.find((x) => x.id === r.data.inversor_id);
    energia += (r.data.p_ac_kw * PASSO_MIN) / 60;
    if (inv && k >= 0 && k < inv.pacEsperadaW.length) esperada += (inv.pacEsperadaW[k] / 1000) * (PASSO_MIN / 60);
  }
  return { ok: true as const, linhas: linhas.length - 1, energia, esperada };
}

export function AbaTelemetria({ usina, ctx, primeiroDia }: { usina: UsinaMonitorada; ctx: ContextoGeracao; primeiroDia: string }) {
  const t = useTextos("monitoramento");
  const tt = t.usina.telemetria;
  const f = useFormato();
  const [dia, setDia] = useState(ctx.hoje);
  const [passo, setPasso] = useState(144); // 12:00
  const dados = useDiaGerado(usina, dia, ctx);
  const arquivo = useRef<HTMLInputElement>(null);
  const [importado, setImportado] = useState<ReturnType<typeof importarTelemetria> | null>(null);
  const instante = dados ? dados.inicioUtcMs + passo * PASSO_MIN * MS_POR_MINUTO : 0;
  const recebimento = dados ? NOMES_RECEBIMENTO[dados.recebimento[passo]] : "futuro";
  const visivel = recebimento === "online" || recebimento === "reenviado";
  const tabelaAlarmes = useMemo(() => dados?.alarmes ?? [], [dados]);

  return (
    <div className="grid gap-6">
      <section className="rounded-xl border bg-card p-4" aria-labelledby="telemetria">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 id="telemetria" className="font-semibold">{tt.titulo}</h3>
            <p className="text-sm text-muted-foreground">{tt.descricao}</p>
          </div>
          <SeletorDia chave={dia} aoMudar={setDia} min={primeiroDia} max={ctx.hoje} />
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-[1fr_auto] sm:items-center">
          <div className="space-y-2">
            <Label htmlFor="horario">
              {tt.horarioSelecionado}: <span className="tabular-nums">{dados ? f.hora(instante) : "—"}</span> ({new Date(instante).toISOString().slice(11, 16)} UTC)
            </Label>
            <Slider id="horario" min={0} max={287} step={1} value={[passo]} onValueChange={([v]) => setPasso(v)} aria-label={tt.horarioSelecionado} />
          </div>
          <Badge variant={visivel ? "secondary" : "outline"}>{tt.recebimento[recebimento]}</Badge>
        </div>
        {dados && (
          <div className="mt-4 overflow-x-auto">
            <Table className="min-w-[760px]">
              <TableHeader>
                <TableRow>
                  <TableHead scope="col">{tt.inversor}</TableHead>
                  <TableHead scope="col">{tt.mppt}</TableHead>
                  <TableHead scope="col" className="text-right">{tt.tensao}</TableHead>
                  <TableHead scope="col" className="text-right">{tt.corrente}</TableHead>
                  <TableHead scope="col" className="text-right">{tt.potenciaCc}</TableHead>
                  <TableHead scope="col" className="text-right">{tt.potenciaCa}</TableHead>
                  <TableHead scope="col" className="text-right">{tt.temperatura}</TableHead>
                  <TableHead scope="col">{tt.status}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {dados.inversores.flatMap((inv) =>
                  inv.mppts.map((m, j) => (
                    <TableRow key={`${inv.id}-${m.id}`}>
                      <TableCell className="font-mono text-xs">{j === 0 ? inv.id : ""}</TableCell>
                      <TableCell className="font-mono text-xs">{m.id}</TableCell>
                      <TableCell className="text-right">{visivel ? f.numero(m.vV[passo], 1) : "—"}</TableCell>
                      <TableCell className="text-right">{visivel ? f.numero(m.iA[passo], 2) : "—"}</TableCell>
                      <TableCell className="text-right">{visivel ? f.numero(m.pdcW[passo] / 1000, 2) : "—"}</TableCell>
                      <TableCell className="text-right">{visivel && j === 0 ? f.numero(inv.pacW[passo] / 1000, 2) : ""}</TableCell>
                      <TableCell className="text-right">{visivel && j === 0 ? f.numero(inv.tempInternaC[passo], 1) : ""}</TableCell>
                      <TableCell>{j === 0 && visivel ? tt.statusNomes[NOMES_STATUS[inv.status[passo]]] : ""}</TableCell>
                    </TableRow>
                  )),
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </section>

      <section className="rounded-xl border bg-card p-4" aria-labelledby="alarmes-dia">
        <h3 id="alarmes-dia" className="font-semibold">{tt.alarmesTitulo}</h3>
        {tabelaAlarmes.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">{tt.semAlarmes}</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead scope="col">{tt.inversor}</TableHead>
                  <TableHead scope="col">{tt.codigo}</TableHead>
                  <TableHead scope="col">{tt.categoria}</TableHead>
                  <TableHead scope="col">{t.usina.alertas.inicio}</TableHead>
                  <TableHead scope="col">{t.usina.alertas.fim}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tabelaAlarmes.map((a, i) => (
                  <TableRow key={i}>
                    <TableCell className="font-mono text-xs">{a.inversorId}</TableCell>
                    <TableCell className="font-mono text-xs">{a.codigo}</TableCell>
                    <TableCell>{t.categorias[a.categoria]}</TableCell>
                    <TableCell className="tabular-nums">{f.hora(a.inicioUtcMs)}</TableCell>
                    <TableCell className="tabular-nums">{f.hora(a.fimUtcMs)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
        <p className="mt-2 text-xs text-muted-foreground">{alarmes.aviso}</p>
      </section>

      <section className="rounded-xl border border-dashed bg-card p-4" aria-labelledby="importar-telemetria">
        <h3 id="importar-telemetria" className="font-semibold">{tt.importarTitulo}</h3>
        <p className="text-sm text-muted-foreground">{tt.importarDescricao}</p>
        <input
          ref={arquivo}
          type="file"
          accept=".csv,text/csv"
          className="sr-only"
          aria-label={tt.importarTitulo}
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (file) setImportado(importarTelemetria(await file.text(), usina, ctx));
            e.target.value = "";
          }}
        />
        <Button className="mt-3" variant="outline" size="sm" onClick={() => arquivo.current?.click()}>
          <FileUp aria-hidden="true" /> {tt.importarBotao}
        </Button>
        {importado && (
          <p role="status" className="mt-2 text-sm">
            {importado.ok
              ? `${f.numero(importado.linhas)} · ${t.usina.real}: ${f.energia(importado.energia)} · ${t.usina.esperada}: ${f.energia(importado.esperada)} · ${t.usina.kpis.desvio}: ${f.pct(importado.esperada > 0 ? (importado.energia / importado.esperada - 1) * 100 : 0)}`
              : t.usina.scada.importarErro.linha.replace("{linha}", String(importado.linha))}
          </p>
        )}
      </section>
    </div>
  );
}
