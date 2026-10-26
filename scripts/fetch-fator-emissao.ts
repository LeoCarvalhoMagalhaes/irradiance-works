/**
 * Gera src/data/fator-emissao.json com os fatores médios de emissão de CO2 do SIN
 * "para inventários" publicados pelo MCTI (SIRENE). A planilha traz um bloco por ano,
 * com os 12 fatores mensais e o fator médio anual (tCO2/MWh).
 *
 * Uso: npm run dados:emissao
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import ExcelJS from "exceljs";

const PAGINA = "https://www.gov.br/mcti/pt-br/acompanhe-o-mcti/sirene/dados-e-ferramentas/fatores-de-emissao";
const ARQUIVO = "Inventario_2026_janset.xlsx";
const URL_ARQUIVO = `${PAGINA}/arquivo/${ARQUIVO}`;
const CACHE = join(process.cwd(), ".cache", "mcti", ARQUIVO);

type Celula = ExcelJS.CellValue;
const valor = (c: Celula): unknown =>
  c && typeof c === "object" && "result" in (c as object) ? (c as { result: unknown }).result : c;

async function main() {
  if (!existsSync(CACHE)) {
    mkdirSync(join(process.cwd(), ".cache", "mcti"), { recursive: true });
    const resposta = await fetch(URL_ARQUIVO);
    if (!resposta.ok) throw new Error(`HTTP ${resposta.status} em ${URL_ARQUIVO}`);
    writeFileSync(CACHE, Buffer.from(await resposta.arrayBuffer()));
  }
  const pasta = new ExcelJS.Workbook();
  await pasta.xlsx.readFile(CACHE);
  const aba = pasta.worksheets[0];

  const linhas: unknown[][] = [];
  aba.eachRow({ includeEmpty: true }, (linha) => {
    linhas.push((linha.values as Celula[]).map(valor));
  });

  const anos: Array<{ ano: number; mensalTCO2MWh: Array<number | null>; anualTCO2MWh: number | null }> = [];
  for (let i = 0; i < linhas.length; i++) {
    const ano = linhas[i][2];
    if (typeof ano !== "number" || ano < 2000 || ano > 2100) continue;
    // A linha de valores mensais é a primeira, logo abaixo, com número na coluna C (índice 3).
    for (let j = i + 1; j <= i + 4 && j < linhas.length; j++) {
      const l = linhas[j];
      const meses = l.slice(3, 15).map((v) => (typeof v === "number" ? v : null));
      if (meses.some((v) => v !== null)) {
        const completos = meses.every((v) => v !== null);
        const anual = typeof l[15] === "number" ? (l[15] as number) : null;
        anos.push({ ano, mensalTCO2MWh: meses, anualTCO2MWh: completos ? anual : null });
        break;
      }
    }
  }
  if (anos.length === 0) throw new Error("Nenhum bloco anual reconhecido na planilha");
  anos.sort((a, b) => a.ano - b.ano);
  const ultimoCompleto = [...anos].reverse().find((a) => a.anualTCO2MWh !== null);
  if (!ultimoCompleto) throw new Error("Nenhum ano completo encontrado");

  const saida = {
    fonte: {
      nome: "MCTI/SIRENE — Fatores de emissão de CO2 do SIN (fator médio, inventários corporativos)",
      pagina: PAGINA,
      arquivo: URL_ARQUIVO,
      obtidoEm: new Date().toISOString().slice(0, 10),
      unidade: "tCO2/MWh",
      observacao:
        "A partir de 2025 o MCTI passou a considerar integralmente na base de cálculo os conjuntos de usinas renováveis conectados ao SIN; valores anteriores e posteriores não são diretamente comparáveis.",
    },
    padrao: { ano: ultimoCompleto.ano, fatorTCO2MWh: ultimoCompleto.anualTCO2MWh },
    anos,
  };
  const destino = join(process.cwd(), "src", "data", "fator-emissao.json");
  writeFileSync(destino, JSON.stringify(saida, null, 1) + "\n");
  console.log(`Anos: ${anos[0].ano}–${anos[anos.length - 1].ano}; padrão ${ultimoCompleto.ano} = ${ultimoCompleto.anualTCO2MWh} tCO2/MWh`);
}

main().catch((erro) => {
  console.error(erro);
  process.exit(1);
});
