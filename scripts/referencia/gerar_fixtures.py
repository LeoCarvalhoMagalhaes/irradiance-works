"""
Gera fixtures de referência para os testes do núcleo TypeScript (src/core).

Referência independente: pvlib-python (BSD-3-Clause), versão fixada em requirements.txt.
Os testes em tests/unit comparam as funções do núcleo com estes valores dentro de
tolerâncias declaradas em cada teste.

Uso (a partir da raiz do projeto):
    python -m venv scripts/referencia/.venv
    scripts/referencia/.venv/Scripts/pip install -r scripts/referencia/requirements.txt   (Windows)
    scripts/referencia/.venv/Scripts/python scripts/referencia/gerar_fixtures.py
"""
import json
import math
from pathlib import Path

import numpy as np
import pandas as pd
import pvlib
from scipy.optimize import brentq

RAIZ = Path(__file__).resolve().parents[2]
DESTINO = RAIZ / "tests" / "fixtures" / "pvlib-referencia.json"

LOCAIS = [
    {"nome": "Sao Paulo", "lat": -23.55, "lon": -46.63, "alt": 760.0},
    {"nome": "Porto Alegre", "lat": -30.03, "lon": -51.23, "alt": 10.0},
    {"nome": "Manaus", "lat": -3.12, "lon": -60.02, "alt": 92.0},
    {"nome": "Fortaleza", "lat": -3.73, "lon": -38.52, "alt": 21.0},
]


def posicao_solar():
    casos = []
    instantes = pd.DatetimeIndex(
        [f"2025-{m:02d}-{d:02d} {h:02d}:{mi:02d}:00" for m in range(1, 13) for (d, h, mi) in ((7, 12, 0), (21, 15, 30), (14, 19, 45))],
        tz="UTC",
    )
    for local in LOCAIS:
        sp = pvlib.solarposition.get_solarposition(
            instantes, local["lat"], local["lon"], altitude=local["alt"], method="nrel_numpy"
        )
        for t, linha in sp.iterrows():
            casos.append(
                {
                    "instanteUtc": t.strftime("%Y-%m-%dT%H:%M:%SZ"),
                    "latitude": local["lat"],
                    "longitude": local["lon"],
                    "zenitalGraus": float(linha["zenith"]),
                    "azimuteGraus": float(linha["azimuth"]),
                }
            )
    return casos


def irradiancia_extraterrestre():
    dias = list(range(1, 366, 11))
    valores = pvlib.irradiance.get_extra_radiation(np.array(dias, dtype=float), method="spencer")
    return [{"diaDoAno": d, "wM2": float(v)} for d, v in zip(dias, valores)]


def erbs():
    casos = []
    for ghi in (0.0, 15.0, 120.0, 350.0, 600.0, 850.0, 1050.0):
        for zenite in (10.0, 35.0, 60.0, 80.0, 86.0, 88.0):
            for dia in (15, 172, 355):
                r = pvlib.irradiance.erbs(np.array([ghi]), np.array([zenite]), np.array([float(dia)]))
                casos.append(
                    {
                        "ghiWM2": ghi,
                        "zenitalGraus": zenite,
                        "diaDoAno": dia,
                        "dniWM2": float(r["dni"][0]),
                        "dhiWM2": float(r["dhi"][0]),
                        "kt": float(r["kt"][0]),
                    }
                )
    return casos


def transposicao():
    casos = []
    combinacoes_sol = [(20.0, 30.0), (45.0, 300.0), (60.0, 90.0), (75.0, 250.0), (30.0, 0.0), (50.0, 180.0)]
    planos = [(0.0, 0.0), (20.0, 0.0), (23.0, 315.0), (35.0, 45.0), (10.0, 180.0), (90.0, 0.0)]
    for (zenite, azimute_sol) in combinacoes_sol:
        for (inclinacao, azimute_plano) in planos:
            for (ghi, dni, dhi, dia) in ((820.0, 760.0, 160.0, 30), (430.0, 250.0, 230.0, 200)):
                dni_extra = float(pvlib.irradiance.get_extra_radiation(float(dia), method="spencer"))
                for modelo in ("isotropic", "haydavies"):
                    r = pvlib.irradiance.get_total_irradiance(
                        inclinacao, azimute_plano, zenite, azimute_sol, dni, ghi, dhi,
                        dni_extra=dni_extra, albedo=0.2, model=modelo,
                    )
                    casos.append(
                        {
                            "modelo": modelo,
                            "inclinacaoGraus": inclinacao,
                            "azimutePlanoGraus": azimute_plano,
                            "zenitalGraus": zenite,
                            "azimuteSolGraus": azimute_sol,
                            "ghiWM2": ghi,
                            "dniWM2": dni,
                            "dhiWM2": dhi,
                            "dniExtraWM2": dni_extra,
                            "albedo": 0.2,
                            "poaGlobalWM2": float(r["poa_global"]),
                            "poaDiretaWM2": float(r["poa_direct"]),
                            "poaDifusaCeuWM2": float(r["poa_sky_diffuse"]),
                            "poaSoloWM2": float(r["poa_ground_diffuse"]),
                        }
                    )
    return casos


def temperatura_e_potencia():
    temperatura = []
    for poa in (0.0, 200.0, 650.0, 1000.0, 1150.0):
        for tar in (5.0, 22.0, 36.0):
            for noct in (43.0, 45.0, 47.0):
                tc = pvlib.temperature.ross(poa, tar, noct=noct)
                temperatura.append({"poaWM2": poa, "tempArC": tar, "noctC": noct, "tempCelulaC": float(tc)})
    cc = []
    for g in (0.0, 150.0, 500.0, 1000.0, 1100.0):
        for tc in (10.0, 25.0, 55.0, 70.0):
            for gamma in (-0.0029, -0.0035, -0.0040):
                p = pvlib.pvsystem.pvwatts_dc(g, tc, 5000.0, gamma)
                cc.append({"irradianciaWM2": g, "tempCelulaC": tc, "potenciaNominalW": 5000.0, "gamma": gamma, "potenciaCcW": float(p)})
    inversor = []
    for pdc in (0.0, 50.0, 400.0, 1500.0, 3000.0, 4800.0, 5200.0, 6500.0):
        for eta in (0.96, 0.975):
            pdc0 = 5000.0 / eta
            pac = pvlib.inverter.pvwatts(np.array([pdc]), pdc0, eta_inv_nom=eta)[0]
            inversor.append({"potenciaCcW": pdc, "potenciaCaNominalW": 5000.0, "etaNominal": eta, "potenciaCaW": float(pac)})
    haurwitz = []
    for z in (0.0, 20.0, 45.0, 70.0, 85.0, 89.0, 91.0):
        r = pvlib.clearsky.haurwitz(pd.Series([z]))
        haurwitz.append({"zenitalGraus": z, "ghiCeuClaroWM2": float(r["ghi"].iloc[0])})
    return temperatura, cc, inversor, haurwitz


def cadeia_horaria():
    """Ano horário completo com a cadeia do núcleo, para validação ponta a ponta.

    GHI = Haurwitz x fator diário determinístico; temperatura do ar senoidal. A série de entrada
    é gravada na fixture para que o teste TypeScript use exatamente os mesmos dados.
    """
    local = LOCAIS[0]
    tempos = pd.date_range("2025-01-01 00:30", "2025-12-31 23:30", freq="1h", tz="UTC")
    sp = pvlib.solarposition.get_solarposition(tempos, local["lat"], local["lon"], altitude=local["alt"], method="nrel_numpy")
    ceu = pvlib.clearsky.haurwitz(sp["zenith"])["ghi"]
    dia = np.array(tempos.day_of_year)
    fator = 0.55 + 0.4 * (0.5 + 0.5 * np.sin(dia * 2.399963))  # determinístico, entre 0,55 e 0,95
    ghi = (ceu.values * fator).round(3)
    hora_local = (np.array(tempos.hour) + local["lon"] / 15.0) % 24
    tar = (21.0 + 5.0 * np.sin((hora_local - 9.0) / 24.0 * 2 * np.pi)).round(3)

    inclinacao, azimute = 20.0, 0.0
    albedo, noct, gamma = 0.2, 45.0, -0.0035
    potencia_cc_w, potencia_ca_w, eta = 10000.0, 8000.0, 0.965
    perdas_cc = 0.97 * 0.98 * 0.985  # sujidade, mismatch, cabos CC (multiplicativo)

    ext = pvlib.irradiance.get_extra_radiation(tempos, method="spencer")
    dec = pvlib.irradiance.erbs(pd.Series(ghi, index=tempos), sp["zenith"], tempos)
    poa = pvlib.irradiance.get_total_irradiance(
        inclinacao, azimute, sp["zenith"], sp["azimuth"], dec["dni"], pd.Series(ghi, index=tempos), dec["dhi"],
        dni_extra=ext, albedo=albedo, model="haydavies",
    )
    tc = pvlib.temperature.ross(poa["poa_global"], pd.Series(tar, index=tempos), noct=noct)
    pdc = pvlib.pvsystem.pvwatts_dc(poa["poa_global"], tc, potencia_cc_w, gamma) * perdas_cc
    pac = pvlib.inverter.pvwatts(pdc.values, potencia_ca_w / eta, eta_inv_nom=eta)
    return {
        "local": local,
        "parametros": {
            "inclinacaoGraus": inclinacao, "azimuteGraus": azimute, "albedo": albedo, "noctC": noct, "gamma": gamma,
            "potenciaCcW": potencia_cc_w, "potenciaCaW": potencia_ca_w, "etaInversor": eta, "fatorPerdasCc": perdas_cc,
        },
        "entradas": {
            "inicioUtc": "2025-01-01T00:30:00Z",
            "ghiWM2": ghi.tolist(),
            "tempArC": tar.tolist(),
        },
        "resultado": {
            "irradiacaoPoaKWhM2": float(poa["poa_global"].sum() / 1000.0),
            "energiaCcKWh": float(pdc.sum() / 1000.0),
            "energiaCaKWh": float(pac.sum() / 1000.0),
            "energiaCaMensalKWh": [float(v) / 1000.0 for v in pd.Series(pac, index=tempos).groupby(tempos.month).sum()],
        },
    }


def financeiro():
    """Cálculos financeiros por implementação independente (Python puro + scipy)."""
    fluxos = [
        [-30000.0] + [5200.0 * (1.05 ** (t - 1)) * (0.995 ** (t - 1)) for t in range(1, 26)],
        [-10000.0, 3000.0, 3000.0, 3000.0, 3000.0],
        [-5000.0, 800.0, 800.0, 800.0],
    ]
    casos = []
    for f in fluxos:
        taxa = 0.08
        vpl = sum(v / (1 + taxa) ** t for t, v in enumerate(f))

        def npv(r):
            return sum(v / (1 + r) ** t for t, v in enumerate(f))

        try:
            tir = brentq(npv, -0.99, 10.0)
        except ValueError:
            tir = None
        acumulado, payback = 0.0, None
        for t, v in enumerate(f):
            anterior = acumulado
            acumulado += v
            if t > 0 and anterior < 0 <= acumulado:
                payback = (t - 1) + (-anterior / v)
                break
        acum_desc, payback_desc = 0.0, None
        for t, v in enumerate(f):
            vd = v / (1 + taxa) ** t
            anterior = acum_desc
            acum_desc += vd
            if t > 0 and anterior < 0 <= acum_desc:
                payback_desc = (t - 1) + (-anterior / vd)
                break
        casos.append({"fluxos": f, "taxaDesconto": taxa, "vpl": vpl, "tir": tir, "paybackAnos": payback, "paybackDescontadoAnos": payback_desc})

    price = []
    for (principal, taxa_mensal, n) in ((30000.0, 0.0149, 60), (50000.0, 0.0199, 96), (12000.0, 0.0, 24)):
        if taxa_mensal == 0:
            pmt = principal / n
        else:
            pmt = principal * taxa_mensal / (1 - (1 + taxa_mensal) ** (-n))
        saldo, juros_total = principal, 0.0
        for _ in range(n):
            juros = saldo * taxa_mensal
            juros_total += juros
            saldo -= pmt - juros
        price.append({"principal": principal, "taxaMensal": taxa_mensal, "meses": n, "parcela": pmt, "jurosTotais": juros_total})

    return {"fluxos": casos, "price": price}


def main():
    temperatura, cc, inversor, haurwitz = temperatura_e_potencia()
    saida = {
        "gerador": {
            "biblioteca": "pvlib-python",
            "versao": pvlib.__version__,
            "licenca": "BSD-3-Clause",
            "numpy": np.__version__,
            "pandas": pd.__version__,
        },
        "posicaoSolar": posicao_solar(),
        "irradianciaExtraterrestre": irradiancia_extraterrestre(),
        "erbs": erbs(),
        "transposicao": transposicao(),
        "temperaturaRoss": temperatura,
        "pvwattsCc": cc,
        "pvwattsInversor": inversor,
        "haurwitz": haurwitz,
        "cadeiaHoraria": cadeia_horaria(),
        "financeiro": financeiro(),
    }
    DESTINO.parent.mkdir(parents=True, exist_ok=True)
    DESTINO.write_text(json.dumps(saida, ensure_ascii=False, indent=1, allow_nan=False), encoding="utf-8")
    print(f"Fixtures gravadas em {DESTINO}")


if __name__ == "__main__":
    main()
