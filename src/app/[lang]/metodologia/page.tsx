import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ValidacaoAoVivo } from "@/components/metodologia/validacao-ao-vivo";
import { CabecalhoPagina } from "@/components/shared/indicadores";
import config from "@/data/config-regulatoria.json";
import fatorEmissao from "@/data/fator-emissao.json";
import irradiacao from "@/data/irradiacao.json";
import licencas from "@/data/licencas.json";
import tarifas from "@/data/tarifas.json";
import fixtures from "../../../../tests/fixtures/pvlib-referencia.json";
import { LIMIARES_PADRAO } from "@/core/monitoramento/detectores";
import { SCHEMA_OS, VERSAO_OS } from "@/core/manutencao/ordens";
import { ProvedorIdioma } from "@/i18n/cliente";
import { ehIdioma, LOCALE_INTL, preencher } from "@/i18n/config";
import { obterDicionario, secoes } from "@/i18n/servidor";

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params;
  if (!ehIdioma(lang)) return {};
  const d = await obterDicionario(lang);
  return { title: d.metodologia.titulo, description: d.metodologia.descricao };
}

function Secao({ id, titulo, children }: { id: string; titulo: string; children: React.ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-t`} className="scroll-mt-20 space-y-3 border-t pt-8">
      <h2 id={`${id}-t`} className="text-xl font-semibold tracking-tight">{titulo}</h2>
      {children}
    </section>
  );
}

const Lista = ({ itens }: { itens: readonly string[] }) => (
  <ul className="list-disc space-y-1.5 pl-5 text-sm leading-relaxed">
    {itens.map((i) => (
      <li key={i}>{i}</li>
    ))}
  </ul>
);

export default async function Pagina({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  if (!ehIdioma(lang)) notFound();
  const d = await obterDicionario(lang);
  const t = d.metodologia;
  const data = (iso: string) => new Intl.DateTimeFormat(LOCALE_INTL[lang], { dateStyle: "medium", timeZone: "UTC" }).format(new Date(`${iso}T12:00:00Z`));
  const casosValidacao =
    fixtures.posicaoSolar.length + fixtures.irradianciaExtraterrestre.length + fixtures.erbs.length + fixtures.transposicao.length + fixtures.temperaturaRoss.length + fixtures.pvwattsCc.length + fixtures.pvwattsInversor.length + fixtures.haurwitz.length;
  const s = t.secoes;
  const ordemSecoes = Object.keys(s) as Array<keyof typeof s>;
  const L = LIMIARES_PADRAO;
  const limiares: Record<string, string> = {
    alarme: `${L.alarme.lacunaMaxDias} d`,
    inversorOffline: `${L.offline.fracaoEnergiaMax * 100} % · ${L.offline.minutosZeroMin} min`,
    perdaComunicacao: `${L.comunicacao.minutosMin} min`,
    stringDesligada: `${L.string.fatorTolerancia} · ${L.string.diasConfirmacao} d`,
    sombreamento: `${L.sombreamento.razaoMax} / ${L.sombreamento.razaoForaMin} · ${L.sombreamento.janelaDias} d`,
    sujidade: `${L.sujidade.perdaMinPct} % / ${L.sujidade.perdaSaidaPct} % · ${L.sujidade.multiplicadorRuido}σ`,
    clipping: `${L.clipping.perdaMinPct} % · ${L.clipping.janelaDias} d`,
    degradacaoAcelerada: `${L.degradacao.taxaMinPctAno} %/a · t ≤ ${L.degradacao.tMax}`,
    subdesempenhoInversor: `${L.subdesempenho.razaoMax} · ${L.subdesempenho.diasConfirmacao} d`,
  };

  const fontes = [
    { dado: t.fontes.irradiacao, fonte: `${irradiacao.fonte.nome} ${irradiacao.fonte.versaoApi ?? ""}`, url: "https://power.larc.nasa.gov/", periodo: (irradiacao.fonte.periodo ?? "").match(/\d{4}/g)?.join("–") ?? "", obtido: irradiacao.fonte.obtidoEm },
    { dado: t.fontes.tarifas, fonte: `${tarifas.fonte.nome} (${tarifas.fonte.licenca.split(" —")[0]})`, url: tarifas.fonte.url, periodo: tarifas.distribuidoras.map((x) => `${x.sigla}: ${x.vigencia.inicio}`).join(" · "), obtido: tarifas.fonte.obtidoEm },
    { dado: t.fontes.emissao, fonte: "MCTI/SIRENE", url: fatorEmissao.fonte.pagina, periodo: `${fatorEmissao.padrao.ano}: ${fatorEmissao.padrao.fatorTCO2MWh} tCO₂/MWh`, obtido: fatorEmissao.fonte.obtidoEm },
    { dado: t.fontes.coordenadas, fonte: "kelvins/municipios-brasileiros (MIT)", url: "https://github.com/kelvins/municipios-brasileiros", periodo: irradiacao.fonte.coordenadas.commit.slice(0, 7), obtido: irradiacao.fonte.obtidoEm },
    { dado: t.fontes.legislacao, fonte: "Planalto · ANEEL", url: config.fontes.lei14300.url, periodo: preencher(t.fontes.verificadoEm, { data: data(config.verificadoEm) }), obtido: config.verificadoEm },
  ];

  return (
    <ProvedorIdioma idioma={lang} textos={secoes(d, "metodologia", "monitoramento")}>
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-8 lg:grid-cols-[14rem_1fr]">
        <nav aria-label={t.indice} className="hidden lg:block">
          <div className="sticky top-20 space-y-1 text-sm">
            <p className="mb-2 font-medium">{t.indice}</p>
            {ordemSecoes.map((k) => (
              <a key={k} href={`#${k}`} className="block rounded px-2 py-1 text-muted-foreground hover:bg-muted hover:text-foreground">
                {s[k]}
              </a>
            ))}
            <a href="#licencas" className="block rounded px-2 py-1 text-muted-foreground hover:bg-muted hover:text-foreground">
              {d.comum.rodape.licencas}
            </a>
          </div>
        </nav>
        <article className="min-w-0 space-y-8">
          <CabecalhoPagina titulo={t.titulo} descricao={t.descricao} />

          <Secao id="arquitetura" titulo={s.arquitetura}>
            <p className="text-sm leading-relaxed">{t.arquitetura.texto}</p>
            <Lista itens={t.arquitetura.itens} />
          </Secao>

          <Secao id="fontes" titulo={s.fontes}>
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-left">
                  <tr>
                    {(["dado", "fonte", "periodo", "obtido"] as const).map((c) => (
                      <th key={c} scope="col" className="px-3 py-2 font-medium">{t.fontes.colunas[c]}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {fontes.map((fo) => (
                    <tr key={fo.dado} className="border-t align-top">
                      <td className="px-3 py-2">{fo.dado}</td>
                      <td className="px-3 py-2"><a href={fo.url} className="underline underline-offset-4" rel="noopener noreferrer">{fo.fonte}</a></td>
                      <td className="px-3 py-2 tabular-nums">{fo.periodo}</td>
                      <td className="px-3 py-2 tabular-nums">{data(fo.obtido)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Secao>

          <Secao id="solar" titulo={s.solar}>
            <dl className="grid gap-4 sm:grid-cols-2">
              {t.solar.itens.map((i) => (
                <div key={i.titulo} className="rounded-lg border bg-card p-3">
                  <dt className="font-medium">{i.titulo}</dt>
                  <dd className="mt-1 text-sm leading-relaxed text-muted-foreground">{i.texto}</dd>
                </div>
              ))}
            </dl>
            <p className="text-sm">{preencher(t.solar.validacao, { n: casosValidacao, versao: fixtures.gerador.versao })}</p>
            <p className="text-sm">{t.solar.pr}</p>
          </Secao>

          <Secao id="eletrica" titulo={s.eletrica}>
            <Lista itens={t.eletrica.itens} />
            <p className="text-sm text-muted-foreground">{t.eletrica.temperaturas}</p>
          </Secao>

          <Secao id="regulacao" titulo={s.regulacao}>
            <dl className="space-y-3">
              {t.regulacao.itens.map((i) => (
                <div key={i.titulo}>
                  <dt className="font-medium">{i.titulo}</dt>
                  <dd className="text-sm leading-relaxed text-muted-foreground">{i.texto}</dd>
                </div>
              ))}
            </dl>
            <p className="rounded-lg bg-atencao-suave/50 p-3 text-sm">{t.regulacao.interpretacao}</p>
            <p className="text-sm">{t.regulacao.pos2029}</p>
            <ul className="list-disc space-y-1 pl-5 text-xs text-muted-foreground" lang="pt-BR">
              {Object.values(config.fontes).map((fo) => (
                <li key={fo.url}><a href={fo.url} className="underline underline-offset-4" rel="noopener noreferrer">{fo.titulo}</a></li>
              ))}
            </ul>
          </Secao>

          <Secao id="financeiro" titulo={s.financeiro}>
            <Lista itens={t.financeiro.itens} />
            <p className="text-sm">{t.financeiro.paridade}</p>
          </Secao>

          <Secao id="monitoramento" titulo={s.monitoramento}>
            <Lista itens={t.monitoramento.itens} />
            <p className="font-mono text-xs leading-relaxed">{t.monitoramento.kpis}</p>
          </Secao>

          <Secao id="detectores" titulo={s.detectores}>
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-left">
                  <tr>
                    <th scope="col" className="px-3 py-2 font-medium">{t.detectores.colunas.tipo}</th>
                    <th scope="col" className="px-3 py-2 font-medium">{t.detectores.colunas.regra}</th>
                    <th scope="col" className="px-3 py-2 font-medium">{t.detectores.colunas.limiar}</th>
                  </tr>
                </thead>
                <tbody>
                  {(Object.keys(t.detectores.regras) as Array<keyof typeof t.detectores.regras>).map((k) => (
                    <tr key={k} className="border-t align-top">
                      <th scope="row" className="px-3 py-2 text-left font-normal">{d.monitoramento.tipos[k]}</th>
                      <td className="px-3 py-2">{t.detectores.regras[k]}</td>
                      <td className="px-3 py-2 font-mono text-xs whitespace-nowrap">{limiares[k]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Secao>

          <Secao id="validacao" titulo={s.validacao}>
            <p className="text-sm text-muted-foreground">{t.validacao.descricao}</p>
            <ValidacaoAoVivo />
          </Secao>

          <Secao id="limpeza" titulo={s.limpeza}>
            <p className="text-sm leading-relaxed">{t.limpeza.texto}</p>
          </Secao>

          <Secao id="cmms" titulo={s.cmms}>
            <p className="text-sm">{preencher(t.cmms.texto, { schema: SCHEMA_OS, versao: VERSAO_OS })}</p>
            <Lista itens={t.cmms.campos} />
            <p className="text-sm text-muted-foreground">{t.cmms.ciclo}</p>
          </Secao>

          <Secao id="scada" titulo={s.scada}>
            <p className="text-sm leading-relaxed">{t.scada.texto}</p>
            <p className="text-sm leading-relaxed text-muted-foreground">{t.scada.restricoes}</p>
          </Secao>

          <Secao id="premissas" titulo={s.premissas}>
            <Lista itens={t.premissas.itens} />
            <Lista itens={t.premissas.limitacoes} />
          </Secao>

          <Secao id="proximos" titulo={s.proximos}>
            <Lista itens={t.proximos.itens} />
          </Secao>

          <Secao id="licencas" titulo={d.comum.rodape.licencas}>
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-sm">
                <tbody>
                  {licencas.dependencias.filter((x) => x.escopo === "aplicacao").map((x) => (
                    <tr key={x.nome} className="border-t first:border-t-0">
                      <th scope="row" className="px-3 py-1.5 text-left font-mono text-xs font-normal">{x.nome}</th>
                      <td className="px-3 py-1.5 tabular-nums">{x.versao}</td>
                      <td className="px-3 py-1.5">{x.licenca}</td>
                    </tr>
                  ))}
                  {licencas.recursos.map((r) => (
                    <tr key={r.id} className="border-t align-top">
                      <th scope="row" className="px-3 py-1.5 text-left font-normal"><a href={r.fonte} className="underline underline-offset-4" rel="noopener noreferrer">{r.rotulo}</a></th>
                      <td className="px-3 py-1.5 text-muted-foreground">{t.recursos[r.id as keyof typeof t.recursos]}</td>
                      <td className="px-3 py-1.5">{r.licencaCurta}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Secao>
        </article>
      </div>
    </ProvedorIdioma>
  );
}
