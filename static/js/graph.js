/* ============================================================================
   NetMap — GRAPH CANVAS (D3 force network + lenses)
   ========================================================================== */
(function () {
  let svg, zoomG, linkG, hullG, nodeG, sim, zoom;
  let W = 0, H = 0;
  let nodeSel, linkSel;
  let rScale, hScale;
  const tip = document.getElementById("tooltip");

  // Lens definitions (label + icon + explain key) — drive the rail and legend.
  NM.MODES = [
    { id: "default",     name: "Network",          icon: '<circle cx="12" cy="6" r="2.4"/><circle cx="6" cy="17" r="2.4"/><circle cx="18" cy="16" r="2.4"/><path d="M11 8L7 15M13 7l4 8M8 17h8"/>' },
    { id: "degree",      name: "Most-connected",   icon: '<circle cx="12" cy="12" r="3"/><circle cx="5" cy="6" r="1.6"/><circle cx="19" cy="6" r="1.6"/><circle cx="5" cy="18" r="1.6"/><circle cx="19" cy="18" r="1.6"/><path d="M10 10L6 7M14 10l4-3M10 14l-4 3M14 14l4 3"/>' },
    { id: "betweenness", name: "Bridges",          icon: '<path d="M3 17V9M21 17V9M3 13h18M7 13v-2M11 13v-2M15 13v-2M19 13v-2"/>' },
    { id: "cluster",     name: "By department",    icon: '<circle cx="7" cy="8" r="3"/><circle cx="17" cy="9" r="2.2"/><circle cx="9" cy="17" r="2.6"/>' },
    { id: "groups",      name: "Research groups",  icon: '<circle cx="8" cy="9" r="4"/><circle cx="16" cy="15" r="4"/>' },
    { id: "semantic",    name: "Shared interests", icon: '<circle cx="6" cy="12" r="2.4"/><circle cx="18" cy="12" r="2.4"/><path d="M8.4 12h7.2" stroke-dasharray="2 2"/>' },
    { id: "almamater",   name: "Shared alma mater",icon: '<path d="M3 9l9-4 9 4-9 4-9-4z"/><path d="M7 11v4c0 1 2.5 2 5 2s5-1 5-2v-4"/>' },
    { id: "flow",        name: "By impact (h-index)", icon: '<path d="M4 20V8M10 20V4M16 20v-9M22 20H2"/>' },
  ];

  NM.getResearchGroups = function (d) {
    if (!d.groups || !d.groups.length) return ["None"];
    const valid = d.groups.filter(g => {
      if (!g) return false;
      const clean = g.toLowerCase();
      return !clean.includes("universidad") &&
             !clean.includes("utec") &&
             !clean.includes("facultad") &&
             !clean.includes("departamento") &&
             !clean.includes("escuela");
    });
    return valid.length ? valid : ["None"];
  };

  NM._groupColorCache = {};
  NM.groupColor = function (g) {
    if (g === "None") return "#a0a0a0";
    if (!(g in NM._groupColorCache)) {
      let hash = 0;
      for (let i = 0; i < g.length; i++) {
        hash = g.charCodeAt(i) + ((hash << 5) - hash);
      }
      const hue = (Math.abs(hash) % 24) * 15;
      NM._groupColorCache[g] = `hsl(${hue}, 75%, 48%)`;
    }
    return NM._groupColorCache[g];
  };

  NM.buildRail = function () {
    const list = document.getElementById("mode-list");
    list.innerHTML = NM.MODES.map((m) => `
      <div style="display:flex;align-items:center;gap:4px">
        <button class="mode-btn${m.id === "default" ? " active" : ""}" data-mode="${m.id}">
          <span class="ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7">${m.icon}</svg></span>
          ${m.name}
        </button>
        <button class="info-dot" data-explain="mode-${m.id === "almamater" ? "almamater" : m.id}" style="margin-right:2px">i</button>
      </div>`).join("");
    list.querySelectorAll(".mode-btn").forEach((b) => {
      b.addEventListener("click", () => NM.setMode(b.getAttribute("data-mode")));
    });

    // edge toggle
    document.getElementById("edge-toggle").addEventListener("click", () => {
      NM.state.edgeMode = NM.state.edgeMode === "coauthor" ? "nlp" : "coauthor";
      const et = document.getElementById("edge-toggle");
      const lbl = document.getElementById("edge-toggle-label");
      if (NM.state.edgeMode === "nlp") { et.classList.add("nlp"); lbl.textContent = "Showing topic similarity"; }
      else { et.classList.remove("nlp"); lbl.textContent = "Showing co-authorship"; }
      NM.refreshLinks();
      NM.renderLegend();
    });
  };

  function size() {
    const wrap = document.getElementById("canvas-wrap");
    W = wrap.clientWidth; H = wrap.clientHeight;
  }

  NM.buildGraph = function () {
    size();
    svg = d3.select("#network").attr("viewBox", `0 0 ${W} ${H}`);
    svg.selectAll("*").remove();
    zoomG = svg.append("g");
    hullG = zoomG.append("g");
    linkG = zoomG.append("g");
    nodeG = zoomG.append("g");

    zoom = d3.zoom().scaleExtent([0.2, 4]).on("zoom", (e) => zoomG.attr("transform", e.transform));
    svg.call(zoom).on("dblclick.zoom", null);

    const nodes = NM.state.graph.nodes;
    nodes.forEach((n) => { NM.state.nodeById[n.id] = n; });

    const maxDeg = d3.max(nodes, (n) => n.degree || 0) || 1;
    rScale = d3.scaleSqrt().domain([0, maxDeg]).range([9, 30]);

    const maxH = d3.max(nodes, (n) => n.h_index || 0) || 1;
    hScale = d3.scaleSqrt().domain([0, maxH]).range([9, 30]);

    sim = d3.forceSimulation(nodes)
      .force("charge", d3.forceManyBody().strength(-150))
      .force("center", d3.forceCenter(W / 2, H / 2))
      .force("collide", d3.forceCollide().radius((d) => NM.radius(d) + 4))
      .on("tick", tick);
    NM.state.sim = sim;

    drawNodes();
    NM.refreshLinks();
    NM.setMode("default");

    // zoom controls
    document.getElementById("zoom-in").onclick = () => svg.transition().call(zoom.scaleBy, 1.3);
    document.getElementById("zoom-out").onclick = () => svg.transition().call(zoom.scaleBy, 0.75);
    document.getElementById("zoom-reset").onclick = () => fit();
    window.addEventListener("resize", () => { size(); svg.attr("viewBox", `0 0 ${W} ${H}`); sim.force("center", d3.forceCenter(W / 2, H / 2)); sim.alpha(0.2).restart(); });
  };

  NM.radius = function (d) {
    if (NM.state.mode === "degree") return rScale(d.degree || 0);
    if (NM.state.mode === "flow") return hScale(d.h_index || 0);
    return Math.max(10, rScale(d.degree || 0) * 0.8 + 4);
  };

  function drawNodes() {
    const nodes = NM.state.graph.nodes;
    nodeSel = nodeG.selectAll(".node").data(nodes, (d) => d.id)
      .join("g").attr("class", "node")
      .call(d3.drag()
        .on("start", (e, d) => { if (!e.active) sim.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y; })
        .on("drag", (e, d) => { d.fx = e.x; d.fy = e.y; })
        .on("end", (e, d) => { if (!e.active) sim.alphaTarget(0); if (NM.state.mode !== "cluster" && NM.state.mode !== "flow" && NM.state.mode !== "almamater") { d.fx = null; d.fy = null; } }))
      .on("mouseover", onHover).on("mousemove", moveTip).on("mouseout", onOut)
      .on("click", (e, d) => { e.stopPropagation(); NM.openProfile(d.id); });

    nodeSel.append("circle").attr("class", "ring");
    nodeSel.append("circle").attr("class", "body")
      .attr("fill", (d) => NM.deptColor(d.dept_code))
      .attr("stroke", (d) => NM.deptColor(d.dept_code));
    nodeSel.append("g").attr("class", "group-donut");
    nodeSel.append("clipPath").attr("id", (d) => "clip-" + d.id).append("circle");
    nodeSel.append("text").attr("class", "node-init").text((d) => NM.initials(d.name));
    // photo overlay (best-effort; falls back to colored circle + initials)
    nodeSel.each(function (d) {
      if (!d.photo_url) return;
      d3.select(this).append("image")
        .attr("clip-path", (x) => `url(#clip-${x.id})`)
        .attr("href", "/api/photo?src=" + encodeURIComponent(d.photo_url))
        .attr("preserveAspectRatio", "xMidYMid slice")
        .on("error", function () { d3.select(this).remove(); });
    });
    nodeSel.append("text").attr("class", "node-name").text((d) => d.name.split(/\s+/)[0]);

    sizeNodes();
    svg.on("click", () => NM.closeProfile());
  }

  function sizeNodes() {
    nodeSel.select(".body").attr("r", (d) => NM.radius(d));
    nodeSel.select(".ring").attr("r", (d) => NM.radius(d) + 4);
    nodeSel.select("clipPath circle").attr("r", (d) => NM.radius(d) - 1);
    nodeSel.select(".node-init").attr("font-size", (d) => Math.max(8, NM.radius(d) * 0.62));
    nodeSel.select("image")
      .attr("width", (d) => (NM.radius(d) - 1) * 2).attr("height", (d) => (NM.radius(d) - 1) * 2)
      .attr("x", (d) => -(NM.radius(d) - 1)).attr("y", (d) => -(NM.radius(d) - 1));
    nodeSel.select(".node-name").attr("dy", (d) => NM.radius(d) + 12);

    nodeSel.each(function (d) {
      const arc = d3.arc()
        .innerRadius(Math.max(0, NM.radius(d) - 3))
        .outerRadius(NM.radius(d) + 4);
      d3.select(this).selectAll(".group-donut path").attr("d", arc);
    });
  }

  // Build link list for current edge/lens mode
  NM.currentLinks = function () {
    const g = NM.state.graph;
    const mode = NM.state.mode;
    if (mode === "semantic") return g.semantic_edges.map((e) => ({ ...e, kind: "nlp" }));
    if (mode === "almamater") return (g.education_network?.edges || []).map((e) => ({ ...e, kind: "alumni" }));
    if (NM.state.edgeMode === "nlp") return g.semantic_edges.map((e) => ({ ...e, kind: "nlp" }));
    return g.edges.map((e) => ({ ...e, kind: "coauthor" }));
  };

  NM.refreshLinks = function () {
    const raw = NM.currentLinks();
    const by = NM.state.nodeById;
    const links = raw.map((e) => ({
      ...e,
      source: by[e.source] || e.source,
      target: by[e.target] || e.target,
    })).filter((e) => e.source && e.target && typeof e.source === "object");

    const maxW = d3.max(NM.state.graph.edges, (e) => e.weight) || 1;
    const wScale = d3.scaleLinear().domain([1, maxW]).range([1.2, 5]);

    linkSel = linkG.selectAll(".link").data(links, (d) => (d.source.id || d.source) + "-" + (d.target.id || d.target) + d.kind)
      .join("line")
      .attr("class", (d) => `link ${d.kind}${d.is_cross_dept ? " cross" : ""}`)
      .attr("stroke-width", (d) => d.kind === "coauthor" ? wScale(d.weight || 1) : 1.4);

    sim.force("link", d3.forceLink(links).id((d) => d.id)
      .distance((d) => d.kind === "alumni" ? 60 : 80).strength((d) => d.kind === "alumni" ? 0.05 : 0.4));
    sim.alpha(0.5).restart();
    NM.applyFilters();
  };

  function tick() {
    if (linkSel) linkSel
      .attr("x1", (d) => d.source.x).attr("y1", (d) => d.source.y)
      .attr("x2", (d) => d.target.x).attr("y2", (d) => d.target.y);
    if (nodeSel) nodeSel.attr("transform", (d) => `translate(${d.x},${d.y})`);
    if (NM.state.mode === "cluster") updateHulls();
  }

  /* ---------------- LENSES ---------------- */
  NM.setMode = function (mode) {
    NM.state.mode = mode;
    NM.state.groupFilter = null;
    document.querySelectorAll(".mode-btn").forEach((b) =>
      b.classList.toggle("active", b.getAttribute("data-mode") === mode));

    // reset pins & forces
    NM.state.graph.nodes.forEach((n) => { n.fx = null; n.fy = null; });
    sim.force("x", null).force("y", null);
    hullG.selectAll("*").remove();

    // node color by groups vs department
    if (mode === "groups") {
      nodeSel.select(".body").transition().duration(400)
        .attr("fill", "#e2e8f0")
        .attr("stroke", "#cbd5e1");

      nodeSel.each(function (d) {
        const gDonut = d3.select(this).select(".group-donut");
        const groups = NM.getResearchGroups(d);
        const pieData = d3.pie().value(1)(groups);
        const arc = d3.arc()
          .innerRadius(Math.max(0, NM.radius(d) - 3))
          .outerRadius(NM.radius(d) + 4);

        gDonut.selectAll("path")
          .data(pieData)
          .join("path")
          .attr("d", arc)
          .attr("fill", (p) => NM.groupColor(p.data))
          .attr("stroke", "var(--bg-card)")
          .attr("stroke-width", groups.length > 1 ? 1 : 0)
          .style("opacity", 1);
      });
    } else {
      nodeSel.select(".body").transition().duration(400)
        .attr("fill", (d) => NM.deptColor(d.dept_code))
        .attr("stroke", (d) => NM.deptColor(d.dept_code));

      nodeSel.selectAll(".group-donut path").remove();
    }

    // bridge rings
    const betw = NM.state.graph.nodes.map((n) => n.betweenness_centrality || 0);
    const bThresh = d3.quantile(betw.slice().sort(d3.ascending), 0.85) || 0.0001;
    nodeSel.classed("bridge", (d) => mode === "betweenness" && (d.betweenness_centrality || 0) > 0 && (d.betweenness_centrality || 0) >= bThresh);

    if (mode === "cluster") clusterLayout();
    else if (mode === "groups") groupsLayout();
    else if (mode === "almamater") almaMaterLayout();
    else if (mode === "flow") flowLayout();
    else {
      sim.force("charge", d3.forceManyBody().strength(mode === "semantic" ? -120 : -150))
         .force("center", d3.forceCenter(W / 2, H / 2));
    }

    if (mode === "semantic" || mode === "almamater") NM.refreshLinks();
    else if (linkSel) NM.refreshLinks();

    sizeNodes();
    sim.alpha(0.6).restart();
    NM.renderLegend();
    NM.applyFilters();
  };

  function clusterLayout() {
    const codes = [...new Set(NM.state.graph.nodes.map((n) => n.dept_code))];
    const cols = Math.ceil(Math.sqrt(codes.length));
    const cellW = W / cols, cellH = H / Math.ceil(codes.length / cols);
    const cen = {};
    codes.forEach((c, i) => {
      cen[c] = { x: (i % cols) * cellW + cellW / 2, y: Math.floor(i / cols) * cellH + cellH / 2 };
    });
    NM._centroids = cen;
    sim.force("charge", d3.forceManyBody().strength(-60))
      .force("x", d3.forceX((d) => cen[d.dept_code].x).strength(0.22))
      .force("y", d3.forceY((d) => cen[d.dept_code].y).strength(0.22))
      .force("center", null);
  }

  function updateHulls() {
    const cen = NM._centroids; if (!cen) return;
    const groups = d3.groups(NM.state.graph.nodes, (d) => d.dept_code);
    const data = groups.map(([code, pts]) => ({ code, pts: pts.filter((p) => p.x != null) }))
      .filter((g) => g.pts.length >= 2);
    const hulls = hullG.selectAll(".hull").data(data, (d) => d.code);
    hulls.join(
      (enter) => enter.append("path").attr("class", "hull"),
      (update) => update, (exit) => exit.remove())
      .attr("fill", (d) => NM.deptColor(d.code)).attr("stroke", (d) => NM.deptColor(d.code))
      .attr("d", (d) => {
        const h = d3.polygonHull(d.pts.map((p) => [p.x, p.y]));
        if (!h) return "";
        return "M" + h.map((p) => p.join(",")).join("L") + "Z";
      });
    const labels = hullG.selectAll(".hull-label").data(groups.map(([c]) => c), (d) => d);
    labels.join("text").attr("class", "hull-label")
      .attr("x", (c) => cen[c].x).attr("y", (c) => cen[c].y - 4)
      .text((c) => NM.deptLabel(c));
  }

  function groupsLayout() {
    const groupCounts = {};
    NM.state.graph.nodes.forEach((n) => {
      NM.getResearchGroups(n).forEach((g) => {
        if (g !== "None") groupCounts[g] = (groupCounts[g] || 0) + 1;
      });
    });
    const sortedGroups = Object.keys(groupCounts).sort((a, b) => groupCounts[b] - groupCounts[a]);
    sortedGroups.push("None");

    const cen = {};
    const num = sortedGroups.length;
    const centerX = W / 2;
    const centerY = H / 2;
    const circleRadius = Math.min(W, H) * 0.35;

    sortedGroups.forEach((g, i) => {
      const angle = (i / num) * 2 * Math.PI;
      cen[g] = {
        x: centerX + circleRadius * Math.cos(angle),
        y: centerY + circleRadius * Math.sin(angle)
      };
    });

    sim.force("charge", d3.forceManyBody().strength(-60))
      .force("x", d3.forceX((d) => {
        const groups = NM.getResearchGroups(d);
        let sumX = 0;
        groups.forEach((g) => {
          sumX += cen[g] ? cen[g].x : centerX;
        });
        return sumX / groups.length;
      }).strength(0.25))
      .force("y", d3.forceY((d) => {
        const groups = NM.getResearchGroups(d);
        let sumY = 0;
        groups.forEach((g) => {
          sumY += cen[g] ? cen[g].y : centerY;
        });
        return sumY / groups.length;
      }).strength(0.25))
      .force("center", null);
  }

  // primary university per node = canonical uni of first (top) education entry
  NM.primaryUni = function (n) {
    const e = (n.education || [])[0];
    return (e && (e.university_canonical || e.university)) || null;
  };

  function almaMaterLayout() {
    const unis = {};
    NM.state.graph.nodes.forEach((n) => { const u = NM.primaryUni(n); if (u) unis[u] = (unis[u] || 0) + 1; });
    const top = Object.keys(unis).sort((a, b) => unis[b] - unis[a]);
    const cols = Math.ceil(Math.sqrt(top.length || 1));
    const cellW = W / cols, cellH = H / Math.ceil((top.length || 1) / cols);
    const cen = {};
    top.forEach((u, i) => { cen[u] = { x: (i % cols) * cellW + cellW / 2, y: Math.floor(i / cols) * cellH + cellH / 2 }; });
    sim.force("charge", d3.forceManyBody().strength(-40))
      .force("x", d3.forceX((d) => { const u = NM.primaryUni(d); return u && cen[u] ? cen[u].x : W / 2; }).strength(0.3))
      .force("y", d3.forceY((d) => { const u = NM.primaryUni(d); return u && cen[u] ? cen[u].y : H / 2; }).strength(0.3))
      .force("center", null);
  }

  function flowLayout() {
    const sorted = NM.state.graph.nodes.slice().sort((a, b) => (b.h_index || 0) - (a.h_index || 0));
    const cols = Math.ceil(Math.sqrt(sorted.length * (W / H)));
    const padX = 70, padY = 60;
    const gw = (W - padX * 2) / Math.max(1, cols - 1);
    const rows = Math.ceil(sorted.length / cols);
    const gh = (H - padY * 2) / Math.max(1, rows);
    sorted.forEach((n, i) => {
      n.fx = padX + (i % cols) * gw;
      n.fy = padY + Math.floor(i / cols) * gh;
    });
    sim.force("charge", null).force("center", null).force("link", null).force("collide", null);
    linkG.selectAll(".link").remove(); linkSel = null;
  }

  /* ---------------- FILTERS / HIGHLIGHT ---------------- */
  NM.applyFilters = function () {
    if (!nodeSel) return;
    const sel = NM.state.selectedId;
    const dept = NM.state.deptFilter;
    const uni = NM.state.uniFilter;
    const group = NM.state.groupFilter;

    // neighbor set when a node is selected
    let neigh = null;
    if (sel) {
      neigh = new Set([sel]);
      (linkSel ? linkSel.data() : []).forEach((l) => {
        const s = l.source.id || l.source, t = l.target.id || l.target;
        if (s === sel) neigh.add(t); if (t === sel) neigh.add(s);
      });
    }

    nodeSel.classed("selected", (d) => d.id === sel)
      .classed("dimmed", (d) => {
        if (dept && d.dept_code !== dept) return true;
        if (uni && NM.primaryUni(d) !== uni && !((d.education || []).some((e) => (e.university_canonical || e.university) === uni))) return true;
        if (group && !NM.getResearchGroups(d).includes(group)) return true;
        if (neigh && !neigh.has(d.id)) return true;
        return false;
      })
      .classed("labelled", (d) => !!dept || !!uni || !!group);

    if (linkSel) linkSel
      .classed("faded", (l) => {
        const s = l.source.id || l.source, t = l.target.id || l.target;
        if (sel) return !(s === sel || t === sel);
        if (dept) return !(NM.state.nodeById[s]?.dept_code === dept && NM.state.nodeById[t]?.dept_code === dept);
        if (group) {
          const sNode = NM.state.nodeById[s];
          const tNode = NM.state.nodeById[t];
          return !(sNode && tNode && NM.getResearchGroups(sNode).includes(group) && NM.getResearchGroups(tNode).includes(group));
        }
        return false;
      })
      .classed("hi", (l) => sel && ((l.source.id || l.source) === sel || (l.target.id || l.target) === sel));
  };

  NM.focusNode = function (id) {
    const d = NM.state.nodeById[id]; if (!d || d.x == null) return;
    const scale = 1.5;
    const t = d3.zoomIdentity.translate(W / 2 - d.x * scale, H / 2 - d.y * scale).scale(scale);
    svg.transition().duration(600).call(zoom.transform, t);
  };
  function fit() { svg.transition().duration(500).call(zoom.transform, d3.zoomIdentity); }

  NM.isolateUniversity = function (u) {
    NM.state.uniFilter = NM.state.uniFilter === u ? null : u;
    if (NM.state.uniFilter && NM.state.mode !== "almamater") NM.setMode("almamater");
    else NM.applyFilters();
  };

  function onHover(e, d) {
    d3.select(this).raise();
    let sizeNote = "";
    if (NM.state.mode === "degree") sizeNote = "Size shows co-author count.";
    else if (NM.state.mode === "flow") sizeNote = "Size shows h-index.";

    let groupsSection = "";
    if (NM.state.mode === "groups") {
      const groups = NM.getResearchGroups(d);
      if (groups.length && groups[0] !== "None") {
        const groupItems = groups.map(g => `
          <div style="display:flex;align-items:center;gap:6px;font-size:0.75rem;margin-top:2px;">
            <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${NM.groupColor(g)}"></span>
            <span style="white-space:normal">${g}</span>
          </div>
        `).join("");
        groupsSection = `<div style="margin-top:8px;padding-top:6px;border-top:1px solid rgba(255,255,255,0.1)">
          <div style="font-size:0.7rem;text-transform:uppercase;letter-spacing:0.05em;color:var(--ink-3);margin-bottom:2px">Research Groups</div>
          ${groupItems}
        </div>`;
      } else {
        groupsSection = `<div style="margin-top:8px;padding-top:6px;border-top:1px solid rgba(255,255,255,0.1)">
          <div style="font-size:0.7rem;text-transform:uppercase;color:var(--ink-3)">Research Groups</div>
          <div style="font-size:0.75rem;color:var(--ink-3);margin-top:2px">No formal research group affiliation</div>
        </div>`;
      }
    }

    tip.innerHTML = `
      <div class="tt-name">${d.name}</div>
      <div class="tt-dept"><span class="dot" style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${NM.deptColor(d.dept_code)}"></span>${NM.deptLabel(d.dept_code)}</div>
      <div class="tt-stats">
        <div class="tt-stat"><div class="v">${d.degree || 0}</div><div class="k">Co-authors</div></div>
        <div class="tt-stat"><div class="v">${d.h_index || 0}</div><div class="k">h-index</div></div>
        <div class="tt-stat"><div class="v">${d.citations || 0}</div><div class="k">Citations</div></div>
      </div>
      ${groupsSection}
      <div class="tt-hint">Click to open full profile. ${sizeNote}</div>`;
    tip.classList.add("open");
    moveTip(e);
  }
  function moveTip(e) {
    const pad = 16; let x = e.clientX + pad, y = e.clientY + pad;
    const w = tip.offsetWidth, h = tip.offsetHeight;
    if (x + w > window.innerWidth - 8) x = e.clientX - w - pad;
    if (y + h > window.innerHeight - 8) y = e.clientY - h - pad;
    tip.style.left = x + "px"; tip.style.top = y + "px";
  }
  function onOut() { tip.classList.remove("open"); }
})();
