/*
 * COS30045 Exercise 7.1 – Interactive redesign of Visualisation 6
 * "How many women are locked up in the United States?" (Prison Policy Initiative, 2026)
 *
 * D3 concepts used:
 *  - d3.csv / d3.csvParse     load the data
 *  - d3.stratify              turn flat id/parent rows into a hierarchy
 *  - d3.partition             give every node an angle range (x0, x1) and a ring (y0, y1)
 *  - d3.scaleLinear           map angles and rings to the screen; changing their domains = zooming
 *  - d3.arc                   draw each slice
 *  - transitions + tween      animate the zoom
 *  - events                   hover (tooltip + highlight), click / keyboard (zoom in and out)
 */
(function () {
  "use strict";

  /* ---------- Settings ---------- */
  const DATA_URL = "data/women_whole_pie_2026.csv";
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const DURATION = reduceMotion ? 0 : 800;

  const W = 1180, H = 770;          // SVG viewBox
  const CX = 440, CY = 375;         // centre of the circle
  const R = 292;                    // outer radius
  const R1 = R * 0.64;              // edge of the inner pie (systems)
  const R2 = R * 0.87;              // edge of the middle ring
  const START = -Math.PI / 2;       // start at 9 o'clock, as in the original

  const SMALL_ANGLE = 0.15;         // inner slices narrower than this are listed on the right
  const MIN_OUTER_ANGLE = 0.004;    // outer slices narrower than this get no label (tooltip only)
  const LINE = 16.5;                // line height of outer labels

  // One hue per system; inner, middle and outer ring shades.
  // Dark theme: the original's vivid colours (dark text inside slices).
  // Light theme: deeper shades so every slice keeps 3:1 contrast with the light page (white text inside).
  // Checked with check_contrast.py: all text >= 4.5:1, all slices against the page >= 3:1.
  const PALETTES = /* PALETTES-START */ {
    "dark": {
      "jails": ["#d4782e", "#eb8a36", "#eda13e"],
      "state": ["#4a8e7b", "#5db49a", "#67cda5"],
      "federal": ["#ae8a40", "#d3a74b", "#f1c559"],
      "immig": ["#a64e4a", "#c98282", "#d9a0a0"],
      "youth": ["#8b86c9", "#a8a4e2", "#c2bff0"],
      "indian": ["#e0566f"],
      "commit": ["#6f7df0"],
      "territorial": ["#8cc152"],
      "military": ["#b8b8b8"]
    },
    "light": {
      "jails": ["#7d4414", "#9d5419", "#ca6d21"],
      "state": ["#255c49", "#2f735c", "#3c9477"],
      "federal": ["#65501d", "#7e6425", "#a3802f"],
      "immig": ["#8a3934", "#ac4641", "#c56c67"],
      "youth": ["#4d44a7", "#625abb", "#827cca"],
      "indian": ["#ce2743"],
      "commit": ["#475deb"],
      "territorial": ["#4a772a"],
      "military": ["#6d6d6d"]
    }
  } /* PALETTES-END */;

  const TEXT_LIGHT = "#ffffff";
  const TEXT_DARK = "#121212";

  /* ---------- Helpers ---------- */
  const fmt = d3.format(",");
  const share = v => (v < 0.01 ? d3.format(".1%")(v) : d3.format(".0%")(v));
  const lowerFirst = s => (/^[A-Z][a-z]/.test(s) ? s[0].toLowerCase() + s.slice(1) : s);
  const shown = d => (d.data.display != null ? d.data.display : d.value);   // published (rounded) total if given
  const valueText = d => fmt(shown(d));
  const nameLines = d => d.data.short.split("|");

  // WCAG relative luminance and contrast ratio
  function luminance(colour) {
    const c = d3.rgb(colour);
    const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
  }
  function contrast(a, b) {
    const la = luminance(a), lb = luminance(b);
    return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
  }
  // Pick whichever text colour contrasts more with the slice (always at least 4.5:1 for these palettes)
  const textOn = fill => (contrast(fill, TEXT_LIGHT) >= contrast(fill, TEXT_DARK) ? TEXT_LIGHT : TEXT_DARK);

  /* ---------- Theme ---------- */
  const themeQuery = window.matchMedia("(prefers-color-scheme: dark)");
  let userChoseTheme = false;
  let onThemeChange = () => {};
  const currentTheme = () => document.documentElement.getAttribute("data-theme") || (themeQuery.matches ? "dark" : "light");

  function setTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    d3.selectAll(".theme-switch button")
      .attr("aria-pressed", function () { return String(this.dataset.themeChoice === theme); });
    onThemeChange();
  }

  d3.selectAll(".theme-switch button").on("click", function () {
    userChoseTheme = true;
    setTheme(this.dataset.themeChoice);
  });
  themeQuery.addEventListener("change", e => { if (!userChoseTheme) setTheme(e.matches ? "dark" : "light"); });
  setTheme(currentTheme());

  /* ---------- Load ---------- */
  const loadRows = window.INLINE_CSV ? Promise.resolve(d3.csvParse(window.INLINE_CSV)) : d3.csv(DATA_URL);

  loadRows.then(build).catch(err => {
    d3.select("#chart").append("p").attr("class", "error")
      .text("The data file could not be loaded (" + err.message + "). Open this page through a local web server, for example VS Code Live Server.");
  });

  function build(rows) {
    rows.forEach(r => {
      r.value = r.value === "" ? 0 : +r.value;
      r.display = r.display === "" ? null : +r.display;
    });

    /* ---------- Hierarchy and layout ---------- */
    // Children keep the CSV order (no .sort) so slices go round in the same order as the original
    const root = d3.stratify().id(d => d.id).parentId(d => d.parent || null)(rows).sum(d => d.value);
    const LEVELS = root.height + 1;
    d3.partition().size([2 * Math.PI, LEVELS])(root);
    // Leaves stretch to the outer edge so the chart is always a full circle
    root.leaves().forEach(leaf => { leaf.y1 = LEVELS; });

    const nodes = root.descendants().slice(1);

    /* ---------- Scales (zooming = changing their domains) ---------- */
    const x = d3.scaleLinear().domain([0, 2 * Math.PI]).range([START, START + 2 * Math.PI]).clamp(true);
    let ringStart = 1;   // which level is drawn as the inner pie
    const y = d3.scaleLinear().range([0, R1, R2, R]).clamp(true);
    const setY = () => y.domain([ringStart, ringStart + 1, ringStart + 2, ringStart + 3]);
    setY();

    const innerR = d => y(d.y0);
    const outerR = d => Math.max(innerR(d), d.y1 >= LEVELS ? R : y(d.y1));
    const visible = d => x(d.x1) - x(d.x0) > 1e-6 && outerR(d) - innerR(d) > 0.5;

    const arcGen = d3.arc()
      .startAngle(d => x(d.x0))
      .endAngle(d => x(d.x1))
      .innerRadius(innerR)
      .outerRadius(outerR);

    let focus = root;
    let zooming = false;

    /* ---------- Colour ---------- */
    function colourOf(d) {
      const system = d.ancestors().find(a => a.depth === 1);
      const shades = PALETTES[currentTheme()][system.id] || ["#999999"];
      return shades[Math.min(d.depth - 1, shades.length - 1)];
    }

    /* ---------- SVG ---------- */
    const chartEl = document.getElementById("chart");
    const svg = d3.select(chartEl).append("svg")
      .attr("viewBox", [0, 0, W, H])
      .attr("role", "group")
      .attr("aria-label", "Interactive pie chart of where women and girls are locked up in the United States");

    // Clicking empty space goes back one level
    svg.append("rect").attr("width", W).attr("height", H).attr("fill", "transparent").on("click", goBack);

    const gChart = svg.append("g").attr("transform", "translate(" + CX + "," + CY + ")");
    const gArcs = gChart.append("g");
    const gLabels = gChart.append("g").attr("pointer-events", "none");
    const gSide = gChart.append("g");

    const path = gArcs.selectAll("path")
      .data(nodes)
      .join("path")
      .attr("class", d => "arc" + (d.children ? "" : " is-leaf"))
      .attr("fill", colourOf)
      .attr("role", "button")
      .on("click", (event, d) => { event.stopPropagation(); activate(d); })
      .on("keydown", (event, d) => {
        if (event.key === "Enter" || event.key === " ") { event.preventDefault(); activate(d); }
      })
      .on("pointerenter", (event, d) => { highlight(d); showTip(d, event.clientX, event.clientY); })
      .on("pointermove", event => moveTip(event.clientX, event.clientY))
      .on("pointerleave", () => { highlight(null); hideTip(); })
      .on("focus", (event, d) => { highlight(d); const p = screenPoint(d); showTip(d, p[0], p[1]); })
      .on("blur", () => { highlight(null); hideTip(); });

    function drawArcs() {
      path
        .attr("d", d => (visible(d) ? arcGen(d) : null))
        .attr("pointer-events", d => (visible(d) ? "auto" : "none"));
    }

    function updateAccessibility() {
      path
        .attr("tabindex", d => (visible(d) ? 0 : -1))
        .classed("is-leaf", d => !d.children && d !== focus && !(d.parent !== focus && d.parent !== root))
        .attr("aria-label", d => {
          let action = "";
          if (d === focus) action = ". Press Enter to go back";
          else if (d.children) action = ". Press Enter to zoom in";
          return d.data.label + ": " + valueText(d) + action;
        });
    }

    /* ---------- Click behaviour ---------- */
    function activate(d) {
      if (zooming) return;
      if (d === focus) { goBack(); return; }                 // centre disc = back
      if (d.children) { zoomTo(d); return; }                 // group = zoom in
      if (d.parent !== focus && d.parent !== root) zoomTo(d.parent);  // detail slice = zoom to its group
    }

    function goBack() {
      if (!zooming && focus.parent) zoomTo(focus.parent);
    }

    document.addEventListener("keydown", event => {
      if (event.key === "Escape") goBack();
    });

    /* ---------- Zoom ---------- */
    function zoomTo(p) {
      focus = p;
      zooming = true;
      hideTip();
      highlight(null);

      const angleDomain = d3.interpolate(x.domain(), [p.x0, p.x1]);
      const ring = d3.interpolate(ringStart, Math.max(1, p.depth));

      gLabels.interrupt().transition().duration(reduceMotion ? 0 : 150).attr("opacity", 0);
      gSide.interrupt().transition().duration(reduceMotion ? 0 : 150).attr("opacity", 0);

      svg.transition("zoom")
        .duration(DURATION)
        .ease(d3.easeCubicInOut)
        .tween("zoom", () => t => {
          x.domain(angleDomain(t));
          ringStart = ring(t);
          setY();
          drawArcs();
        })
        .on("end", () => {
          zooming = false;
          drawLabels();
          updateAccessibility();
          gLabels.transition().duration(reduceMotion ? 0 : 300).attr("opacity", 1);
          gSide.transition().duration(reduceMotion ? 0 : 300).attr("opacity", 1);
        });
    }

    /* ---------- Labels ---------- */
    function textBlock(parent, lines, cx, cy, size, cls, sliceFill) {
      const text = parent.append("text")
        .attr("class", cls)
        .attr("fill", textOn(sliceFill))
        .attr("stroke", sliceFill)
        .attr("text-anchor", "middle")
        .attr("x", cx)
        .attr("y", cy)
        .style("font-size", size + "px");
      lines.forEach((line, i) => {
        text.append("tspan")
          .attr("x", cx)
          .attr("dy", i === 0 ? (-(lines.length - 1) / 2 * 1.12 + 0.35) + "em" : "1.12em")
          .text(line);
      });
      return text;
    }

    // Measure real text widths (cached) so labels are only placed where they truly fit
    const measurer = svg.append("text").attr("visibility", "hidden").attr("aria-hidden", "true");
    const widthCache = new Map();
    function textWidth(str, size, weightClass) {
      const key = str + "|" + size + "|" + weightClass;
      if (!widthCache.has(key)) {
        measurer.attr("class", weightClass).style("font-size", size + "px").text(str);
        widthCache.set(key, measurer.node().getComputedTextLength());
      }
      return widthCache.get(key);
    }

    // Try font sizes (largest first), then positions along the slice and across the ring,
    // and return the first place where a horizontal label fits completely inside the slice
    const ALONG = [0.5, 0.4, 0.6, 0.3, 0.7, 0.2, 0.8];
    function fitInside(d, lines, sizes, radii, cls, slack = 1) {
      const a0 = x(d.x0), a1 = x(d.x1);
      const rin = innerR(d), rout = outerR(d);
      for (const size of sizes) {
        const boxW = d3.max(lines, l => textWidth(l, size, cls)) + 4;
        const boxH = lines.length * size * 1.12;
        for (const f of radii) {
          const r = rin + (rout - rin) * f;
          const depth = 2 * Math.min(r - rin, rout - r);
          for (const t of ALONG) {
            const a = a0 + (a1 - a0) * t;
            const cos = Math.abs(Math.cos(a)), sin = Math.abs(Math.sin(a));
            const alongTangent = boxW * cos + boxH * sin;
            const alongRadius = boxW * sin + boxH * cos;
            const edge = Math.min(a - a0, a1 - a);
            const room = 2 * r * Math.sin(Math.min(edge, Math.PI / 2));
            if (alongTangent <= room * slack && alongRadius <= depth * slack) return { r, size, mid: a };
          }
        }
      }
      return null;
    }

    function drawLabels() {
      gLabels.selectAll("*").remove();
      gSide.selectAll("*").remove();

      const shownNodes = nodes.filter(visible);
      const ringOf = d => d.depth - ringStart + 1;   // 1 = inner pie, 2 = middle, 3 = outer

      // Inner slices too thin to label go into the list on the right (with their children)
      const small = shownNodes.filter(d => d !== focus && ringOf(d) === 1 && x(d.x1) - x(d.x0) < SMALL_ANGLE);
      const inSmall = d => d.ancestors().some(a => small.includes(a));

      const outer = [];

      shownNodes.forEach(d => {
        if (d === focus || inSmall(d)) return;
        const ring = ringOf(d);
        const lines = nameLines(d).concat(valueText(d));

        if (ring === 1) {
          // The original lets big inner labels touch their slice edges a little, hence the 1.25 slack
          const fit = fitInside(d, lines, [28, 24, 20, 17, 15, 13.5, 12.5], [0.5, 0.62, 0.74, 0.82], "lbl-inner", 1.25);
          if (fit) textBlock(gLabels, lines, Math.sin(fit.mid) * fit.r, -Math.cos(fit.mid) * fit.r, fit.size, "lbl-inner", colourOf(d));
          return;
        }
        if (ring === 2) {
          const fit = fitInside(d, lines, [15.5, 14, 13], [0.5, 0.42, 0.58], "lbl-mid");
          if (fit) { textBlock(gLabels, lines, Math.sin(fit.mid) * fit.r, -Math.cos(fit.mid) * fit.r, fit.size, "lbl-mid", colourOf(d)); return; }
          if (outerR(d) >= R - 0.5 && x(d.x1) - x(d.x0) >= MIN_OUTER_ANGLE) outer.push(d);
          return;
        }
        if (x(d.x1) - x(d.x0) >= MIN_OUTER_ANGLE) outer.push(d);
      });

      drawCentre();
      drawOuterLabels(outer);
      drawSideList(small);
    }

    // When zoomed in, the selected group fills the centre; clicking it goes back
    function drawCentre() {
      if (focus === root) return;
      const lines = nameLines(focus).concat(valueText(focus));
      const size = 27;
      textBlock(gLabels, lines, 0, -12, size, "lbl-centre", colourOf(focus));
      const bottom = -12 + ((lines.length - 1) / 2) * size * 1.12;
      gLabels.append("text")
        .attr("class", "lbl-hint")
        .attr("fill", textOn(colourOf(focus)))
        .attr("text-anchor", "middle")
        .attr("y", bottom + 30)
        .text("Click here to go back");
    }

    // Outer labels sit outside the circle; overlapping ones are pushed apart with a leader line
    function drawOuterLabels(list) {
      const rr = R + 12;
      const items = list.map(d => {
        const mid = (x(d.x0) + x(d.x1)) / 2;
        const lines = nameLines(d);
        lines[lines.length - 1] += " " + valueText(d);
        return {
          d, mid, lines,
          side: Math.sin(mid) >= 0 ? 1 : -1,
          y0: -Math.cos(mid) * rr,
          y: -Math.cos(mid) * rr,
          h: lines.length * LINE
        };
      });

      [1, -1].forEach(side => {
        const group = items.filter(i => i.side === side).sort((a, b) => a.y - b.y);
        for (let iter = 0; iter < 400; iter++) {
          let moved = false;
          for (let i = 1; i < group.length; i++) {
            const a = group[i - 1], b = group[i];
            const overlap = a.y + (a.h + b.h) / 2 + 1 - b.y;
            if (overlap > 0.01) { a.y -= overlap / 2; b.y += overlap / 2; moved = true; }
          }
          if (!moved) break;
        }
        group.forEach(i => { i.y = Math.max(-CY + 14 + i.h / 2, Math.min(H - CY - 10 - i.h / 2, i.y)); });
      });

      items.forEach(item => {
        const lx = Math.abs(item.y) < rr ? item.side * Math.sqrt(rr * rr - item.y * item.y) : item.side * 6;
        const ax = Math.sin(item.mid) * (R + 2), ay = -Math.cos(item.mid) * (R + 2);
        if (Math.abs(item.y - item.y0) > 3) {
          gLabels.append("path").attr("class", "leader")
            .attr("d", "M" + ax + "," + ay + "L" + (lx - item.side * 3) + "," + item.y);
        }
        const text = gLabels.append("text")
          .attr("class", "lbl-outer")
          .attr("text-anchor", item.side > 0 ? "start" : "end")
          .attr("x", lx)
          .attr("y", item.y);
        item.lines.forEach((line, i) => {
          text.append("tspan")
            .attr("x", lx)
            .attr("dy", i === 0 ? (-(item.lines.length - 1) / 2 * LINE + 4.5) : LINE)
            .text(line);
        });
      });
    }

    // List of thin slices on the right, joined to the circle with a bracket (as in the original)
    function drawSideList(small) {
      if (!small.length) return;
      const a0 = x(small[0].x0), a1 = x(small[small.length - 1].x1), mid = (a0 + a1) / 2;
      const br = R + 18;
      const joinY = -Math.cos(mid) * br;
      const bracketX = 490;

      gSide.append("path").attr("class", "bracket")
        .attr("d", d3.arc()({ innerRadius: br, outerRadius: br, startAngle: a0 - 0.01, endAngle: a1 + 0.01 }));
      gSide.append("path").attr("class", "bracket")
        .attr("d", "M" + (Math.sin(mid) * br) + "," + joinY + "H" + bracketX);

      const entries = [];
      small.forEach(d => {
        entries.push({ d, level: 0 });
        if (d.children) d.children.forEach(c => entries.push({ d: c, level: 1 }));
      });
      const gapOf = e => (e.level === 0 ? 24 : 20);
      const total = d3.sum(entries, gapOf);
      let cursor = joinY - total / 2 + 12;

      gSide.append("path").attr("class", "bracket")
        .attr("d", "M" + bracketX + "," + (cursor - 14) + "V" + (cursor + total - 16));

      entries.forEach(e => {
        const item = gSide.append("g")
          .attr("class", "side-item" + (e.d.children ? "" : " is-leaf"))
          .attr("transform", "translate(" + (bracketX + 16 + e.level * 26) + "," + cursor + ")")
          .attr("tabindex", 0)
          .attr("role", "button")
          .attr("aria-label", e.d.data.label + ": " + valueText(e.d))
          .on("click", event => { event.stopPropagation(); activate(e.d); })
          .on("keydown", event => {
            if (event.key === "Enter" || event.key === " ") { event.preventDefault(); activate(e.d); }
          })
          .on("pointerenter", event => { highlight(e.d); showTip(e.d, event.clientX, event.clientY); })
          .on("pointermove", event => moveTip(event.clientX, event.clientY))
          .on("pointerleave", () => { highlight(null); hideTip(); })
          .on("focus", () => highlight(e.d))
          .on("blur", () => highlight(null));
        item.append("text")
          .attr("class", e.level === 0 ? "side-main" : "side-sub")
          .style("font-size", (e.level === 0 ? 17 : 14.5) + "px")
          .attr("dy", "0.35em")
          .text(nameLines(e.d).join(" ") + " " + valueText(e.d));
        cursor += gapOf(e);
      });
    }

    /* ---------- Hover highlight ---------- */
    function highlight(d) {
      if (!d) { path.classed("is-dim", false); return; }
      path.classed("is-dim", n => !(n.ancestors().includes(d) || d.ancestors().includes(n)));
    }

    /* ---------- Tooltip ---------- */
    const tip = d3.select(chartEl).append("div").attr("class", "tip").attr("hidden", true);

    function showTip(d, clientX, clientY) {
      tip.html("");
      tip.append("strong").text(d.data.label);
      tip.append("b").text(valueText(d));
      tip.append("span").text(share(d.value / root.value) + " of all women and girls locked up");
      if (d.parent && d.parent !== root) {
        tip.append("span").text(share(d.value / d.parent.value) + " of " + lowerFirst(d.parent.data.label));
      }
      if (d.data.note) tip.append("em").text(d.data.note);
      tip.attr("hidden", null);
      moveTip(clientX, clientY);
    }

    function moveTip(clientX, clientY) {
      const box = chartEl.getBoundingClientRect();
      const tipBox = tip.node().getBoundingClientRect();
      let left = clientX - box.left + chartEl.scrollLeft + 16;
      let top = clientY - box.top + 16;
      if (clientX + 16 + tipBox.width > window.innerWidth - 8) left -= tipBox.width + 32;
      if (top + tipBox.height > box.height - 8) top -= tipBox.height + 32;
      tip.style("left", Math.max(4, left) + "px").style("top", Math.max(4, top) + "px");
    }

    function hideTip() { tip.attr("hidden", true); }

    function screenPoint(d) {
      const p = svg.node().createSVGPoint();
      const c = arcGen.centroid(d);
      p.x = c[0] + CX; p.y = c[1] + CY;
      const s = p.matrixTransform(svg.node().getScreenCTM());
      return [s.x, s.y];
    }

    /* ---------- First draw ---------- */
    drawArcs();
    drawLabels();
    updateAccessibility();

    // Switching light/dark recolours the slices and redraws the labels with matching text colours
    onThemeChange = () => {
      path.interrupt("recolour").transition("recolour").duration(reduceMotion ? 0 : 300).attr("fill", colourOf);
      if (!zooming) drawLabels();
    };

    // Label sizes are measured, so measure again once the web font has loaded
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(() => { widthCache.clear(); if (!zooming) drawLabels(); });
    }
  }
})();
