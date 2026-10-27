"use client";

/**
 * Mapa da frota com Leaflet (BSD-2-Clause) e blocos do OpenStreetMap, carregado sob demanda.
 * Atribuição obrigatória exibida; marcadores vetoriais (sem imagens externas). Usinas na mesma
 * cidade são levemente espalhadas para continuarem visíveis.
 */
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { useEffect, useRef } from "react";

export type PontoMapa = { id: string; nome: string; latitude: number; longitude: number; status: "normal" | "atencao" | "critico" | "semDados"; rotuloStatus: string; href: string };

const CORES = { normal: "#2f7d4a", atencao: "#a86b00", critico: "#c0362c", semDados: "#5b6577" };

/**
 * `aoAbrir` recebe o href da usina e navega pelo roteador do Next, que acrescenta o caminho base do
 * GitHub Pages (window.location.assign não acrescenta e levaria a um 404).
 */
export default function MapaFrota({ pontos, atribuicao, aoAbrir }: { pontos: PontoMapa[]; atribuicao: string; aoAbrir: (href: string) => void }) {
  const elemento = useRef<HTMLDivElement>(null);
  // Ref para o mapa não ser recriado a cada renderização do pai.
  const abrir = useRef(aoAbrir);
  useEffect(() => {
    abrir.current = aoAbrir;
  }, [aoAbrir]);
  useEffect(() => {
    if (!elemento.current) return;
    const mapa = L.map(elemento.current, { scrollWheelZoom: false }).setView([-17, -48], 4);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 12,
      attribution: `<a href="https://www.openstreetmap.org/copyright">${atribuicao}</a>`,
    }).addTo(mapa);
    const contagem = new Map<string, number>();
    const limites: L.LatLngTuple[] = [];
    for (const p of pontos) {
      const chave = `${p.latitude}|${p.longitude}`;
      const n = contagem.get(chave) ?? 0;
      contagem.set(chave, n + 1);
      const angulo = n * 2.1;
      const pos: L.LatLngTuple = [p.latitude + 0.06 * n * Math.cos(angulo), p.longitude + 0.06 * n * Math.sin(angulo)];
      limites.push(pos);
      L.circleMarker(pos, { radius: 8, color: "#ffffff", weight: 2, fillColor: CORES[p.status], fillOpacity: 1 })
        .bindTooltip(`${p.nome} — ${p.rotuloStatus}`)
        .on("click", () => abrir.current(p.href))
        .addTo(mapa);
    }
    if (limites.length) mapa.fitBounds(limites, { padding: [24, 24] });
    return () => {
      mapa.remove();
    };
  }, [pontos, atribuicao]);
  return <div ref={elemento} className="h-[420px] w-full rounded-lg border" />;
}
