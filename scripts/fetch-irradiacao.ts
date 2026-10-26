/**
 * Gera src/data/irradiacao.json a partir de fontes públicas, de forma reproduzível.
 *
 * - Coordenadas: dataset kelvins/municipios-brasileiros (MIT), commit fixado abaixo,
 *   que publica latitude/longitude das sedes municipais (origem IBGE).
 * - Climatologia: NASA POWER, endpoint de climatologia por ponto (comunidade RE).
 *   Documentação: https://power.larc.nasa.gov/docs/services/api/temporal/climatology/
 *
 * Uso: npm run dados:irradiacao
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";

const COMMIT_MUNICIPIOS = "503e2f70bbf1b4b7ec0b1f68b09086ccc38fe861";
const URL_MUNICIPIOS = `https://raw.githubusercontent.com/kelvins/municipios-brasileiros/${COMMIT_MUNICIPIOS}/csv/municipios.csv`;
const URL_ESTADOS = `https://raw.githubusercontent.com/kelvins/municipios-brasileiros/${COMMIT_MUNICIPIOS}/csv/estados.csv`;
const URL_POWER = "https://power.larc.nasa.gov/api/temporal/climatology/point";

const PARAMETROS = [
  "ALLSKY_SFC_SW_DWN", // irradiação global horizontal, kWh/m²/dia
  "ALLSKY_SFC_SW_DIFF", // irradiação difusa horizontal, kWh/m²/dia
  "CLRSKY_SFC_SW_DWN", // irradiação global de céu claro, kWh/m²/dia
  "ALLSKY_KT", // índice de claridade, adimensional
  "T2M", // temperatura do ar a 2 m, °C
  "T2M_MAX", // máxima média, °C
  "T2M_MIN", // mínima média, °C
  "PRECTOTCORR", // precipitação, mm/dia
  "WS2M", // vento a 2 m, m/s
] as const;

/** Cidades além das capitais, escolhidas para cobrir os estados líderes em GD e o interior. */
const CIDADES_EXTRAS: Array<[string, string]> = [
  ["Campinas", "SP"], ["Ribeirão Preto", "SP"], ["São José dos Campos", "SP"], ["Sorocaba", "SP"],
  ["Bauru", "SP"], ["Presidente Prudente", "SP"], ["São José do Rio Preto", "SP"], ["Piracicaba", "SP"],
  ["Uberlândia", "MG"], ["Juiz de Fora", "MG"], ["Montes Claros", "MG"], ["Uberaba", "MG"],
  ["Governador Valadares", "MG"], ["Varginha", "MG"],
  ["Londrina", "PR"], ["Maringá", "PR"], ["Cascavel", "PR"], ["Ponta Grossa", "PR"],
  ["Foz do Iguaçu", "PR"], ["Guarapuava", "PR"],
  ["Caxias do Sul", "RS"], ["Passo Fundo", "RS"], ["Santa Maria", "RS"], ["Pelotas", "RS"],
  ["Santa Rosa", "RS"], ["Uruguaiana", "RS"],
  ["Feira de Santana", "BA"], ["Vitória da Conquista", "BA"], ["Barreiras", "BA"],
  ["Petrolina", "PE"], ["Juazeiro do Norte", "CE"], ["Mossoró", "RN"], ["Imperatriz", "MA"],
  ["Campina Grande", "PB"], ["Rondonópolis", "MT"], ["Sinop", "MT"], ["Dourados", "MS"],
  ["Rio Verde", "GO"], ["Anápolis", "GO"], ["Joinville", "SC"], ["Chapecó", "SC"],
  ["Blumenau", "SC"], ["Campos dos Goytacazes", "RJ"], ["Santarém", "PA"], ["Marabá", "PA"],
  ["Araguaína", "TO"],
];

const MESES = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

type LinhaCsv = Record<string, string>;

function lerCsv(texto: string): LinhaCsv[] {
  const linhas = texto.replace(/^﻿/, "").trim().split(/\r?\n/);
  const cabecalho = linhas[0].split(",");
  return linhas.slice(1).map((l) => {
    const campos = l.split(",");
    return Object.fromEntries(cabecalho.map((c, i) => [c, campos[i]]));
  });
}

async function obterTexto(url: string): Promise<string> {
  const resposta = await fetch(url);
  if (!resposta.ok) throw new Error(`HTTP ${resposta.status} em ${url}`);
  return resposta.text();
}

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function obterClimatologia(lat: number, lon: number) {
  const url = `${URL_POWER}?parameters=${PARAMETROS.join(",")}&community=RE&longitude=${lon}&latitude=${lat}&format=JSON`;
  for (let tentativa = 1; tentativa <= 4; tentativa++) {
    try {
      const resposta = await fetch(url);
      if (!resposta.ok) throw new Error(`HTTP ${resposta.status}`);
      return (await resposta.json()) as {
        geometry: { coordinates: [number, number, number] };
        properties: { parameter: Record<string, Record<string, number>> };
        header: { api: { version: string }; sources: string[]; range: string; fill_value: number };
        parameters: Record<string, { units: string; longname: string }>;
      };
    } catch (erro) {
      if (tentativa === 4) throw erro;
      await esperar(2000 * tentativa);
    }
  }
  throw new Error("inalcançável");
}

async function main() {
  const municipios = lerCsv(await obterTexto(URL_MUNICIPIOS));
  const estados = lerCsv(await obterTexto(URL_ESTADOS));
  const ufPorCodigo = new Map(estados.map((e) => [e.codigo_uf, e.uf]));

  const selecionados = municipios.filter((m) => m.capital === "1");
  for (const [nome, uf] of CIDADES_EXTRAS) {
    const achado = municipios.find((m) => m.nome === nome && ufPorCodigo.get(m.codigo_uf) === uf);
    if (!achado) throw new Error(`Município não encontrado: ${nome}/${uf}`);
    selecionados.push(achado);
  }

  const cidades = [];
  let cabecalhoPower: Awaited<ReturnType<typeof obterClimatologia>>["header"] | undefined;
  let unidades: Record<string, string> = {};
  for (const m of selecionados) {
    const lat = Number(m.latitude);
    const lon = Number(m.longitude);
    const dados = await obterClimatologia(lat, lon);
    cabecalhoPower = dados.header;
    unidades = Object.fromEntries(Object.entries(dados.parameters).map(([k, v]) => [k, v.units]));
    const serie = (p: string) =>
      MESES.map((mes) => {
        const valor = dados.properties.parameter[p][mes];
        if (valor === dados.header.fill_value) throw new Error(`Valor ausente ${p}/${mes} em ${m.nome}`);
        return valor;
      });
    cidades.push({
      id: m.codigo_ibge,
      nome: m.nome,
      uf: ufPorCodigo.get(m.codigo_uf)!,
      capital: m.capital === "1",
      latitude: lat,
      longitude: lon,
      altitudeM: Math.round(dados.geometry.coordinates[2]),
      ghiKWhM2Dia: serie("ALLSKY_SFC_SW_DWN"),
      difusaKWhM2Dia: serie("ALLSKY_SFC_SW_DIFF"),
      ceuClaroKWhM2Dia: serie("CLRSKY_SFC_SW_DWN"),
      kt: serie("ALLSKY_KT"),
      tempMediaC: serie("T2M"),
      tempMaxC: serie("T2M_MAX"),
      tempMinC: serie("T2M_MIN"),
      precipitacaoMmDia: serie("PRECTOTCORR"),
      ventoMS: serie("WS2M"),
    });
    process.stdout.write(`${m.nome}/${ufPorCodigo.get(m.codigo_uf)} `);
    await esperar(800);
  }

  cidades.sort((a, b) => a.uf.localeCompare(b.uf) || a.nome.localeCompare(b.nome, "pt-BR"));
  const saida = {
    fonte: {
      nome: "NASA POWER — Climatology API",
      url: URL_POWER,
      versaoApi: cabecalhoPower?.api.version,
      fontesDados: cabecalhoPower?.sources,
      periodo: cabecalhoPower?.range,
      comunidade: "RE",
      parametros: PARAMETROS,
      unidades,
      obtidoEm: new Date().toISOString().slice(0, 10),
      coordenadas: {
        nome: "kelvins/municipios-brasileiros (licença MIT; coordenadas das sedes municipais, origem IBGE)",
        url: URL_MUNICIPIOS,
        commit: COMMIT_MUNICIPIOS,
      },
      termos: "Dados NASA POWER de uso livre; citar 'NASA Langley Research Center (LaRC) POWER Project'.",
    },
    cidades,
  };
  const destino = join(process.cwd(), "src", "data", "irradiacao.json");
  writeFileSync(destino, JSON.stringify(saida, null, 1) + "\n");
  console.log(`\n${cidades.length} cidades gravadas em ${destino}`);
}

main().catch((erro) => {
  console.error(erro);
  process.exit(1);
});
