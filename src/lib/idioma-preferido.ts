/**
 * Preferência de idioma no armazenamento local, em módulo próprio: é usada em todas as páginas e
 * não deve arrastar o estado da aplicação (e o núcleo de cálculo) para o pacote comum.
 */
export const CHAVE_IDIOMA = "irradiance-works:idioma";

export function lerIdiomaPreferido(): string | null {
  try {
    return window.localStorage.getItem(CHAVE_IDIOMA);
  } catch {
    return null;
  }
}

export function gravarIdiomaPreferido(idioma: string): void {
  try {
    window.localStorage.setItem(CHAVE_IDIOMA, idioma);
  } catch {
    // Preferência opcional.
  }
}
