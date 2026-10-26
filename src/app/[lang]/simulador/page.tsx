import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { CabecalhoPagina } from "@/components/shared/indicadores";
import { EsqueletoPagina } from "@/components/shared/esqueleto-pagina";
import { Simulador } from "@/components/simulador/simulador";
import { ProvedorIdioma } from "@/i18n/cliente";
import { ehIdioma } from "@/i18n/config";
import { obterDicionario, secoes } from "@/i18n/servidor";

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params;
  if (!ehIdioma(lang)) return {};
  const d = await obterDicionario(lang);
  return { title: d.simulador.titulo, description: d.simulador.descricao };
}

export default async function Pagina({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  if (!ehIdioma(lang)) notFound();
  const d = await obterDicionario(lang);
  return (
    <ProvedorIdioma idioma={lang} textos={secoes(d, "simulador", "pdf")}>
      <div className="mx-auto max-w-7xl px-4 py-8">
        <CabecalhoPagina titulo={d.simulador.titulo} descricao={d.simulador.descricao} />
        {/* useSearchParams (?proposta=) exige Suspense na exportação estática. */}
        <Suspense fallback={<EsqueletoPagina />}>
          <Simulador />
        </Suspense>
      </div>
    </ProvedorIdioma>
  );
}
