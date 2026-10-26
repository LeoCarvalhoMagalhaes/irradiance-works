import type { Metadata } from "next";
import "./globals.css";
import { IDIOMAS, LANG_HTML, NOME_IDIOMA } from "@/i18n/config";
import { geistSans } from "./fontes";

export const metadata: Metadata = {
  title: "404 · Irradiance Works",
  description: "Página não encontrada · Page not found",
};

/** 404 global multilíngue (há um layout raiz por idioma). */
export default function NaoEncontradoGlobal() {
  const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
  return (
    <html lang="pt-BR" className={`${geistSans.variable} antialiased`}>
      <body className="min-h-dvh bg-background text-foreground">
        <main className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center gap-4 px-4 py-12">
          <p className="font-mono text-sm text-muted-foreground">404</p>
          <h1 className="text-2xl font-semibold">Página não encontrada · Page not found</h1>
          <ul className="flex flex-wrap gap-2">
            {IDIOMAS.map((idioma) => (
              <li key={idioma}>
                <a href={`${base}/${idioma}/`} lang={LANG_HTML[idioma]} className="inline-block rounded-md border bg-card px-3 py-2 hover:bg-accent">
                  {NOME_IDIOMA[idioma]}
                </a>
              </li>
            ))}
          </ul>
        </main>
      </body>
    </html>
  );
}
