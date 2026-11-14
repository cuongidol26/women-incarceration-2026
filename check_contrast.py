"""WCAG 2.1 contrast check for every colour pairing in the chart.

Reads the slice palettes from js/main.js and the theme tokens from css/style.css,
so it always checks the colours actually used. Run: python check_contrast.py
  - text: needs 4.5:1 (WCAG 1.4.3, level AA)
  - slices, lines and focus ring against the page: need 3:1 (WCAG 1.4.11)
"""
import json, pathlib, re

HERE = pathlib.Path(__file__).parent
TEXT_LIGHT, TEXT_DARK = "#ffffff", "#121212"

def rgb(h):
    h = h.lstrip("#")
    return [int(h[i:i + 2], 16) for i in (0, 2, 4)]

def lum(h):
    f = lambda v: v / 12.92 if v <= 0.03928 else ((v + 0.055) / 1.055) ** 2.4
    r, g, b = [c / 255 for c in rgb(h)]
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)

def ratio(a, b):
    la, lb = lum(a), lum(b)
    return (max(la, lb) + 0.05) / (min(la, lb) + 0.05)

def tokens(theme):
    css = (HERE / "css/style.css").read_text()
    sel = r':root\[data-theme="light"\]' if theme == "light" else r':root,\s*:root\[data-theme="dark"\]'
    block = re.search(sel + r"\s*\{(.*?)\}", css, re.S).group(1)
    return dict(re.findall(r"--([\w-]+):\s*(#[0-9a-fA-F]{6})", block))

js = (HERE / "js/main.js").read_text()
palettes = json.loads(re.search(r"/\* PALETTES-START \*/(.*?)/\* PALETTES-END \*/", js, re.S).group(1))

failures = 0
def check(label, value, need):
    global failures
    ok = value >= need
    failures += not ok
    print(f"  {'PASS' if ok else 'FAIL'}  {value:5.2f}:1  (needs {need}:1)  {label}")

for theme in ("dark", "light"):
    t = tokens(theme)
    page = [t["bg-centre"], t["bg-mid"], t["bg-edge"]]
    print(f"\n=== {theme.upper()} theme ===")
    print(" Text inside slices (black or white, whichever contrasts more):")
    for system, shades in palettes[theme].items():
        for i, fill in enumerate(shades):
            text = TEXT_LIGHT if ratio(fill, TEXT_LIGHT) >= ratio(fill, TEXT_DARK) else TEXT_DARK
            check(f"{system} ring {i + 1} {fill} with {'white' if text == TEXT_LIGHT else 'black'} text", ratio(fill, text), 4.5)
    print(" Page text (worst case over the background gradient):")
    for name in ("text", "text-soft", "text-muted"):
        check(f"--{name} {t[name]}", min(ratio(t[name], bg) for bg in page), 4.5)
    check("tooltip text", ratio(t["tip-text"], t["tip-bg"]), 4.5)
    check("tooltip secondary text", ratio(t["tip-muted"], t["tip-bg"]), 4.5)
    check("switch, selected button", ratio(t["switch-on-text"], t["switch-on-bg"]), 4.5)
    print(" Lines and focus ring against the page:")
    for name in ("leader", "bracket", "focus", "switch-border"):
        check(f"--{name} {t[name]}", min(ratio(t[name], bg) for bg in page), 3)
    print(" Slices that touch the page (rings 2-3 and single-colour slices), against the page behind the circle edge:")
    for system, shades in palettes[theme].items():
        for i, fill in enumerate(shades):
            if len(shades) == 1 or i >= 1:
                check(f"{system} ring {i + 1} {fill}", ratio(fill, t["bg-mid"]), 3)

print(f"\n{'All checks passed.' if failures == 0 else str(failures) + ' check(s) failed.'}")
