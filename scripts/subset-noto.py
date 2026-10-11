"""Cuts Noto Sans SC down to the characters this site actually uses.

The npm package ships the font as ~100 unicode-range slices per weight; the
page needs a few hundred characters. This writes one static WOFF2 per weight
(400, 500, 700) into src/fonts/, plus noto-sans-sc.chars.txt, the list of
characters they cover. tests/build.test.mjs fails when the built page uses a
Chinese character that is not in that list, so re-run this after adding copy:

    pip install fonttools brotli
    python scripts/subset-noto.py path/to/NotoSansSC[wght].ttf

The source is the Noto Sans SC variable font (SIL OFL 1.1), e.g.
https://github.com/google/fonts/tree/main/ofl/notosanssc, or on Windows
C:\\Windows\\Fonts\\NotoSansSC-VF.ttf (the default).
"""

import io
import re
import sys
from pathlib import Path

from fontTools import subset
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "src" / "fonts"
DEFAULT_SOURCE = Path("C:/Windows/Fonts/NotoSansSC-VF.ttf")
WEIGHTS = (400, 500, 700)

# Everything the copy can reach: the page shell, every view, screen and style
# (CSS content: strings), and the GitHub snapshot that gets pre-rendered.
SOURCES = ["index.html", "src/**/*.ts", "src/**/*.css", "public/data/github.json"]

# Kept whole, so punctuation and fullwidth forms never fall back mid-sentence.
# (Of U+FF00-FFEF only the fullwidth forms: halfwidth kana and hangul would
# add ~10% to every file for text this page never shows.)
RANGES = [(0x20, 0x7E), (0xA0, 0xFF), (0x2010, 0x2027), (0x3000, 0x303F), (0xFF00, 0xFF60), (0xFFE0, 0xFFEF)]


def used_codepoints() -> set[int]:
    found: set[int] = set()
    for pattern in SOURCES:
        for path in sorted(ROOT.glob(pattern)):
            text = path.read_text(encoding="utf-8")
            # JSON may store non-ASCII as \uXXXX escapes; decode them so they count
            text = re.sub(r"\\u([0-9a-fA-F]{4})", lambda m: chr(int(m.group(1), 16)), text)
            found.update(ord(c) for c in text if ord(c) >= 0xA0)
    return found


def main() -> None:
    source = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_SOURCE
    if not source.exists():
        sys.exit(f"font not found: {source}\nusage: python scripts/subset-noto.py path/to/NotoSansSC[wght].ttf")

    vf = TTFont(source)
    cmap = vf.getBestCmap()
    used = used_codepoints()
    wanted = used.union(*(range(a, b + 1) for a, b in RANGES))
    keep = sorted(c for c in wanted if c in cmap)
    # what the font lacks (emoji, subscripts): the browser falls back per glyph
    absent = sorted(c for c in used if c not in cmap)

    options = subset.Options()
    # the defaults plus the CJK half-width spacing that text-spacing-trim relies on
    options.layout_features = [*options.layout_features, "halt", "vhal", "palt", "vpal"]
    # keep the copyright and licence records (OFL) inside every file
    options.name_IDs = [0, 1, 2, 3, 4, 5, 6, 13, 14]
    subsetter = subset.Subsetter(options)
    subsetter.populate(unicodes=keep)
    subsetter.subset(vf)
    cut = io.BytesIO()
    vf.save(cut)

    OUT.mkdir(parents=True, exist_ok=True)
    for weight in WEIGHTS:
        font = TTFont(io.BytesIO(cut.getvalue()))
        static = instancer.instantiateVariableFont(font, {"wght": weight}, updateFontNames=True)
        static.flavor = "woff2"
        target = OUT / f"noto-sans-sc-{weight}.woff2"
        static.save(target)
        print(f"{target.relative_to(ROOT)}  {target.stat().st_size:,} B")

    # every character the files cover, minus ASCII, 50 to a line
    chars = "".join(chr(c) for c in keep if c > 0x7E)
    lines = [chars[i : i + 50] for i in range(0, len(chars), 50)]
    (OUT / "noto-sans-sc.chars.txt").write_text("\n".join(lines) + "\n", encoding="utf-8")
    cjk = sum(1 for c in keep if 0x3400 <= c <= 0x9FFF or 0xF900 <= c <= 0xFAFF)
    print(f"{len(keep)} code points ({cjk} ideographs) from {source.name}")
    if absent:
        print("not in the font (left to fallback fonts): " + " ".join(f"U+{c:04X}" for c in absent))


if __name__ == "__main__":
    main()
