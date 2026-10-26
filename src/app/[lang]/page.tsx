import { ArrowRight, Calculator, ClipboardCheck, Radar } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import frota from "@/data/frota.json";
import irradiacao from "@/data/irradiacao.json";
import tarifas from "@/data/tarifas.json";
import { ehIdioma, IDIOMAS } from "@/i18n/config";
import { obterDicionario } from "@/i18n/servidor";

export default async function PaginaInicio({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  if (!ehIdioma(lang)) notFound();
  const d = await obterDicionario(lang);
  const t = d.inicio;
  const modulos = [
    { chave: "simulador", Icone: Calculator, href: `/${lang}/simulador/`, ...t.modulos.simulador },
    { chave: "monitoramento", Icone: Radar, href: `/${lang}/monitoramento/`, ...t.modulos.monitoramento },
    { chave: "manutencao", Icone: ClipboardCheck, href: `/${lang}/manutencao/`, ...t.modulos.manutencao },
  ];
  const numeros = [
    { valor: irradiacao.cidades.length, rotulo: t.numeros.cidades },
    { valor: tarifas.distribuidoras.length, rotulo: t.numeros.distribuidoras },
    { valor: frota.usinas.length, rotulo: t.numeros.usinas },
    { valor: IDIOMAS.length, rotulo: t.numeros.idiomas },
  ];
  return (
    <>
      <section className="relative overflow-hidden border-b">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(60rem_30rem_at_85%_-10%,var(--solar-suave),transparent_70%)]"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 opacity-[0.35] [background-image:linear-gradient(var(--border)_1px,transparent_1px),linear-gradient(90deg,var(--border)_1px,transparent_1px)] [background-size:48px_48px] [mask-image:radial-gradient(ellipse_at_top,black,transparent_75%)]"
        />
        <div className="relative mx-auto max-w-7xl px-4 py-16 sm:py-24">
          <p className="mb-4 inline-flex items-center rounded-full border bg-card px-3 py-1 text-xs font-medium text-muted-foreground">{d.comum.slogan}</p>
          <h1 className="max-w-3xl text-3xl font-semibold tracking-tight text-balance sm:text-5xl">{t.titulo}</h1>
          <p className="mt-5 max-w-2xl text-lg text-pretty text-muted-foreground">{t.subtitulo}</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild size="lg" className="h-10 px-4">
              <Link href={`/${lang}/simulador/`}>
                {t.ctaSimulador} <ArrowRight aria-hidden="true" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="h-10 px-4">
              <Link href={`/${lang}/monitoramento/`}>{t.ctaMonitoramento}</Link>
            </Button>
            <Button asChild size="lg" variant="ghost" className="h-10 px-4">
              <Link href={`/${lang}/metodologia/`}>{t.ctaMetodologia}</Link>
            </Button>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-14" aria-labelledby="modulos">
        <h2 id="modulos" className="text-xl font-semibold tracking-tight">
          {t.modulos.titulo}
        </h2>
        <div className="mt-6 grid gap-4 md:grid-cols-3">
          {modulos.map(({ chave, Icone, href, titulo, texto }) => (
            <Link key={chave} href={href} className="group rounded-xl focus-visible:outline-2">
              <Card className="h-full transition-shadow duration-200 group-hover:shadow-elevada">
                <CardHeader>
                  <span className="mb-2 inline-flex size-10 items-center justify-center rounded-lg bg-solar-suave text-solar-foreground">
                    <Icone aria-hidden="true" className="size-5" />
                  </span>
                  <CardTitle className="flex items-center gap-1">
                    {titulo}
                    <ArrowRight aria-hidden="true" className="size-4 opacity-0 transition-opacity group-hover:opacity-100" />
                  </CardTitle>
                  <CardDescription className="text-sm leading-relaxed">{texto}</CardDescription>
                </CardHeader>
              </Card>
            </Link>
          ))}
        </div>
      </section>

      <section className="border-y bg-muted/40" aria-labelledby="diferenciais">
        <div className="mx-auto max-w-7xl px-4 py-14">
          <h2 id="diferenciais" className="text-xl font-semibold tracking-tight">
            {t.diferenciais.titulo}
          </h2>
          <div className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {t.diferenciais.itens.map((item) => (
              <div key={item.titulo} className="space-y-2">
                <h3 className="font-medium">{item.titulo}</h3>
                <p className="text-sm leading-relaxed text-muted-foreground">{item.texto}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-14" aria-labelledby="numeros">
        <h2 id="numeros" className="text-xl font-semibold tracking-tight">
          {t.numeros.titulo}
        </h2>
        <dl className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-4">
          {numeros.map((n) => (
            // Um único <div> por par (o HTML só admite esse invólucro em <dl>); dt antes de dd no DOM,
            // número acima do rótulo na tela.
            <div key={n.rotulo} className="flex flex-col-reverse rounded-xl border bg-card px-5 py-5 text-card-foreground shadow-sm">
              <dt className="mt-1 text-sm text-muted-foreground">{n.rotulo}</dt>
              <dd className="text-3xl font-semibold tabular-nums">{n.valor}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-8 text-sm text-muted-foreground">{t.aviso}</p>
      </section>
    </>
  );
}
