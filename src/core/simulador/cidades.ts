import irradiacao from "@/data/irradiacao.json";

export type Cidade = (typeof irradiacao.cidades)[number];

export const CIDADES: Cidade[] = irradiacao.cidades;
export const FONTE_IRRADIACAO = irradiacao.fonte;

export function cidadePorId(id: string): Cidade | undefined {
  return CIDADES.find((c) => c.id === id);
}

/** Distância ortodrômica (fórmula de haversine), em km. */
export function distanciaKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const r = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * r * Math.asin(Math.sqrt(a));
}

export function cidadeMaisProxima(latitude: number, longitude: number): { cidade: Cidade; distanciaKm: number } {
  let melhor = CIDADES[0];
  let menor = Infinity;
  for (const c of CIDADES) {
    const d = distanciaKm(latitude, longitude, c.latitude, c.longitude);
    if (d < menor) {
      menor = d;
      melhor = c;
    }
  }
  return { cidade: melhor, distanciaKm: menor };
}
