/**
 * Gera src/data/tarifas.json com as componentes tarifárias homologadas (Grupo B) de
 * quatro distribuidoras, a partir do conjunto de dados abertos "Componentes Tarifárias"
 * da ANEEL (licença ODbL — o extrato gerado permanece sob ODbL).
 *
 * O CSV anual tem centenas de MB: é lido em streaming e só o extrato é versionado.
 * Se existir uma cópia em .cache/aneel/, ela é usada; caso contrário, o arquivo é baixado.
 *
 * Uso: npm run dados:tarifas
 */
import { createReadStream, createWriteStream, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

const ANO = 2026;
const PACOTE_CKAN = "componentes-tarifarias";
const URL_CKAN = `https://dadosabertos.aneel.gov.br/api/3/action/package_show?id=${PACOTE_CKAN}`;
const CACHE = join(process.cwd(), ".cache", "aneel", `componentes-tarifarias-${ANO}.csv`);

/** Siglas exatamente como aparecem no campo SigNomeAgente da ANEEL. */
const DISTRIBUIDORAS = [
  { sigla: "COPEL-DIS", id: "copel", uf: "PR" },
  { sigla: "CEMIG-D", id: "cemig", uf: "MG" },
  { sigla: "CPFL-PAULISTA", id: "cpfl-paulista", uf: "SP" },
  { sigla: "RGE", id: "rge", uf: "RS" },
] as const;

/** Recortes do Grupo B extraídos: subgrupo, modalidade, classe e subclasse. */
const RECORTES = [
  { chave: "B1", subgrupo: "B1", modalidade: "Convencional", classe: "Residencial", subclasse: "Residencial" },
  { chave: "B2", subgrupo: "B2", modalidade: "Convencional", classe: "Rural", subclasse: "Não se aplica" },
  { chave: "B3", subgrupo: "B3", modalidade: "Convencional", classe: "Não se aplica", subclasse: "Não se aplica" },
] as const;

async function garantirArquivo(): Promise<string> {
  if (existsSync(CACHE)) return CACHE;
  const pacote = (await (await fetch(URL_CKAN)).json()) as {
    result: { resources: Array<{ name: string; url: string }> };
  };
  const recurso = pacote.result.resources.find((r) => r.name === `componentes-tarifarias-${ANO}.csv`);
  if (!recurso) throw new Error(`Recurso de ${ANO} não encontrado no pacote ${PACOTE_CKAN}`);
  mkdirSync(join(process.cwd(), ".cache", "aneel"), { recursive: true });
  const resposta = await fetch(recurso.url);
  if (!resposta.ok || !resposta.body) throw new Error(`HTTP ${resposta.status} ao baixar ${recurso.url}`);
  await pipeline(Readable.fromWeb(resposta.body as never), createWriteStream(CACHE));
  return CACHE;
}

const numero = (texto: string) => Number(texto.replace(",", "."));

type Registro = {
  resolucao: string;
  inicio: string;
  fim: string;
  componentes: Map<string, number>; // detalhe "Não se aplica"
  componentesScee: Map<string, number>; // detalhe "SCEE"
};

async function main() {
  const arquivo = await garantirArquivo();
  const siglas = new Set<string>(DISTRIBUIDORAS.map((d) => d.sigla));
  // chave: sigla|recorte|inicioVigencia
  const registros = new Map<string, Registro>();
  let geradoEm = "";

  const leitor = createInterface({ input: createReadStream(arquivo, { encoding: "utf8" }), crlfDelay: Infinity });
  let cabecalho: string[] | undefined;
  for await (const linha of leitor) {
    const campos = linha.replace(/^﻿/, "").slice(1, -1).split('";"');
    if (!cabecalho) {
      cabecalho = campos;
      continue;
    }
    const c = (nome: string) => campos[cabecalho!.indexOf(nome)];
    if (!siglas.has(c("SigNomeAgente"))) continue;
    if (c("DscBaseTarifaria") !== "Tarifa de Aplicação") continue;
    if (c("DscPostoTarifario") !== "Não se aplica" || c("DscUnidade") !== "R$/MWh") continue;
    const recorte = RECORTES.find(
      (r) =>
        r.subgrupo === c("DscSubGrupoTarifario") &&
        r.modalidade === c("DscModalidadeTarifaria") &&
        r.classe === c("DscClasseConsumidor") &&
        r.subclasse === c("DscSubClasseConsumidor"),
    );
    if (!recorte) continue;
    const detalhe = c("DscDetalheConsumidor");
    if (detalhe !== "Não se aplica" && detalhe !== "SCEE") continue;
    geradoEm = c("DatGeracaoConjuntoDados");
    const chave = `${c("SigNomeAgente")}|${recorte.chave}|${c("DatInicioVigencia")}`;
    let registro = registros.get(chave);
    if (!registro) {
      registro = {
        resolucao: c("DscResolucaoHomologatoria"),
        inicio: c("DatInicioVigencia"),
        fim: c("DatFimVigencia"),
        componentes: new Map(),
        componentesScee: new Map(),
      };
      registros.set(chave, registro);
    }
    // O conjunto repete linhas idênticas; a atribuição (não a soma) torna isso inócuo.
    const alvo = detalhe === "SCEE" ? registro.componentesScee : registro.componentes;
    alvo.set(c("DscComponenteTarifario"), numero(c("VlrComponenteTarifario")));
  }

  const arredondar = (v: number) => Math.round(v * 1e6) / 1e6;
  const distribuidoras = DISTRIBUIDORAS.map((d) => {
    const subgrupos: Record<string, unknown> = {};
    let resolucao = "";
    let vigencia = { inicio: "", fim: "" };
    for (const r of RECORTES) {
      // Usa a vigência mais recente publicada para o recorte.
      const candidatos = [...registros.entries()]
        .filter(([k]) => k.startsWith(`${d.sigla}|${r.chave}|`))
        .map(([, v]) => v)
        .sort((a, b) => b.inicio.localeCompare(a.inicio));
      const atual = candidatos[0];
      if (!atual) throw new Error(`Sem dados para ${d.sigla} ${r.chave}`);
      resolucao = atual.resolucao;
      vigencia = { inicio: atual.inicio, fim: atual.fim };
      const paraObjeto = (m: Map<string, number>) =>
        Object.fromEntries([...m.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, arredondar(v)]));
      subgrupos[r.chave] = {
        modalidade: r.modalidade,
        classe: r.classe,
        subclasse: r.subclasse,
        componentesRMWh: paraObjeto(atual.componentes),
        componentesSceeRMWh: paraObjeto(atual.componentesScee),
      };
    }
    return { id: d.id, sigla: d.sigla, uf: d.uf, resolucao, vigencia, subgrupos };
  });

  const saida = {
    fonte: {
      nome: "ANEEL — Dados Abertos: Componentes Tarifárias",
      url: `https://dadosabertos.aneel.gov.br/dataset/${PACOTE_CKAN}`,
      arquivo: `componentes-tarifarias-${ANO}.csv`,
      licenca: "Open Data Commons Open Database License (ODbL) — este extrato também é distribuído sob ODbL",
      geracaoConjuntoDados: geradoEm,
      obtidoEm: new Date().toISOString().slice(0, 10),
      base: "Tarifa de Aplicação",
      unidade: "R$/MWh, sem tributos (ICMS, PIS/COFINS)",
      observacao:
        "As componentes 'TUSD' e 'TE' são os totais homologados; as demais são parcelas. O detalhe 'SCEE' traz as tarifas aplicáveis à energia compensada antes dos descontos por categoria (GD I/II/III), que constam das Resoluções Homologatórias e não deste conjunto.",
    },
    distribuidoras,
  };
  const destino = join(process.cwd(), "src", "data", "tarifas.json");
  writeFileSync(destino, JSON.stringify(saida, null, 1) + "\n");
  for (const d of distribuidoras) console.log(d.sigla, d.resolucao, d.vigencia.inicio, "→", d.vigencia.fim);
  console.log(`Gravado em ${destino}`);
}

main().catch((erro) => {
  console.error(erro);
  process.exit(1);
});
