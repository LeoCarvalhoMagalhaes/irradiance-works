"use client";

import { Info } from "lucide-react";
import equipamentos from "@/data/equipamentos.json";
import { esquemaInversor, esquemaModulo, type Inversor, type Modulo } from "@/core/eletrica/equipamentos";
import { INVERSOR_AUTOMATICO } from "@/core/simulador/proposta";
import { useTextos } from "@/i18n/cliente";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { CampoNumero, CampoSelecao, CampoTexto, GrupoOpcoes } from "./campos";
import type { PropsEtapa } from "./etapa-local";
import { nomeInversor, nomeModulo } from "@/lib/nome-equipamento";

/** Rosa dos ventos com a direção do azimute (0° = norte, sentido horário). */
function Rosa({ azimute, rotulos }: { azimute: number; rotulos: { n: string; l: string; s: string; o: string } }) {
  return (
    <svg viewBox="-60 -60 120 120" className="size-28 shrink-0" aria-hidden="true">
      <circle r="44" className="fill-muted stroke-border" />
      <text y="-48" textAnchor="middle" className="fill-foreground text-[11px] font-semibold">{rotulos.n}</text>
      <text x="52" y="4" textAnchor="middle" className="fill-muted-foreground text-[11px]">{rotulos.l}</text>
      <text y="58" textAnchor="middle" className="fill-muted-foreground text-[11px]">{rotulos.s}</text>
      <text x="-52" y="4" textAnchor="middle" className="fill-muted-foreground text-[11px]">{rotulos.o}</text>
      <g transform={`rotate(${azimute})`}>
        <path d="M0 -38 L7 0 L0 6 L-7 0 Z" className="fill-solar" />
      </g>
      <circle r="3" className="fill-foreground" />
    </svg>
  );
}

const MODULOS = equipamentos.modulos as Modulo[];
const INVERSORES = equipamentos.inversores as Inversor[];

export function EtapaInstalacao({ entrada, atualizar, erros }: PropsEtapa) {
  const t = useTextos("simulador");
  const tComum = useTextos("comum");
  const ti = t.instalacao;
  const modPers = entrada.moduloPersonalizado;
  const invPers = entrada.inversorPersonalizado;
  const errosEquip = Object.keys(erros).some((k) => k.startsWith("moduloPersonalizado") || k.startsWith("inversorPersonalizado"));

  return (
    <div className="grid gap-8">
      <section className="grid gap-4">
        <GrupoOpcoes
          rotulo={ti.tipo}
          valor={entrada.instalacao.tipo}
          colunas={4}
          aoMudar={(v) => atualizar({ instalacao: { ...entrada.instalacao, tipo: v as typeof entrada.instalacao.tipo } })}
          opcoes={(["telhadoCeramico", "telhadoMetalico", "laje", "solo"] as const).map((x) => ({ valor: x, rotulo: ti.tipos[x] }))}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <CampoNumero
            rotulo={ti.area}
            dica={ti.areaDica}
            opcional
            min={1}
            sufixo="m²"
            valor={entrada.instalacao.areaM2}
            erro={erros["instalacao.areaM2"]}
            aoMudar={(v) => atualizar({ instalacao: { ...entrada.instalacao, areaM2: v } })}
          />
          <CampoNumero
            rotulo={ti.sombreamento}
            dica={ti.sombreamentoDica}
            premissa
            min={0}
            max={50}
            sufixo="%"
            valor={entrada.instalacao.sombreamentoPct}
            erro={erros["instalacao.sombreamentoPct"]}
            aoMudar={(v) => v !== null && atualizar({ instalacao: { ...entrada.instalacao, sombreamentoPct: v } })}
          />
          <CampoNumero
            rotulo={ti.inclinacao}
            min={0}
            max={90}
            sufixo="°"
            valor={entrada.instalacao.inclinacaoGraus}
            erro={erros["instalacao.inclinacaoGraus"]}
            aoMudar={(v) => v !== null && atualizar({ instalacao: { ...entrada.instalacao, inclinacaoGraus: v } })}
          />
          <div className="flex items-start gap-3">
            <CampoNumero
              className="flex-1"
              rotulo={ti.azimute}
              dica={ti.azimuteDica}
              min={0}
              max={360}
              sufixo="°"
              valor={entrada.instalacao.azimuteGraus}
              erro={erros["instalacao.azimuteGraus"]}
              aoMudar={(v) => v !== null && atualizar({ instalacao: { ...entrada.instalacao, azimuteGraus: v } })}
            />
            <Rosa azimute={entrada.instalacao.azimuteGraus} rotulos={ti.rosa} />
          </div>
        </div>
      </section>

      <section className="grid gap-4">
        <Alert>
          <Info aria-hidden="true" />
          <AlertDescription>{ti.equipamentoGenerico}</AlertDescription>
        </Alert>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            {!modPers && (
              <CampoSelecao rotulo={ti.modulo} valor={entrada.moduloId} aoMudar={(moduloId) => atualizar({ moduloId })} opcoes={MODULOS.map((m) => ({ valor: m.id, rotulo: nomeModulo(m, tComum) }))} />
            )}
            <Button
              size="sm"
              variant="outline"
              onClick={() => atualizar({ moduloPersonalizado: modPers ? null : { ...(MODULOS.find((m) => m.id === entrada.moduloId) ?? MODULOS[1]), id: "proprio", nome: "" } })}
            >
              {modPers ? ti.removerPersonalizado : ti.personalizarModulo}
            </Button>
          </div>
          <div className="space-y-2">
            {!invPers && (
              <CampoSelecao
                rotulo={ti.inversor}
                valor={entrada.inversorId}
                aoMudar={(inversorId) => atualizar({ inversorId })}
                opcoes={[{ valor: INVERSOR_AUTOMATICO, rotulo: ti.inversorAuto }, ...INVERSORES.map((i) => ({ valor: i.id, rotulo: nomeInversor(i, tComum) }))]}
              />
            )}
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                atualizar({ inversorPersonalizado: invPers ? null : { ...(INVERSORES.find((i) => i.id === entrada.inversorId) ?? INVERSORES[1]), id: "proprio", nome: "" } })
              }
            >
              {invPers ? ti.removerPersonalizado : ti.personalizarInversor}
            </Button>
          </div>
        </div>
        {modPers && (
          <fieldset className="grid gap-3 rounded-lg border p-3 sm:grid-cols-3">
            <legend className="px-1 text-sm font-medium">{ti.personalizarModulo}</legend>
            {(Object.keys(ti.camposModulo) as Array<keyof typeof ti.camposModulo>).map((campo) =>
              campo === "nome" ? (
                <CampoTexto key={campo} rotulo={ti.camposModulo.nome} valor={modPers.nome} erro={erros["moduloPersonalizado.nome"]} aoMudar={(nome) => atualizar({ moduloPersonalizado: { ...modPers, nome } })} />
              ) : (
                <CampoNumero
                  key={campo}
                  rotulo={ti.camposModulo[campo]}
                  valor={modPers[campo]}
                  erro={erros[`moduloPersonalizado.${campo}`]}
                  aoMudar={(v) => v !== null && atualizar({ moduloPersonalizado: { ...modPers, [campo]: v } })}
                />
              ),
            )}
          </fieldset>
        )}
        {invPers && (
          <fieldset className="grid gap-3 rounded-lg border p-3 sm:grid-cols-3">
            <legend className="px-1 text-sm font-medium">{ti.personalizarInversor}</legend>
            {(Object.keys(ti.camposInversor) as Array<keyof typeof ti.camposInversor>).map((campo) =>
              campo === "nome" ? (
                <CampoTexto key={campo} rotulo={ti.camposInversor.nome} valor={invPers.nome} erro={erros["inversorPersonalizado.nome"]} aoMudar={(nome) => atualizar({ inversorPersonalizado: { ...invPers, nome } })} />
              ) : (
                <CampoNumero
                  key={campo}
                  rotulo={ti.camposInversor[campo]}
                  valor={invPers[campo] as number}
                  erro={erros[`inversorPersonalizado.${campo}`]}
                  aoMudar={(v) => v !== null && atualizar({ inversorPersonalizado: { ...invPers, [campo]: v } as Inversor })}
                />
              ),
            )}
          </fieldset>
        )}
        {errosEquip && (
          <p role="alert" className="text-sm font-medium text-destructive">
            {ti.equipamentoInvalido}
          </p>
        )}
      </section>

      <section className="grid gap-4">
        <h3 className="text-sm font-medium">{ti.dimensionamento}</h3>
        <GrupoOpcoes
          rotulo={ti.modo}
          valor={entrada.dimensionamento.modo}
          aoMudar={(v) => atualizar({ dimensionamento: { ...entrada.dimensionamento, modo: v as "energia" | "valor" } })}
          opcoes={(["energia", "valor"] as const).map((m) => ({ valor: m, rotulo: ti.modos[m] }))}
          dica={ti.modoDica[entrada.dimensionamento.modo]}
        />
        <CampoNumero
          rotulo={ti.cobertura}
          min={5}
          max={150}
          sufixo="%"
          valor={entrada.dimensionamento.coberturaPct}
          erro={erros["dimensionamento.coberturaPct"]}
          aoMudar={(v) => v !== null && atualizar({ dimensionamento: { ...entrada.dimensionamento, coberturaPct: v } })}
        />
      </section>
    </div>
  );
}

/** Valida equipamentos próprios com os mesmos esquemas do núcleo. */
export function validarEquipamentos(modulo: Modulo | null, inversor: Inversor | null) {
  return { modulo: modulo ? esquemaModulo.safeParse(modulo).success : true, inversor: inversor ? esquemaInversor.safeParse(inversor).success : true };
}
