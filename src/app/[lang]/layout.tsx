import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";
import "../globals.css";
import { Cabecalho } from "@/components/shared/cabecalho";
import { Provedores } from "@/components/shared/provedores";
import { Rodape } from "@/components/shared/rodape";
import { ehIdioma, IDIOMAS, LANG_HTML } from "@/i18n/config";
import { obterDicionario, secoes } from "@/i18n/servidor";
import { geistMono, geistSans } from "../fontes";

export const dynamicParams = false;

export function generateStaticParams() {
  return IDIOMAS.map((lang) => ({ lang }));
}

type Props = { children: React.ReactNode; params: Promise<{ lang: string }> };

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params;
  if (!ehIdioma(lang)) return {};
  const d = await obterDicionario(lang);
  return {
    title: { default: `${d.comum.marca} · ${d.comum.slogan}`, template: `%s · ${d.comum.marca}` },
    description: d.inicio.subtitulo,
    alternates: { languages: Object.fromEntries(IDIOMAS.map((i) => [LANG_HTML[i], `/${i}/`])) },
  };
}

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fbfaf7" },
    { media: "(prefers-color-scheme: dark)", color: "#151a24" },
  ],
};

export default async function LayoutIdioma({ children, params }: Props) {
  const { lang } = await params;
  if (!ehIdioma(lang)) notFound();
  const d = await obterDicionario(lang);
  return (
    <html lang={LANG_HTML[lang]} suppressHydrationWarning className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
      <body className="flex min-h-dvh flex-col bg-background text-foreground">
        <Provedores idioma={lang} textos={secoes(d, "comum")}>
          <a
            href="#conteudo"
            className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[100] focus:rounded-md focus:bg-primary focus:px-3 focus:py-2 focus:text-primary-foreground"
          >
            {d.comum.pularParaConteudo}
          </a>
          <Cabecalho />
          <main id="conteudo" tabIndex={-1} className="flex-1 outline-none">
            {children}
          </main>
          <Rodape />
        </Provedores>
      </body>
    </html>
  );
}
