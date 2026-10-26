"""
"Planilha" de referência independente para o teste de paridade do faturamento e do fluxo de caixa.

Implementa, em Python puro e sem compartilhar código com o núcleo TypeScript, a mesma leitura das
regras (REN ANEEL 1.000/2021, arts. 290, 291, 655-G, 655-I e 655-L; Lei 14.300/2022, arts. 26 e 27):
  - autoconsumo instantâneo horário = min(carga, geração);
  - energia compensada limitada ao consumo da rede e ao ponto em que a fatura iguala o custo de
    disponibilidade; injeção do mês usada antes dos créditos; créditos mais antigos primeiro;
  - créditos expiram 60 meses após o mês de origem;
  - fatura = max(custo de disponibilidade, não compensada × tarifa + compensada × tarifa SCEE).
Gera tests/fixtures/paridade-planilha.json. O teste TypeScript deve reproduzir os resultados.
"""
import json
import math
from pathlib import Path

from scipy.optimize import brentq

RAIZ = Path(__file__).resolve().parents[2]
DESTINO = RAIZ / "tests" / "fixtures" / "paridade-planilha.json"
DIAS_MES = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
FIO_B_PCT = {2023: 15, 2024: 30, 2025: 45, 2026: 60, 2027: 75, 2028: 90}


def series_horarias(escala_geracao):
    carga, geracao = [], []
    for m, dias in enumerate(DIAS_MES):
        sazonal = 1.0 + 0.25 * math.cos(2 * math.pi * m / 12)  # mais sol no verão austral
        for _ in range(dias):
            for h in range(24):
                carga.append(0.35 + 0.9 * math.exp(-((h - 19.5) ** 2) / 6.0) + 0.15 * math.exp(-((h - 12.0) ** 2) / 10.0))
                sol = max(0.0, math.sin(math.pi * (h + 0.5 - 6.0) / 12.0)) if 6 <= h < 18 else 0.0
                geracao.append(escala_geracao * sazonal * sol)
    return carga, geracao


def fio_b(ano):
    if ano < 2023:
        return 0.0
    return FIO_B_PCT.get(ano, 90) / 100.0


def tarifa_compensada(caso, ano, reajuste):
    if ano >= caso["anoArt17"]:
        return caso["fioB"] * reajuste  # cenário "Fio B a 100 %"
    if caso["categoria"] == "GD1":
        return 0.0
    return fio_b(ano) * caso["fioB"] * reajuste


def projetar(caso, carga, geracao):
    ft = 1.0 / (1.0 - (caso["icms"] + caso["pis"] + caso["cofins"]) / 100.0)
    lotes = []  # [mes_origem, kwh]
    anos = []
    expirados_total = 0.0
    for y in range(caso["horizonte"]):
        deg = (1 - caso["degPrimeiro"] / 100.0) * (1 - caso["degAnual"] / 100.0) ** y
        mensal = []
        inicio = 0
        for dias in DIAS_MES:
            fim = inicio + dias * 24
            c = sum(carga[inicio:fim])
            g = sum(v * deg for v in geracao[inicio:fim])
            a = sum(min(carga[i], geracao[i] * deg) for i in range(inicio, fim))
            mensal.append((c, g, a))
            inicio = fim
        reajuste = (1 + caso["reajuste"] / 100.0) ** y
        economia = 0.0
        expirados_ano = 0.0
        for k in range(12):
            absoluto = caso["mesInicio"] - 1 + y * 12 + k
            ano = caso["anoInicio"] + absoluto // 12
            mes = absoluto % 12
            indice = ano * 12 + mes
            c, g, a = mensal[mes]
            rede = c - a
            injetada = g - a
            tc = (caso["te"] + caso["tusd"]) * reajuste * ft
            tg = tarifa_compensada(caso, ano, reajuste) * ft
            cd = caso["dispKWh"] * tc
            # expiração
            novos = []
            for origem, kwh in lotes:
                if indice - origem >= 60:
                    expirados_ano += kwh
                else:
                    novos.append([origem, kwh])
            lotes = sorted(novos)
            saldo = sum(l[1] for l in lotes)
            limite = rede if tc <= tg else max(0.0, (rede * tc - cd) / (tc - tg))
            comp = min(rede, limite, injetada + saldo)
            da_injecao = min(comp, injetada)
            falta = comp - da_injecao
            for lote in lotes:
                uso = min(lote[1], falta)
                lote[1] -= uso
                falta -= uso
            lotes = [l for l in lotes if l[1] > 1e-9]
            if injetada - da_injecao > 1e-9:
                lotes.append([indice, injetada - da_injecao])
            fatura_com = max(cd, (rede - comp) * tc + comp * tg)
            fatura_sem = max(c, caso["dispKWh"]) * tc
            economia += fatura_sem - fatura_com
        expirados_total += expirados_ano
        anos.append({"economiaR": economia, "creditosExpiradosKWh": expirados_ano, "geracaoKWh": sum(x[1] for x in mensal)})
    return anos, expirados_total


def fluxo_a_vista(caso, anos):
    fluxos = [-caso["investimento"]]
    for i, a in enumerate(anos):
        om = caso["investimento"] * caso["omPct"] / 100.0 * (1 + caso["omReajuste"] / 100.0) ** i
        troca = caso["trocaCusto"] if (i + 1) == caso["trocaAno"] else 0.0
        fluxos.append(a["economiaR"] - om - troca)
    taxa = caso["taxaDesconto"] / 100.0
    vpl = sum(v / (1 + taxa) ** t for t, v in enumerate(fluxos))
    f = lambda r: sum(v / (1 + r) ** t for t, v in enumerate(fluxos))
    try:
        tir = brentq(f, -0.99, 10.0)
    except ValueError:
        tir = None

    def payback(valores):
        acumulado = 0.0
        for t, v in enumerate(valores):
            anterior = acumulado
            acumulado += v
            if t > 0 and anterior < 0 <= acumulado:
                return (t - 1) + (-anterior / v)
        return None

    return {
        "fluxos": fluxos,
        "vpl": vpl,
        "tir": tir,
        "payback": payback(fluxos),
        "paybackDescontado": payback([v / (1 + taxa) ** t for t, v in enumerate(fluxos)]),
    }


BASE = {
    "te": 0.31021, "tusd": 0.59308, "fioB": 0.268193, "icms": 18.0, "pis": 1.0, "cofins": 4.5,
    "dispKWh": 50, "anoInicio": 2026, "mesInicio": 11, "horizonte": 25, "degPrimeiro": 2.0, "degAnual": 0.5,
    "reajuste": 5.0, "investimento": 30000.0, "omPct": 1.0, "omReajuste": 4.0, "trocaAno": 12, "trocaCusto": 4500.0,
    "taxaDesconto": 10.0, "categoria": "GD2", "anoArt17": 2029,
}
CASOS = [
    {"nome": "GD II dimensionada", "escala": 1.6, **BASE},
    {"nome": "GD II sobredimensionada (créditos expiram)", "escala": 4.5, **BASE},
    {"nome": "GD I (protocolo até 07/01/2023)", "escala": 1.6, **{**BASE, "categoria": "GD1", "anoArt17": 2046}},
]


def main():
    saida = {"descricao": __doc__.strip().splitlines()[0], "casos": []}
    for caso in CASOS:
        carga, geracao = series_horarias(caso["escala"])
        anos, expirados = projetar(caso, carga, geracao)
        saida["casos"].append({
            "nome": caso["nome"],
            "parametros": {k: v for k, v in caso.items() if k != "nome"},
            "cargaHorariaKWh": [round(v, 9) for v in carga],
            "geracaoHorariaKWh": [round(v, 9) for v in geracao],
            "anos": anos,
            "creditosExpiradosTotalKWh": expirados,
            "aVista": fluxo_a_vista(caso, anos),
        })
    DESTINO.parent.mkdir(parents=True, exist_ok=True)
    DESTINO.write_text(json.dumps(saida, ensure_ascii=False, allow_nan=False), encoding="utf-8")
    for c in saida["casos"]:
        print(c["nome"], "| VPL", round(c["aVista"]["vpl"], 2), "| expirados", round(c["creditosExpiradosTotalKWh"], 1))


if __name__ == "__main__":
    main()
