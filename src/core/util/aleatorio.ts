/**
 * Gerador pseudoaleatório determinístico. A mesma semente produz sempre a mesma sequência,
 * o que torna toda a simulação reproduzível (requisito do gerador sintético).
 */

/** Hash FNV-1a de 32 bits de uma string, usado para derivar sementes a partir de identificadores. */
export function hashTexto(texto: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < texto.length; i++) {
    h ^= texto.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** mulberry32: gerador de 32 bits com período 2^32, suficiente para séries sintéticas. */
export function criarAleatorio(semente: number | string): () => number {
  let estado = typeof semente === "string" ? hashTexto(semente) : semente >>> 0;
  return () => {
    estado = (estado + 0x6d2b79f5) >>> 0;
    let t = estado;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Normal padrão por Box-Muller a partir de um gerador uniforme. */
export function normal(aleatorio: () => number): number {
  let u = 0;
  while (u === 0) u = aleatorio();
  const v = aleatorio();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/**
 * Aproximação barata da normal padrão (soma de três uniformes, média 0, variância 1), usada no
 * ruído de medição de alta frequência, onde a forma exata da cauda é irrelevante.
 */
export function normalRapida(aleatorio: () => number): number {
  return (aleatorio() + aleatorio() + aleatorio() - 1.5) * 2;
}
