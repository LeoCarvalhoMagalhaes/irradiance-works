/**
 * Enquadramento da unidade geradora (verificado em 2026-10-26 no texto consolidado da
 * Lei 14.300/2022 e da REN ANEEL 1.000/2021 — ver src/data/config-regulatoria.json).
 */
import config from "@/data/config-regulatoria.json";

export type Modalidade = "autoconsumoLocal" | "autoconsumoRemoto" | "geracaoCompartilhada" | "multiplasUnidades";
export type Porte = "micro" | "mini" | "foraScee";
export type CategoriaGd = "GD1" | "GD2" | "GD3";

export type EntradaEnquadramento = {
  potenciaCaKW: number;
  despachavel: boolean;
  /** Data de protocolo da solicitação de orçamento de conexão, "AAAA-MM-DD". */
  dataProtocolo: string;
  modalidade: Modalidade;
  /** Maior participação de um beneficiário no excedente (geração compartilhada), em %. */
  maiorParticipacaoPct?: number;
};

export type Enquadramento = {
  porte: Porte;
  categoria: CategoriaGd | null;
  /** Primeiro ano de faturamento pela regra do art. 17 (pós-transição). */
  anoRegraArt17: number | null;
  limiteAplicavelKW: number;
  fundamentos: string[];
};

const { limitesPotencia: lim, categoriasGd: cat } = config;

export function enquadrar(e: EntradaEnquadramento): Enquadramento {
  const fundamentos: string[] = [];
  // Lei 14.300, art. 26 / REN 1.000, art. 655-O: protocolo até 07/01/2023.
  const gd1 = e.dataProtocolo <= cat.gd1ProtocoloAte;
  // Parágrafo único do art. 1º: 5 MW até 31/12/2045 para as unidades do art. 26.
  const limiteMini = gd1 ? lim.miniArt26MaxKW : e.despachavel ? lim.miniDespachavelMaxKW : lim.miniNaoDespachavelMaxKW;

  let porte: Porte;
  if (e.potenciaCaKW <= lim.microMaxKW) porte = "micro";
  else if (e.potenciaCaKW <= limiteMini) porte = "mini";
  else porte = "foraScee";
  fundamentos.push(lim.fundamento);

  if (porte === "foraScee") {
    return { porte, categoria: null, anoRegraArt17: null, limiteAplicavelKW: limiteMini, fundamentos };
  }

  let categoria: CategoriaGd;
  if (gd1) {
    categoria = "GD1";
    fundamentos.push(cat.fundamentoGd1);
  } else {
    const remotoOuCompartilhado =
      e.modalidade === "autoconsumoRemoto" ||
      (e.modalidade === "geracaoCompartilhada" && (e.maiorParticipacaoPct ?? 0) >= cat.gd3ParticipacaoMinimaPct);
    if (porte === "mini" && e.potenciaCaKW > cat.gd3PotenciaMinimaKW && !e.despachavel && remotoOuCompartilhado) {
      categoria = "GD3";
      fundamentos.push(cat.fundamentoGd3);
    } else {
      categoria = "GD2";
    }
  }

  let anoRegraArt17: number;
  if (categoria === "GD1") {
    anoRegraArt17 = lim.art26AteAno + 1;
  } else if (e.dataProtocolo >= cat.janelaTransicao2031.inicio && e.dataProtocolo <= cat.janelaTransicao2031.fim) {
    anoRegraArt17 = 2031;
    fundamentos.push(cat.fundamentoJanela2031);
  } else {
    anoRegraArt17 = config.fioB.anoRegraArt17;
  }
  return { porte, categoria, anoRegraArt17, limiteAplicavelKW: limiteMini, fundamentos };
}
