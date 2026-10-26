import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Frota } from "@/components/monitoramento/frota";
import { CabecalhoPagina } from "@/components/shared/indicadores";
import { ProvedorIdioma } from "@/i18n/cliente";
import { ehIdioma } from "@/i18n/config";
import { obterDicionario, secoes } from "@/i18n/servidor";

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params;
  if (!ehIdioma(lang)) return {};
  const d = await obterDicionario(lang);
  return { title: d.monitoramento.titulo, description: d.monitoramento.descricao };
}

export default async function Pagina({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  if (!ehIdioma(lang)) notFound();
  const d = await obterDicionario(lang);
  return (
    <ProvedorIdioma idioma={lang} textos={secoes(d, "monitoramento")}>
      <div className="mx-auto max-w-7xl px-4 py-8">
        <CabecalhoPagina titulo={d.monitoramento.titulo} descricao={d.monitoramento.descricao}>
          <span className="inline-flex items-center rounded-full border border-dashed px-3 py-1 text-xs text-muted-foreground">{d.comum.dadosSinteticos}</span>
        </CabecalhoPagina>
        <Frota />
      </div>
    </ProvedorIdioma>
  );
}
