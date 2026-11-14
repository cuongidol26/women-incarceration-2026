# Visualisation 6 redesign – How many women are locked up in the United States? (2026)

**Live demo:** https://cuongidol26.github.io/women-incarceration-2026/

Interactive D3 v7 version of Prison Policy Initiative's 2026 women's incarceration pie chart, for COS30045 Exercise 7.1. It keeps the look of the original (dark background, three rings, labels around the outside, small slices listed on the right) and adds zooming.

## How to use it

- Click a slice to zoom in. Clicking a detail slice (e.g. Murder) zooms into its group (Violent).
- Click the centre, click an empty area, or press **Esc** to go back one level.
- Hover any slice or any item in the right-hand list for a tooltip.
- Keyboard: Tab to a slice, Enter to zoom, Esc to go back.
- **Light / Dark** buttons (top right) switch the colour theme. The page starts in the visitor's system theme and follows it until a button is pressed.

## Run it

`index.html` loads `data/women_whole_pie_2026.csv` with `d3.csv`, so serve it over HTTP:

- VS Code: right-click `index.html` → **Open with Live Server**, or
- Terminal: `python -m http.server` in this folder, then open http://localhost:8000

`python build_standalone.py` creates `vis6_standalone.html`, a single file with CSS, JS and data inlined that opens with a double-click.

## Files

| File | What it does |
| --- | --- |
| `index.html` | Title, subtitle, chart container, source line |
| `css/style.css` | Dark styling, label styles, tooltip |
| `js/main.js` | All D3 code |
| `data/women_whole_pie_2026.csv` | Data: `id`, `parent`, `label` (tooltip name), `short` (on-chart name, `\|` = line break), `value` (leaves), `display` (published rounded total for groups), `note` |
| `build_standalone.py` | Creates the single-file version (`vis6_standalone.html`) |
| `check_contrast.py` | Checks every colour pairing against WCAG 2.1 AA (reads the colours from `main.js` and `style.css`) |

## How the D3 code works (js/main.js)

1. **Load** – `d3.csv()` reads the flat table.
2. **Hierarchy** – `d3.stratify()` links each row to its `parent`; `.sum()` adds leaf values up the tree. There is no `.sort()`, so slices keep the CSV order and go round the circle in the same order as the original.
3. **Layout** – `d3.partition()` gives each node an angle range (`x0`, `x1`) and a ring (`y0`, `y1`). Leaves are stretched to the outer ring so the chart is always a full circle.
4. **Scales** – `x` maps angles to the screen, starting at 9 o'clock; `y` maps rings to radii (inner pie, middle ring, outer ring).
5. **Zoom** – `zoomTo(node)` animates `x.domain()` to the clicked node's angle range, so it fills the circle, and moves `y` in by one ring when needed. A `tween` redraws the arcs on every frame.
6. **Labels** – inner and middle labels are measured (`getComputedTextLength`) and only drawn where they fit inside the slice. Outer labels sit outside the circle and are pushed apart if they overlap, with a leader line. Slices too thin to label are listed on the right with a bracket.
7. **Interaction** – hover highlights a slice and its parents and children and shows a tooltip; click, Enter and Esc zoom in and out.
8. **Themes** – `PALETTES` holds one set of slice colours per theme; `setTheme()` sets `data-theme` on `<html>` (CSS variables change the page colours) and recolours the slices with a short transition. `textOn()` computes the WCAG contrast ratio of a slice colour against white and black and uses whichever is higher for text inside that slice.

## Accessibility (WCAG 2.1 AA)

Run `python check_contrast.py` to verify. All 72 checks pass:

- **Text contrast ≥ 4.5:1 (1.4.3)** – every label inside a slice, all page text, tooltip and switch text, in both themes. Dark theme keeps the original's vivid colours with black text inside slices; light theme uses deeper shades with white text.
- **Non-text contrast ≥ 3:1 (1.4.11)** – slices that touch the page, leader lines, the bracket, the switch outline and the keyboard focus ring. Slices are also separated by white outlines.
- **Not colour alone (1.4.1)** – every slice is named by a text label, the side list or the tooltip.
- **Keyboard (2.1.1) and visible focus (2.4.7)** – slices, side-list items and the theme switch are reachable with Tab; the theme buttons report their state with `aria-pressed`.
- **Text size** – labels are at least 12.5px; on narrow screens the chart scrolls sideways instead of shrinking the text.
- **Motion** – animations are switched off when the system asks for reduced motion.

## Design decisions

| Weakness of the static original | What the interactive version does |
| --- | --- |
| Angle and area are hard to compare | Zooming gives any group the full circle, so its parts can be compared; tooltips give exact values and percentages |
| 50+ labels at once overload memory | The overview stays the same as the original, but each zoom level shows only one group's labels |
| Thin slices are unreadable | Thin slices are listed on the right, and clicking them zooms in |
| Static | Animated zoom, hover highlighting, tooltips, keyboard support, reduced-motion support |

## Data

All values are read from the 2026 chart in the report. Group totals (`display`) are the published rounded figures. Because Prison Policy Initiative rounds every number, leaves do not always add up exactly to their group (e.g. Local Jails leaves sum to 86,700, shown as 87,000).

Source: Wendy Sawyer and Brian Nam-Sonenstein, *Women's Mass Incarceration: The Whole Pie 2026*, Prison Policy Initiative. https://www.prisonpolicy.org/reports/pie2026women.html
