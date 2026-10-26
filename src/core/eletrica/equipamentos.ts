import { z } from "zod";

export const esquemaModulo = z.object({
  id: z.string().min(1),
  nome: z.string().min(1),
  potenciaWp: z.number().positive(),
  vocV: z.number().positive(),
  vmpV: z.number().positive(),
  iscA: z.number().positive(),
  impA: z.number().positive(),
  coefVocPctC: z.number().max(0),
  coefVmpPctC: z.number().max(0),
  coefIscPctC: z.number().min(0),
  coefPotenciaPctC: z.number().max(0),
  noctC: z.number().min(30).max(60),
  comprimentoM: z.number().positive(),
  larguraM: z.number().positive(),
});

export const esquemaInversor = z.object({
  id: z.string().min(1),
  nome: z.string().min(1),
  potenciaCaW: z.number().positive(),
  tensaoCcMaxV: z.number().positive(),
  mpptMinV: z.number().positive(),
  mpptMaxV: z.number().positive(),
  correnteMaxMpptA: z.number().positive(),
  correnteCurtoMaxMpptA: z.number().positive(),
  numMppt: z.number().int().positive(),
  etaNominal: z.number().min(0.8).max(0.995),
  fases: z.union([z.literal(1), z.literal(3)]),
});

export type Modulo = z.infer<typeof esquemaModulo>;
export type Inversor = z.infer<typeof esquemaInversor>;

export const areaModuloM2 = (m: Modulo) => m.comprimentoM * m.larguraM;
