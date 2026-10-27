/**
 * Servidor estático mínimo para a exportação (pasta out/), usado nos testes de ponta a ponta e
 * na medição do Lighthouse. Reproduz o GitHub Pages: caminho base opcional, index.html em pastas
 * 404.html para rotas inexistentes e compressão gzip de textos (como o GitHub Pages).
 * Uso: node scripts/servir-estatico.mjs [porta] [caminhoBase]
 */
import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";
import { createGzip } from "node:zlib";

const porta = Number(process.argv[2] ?? 4173);
const base = process.argv[3] ?? "";
const raiz = join(process.cwd(), "out");
const tipos = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json",
  ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon", ".woff2": "font/woff2", ".ttf": "font/ttf",
  ".txt": "text/plain; charset=utf-8", ".webmanifest": "application/manifest+json",
};

createServer((req, res) => {
  let caminho = decodeURIComponent(new URL(req.url ?? "/", "http://x").pathname);
  if (base && caminho.startsWith(base)) caminho = caminho.slice(base.length) || "/";
  let arquivo = normalize(join(raiz, caminho));
  if (!arquivo.startsWith(raiz)) {
    res.writeHead(403).end();
    return;
  }
  if (existsSync(arquivo) && statSync(arquivo).isDirectory()) arquivo = join(arquivo, "index.html");
  let status = 200;
  if (!existsSync(arquivo)) {
    arquivo = join(raiz, "404.html");
    status = 404;
  }
  const tipo = tipos[extname(arquivo)] ?? "application/octet-stream";
  const comprimir = /gzip/.test(req.headers["accept-encoding"] ?? "") && /text|javascript|json|svg|manifest/.test(tipo);
  res.writeHead(status, { "Content-Type": tipo, ...(comprimir ? { "Content-Encoding": "gzip", Vary: "Accept-Encoding" } : {}) });
  const fluxo = createReadStream(arquivo);
  (comprimir ? fluxo.pipe(createGzip()) : fluxo).pipe(res);
}).listen(porta, () => console.log(`Servindo out/ em http://localhost:${porta}${base}/`));
