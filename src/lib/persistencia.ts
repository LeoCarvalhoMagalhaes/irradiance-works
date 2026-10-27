/**
 * Persistência local (localStorage) com schema versionado e validação Zod na leitura.
 * Toda operação é protegida: armazenamento indisponível, vazio ou corrompido cai num estado
 * seguro (demonstração), e o conteúdo inválido é preservado em uma chave de backup.
 */
import { z } from "zod";
import { esquemaComissionamento } from "@/core/integracao/comissionamento";
import { esquemaOrdemServico } from "@/core/manutencao/ordens";
import { esquemaPremissas, PREMISSAS_PADRAO, TRIBUTOS_EXEMPLO } from "@/core/simulador/premissas";
import { esquemaEntradaProposta, entradaPadrao } from "@/core/simulador/proposta";
import { somarDias } from "@/core/util/tempo";

export const CHAVE_ARMAZENAMENTO = "irradiance-works:v1";
export const VERSAO_ESTADO = 1;

export const esquemaPropostaSalva = z.object({
  id: z.string().regex(/^P-\d{4,}$/),
  nome: z.string().max(120),
  criadaEm: z.string(),
  entrada: esquemaEntradaProposta,
  resumo: z.object({
    cidade: z.string(),
    uf: z.string(),
    potenciaCcKWp: z.number(),
    energiaAnualKWh: z.number(),
    vplR: z.number(),
    paybackAnos: z.number().nullable(),
  }),
});

export type PropostaSalva = z.infer<typeof esquemaPropostaSalva>;

export const esquemaEstado = z.object({
  versao: z.literal(VERSAO_ESTADO),
  propostas: z.array(esquemaPropostaSalva),
  comissionamentos: z.array(esquemaComissionamento),
  ordens: z.array(esquemaOrdemServico),
  sequenciaProposta: z.number().int().min(0),
  sequenciaOs: z.number().int().min(0),
  sequenciaUsina: z.number().int().min(0),
  premissasPersonalizadas: esquemaPremissas.nullable(),
  custosLimpeza: z.record(z.string(), z.number().min(0)),
});

export type Estado = z.infer<typeof esquemaEstado>;

/**
 * Dados de demonstração: uma proposta residencial em Campinas, comissionada há 6 meses, com
 * sujidade aderente injetada (histórico simulado) — permite ver "prometido × real" de imediato.
 */
export function estadoDemonstracao(hoje: string): Estado {
  const entrada = { ...entradaPadrao(hoje, PREMISSAS_PADRAO, TRIBUTOS_EXEMPLO), cliente: "Cliente demonstração", cidadeId: "3509502" };
  return {
    versao: VERSAO_ESTADO,
    propostas: [],
    comissionamentos: [
      {
        id: "UFV-C01",
        nome: "Residência demonstração (comissionada)",
        propostaId: "P-0001",
        entrada,
        dataComissionamento: somarDias(hoje, -183),
        falhasDemo: [{ tipo: "sujidade", inicio: somarDias(hoje, -40) }],
        criadoEm: `${hoje}T12:00:00.000Z`,
      },
    ],
    ordens: [],
    sequenciaProposta: 1,
    sequenciaOs: 0,
    sequenciaUsina: 1,
    premissasPersonalizadas: null,
    custosLimpeza: {},
  };
}

export type ResultadoLeitura = { estado: Estado; situacao: "ok" | "vazio" | "corrompido" | "indisponivel" };

export function lerEstado(hoje: string): ResultadoLeitura {
  let bruto: string | null;
  try {
    bruto = window.localStorage.getItem(CHAVE_ARMAZENAMENTO);
  } catch {
    return { estado: estadoDemonstracao(hoje), situacao: "indisponivel" };
  }
  if (bruto === null) return { estado: estadoDemonstracao(hoje), situacao: "vazio" };
  try {
    const r = esquemaEstado.safeParse(JSON.parse(bruto));
    if (r.success) return { estado: r.data, situacao: "ok" };
  } catch {
    // JSON inválido: tratado como corrompido abaixo.
  }
  try {
    window.localStorage.setItem(`${CHAVE_ARMAZENAMENTO}:backup-corrompido`, bruto);
  } catch {
    // Sem espaço ou sem acesso: o backup é melhor esforço.
  }
  return { estado: estadoDemonstracao(hoje), situacao: "corrompido" };
}

export function gravarEstado(estado: Estado): boolean {
  try {
    window.localStorage.setItem(CHAVE_ARMAZENAMENTO, JSON.stringify(estado));
    return true;
  } catch {
    return false;
  }
}
