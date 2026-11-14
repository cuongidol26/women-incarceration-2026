"""Builds a single self-contained HTML file (CSS, JS and CSV inlined) for previewing or submitting."""
import json, pathlib, sys
root = pathlib.Path(__file__).parent
html = (root / "index.html").read_text(encoding="utf-8")
css = (root / "css/style.css").read_text(encoding="utf-8")
js = (root / "js/main.js").read_text(encoding="utf-8")
csv = (root / "data/women_whole_pie_2026.csv").read_text(encoding="utf-8")
d3_src = sys.argv[2] if len(sys.argv) > 2 else None
html = html.replace('<link rel="stylesheet" href="css/style.css">', "<style>\n" + css + "\n</style>")
html = html.replace('<script src="js/main.js"></script>',
    "<script>window.INLINE_CSV = " + json.dumps(csv) + ";</script>\n  <script>\n" + js + "\n</script>")
if d3_src:  # local d3 for offline testing only
    html = html.replace('<script src="https://cdnjs.cloudflare.com/ajax/libs/d3/7.9.0/d3.min.js"></script>',
                        "<script>" + pathlib.Path(d3_src).read_text(encoding="utf-8") + "</script>")
out = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else root / "vis6_standalone.html")
out.write_text(html, encoding="utf-8")
print("wrote", out, len(html), "bytes")
