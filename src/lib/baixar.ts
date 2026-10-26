/** Dispara o download de um conteúdo gerado no navegador. */
export function baixar(conteudo: Blob | string, nomeArquivo: string, tipo = "text/plain;charset=utf-8") {
  const blob = typeof conteudo === "string" ? new Blob([conteudo], { type: tipo }) : conteudo;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nomeArquivo;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
