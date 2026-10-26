"use client";

import { useMemo } from "react";
import { custoDisponibilidadeKWh } from "@/core/regulacao/faturamento";
import { CIDADES, cidadeMaisProxima, cidadePorId } from "@/core/simulador/cidades";
import type { EntradaProposta } from "@/core/simulador/proposta";
import { preencher } from "@/i18n/config";
import { useFormato, useTextos } from "@/i18n/cliente";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { CampoData, CampoNumero, CampoSelecao, CampoTexto, GrupoOpcoes } from "./campos";

export type PropsEtapa = {
  entrada: EntradaProposta;
  atualizar: (mudanca: Partial<EntradaProposta>) => void;
  erros: Record<string, string>;
};

const ORDEM_CIDADES = [...CIDADES].sort((a, b) => a.uf.localeCompare(b.uf) || a.nome.localeCompare(b.nome, "pt-BR"));

export function EtapaLocal({ entrada, atualizar, erros }: PropsEtapa) {
  const t = useTextos("simulador");
  const f = useFormato();
  const porCoordenadas = entrada.coordenadas !== null;
  const proxima = useMemo(() => (entrada.coordenadas ? cidadeMaisProxima(entrada.coordenadas.latitude, entrada.coordenadas.longitude) : null), [entrada.coordenadas]);
  const cidade = proxima?.cidade ?? cidadePorId(entrada.cidadeId);
  const media = (v: number[]) => v.reduce((a, b) => a + b, 0) / v.length;

  return (
    <div className="grid gap-6">
      <CampoTexto rotulo={t.local.cliente} dica={t.local.clienteDica} valor={entrada.cliente} aoMudar={(cliente) => atualizar({ cliente })} />

      <GrupoOpcoes
        rotulo={t.local.modoLocal}
        valor={porCoordenadas ? "coordenadas" : "cidade"}
        aoMudar={(v) => atualizar({ coordenadas: v === "coordenadas" ? { latitude: cidade?.latitude ?? -23.55, longitude: cidade?.longitude ?? -46.63 } : null })}
        opcoes={[
          { valor: "cidade", rotulo: t.local.porCidade },
          { valor: "coordenadas", rotulo: t.local.porCoordenadas },
        ]}
      />

      {porCoordenadas && entrada.coordenadas ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <CampoNumero
            rotulo={t.local.latitude}
            valor={entrada.coordenadas.latitude}
            min={-34}
            max={6}
            erro={erros["coordenadas.latitude"]}
            aoMudar={(v) => v !== null && atualizar({ coordenadas: { ...entrada.coordenadas!, latitude: v } })}
          />
          <CampoNumero
            rotulo={t.local.longitude}
            valor={entrada.coordenadas.longitude}
            min={-75}
            max={-28}
            erro={erros["coordenadas.longitude"]}
            aoMudar={(v) => v !== null && atualizar({ coordenadas: { ...entrada.coordenadas!, longitude: v } })}
          />
          {proxima && (
            <p className="text-sm text-muted-foreground sm:col-span-2" role="status">
              {preencher(t.local.cidadeMaisProxima, { cidade: proxima.cidade.nome, uf: proxima.cidade.uf, km: f.numero(proxima.distanciaKm) })}
            </p>
          )}
        </div>
      ) : (
        <CampoSelecao
          rotulo={t.local.cidade}
          valor={entrada.cidadeId}
          aoMudar={(cidadeId) => atualizar({ cidadeId })}
          opcoes={ORDEM_CIDADES.map((c) => ({ valor: c.id, rotulo: `${c.nome}${c.capital ? " ★" : ""}`, grupo: c.uf }))}
        />
      )}
      {cidade && (
        <p className="-mt-3 text-sm text-muted-foreground">
          {preencher(t.local.climatologia, { ghi: f.numero(media(cidade.ghiKWhM2Dia), 2), temp: f.numero(media(cidade.tempMediaC), 1) })}
        </p>
      )}

      <GrupoOpcoes
        rotulo={t.local.ligacao}
        valor={entrada.ligacao}
        aoMudar={(v) => atualizar({ ligacao: v as EntradaProposta["ligacao"] })}
        colunas={2}
        opcoes={(["monofasico", "bifasico2", "bifasico3", "trifasico"] as const).map((l) => ({ valor: l, rotulo: t.local.ligacoes[l] }))}
        dica={preencher(t.local.custoDisponibilidade, { kwh: custoDisponibilidadeKWh(entrada.ligacao, entrada.cadUnico) })}
      />

      <div className="flex items-start gap-2">
        <Checkbox id="cadunico" checked={entrada.cadUnico} onCheckedChange={(v) => atualizar({ cadUnico: v === true })} />
        <Label htmlFor="cadunico" className="leading-snug font-normal">
          {t.local.cadUnico}
        </Label>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <CampoData rotulo={t.local.dataProtocolo} dica={t.local.dataProtocoloDica} valor={entrada.dataProtocolo} aoMudar={(dataProtocolo) => atualizar({ dataProtocolo })} />
        <CampoSelecao
          rotulo={t.local.modalidade}
          valor={entrada.modalidade}
          aoMudar={(v) => atualizar({ modalidade: v as EntradaProposta["modalidade"] })}
          opcoes={(["autoconsumoLocal", "autoconsumoRemoto", "geracaoCompartilhada", "multiplasUnidades"] as const).map((m) => ({ valor: m, rotulo: t.local.modalidades[m] }))}
        />
        {entrada.modalidade === "geracaoCompartilhada" && (
          <CampoNumero
            rotulo={t.local.participacao}
            valor={entrada.maiorParticipacaoPct}
            min={0}
            max={100}
            sufixo="%"
            erro={erros.maiorParticipacaoPct}
            aoMudar={(v) => v !== null && atualizar({ maiorParticipacaoPct: v })}
          />
        )}
      </div>
    </div>
  );
}
