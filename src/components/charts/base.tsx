"use client";

import type { TooltipContentProps } from "recharts";
import { useChart } from "@/components/ui/chart";

/** Eixos e grade recessivos (guia de visualização: o dado em primeiro plano). */
export const EIXO = { tickLine: false, axisLine: false, tickMargin: 8, fontSize: 12 } as const;
export const GRADE = { vertical: false, strokeDasharray: "3 3" } as const;
/** Barras finas com cantos arredondados no topo, ancoradas na base. */
export const RAIO_BARRA: [number, number, number, number] = [4, 4, 0, 0];

type Props = Partial<TooltipContentProps<number | string, string>> & {
  formatar: (valor: number, chave: string) => string;
  rotulo?: (rotulo: string | number) => string;
};

/** Dica do gráfico com nomes da configuração e valores formatados no idioma atual. */
export function DicaGrafico({ active, payload, label, formatar, rotulo }: Props) {
  const { config } = useChart();
  if (!active || !payload?.length) return null;
  return (
    <div className="grid min-w-36 gap-1.5 rounded-lg border bg-popover px-2.5 py-1.5 text-xs text-popover-foreground shadow-elevada">
      {label !== undefined && <div className="font-medium">{rotulo ? rotulo(label as string | number) : String(label)}</div>}
      {payload
        .filter((p) => p.value !== null && p.value !== undefined && p.type !== "none")
        .map((p) => {
          const chave = String(p.dataKey ?? p.name);
          return (
            <div key={chave} className="flex items-center gap-2">
              <span className="size-2.5 shrink-0 rounded-[2px]" style={{ background: p.color ?? `var(--color-${chave})` }} aria-hidden="true" />
              <span className="text-muted-foreground">{(config[chave]?.label as string) ?? chave}</span>
              <span className="ml-auto pl-3 font-medium tabular-nums">{formatar(Number(p.value), chave)}</span>
            </div>
          );
        })}
    </div>
  );
}
