/**
 * Gera THIRD_PARTY_LICENSES.md e src/data/licencas.json a partir dos package.json das dependências
 * diretas instaladas (licença declarada pelo próprio pacote) e da lista de dados e recursos não-npm.
 * Uso: node scripts/gerar-licencas.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const raiz = process.cwd();
const pacote = JSON.parse(readFileSync(join(raiz, "package.json"), "utf8"));

const npm = (deps, escopo) =>
  Object.keys(deps ?? {})
    .sort()
    .map((nome) => {
      const meta = JSON.parse(readFileSync(join(raiz, "node_modules", nome, "package.json"), "utf8"));
      const repo = typeof meta.repository === "string" ? meta.repository : meta.repository?.url;
      return { nome, versao: meta.version, licenca: meta.license ?? "?", escopo, fonte: `https://www.npmjs.com/package/${nome}`, repositorio: repo?.replace(/^git\+/, "").replace(/\.git$/, "") ?? null };
    });

// id/rotulo/licencaCurta: exibidos na interface (a nota traduzida vem do dicionário, metodologia.recursos);
// nome/licenca/uso: texto em português do THIRD_PARTY_LICENSES.md.
const recursos = [
  { id: "nasa", rotulo: "NASA POWER", licencaCurta: "NASA Open Data", nome: "NASA POWER (climatologia)", licenca: "Dados abertos da NASA; citar NASA Langley Research Center (LaRC) POWER Project", fonte: "https://power.larc.nasa.gov/", uso: "src/data/irradiacao.json" },
  { id: "aneel", rotulo: "ANEEL — Dados Abertos", licencaCurta: "ODbL 1.0", nome: "ANEEL — Dados Abertos (Componentes Tarifárias)", licenca: "ODbL 1.0 (o extrato src/data/tarifas.json também é ODbL)", fonte: "https://dadosabertos.aneel.gov.br/dataset/componentes-tarifarias", uso: "src/data/tarifas.json" },
  { id: "mcti", rotulo: "MCTI/SIRENE", licencaCurta: "gov.br", nome: "MCTI/SIRENE — fatores de emissão do SIN", licenca: "Dados públicos do Governo Federal (citar a fonte)", fonte: "https://www.gov.br/mcti/pt-br/acompanhe-o-mcti/sirene/dados-e-ferramentas/fatores-de-emissao", uso: "src/data/fator-emissao.json" },
  { id: "municipios", rotulo: "kelvins/municipios-brasileiros", licencaCurta: "MIT", nome: "kelvins/municipios-brasileiros", licenca: "MIT", fonte: "https://github.com/kelvins/municipios-brasileiros", uso: "coordenadas em src/data/irradiacao.json" },
  { id: "noto", rotulo: "Noto Sans, Noto Sans SC", licencaCurta: "OFL 1.1", nome: "Noto Sans e Noto Sans SC (subconjuntos)", licenca: "SIL Open Font License 1.1", fonte: "https://github.com/google/fonts", uso: "public/fontes (PDF)" },
  { id: "geist", rotulo: "Geist, Geist Mono", licencaCurta: "OFL 1.1", nome: "Geist e Geist Mono (via next/font)", licenca: "SIL Open Font License 1.1", fonte: "https://github.com/vercel/geist-font", uso: "interface" },
  { id: "osm", rotulo: "OpenStreetMap", licencaCurta: "ODbL 1.0", nome: "OpenStreetMap (blocos do mapa opcional)", licenca: "ODbL 1.0 — atribuição obrigatória exibida no mapa; uso conforme a política de tiles", fonte: "https://www.openstreetmap.org/copyright", uso: "mapa da frota (sob demanda)" },
  { id: "pvlib", rotulo: "pvlib-python", licencaCurta: "BSD-3-Clause", nome: "pvlib-python (referência de validação, não distribuída)", licenca: "BSD-3-Clause", fonte: "https://github.com/pvlib/pvlib-python", uso: "scripts/referencia → tests/fixtures" },
  { id: "fonttools", rotulo: "fontTools", licencaCurta: "MIT", nome: "fontTools (geração das fontes, não distribuída)", licenca: "MIT", fonte: "https://github.com/fonttools/fonttools", uso: "scripts/gerar-fontes-pdf.py" },
  { id: "legislacao", rotulo: "Planalto, ANEEL", licencaCurta: "Lei 9.610/1998, art. 8º, IV", nome: "Textos legais (Planalto, ANEEL)", licenca: "Atos oficiais (domínio público, Lei 9.610/1998, art. 8º, IV)", fonte: "https://www.planalto.gov.br/", uso: "citações em src/data/config-regulatoria.json" },
];

const dados = {
  geradoEm: new Date().toISOString().slice(0, 10),
  dependencias: [...npm(pacote.dependencies, "aplicacao"), ...npm(pacote.devDependencies, "desenvolvimento")],
  recursos,
};
writeFileSync(join(raiz, "src", "data", "licencas.json"), JSON.stringify(dados, null, 1) + "\n");

const linhas = [
  "# Licenças de terceiros",
  "",
  `Gerado por \`scripts/gerar-licencas.mjs\` em ${dados.geradoEm}, a partir dos \`package.json\` instalados (licença declarada por cada pacote).`,
  "Dependências de desenvolvimento não são distribuídas no site publicado.",
  "",
  "## Pacotes npm",
  "",
  "| Pacote | Versão | Licença | Escopo |",
  "|---|---|---|---|",
  ...dados.dependencias.map((d) => `| [${d.nome}](${d.fonte}) | ${d.versao} | ${d.licenca} | ${d.escopo === "aplicacao" ? "aplicação" : "desenvolvimento"} |`),
  "",
  "## Dados, fontes tipográficas e outros recursos",
  "",
  "| Recurso | Licença / termos | Uso |",
  "|---|---|---|",
  ...recursos.map((r) => `| [${r.nome}](${r.fonte}) | ${r.licenca} | ${r.uso} |`),
  "",
  "Observações:",
  "",
  "- `react-leaflet` não foi usado: sua licença (Hippocratic-2.1) não é permissiva. O mapa usa o Leaflet diretamente (BSD-2-Clause).",
  "- `@axe-core/playwright` (MPL-2.0) é usado apenas nos testes, sem modificação, e não entra no pacote publicado.",
  "- Nenhuma animação Lottie foi incluída: as confirmações usam Motion (MIT); assim não há arquivos com licença por item a verificar.",
  "- Os textos das licenças OFL das fontes estão em `public/fontes/`.",
  "",
];
writeFileSync(join(raiz, "THIRD_PARTY_LICENSES.md"), linhas.join("\n"));
console.log(`${dados.dependencias.length} pacotes, ${recursos.length} recursos`);
