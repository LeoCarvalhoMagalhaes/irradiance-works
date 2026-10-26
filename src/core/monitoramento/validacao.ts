/**
 * Validação dos detectores contra os rótulos verdadeiros das falhas injetadas.
 * Uma falha é "detectada" se algum alerta do mesmo tipo, na mesma usina e no mesmo ativo, se
 * sobrepõe à sua janela (tolerância de 1 dia antes e 2 dias depois). Alertas sem falha
 * correspondente são falsos positivos. Os números são sempre calculados, nunca escritos à mão.
 */
import { diferencaDias, somarDias } from "../util/tempo";
import type { Alerta, TipoAlerta } from "./detectores";
import type { Falha, UsinaMonitorada } from "./frota";
import { type EventoUsuario, janelaFalha } from "./gerador";

export type FalhaRotulada = {
  usinaId: string;
  falha: Falha;
  tipoAlerta: TipoAlerta;
  inversorId?: string;
  mpptId?: string;
  inicio: string;
  fim: string | null;
};

export type MetricaTipo = {
  tipo: string;
  falhas: number;
  detectadas: number;
  alertas: number;
  alertasCorretos: number;
  precisao: number | null;
  revocacao: number | null;
  atrasoMedioDias: number | null;
};

export function rotulos(usinas: UsinaMonitorada[], hoje: string, inicioJanela: string, eventos: EventoUsuario[]): FalhaRotulada[] {
  const lista: FalhaRotulada[] = [];
  for (const u of usinas) {
    for (const f of u.falhas) {
      const j = janelaFalha(f, hoje, eventos, u);
      if (j.fim !== null && j.fim <= inicioJanela) continue;
      const inicio = j.inicio < inicioJanela ? inicioJanela : j.inicio;
      const inversorId = "inversor" in f ? u.inversores[f.inversor - 1]?.id : undefined;
      const mpptId = f.tipo === "stringDesligada" ? `MPPT${f.mppt}` : undefined;
      lista.push({ usinaId: u.id, falha: f, tipoAlerta: f.tipo === "alarme" ? "alarme" : (f.tipo as TipoAlerta), inversorId, mpptId, inicio, fim: j.fim });
    }
  }
  return lista;
}

function corresponde(a: Alerta, r: FalhaRotulada, hoje: string): boolean {
  if (a.usinaId !== r.usinaId || a.tipo !== r.tipoAlerta) return false;
  if (r.falha.tipo === "alarme" && a.categoriaAlarme !== r.falha.categoria) return false;
  if (r.inversorId && a.ativo.inversorId && a.ativo.inversorId !== r.inversorId) return false;
  if (r.mpptId && a.ativo.mpptId !== r.mpptId) return false;
  const fimAlerta = a.fim ?? somarDias(hoje, 1);
  const inicioFalha = somarDias(r.inicio, -1);
  const fimFalha = somarDias(r.fim ?? somarDias(hoje, 1), 2);
  return a.inicio < fimFalha && fimAlerta > inicioFalha;
}

const chaveTipo = (tipo: TipoAlerta, categoria?: string) => (tipo === "alarme" ? `alarme:${categoria}` : tipo);

export function validar(alertas: Alerta[], falhas: FalhaRotulada[], hoje: string): { porTipo: MetricaTipo[]; global: MetricaTipo } {
  const tipos = new Set<string>([
    ...falhas.map((f) => chaveTipo(f.tipoAlerta, f.falha.tipo === "alarme" ? f.falha.categoria : undefined)),
    ...alertas.map((a) => chaveTipo(a.tipo, a.categoriaAlarme)),
  ]);
  const calcular = (filtroFalha: (f: FalhaRotulada) => boolean, filtroAlerta: (a: Alerta) => boolean, tipo: string): MetricaTipo => {
    const fs = falhas.filter(filtroFalha);
    const as = alertas.filter(filtroAlerta);
    const atrasos: number[] = [];
    let detectadas = 0;
    for (const f of fs) {
      const casados = as.filter((a) => corresponde(a, f, hoje));
      if (casados.length === 0) continue;
      detectadas++;
      const primeira = casados.map((a) => a.deteccao).sort()[0];
      atrasos.push(Math.max(0, diferencaDias(f.inicio, primeira)));
    }
    const corretos = as.filter((a) => fs.some((f) => corresponde(a, f, hoje))).length;
    return {
      tipo,
      falhas: fs.length,
      detectadas,
      alertas: as.length,
      alertasCorretos: corretos,
      precisao: as.length > 0 ? corretos / as.length : null,
      revocacao: fs.length > 0 ? detectadas / fs.length : null,
      atrasoMedioDias: atrasos.length > 0 ? atrasos.reduce((x, y) => x + y, 0) / atrasos.length : null,
    };
  };
  const porTipo = [...tipos].sort().map((t) =>
    calcular(
      (f) => chaveTipo(f.tipoAlerta, f.falha.tipo === "alarme" ? f.falha.categoria : undefined) === t,
      (a) => chaveTipo(a.tipo, a.categoriaAlarme) === t,
      t,
    ),
  );
  return { porTipo, global: calcular(() => true, () => true, "total") };
}
