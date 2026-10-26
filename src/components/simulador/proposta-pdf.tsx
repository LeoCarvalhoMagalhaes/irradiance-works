/**
 * Proposta em PDF gerada no navegador (@react-pdf/renderer, MIT). Este módulo só é importado ao
 * clicar no botão, para não pesar o carregamento da página.
 */
import { Document, Font, Page, pdf, StyleSheet, Text, View } from "@react-pdf/renderer";
import type { Proposta } from "@/core/simulador/proposta";
import { type Idioma, preencher } from "@/i18n/config";
import type { Dicionario } from "@/i18n/tipos";
import { criarFormatadores } from "@/lib/formatacao";

type Textos = Pick<Dicionario, "simulador" | "pdf" | "comum">;

const registradas = new Set<string>();

/**
 * Fontes embutidas (servidas localmente, OFL 1.1): Noto Sans reduzida para os idiomas latinos (a
 * Helvetica padrão do PDF não tem ≤, ≥ nem CO₂) e Noto Sans SC reduzida para o chinês.
 */
function familia(idioma: Idioma): string {
  const nome = idioma === "zh" ? "NotoSansSC" : "NotoSans";
  if (!registradas.has(nome)) {
    const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
    const arquivo = idioma === "zh" ? "noto-sans-sc" : "noto-sans";
    Font.register({
      family: nome,
      fonts: [
        { src: `${base}/fontes/${arquivo}-400.ttf`, fontWeight: 400 },
        { src: `${base}/fontes/${arquivo}-700.ttf`, fontWeight: 700 },
      ],
    });
    // Ideogramas podem quebrar em qualquer caractere; nos demais idiomas, sem hifenização automática.
    Font.registerHyphenationCallback((palavra) => (idioma === "zh" ? Array.from(palavra) : [palavra]));
    registradas.add(nome);
  }
  return nome;
}

const cores = { tinta: "#1f2a3d", suave: "#5b6577", borda: "#d9dee7", solar: "#e5892a", fundo: "#f5f3ee" };

function criarEstilos(fonte: string) {
  return StyleSheet.create({
    pagina: { fontFamily: fonte, fontSize: 9, color: cores.tinta, paddingTop: 36, paddingBottom: 54, paddingHorizontal: 40, lineHeight: 1.35 },
    marca: { fontSize: 9, color: cores.suave, marginBottom: 4 },
    titulo: { fontSize: 18, fontWeight: 700, marginBottom: 2 },
    faixa: { height: 3, backgroundColor: cores.solar, width: 60, marginBottom: 12 },
    secao: { fontSize: 11, fontWeight: 700, marginTop: 14, marginBottom: 6 },
    linha: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: cores.borda, paddingVertical: 3 },
    rotulo: { flex: 1.4, color: cores.suave },
    valor: { flex: 1, textAlign: "right" },
    grade: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
    cartao: { width: "31.8%", backgroundColor: cores.fundo, padding: 7, borderRadius: 3 },
    cartaoRotulo: { fontSize: 7.5, color: cores.suave },
    cartaoValor: { fontSize: 12, fontWeight: 700, marginTop: 2 },
    cabecalhoTabela: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: cores.tinta, paddingBottom: 3, fontWeight: 700 },
    celula: { flex: 1, textAlign: "right" },
    celulaTexto: { flex: 2.2 },
    aviso: { marginTop: 16, padding: 8, borderWidth: 1, borderColor: cores.solar, fontWeight: 700 },
    rodape: { position: "absolute", bottom: 24, left: 40, right: 40, flexDirection: "row", justifyContent: "space-between", fontSize: 7.5, color: cores.suave },
  });
}

function DocumentoProposta({ p, t, idioma }: { p: Proposta; t: Textos; idioma: Idioma }) {
  const f = criarFormatadores(idioma);
  const s = criarEstilos(familia(idioma));
  const tr = t.simulador.resultado;
  const aVista = p.financeiro.cenarios[0];
  const linha = (rotulo: string, valor: string) => (
    <View style={s.linha} key={rotulo}>
      <Text style={s.rotulo}>{rotulo}</Text>
      <Text style={s.valor}>{valor}</Text>
    </View>
  );
  const anos = (v: number | null, desembolso: number) => (desembolso <= 0 ? "—" : v === null ? tr.financeiro.naoAtinge : preencher(tr.financeiro.anos, { valor: f.anos(v) }));
  const tir = (c: (typeof p.financeiro.cenarios)[number]) => (c.tir.situacao === "unica" ? f.pct(c.tir.tir * 100) : c.tir.situacao === "multiplas" ? tr.financeiro.tirMultiplas : tr.financeiro.tirNenhuma);
  const kpis: Array<[string, string]> = [
    [tr.kpis.potencia, f.potenciaKWp(p.arranjo.potenciaCcKWp)],
    [tr.kpis.energiaAnual, f.energia(p.projecao.anos[0].geracaoKWh)],
    [tr.kpis.pr, f.numero(p.simulacao.performanceRatio, 3)],
    [tr.kpis.coberturaValor, f.pct(p.dimensionamento.coberturaAlcancadaValorPct)],
    [tr.kpis.investimento, f.moedaInteira(p.financeiro.investimentoR)],
    [tr.kpis.payback, anos(aVista.paybackAnos, aVista.desembolsoInicialR)],
  ];
  const pr = p.entrada.premissas;
  return (
    <Document title={`${t.pdf.titulo} — ${p.entrada.cliente || p.cidade.nome}`} author={t.comum.marca} language={idioma}>
      <Page size="A4" style={s.pagina}>
        <Text style={s.marca}>{t.comum.marca}</Text>
        <Text style={s.titulo}>{t.pdf.titulo}</Text>
        <View style={s.faixa} />
        <Text>{preencher(t.pdf.gerado, { data: f.dataLonga(new Date().toISOString().slice(0, 10)) })}</Text>
        {linha(t.pdf.cliente, p.entrada.cliente || "—")}
        {linha(t.pdf.local, `${p.cidade.nome}/${p.cidade.uf} (${f.numero(p.cidade.latitude, 2)}°, ${f.numero(p.cidade.longitude, 2)}°)`)}

        <Text style={s.secao}>{t.pdf.resumo}</Text>
        <View style={s.grade}>
          {kpis.map(([r, v]) => (
            <View style={s.cartao} key={r}>
              <Text style={s.cartaoRotulo}>{r}</Text>
              <Text style={s.cartaoValor}>{v}</Text>
            </View>
          ))}
        </View>
        {linha(tr.kpis.enquadramento, `${tr.portes[p.enquadramento.porte]}${p.enquadramento.categoria ? ` · ${tr.categorias[p.enquadramento.categoria]}` : ""}`)}

        <Text style={s.secao}>{t.pdf.equipamentos}</Text>
        {linha(t.simulador.instalacao.modulo, `${p.modulo.nome || p.modulo.id} · ${p.modulo.potenciaWp} Wp`)}
        {linha(t.simulador.instalacao.inversor, `${p.inversor.nome || p.inversor.id} · ${f.potenciaKW(p.inversor.potenciaCaW / 1000)}`)}
        <Text style={{ color: cores.suave, fontSize: 7.5 }}>{t.simulador.instalacao.equipamentoGenerico}</Text>

        <Text style={s.secao}>{t.pdf.arranjo}</Text>
        {p.arranjo.configuracao &&
          linha(
            tr.kpis.potencia,
            preencher(tr.eletrica.configuracao, { inv: p.arranjo.configuracao.quantidadeInversores, ns: p.arranjo.configuracao.modulosEmSerie, strings: p.arranjo.configuracao.stringsPorMppt.join(" / ") }),
          )}
        {linha(t.simulador.instalacao.inclinacao, `${f.numero(p.entrada.instalacao.inclinacaoGraus)}°`)}
        {linha(t.simulador.instalacao.azimute, `${f.numero(p.entrada.instalacao.azimuteGraus)}°`)}

        <Text style={s.secao}>{t.pdf.verificacoes}</Text>
        {p.verificacoes.map((v) =>
          linha(tr.eletrica.codigos[v.codigo], `${f.numero(v.valor, v.unidade ? 1 : 2)} ${v.unidade} ${v.comparador === "<=" ? "≤" : "≥"} ${f.numero(v.limite, v.unidade ? 1 : 2)} ${v.unidade} · ${v.aprovado ? tr.eletrica.aprovado : v.tipo === "aviso" ? tr.eletrica.aviso : tr.eletrica.reprovado}`),
        )}
        <View style={s.rodape} fixed>
          <Text>{t.comum.marca}</Text>
          <Text render={({ pageNumber, totalPages }) => preencher(t.pdf.pagina, { n: pageNumber, total: totalPages })} />
        </View>
      </Page>

      <Page size="A4" style={s.pagina}>
        <Text style={s.secao}>{t.pdf.geracaoMensal}</Text>
        <View style={s.cabecalhoTabela}>
          <Text style={s.celulaTexto}>{tr.geracao.mes}</Text>
          <Text style={s.celula}>{tr.geracao.geracao}</Text>
          <Text style={s.celula}>{tr.geracao.consumo}</Text>
          <Text style={s.celula}>{tr.fatura.sem}</Text>
          <Text style={s.celula}>{tr.fatura.com}</Text>
        </View>
        {p.projecao.meses.slice(0, 12).map((m) => (
          <View style={s.linha} key={`${m.ano}-${m.mes}`}>
            <Text style={s.celulaTexto}>{`${f.mes(m.mes - 1)} ${m.ano}`}</Text>
            <Text style={s.celula}>{f.energia(m.geracaoKWh)}</Text>
            <Text style={s.celula}>{f.energia(m.consumoKWh)}</Text>
            <Text style={s.celula}>{f.moeda(m.faturaSemR)}</Text>
            <Text style={s.celula}>{f.moeda(m.faturaComR)}</Text>
          </View>
        ))}

        <Text style={s.secao}>{t.pdf.financeiro}</Text>
        <View style={s.cabecalhoTabela}>
          <Text style={s.celulaTexto}> </Text>
          {p.financeiro.cenarios.map((c) => (
            <Text style={s.celula} key={c.codigo}>
              {tr.financeiro.cenarios[c.codigo]}
            </Text>
          ))}
        </View>
        {(
          [
            [tr.financeiro.desembolso, (c) => f.moedaInteira(c.desembolsoInicialR)],
            [tr.financeiro.vpl, (c) => f.moedaInteira(c.vplR)],
            [tr.financeiro.tir, tir],
            [tr.financeiro.payback, (c) => anos(c.paybackAnos, c.desembolsoInicialR)],
            [tr.financeiro.economia, (c) => f.moedaInteira(c.economiaAcumuladaR)],
          ] as Array<[string, (c: (typeof p.financeiro.cenarios)[number]) => string]>
        ).map(([r, fn]) => (
          <View style={s.linha} key={r}>
            <Text style={s.celulaTexto}>{r}</Text>
            {p.financeiro.cenarios.map((c) => (
              <Text style={s.celula} key={c.codigo}>
                {fn(c)}
              </Text>
            ))}
          </View>
        ))}

        <Text style={s.secao}>{t.pdf.premissas}</Text>
        {linha(tr.premissas.campos.custoRWp, f.moeda(pr.financeiras.custoRWp))}
        {linha(tr.premissas.campos.taxaDescontoAnualPct, f.pct(pr.financeiras.taxaDescontoAnualPct))}
        {linha(tr.premissas.campos.reajusteTarifaAnualPct, f.pct(pr.financeiras.reajusteTarifaAnualPct))}
        {linha(tr.premissas.campos.degradacaoAnualPct, f.pct(pr.tecnicas.degradacaoAnualPct, 2))}
        {linha(tr.premissas.campos.sujidadePct, f.pct(pr.tecnicas.sujidadePct))}
        {linha(t.simulador.consumo.tributos, `ICMS ${f.pct(p.entrada.tributos.icmsPct)} · PIS ${f.pct(p.entrada.tributos.pisPct)} · COFINS ${f.pct(p.entrada.tributos.cofinsPct)}`)}
        {linha(tr.premissas.campos.cenarioPos2029, preencher(tr.cenarios.nomes[pr.regulatorias.cenarioPos2029], { pct: pr.regulatorias.beneficioPctTusd }))}
        {p.fonteTarifa && <Text style={{ color: cores.suave, fontSize: 7.5, marginTop: 3 }}>{`${p.fonteTarifa.distribuidora} · ${p.fonteTarifa.resolucao}`}</Text>}

        <Text style={s.secao}>{t.pdf.limitacoes}</Text>
        <Text>{t.pdf.limitacoesTexto}</Text>
        <Text style={s.aviso}>{t.pdf.aviso}</Text>
        <View style={s.rodape} fixed>
          <Text>{t.comum.marca}</Text>
          <Text render={({ pageNumber, totalPages }) => preencher(t.pdf.pagina, { n: pageNumber, total: totalPages })} />
        </View>
      </Page>
    </Document>
  );
}

export async function gerarPdf(p: Proposta, t: Textos, idioma: Idioma): Promise<Blob> {
  return pdf(<DocumentoProposta p={p} t={t} idioma={idioma} />).toBlob();
}
