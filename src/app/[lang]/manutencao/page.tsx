import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Manutencao } from "@/components/manutencao/manutencao";
import { CabecalhoPagina } from "@/components/shared/indicadores";
import { ProvedorIdioma } from "@/i18n/cliente";
import { ehIdioma } from "@/i18n/config";
import { obterDicionario, secoes } from "@/i18n/servidor";

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params;
  if (!ehIdioma(lang)) return {};
  const d = await obterDicionario(lang);
  return { title: d.manutencao.titulo, description: d.manutencao.descricao };
}

export default async function Pagina({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  if (!ehIdioma(lang)) notFound();
  const d = await obterDicionario(lang);
  return (
    <ProvedorIdioma idioma={lang} textos={secoes(d, "manutencao", "monitoramento")}>
      <div className="mx-auto max-w-7xl px-4 py-8">
        <CabecalhoPagina titulo={d.manutencao.titulo} descricao={d.manutencao.descricao} />
        <Manutencao />
      </div>
    </ProvedorIdioma>
  );
}
