import type { Metadata } from "next";
import "../globals.css";
import { geistMono, geistSans } from "../fontes";

export const metadata: Metadata = {
  title: "Irradiance Works",
  description: "Solar PV simulator and fleet monitoring · Simulador fotovoltaico e monitoramento de usinas.",
};

export default function LayoutRaiz({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
      <body className="min-h-dvh bg-background text-foreground">{children}</body>
    </html>
  );
}
