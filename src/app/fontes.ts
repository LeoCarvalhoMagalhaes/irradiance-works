import { Geist, Geist_Mono } from "next/font/google";

// Fontes auto-hospedadas no build (next/font): nenhuma requisição ao Google durante a navegação.
// display "optional": sem troca tardia de fonte (a troca virava o LCP no celular); na primeira visita
// lenta fica a fonte de reserva ajustada, e a Geist entra do cache nas seguintes.
export const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin", "latin-ext"], display: "optional" });
export const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"], display: "optional" });
