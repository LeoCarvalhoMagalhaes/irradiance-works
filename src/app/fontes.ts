import { Geist, Geist_Mono } from "next/font/google";

// Fontes auto-hospedadas no build (next/font): nenhuma requisição ao Google durante a navegação.
export const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin", "latin-ext"], display: "swap" });
export const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"], display: "swap" });
