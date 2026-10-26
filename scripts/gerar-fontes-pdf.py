"""
Gera as fontes do PDF da proposta (public/fontes/), reduzidas aos caracteres necessários:

- Noto Sans (OFL 1.1): latino básico e estendido, pontuação tipográfica, símbolos técnicos
  (≤ ≥ √ Σ Δ ₂ ° ·) — cobre pt, en, es, de, it, fr.
- Noto Sans SC (OFL 1.1): o conjunto acima + caracteres do dicionário chinês + nível 1 do
  GB2312 (3.755 ideogramas mais frequentes), para nomes digitados pelo usuário.

As fontes variáveis são instanciadas nos pesos 400 e 700 (fontTools.varLib.instancer).
Origem: https://github.com/google/fonts (ofl/notosans e ofl/notosanssc), baixadas em .cache/fontes.
Uso: scripts/referencia/.venv/Scripts/python scripts/gerar-fontes-pdf.py
"""
from pathlib import Path

from fontTools import subset
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

RAIZ = Path(__file__).resolve().parents[1]
ORIGEM = RAIZ / ".cache" / "fontes"
DESTINO = RAIZ / "public" / "fontes"

FAIXAS_LATINAS = [
    (0x20, 0x7E), (0xA0, 0x17F), (0x2010, 0x2027), (0x2030, 0x2030), (0x20AC, 0x20AC), (0x2122, 0x2122),
    (0x2190, 0x2193), (0x2212, 0x2212), (0x2248, 0x2248), (0x2264, 0x2265), (0x221A, 0x221A), (0x2080, 0x2089),
    (0x0394, 0x0394), (0x03A3, 0x03A3), (0x03B1, 0x03C9), (0x2219, 0x2219), (0x25CF, 0x25CF), (0x2605, 0x2605),
]


def latinos() -> set[int]:
    return {c for a, b in FAIXAS_LATINAS for c in range(a, b + 1)}


def gb2312_nivel1() -> set[int]:
    chars = set()
    for alto in range(0xB0, 0xD8):
        for baixo in range(0xA1, 0xFF):
            try:
                chars.add(ord(bytes([alto, baixo]).decode("gb2312")))
            except UnicodeDecodeError:
                pass
    return chars


def chinesas_dicionario() -> set[int]:
    caminho = RAIZ / "src" / "i18n" / "dicionarios" / "zh.ts"
    texto = caminho.read_text(encoding="utf-8") if caminho.exists() else ""
    return {ord(c) for c in texto if ord(c) > 0x2E7F}


def gerar(origem: str, nome: str, codigos: set[int], eixos_extra: dict) -> None:
    for peso in (400, 700):
        fonte = TTFont(ORIGEM / origem)
        fonte = instancer.instantiateVariableFont(fonte, {"wght": peso, **eixos_extra})
        opcoes = subset.Options()
        opcoes.layout_features = ["kern", "liga", "locl"]
        opcoes.name_IDs = ["*"]
        opcoes.notdef_outline = True
        s = subset.Subsetter(options=opcoes)
        s.populate(unicodes=sorted(codigos))
        s.subset(fonte)
        DESTINO.mkdir(parents=True, exist_ok=True)
        saida = DESTINO / f"{nome}-{peso}.ttf"
        fonte.save(saida)
        print(f"{saida.name}: {saida.stat().st_size / 1024:.0f} KiB")


def main():
    base = latinos()
    gerar("NotoSans.ttf", "noto-sans", base, {"wdth": 100})
    gerar("NotoSansSC.ttf", "noto-sans-sc", base | gb2312_nivel1() | chinesas_dicionario(), {})
    for licenca in ("OFL-NotoSans.txt", "OFL-NotoSansSC.txt"):
        (DESTINO / licenca).write_bytes((ORIGEM / licenca).read_bytes())


if __name__ == "__main__":
    main()
