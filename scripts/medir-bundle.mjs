/**
 * Mede o JavaScript e o CSS que cada rota carrega (scripts e folhas citados no index.html exportado),
 * em bytes brutos e gzip. Uso: node scripts/medir-bundle.mjs [pasta] (padrão: out)
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

const raiz = process.argv[2] ?? "out";
const rotas = ["pt", "pt/simulador", "pt/monitoramento", "pt/monitoramento/usina", "pt/manutencao", "pt/metodologia"];
const kib = (n) => `${(n / 1024).toFixed(0)} KiB`;

console.log("| Rota | JS (bruto) | JS (gzip) | CSS (gzip) |\n|---|---:|---:|---:|");
for (const rota of rotas) {
  const html = readFileSync(join(raiz, rota, "index.html"), "utf8");
  const arquivos = (re) => [...new Set([...html.matchAll(re)].map((m) => m[1].replace(/^.*?\/_next\//, "_next/")))];
  const medir = (lista) => lista.reduce((t, a) => { const b = readFileSync(join(raiz, a)); return { bruto: t.bruto + b.length, gzip: t.gzip + gzipSync(b).length }; }, { bruto: 0, gzip: 0 });
  const js = medir(arquivos(/<script[^>]+src="([^"]+\.js)"/g));
  const css = medir(arquivos(/<link[^>]+href="([^"]+\.css)"/g));
  console.log(`| /${rota}/ | ${kib(js.bruto)} | ${kib(js.gzip)} | ${kib(css.gzip)} |`);
}
