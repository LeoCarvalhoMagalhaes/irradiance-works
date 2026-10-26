# Licenças de terceiros

Gerado por `scripts/gerar-licencas.mjs` em 2026-10-26, a partir dos `package.json` instalados (licença declarada por cada pacote).
Dependências de desenvolvimento não são distribuídas no site publicado.

## Pacotes npm

| Pacote | Versão | Licença | Escopo |
|---|---|---|---|
| [@react-pdf/renderer](https://www.npmjs.com/package/@react-pdf/renderer) | 4.9.0 | MIT | aplicação |
| [class-variance-authority](https://www.npmjs.com/package/class-variance-authority) | 0.7.1 | Apache-2.0 | aplicação |
| [cn](https://www.npmjs.com/package/cn) | 0.5.0 | MIT | aplicação |
| [exceljs](https://www.npmjs.com/package/exceljs) | 4.4.0 | MIT | aplicação |
| [leaflet](https://www.npmjs.com/package/leaflet) | 1.9.4 | BSD-2-Clause | aplicação |
| [lucide-react](https://www.npmjs.com/package/lucide-react) | 1.61.0 | ISC | aplicação |
| [motion](https://www.npmjs.com/package/motion) | 14.6.0 | MIT | aplicação |
| [next](https://www.npmjs.com/package/next) | 16.4.3 | MIT | aplicação |
| [next-themes](https://www.npmjs.com/package/next-themes) | 0.4.6 | MIT | aplicação |
| [radix-ui](https://www.npmjs.com/package/radix-ui) | 1.8.1 | MIT | aplicação |
| [react](https://www.npmjs.com/package/react) | 19.3.0 | MIT | aplicação |
| [react-dom](https://www.npmjs.com/package/react-dom) | 19.3.0 | MIT | aplicação |
| [recharts](https://www.npmjs.com/package/recharts) | 3.8.0 | MIT | aplicação |
| [sonner](https://www.npmjs.com/package/sonner) | 2.0.8 | MIT | aplicação |
| [tw-animate-css](https://www.npmjs.com/package/tw-animate-css) | 1.4.0 | MIT | aplicação |
| [zod](https://www.npmjs.com/package/zod) | 4.6.7 | MIT | aplicação |
| [@axe-core/playwright](https://www.npmjs.com/package/@axe-core/playwright) | 4.14.0 | MPL-2.0 | desenvolvimento |
| [@playwright/test](https://www.npmjs.com/package/@playwright/test) | 1.64.1 | Apache-2.0 | desenvolvimento |
| [@tailwindcss/turbopack](https://www.npmjs.com/package/@tailwindcss/turbopack) | 4.3.3 | MIT | desenvolvimento |
| [@types/leaflet](https://www.npmjs.com/package/@types/leaflet) | 1.9.22 | MIT | desenvolvimento |
| [@types/node](https://www.npmjs.com/package/@types/node) | 24.19.2 | MIT | desenvolvimento |
| [@types/react](https://www.npmjs.com/package/@types/react) | 19.3.0 | MIT | desenvolvimento |
| [@types/react-dom](https://www.npmjs.com/package/@types/react-dom) | 19.3.0 | MIT | desenvolvimento |
| [eslint](https://www.npmjs.com/package/eslint) | 9.39.5 | MIT | desenvolvimento |
| [eslint-config-next](https://www.npmjs.com/package/eslint-config-next) | 16.4.3 | MIT | desenvolvimento |
| [jsdom](https://www.npmjs.com/package/jsdom) | 30.1.3 | MIT | desenvolvimento |
| [shadcn](https://www.npmjs.com/package/shadcn) | 4.22.1 | MIT | desenvolvimento |
| [tailwindcss](https://www.npmjs.com/package/tailwindcss) | 4.3.3 | MIT | desenvolvimento |
| [tsx](https://www.npmjs.com/package/tsx) | 4.23.15 | MIT | desenvolvimento |
| [typescript](https://www.npmjs.com/package/typescript) | 5.9.3 | Apache-2.0 | desenvolvimento |
| [vite](https://www.npmjs.com/package/vite) | 8.3.5 | MIT | desenvolvimento |
| [vitest](https://www.npmjs.com/package/vitest) | 5.0.5 | MIT | desenvolvimento |

## Dados, fontes tipográficas e outros recursos

| Recurso | Licença / termos | Uso |
|---|---|---|
| [NASA POWER (climatologia)](https://power.larc.nasa.gov/) | Dados abertos da NASA; citar NASA Langley Research Center (LaRC) POWER Project | src/data/irradiacao.json |
| [ANEEL — Dados Abertos (Componentes Tarifárias)](https://dadosabertos.aneel.gov.br/dataset/componentes-tarifarias) | ODbL 1.0 (o extrato src/data/tarifas.json também é ODbL) | src/data/tarifas.json |
| [MCTI/SIRENE — fatores de emissão do SIN](https://www.gov.br/mcti/pt-br/acompanhe-o-mcti/sirene/dados-e-ferramentas/fatores-de-emissao) | Dados públicos do Governo Federal (citar a fonte) | src/data/fator-emissao.json |
| [kelvins/municipios-brasileiros](https://github.com/kelvins/municipios-brasileiros) | MIT | coordenadas em src/data/irradiacao.json |
| [Noto Sans e Noto Sans SC (subconjuntos)](https://github.com/google/fonts) | SIL Open Font License 1.1 | public/fontes (PDF) |
| [Geist e Geist Mono (via next/font)](https://github.com/vercel/geist-font) | SIL Open Font License 1.1 | interface |
| [OpenStreetMap (blocos do mapa opcional)](https://www.openstreetmap.org/copyright) | ODbL 1.0 — atribuição obrigatória exibida no mapa; uso conforme a política de tiles | mapa da frota (sob demanda) |
| [pvlib-python (referência de validação, não distribuída)](https://github.com/pvlib/pvlib-python) | BSD-3-Clause | scripts/referencia → tests/fixtures |
| [fontTools (geração das fontes, não distribuída)](https://github.com/fonttools/fonttools) | MIT | scripts/gerar-fontes-pdf.py |
| [Textos legais (Planalto, ANEEL)](https://www.planalto.gov.br/) | Atos oficiais (domínio público, Lei 9.610/1998, art. 8º, IV) | citações em src/data/config-regulatoria.json |

Observações:

- `react-leaflet` não foi usado: sua licença (Hippocratic-2.1) não é permissiva. O mapa usa o Leaflet diretamente (BSD-2-Clause).
- `@axe-core/playwright` (MPL-2.0) é usado apenas nos testes, sem modificação, e não entra no pacote publicado.
- Nenhuma animação Lottie foi incluída: as confirmações usam Motion (MIT); assim não há arquivos com licença por item a verificar.
- Os textos das licenças OFL das fontes estão em `public/fontes/`.
