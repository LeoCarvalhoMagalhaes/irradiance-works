/**
 * Pós-build da exportação estática: o Next 16 grava os segmentos de prefetch em pastas
 * (out/en/simulador/__next.$d$lang/simulador/__PAGE__.txt), mas o roteador do cliente os pede com
 * pontos no lugar das barras (out/en/simulador/__next.$d$lang.simulador.__PAGE__.txt). Sem servidor
 * para reescrever URLs (GitHub Pages), cada navegação gera 404 no console. Este script grava a cópia
 * com o nome achatado ao lado da pasta original.
 * Uso: node scripts/achatar-segmentos.mjs [pasta] (padrão: out)
 */
import { copyFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

const raiz = process.argv[2] ?? "out";
let copias = 0;

function arquivos(pasta) {
  return readdirSync(pasta).flatMap((nome) => {
    const caminho = join(pasta, nome);
    return statSync(caminho).isDirectory() ? arquivos(caminho) : [caminho];
  });
}

function percorrer(pasta) {
  for (const nome of readdirSync(pasta)) {
    const caminho = join(pasta, nome);
    if (!statSync(caminho).isDirectory()) continue;
    if (nome.startsWith("__next.")) {
      for (const arquivo of arquivos(caminho)) {
        const achatado = join(pasta, [nome, ...relative(caminho, arquivo).split(sep)].join("."));
        copyFileSync(arquivo, achatado);
        copias++;
      }
    } else {
      percorrer(caminho);
    }
  }
}

percorrer(raiz);
console.log(`achatar-segmentos: ${copias} arquivo(s) copiado(s) em ${raiz}/`);
