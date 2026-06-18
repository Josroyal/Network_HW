/* ============================================================================
   NetMap — INSIGHTS DASHBOARD
   Each tab answers one question. Reuses the same explanatory pattern, badges,
   rank lists and cards as the rest of the product.
   ========================================================================== */
(function () {
  const TABS = [
    { id: "leaders",  name: "Leaders",       icon: '<path d="M6 21V9M12 21V4M18 21v-7"/>',          fn: tabLeaders },
    { id: "bridges",  name: "Bridges",       icon: '<path d="M3 16V10M21 16V10M3 13h18M8 13v-2M12 13v-2M16 13v-2"/>', fn: tabBridges },
    { id: "depts",    name: "Departments",   icon: '<circle cx="12" cy="12" r="8"/><path d="M12 4v16M4 12h16"/>', fn: tabDepts },
    { id: "topics",   name: "Bridging topics", icon: '<circle cx="6" cy="6" r="2.5"/><circle cx="18" cy="6" r="2.5"/><circle cx="12" cy="18" r="2.5"/><path d="M8 7l8 0M7 8l4 8M17 8l-4 8"/>', fn: tabTopics },
    { id: "opps",     name: "Opportunities", icon: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4"/><circle cx="12" cy="12" r="3.5"/>', fn: tabOpps },
    { id: "edu",      name: "Education",     icon: '<path d="M3 8l9-4 9 4-9 4-9-4z"/><path d="M7 10v4c0 1 2.5 2 5 2s5-1 5-2v-4"/>', fn: tabEdu },
    { id: "partners", name: "Partners",      icon: '<path d="M9 13a4 4 0 100-8 4 4 0 000 8z"/><path d="M3 20a6 6 0 0112 0M16 11l2 2 4-4"/>', fn: tabPartners },
    { id: "fields",   name: "Multi-field",   icon: '<circle cx="9" cy="9" r="4"/><circle cx="15" cy="15" r="4"/>', fn: tabFields },
    { id: "shape",    name: "Depth vs breadth", icon: '<path d="M4 4v16h16"/><circle cx="9" cy="14" r="1.6"/><circle cx="14" cy="9" r="1.6"/><circle cx="18" cy="12" r="1.6"/>', fn: tabShape },
  ];

  NM.buildInsights = function () {
    const nav = document.getElementById("insight-tabs");
    const panels = document.getElementById("insight-panels");
    nav.innerHTML = TABS.map((t, i) => `<button class="insight-tab${i === 0 ? " active" : ""}" data-tab="${t.id}">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">${t.icon}</svg>${t.name}</button>`).join("");
    panels.innerHTML = TABS.map((t, i) => `<div class="insight-panel${i === 0 ? " active" : ""}" id="ipanel-${t.id}"></div>`).join("");
    nav.querySelectorAll(".insight-tab").forEach((b) => b.addEventListener("click", () => activate(b.getAttribute("data-tab"))));
    activate("leaders");
  };

  const rendered = {};
  function activate(id) {
    document.querySelectorAll(".insight-tab").forEach((b) => b.classList.toggle("active", b.getAttribute("data-tab") === id));
    document.querySelectorAll(".insight-panel").forEach((p) => p.classList.toggle("active", p.id === "ipanel-" + id));
    if (!rendered[id]) { TABS.find((t) => t.id === id).fn(document.getElementById("ipanel-" + id)); rendered[id] = true; }
  }

  /* ---- shared bits ---- */
  function desc(text, key) {
    return `<p class="panel-desc">${text}<button class="info-dot" data-explain="${key}">i</button></p>`;
  }
  function goto(id) { NM.showSurface("map"); NM.openProfile(id); }
  NM._goto = goto;

  function rankList(items, opts) {
    const max = d3.max(items, opts.value) || 1;
    return `<div class="rank-list">${items.map((d, i) => {
      const n = NM.state.nodeById[opts.id(d)];
      const v = opts.value(d);
      const av = n ? NM.photoImg(n, 32, "rank-av") : `<div class="rank-av" style="background:var(--dept-UNK)">?</div>`;
      return `<div class="rank-row" data-goto="${opts.id(d)}">
        <span class="rank-n">${i + 1}</span>${av}
        <div class="rank-main"><div class="n">${opts.name(d)}</div>
          <div class="m"><span class="dot" style="display:inline-block;width:7px;height:7px;border-radius:50%;background:${NM.deptColor(n?.dept_code)}"></span>${NM.deptLabel(n?.dept_code)}</div></div>
        <div class="rank-bar-wrap"><div class="rank-bar" style="width:${(v / max * 100).toFixed(0)}%"></div></div>
        <div class="rank-val">${opts.fmt ? opts.fmt(v) : v}</div>
      </div>`;
    }).join("")}</div>`;
  }
  function wireGoto(el) { el.querySelectorAll("[data-goto]").forEach((r) => r.addEventListener("click", () => goto(r.getAttribute("data-goto")))); }

  /* ---- 1. Leaders (degree) ---- */
  function tabLeaders(el) {
    const items = NM.state.graph.nodes.slice().filter((n) => (n.degree || 0) > 0)
      .sort((a, b) => (b.degree || 0) - (a.degree || 0)).slice(0, 20);
    el.innerHTML = `<div class="card"><div class="card-head"><h2>Who leads collaboration</h2></div>
      <div class="card-body">${desc("Ranked by <strong>degree</strong> — the number of distinct co-authors. These are the hubs of UTEC's research network.", "tab-leaders")}
      ${rankList(items, { id: (d) => d.id, name: (d) => d.name, value: (d) => d.degree || 0 })}</div></div>`;
    wireGoto(el);
  }

  /* ---- 2. Bridges (betweenness) ---- */
  function tabBridges(el) {
    const items = NM.state.graph.nodes.slice().filter((n) => (n.betweenness_centrality || 0) > 0)
      .sort((a, b) => (b.betweenness_centrality || 0) - (a.betweenness_centrality || 0)).slice(0, 20);
    el.innerHTML = `<div class="card"><div class="card-head"><h2>Who holds the network together</h2></div>
      <div class="card-body">${desc("Ranked by <strong>betweenness</strong> — how often a professor sits on the shortest path between others. Remove a top bridge and parts of the network would drift apart.", "tab-bridges")}
      ${items.length ? rankList(items, { id: (d) => d.id, name: (d) => d.name, value: (d) => d.betweenness_centrality || 0, fmt: (v) => v.toFixed(3) })
        : `<div class="empty">The co-authorship network is sparse enough that no single professor is a structural bottleneck.</div>`}</div></div>`;
    wireGoto(el);
  }

  /* ---- 3. Departments chord ---- */
  function tabDepts(el) {
    const g = NM.state.graph;
    const codes = [...new Set(g.nodes.map((n) => n.dept_code))];
    const idx = {}; codes.forEach((c, i) => idx[c] = i);
    const m = codes.map(() => codes.map(() => 0));
    g.edges.forEach((e) => {
      const a = idx[e.source_dept], b = idx[e.target_dept];
      if (a == null || b == null) return;
      m[a][b] += e.weight || 1; m[b][a] += e.weight || 1;
    });
    const hasFlow = m.some((r) => r.some((v) => v > 0));
    el.innerHTML = `<div class="card"><div class="card-head"><h2>How departments collaborate</h2></div>
      <div class="card-body">${desc("Each arc is a department; ribbons between them are co-published papers. Thick ribbons = tight cross-department work. A department with thin or no ribbons is a <strong>silo</strong>.", "tab-depts")}
      <div class="chord-wrap" id="chord-wrap"></div></div></div>`;
    if (!hasFlow) { document.getElementById("chord-wrap").innerHTML = `<div class="empty">Not enough cross-department co-authorship to chart yet.</div>`; return; }
    drawChord(codes, m);
  }

  function drawChord(codes, matrix) {
    const wrap = document.getElementById("chord-wrap");
    const sz = Math.min(520, wrap.clientWidth - 20), r = sz / 2;
    const inner = r - 90, outer = inner + 14;
    const chord = d3.chord().padAngle(0.05).sortSubgroups(d3.descending)(matrix);
    const svg = d3.select(wrap).append("svg").attr("viewBox", `${-r} ${-r} ${sz} ${sz}`).attr("width", sz).attr("height", sz);
    const tip = d3.select(wrap).append("div").attr("class", "chord-tip");

    const arc = d3.arc().innerRadius(inner).outerRadius(outer);
    const ribbon = d3.ribbon().radius(inner);

    const group = svg.append("g").selectAll("g").data(chord.groups).join("g");
    group.append("path").attr("d", arc).attr("fill", (d) => NM.deptColor(codes[d.index]))
      .attr("stroke", "#fff").style("cursor", "pointer")
      .on("click", (e, d) => { NM.showSurface("map"); NM.state.deptFilter = codes[d.index]; NM.setMode("cluster"); })
      .on("mouseover", (e, d) => { tip.style("opacity", 1).html(`<strong>${NM.deptLabel(codes[d.index])}</strong><br>${d.value} cross-dept paper-links`); })
      .on("mousemove", (e) => tip.style("left", (e.clientX + 12) + "px").style("top", (e.clientY + 12) + "px"))
      .on("mouseout", () => tip.style("opacity", 0));
    group.append("text").each((d) => { d.angle = (d.startAngle + d.endAngle) / 2; })
      .attr("dy", "0.35em")
      .attr("transform", (d) => `rotate(${d.angle * 180 / Math.PI - 90}) translate(${outer + 6}) ${d.angle > Math.PI ? "rotate(180)" : ""}`)
      .attr("text-anchor", (d) => d.angle > Math.PI ? "end" : null)
      .style("font-size", "10px").style("font-family", "var(--font-body)").style("fill", "var(--ink-2)")
      .text((d) => NM.deptLabel(codes[d.index]));

    svg.append("g").attr("fill-opacity", 0.62).selectAll("path").data(chord).join("path")
      .attr("d", ribbon).attr("fill", (d) => NM.deptColor(codes[d.source.index]))
      .attr("stroke", "#fff").attr("stroke-width", 0.5)
      .on("mouseover", function (e, d) {
        d3.select(this).attr("fill-opacity", 1);
        tip.style("opacity", 1).html(`<strong>${NM.deptLabel(codes[d.source.index])} ↔ ${NM.deptLabel(codes[d.target.index])}</strong><br>${d.source.value} shared paper-links`);
      })
      .on("mousemove", (e) => tip.style("left", (e.clientX + 12) + "px").style("top", (e.clientY + 12) + "px"))
      .on("mouseout", function () { d3.select(this).attr("fill-opacity", 0.62); tip.style("opacity", 0); });
  }

  /* ---- 4. Bridging topics (computed from cross-dept co-authorship) ---- */
  function tabTopics(el) {
    const g = NM.state.graph;
    const topicCount = {};
    g.edges.filter((e) => e.is_cross_dept).forEach((e) => {
      const a = NM.state.nodeById[e.source], b = NM.state.nodeById[e.target];
      if (!a || !b) return;
      const ta = new Set([...(a.areas || []).map((x) => x.toLowerCase()), ...((a.fingerprints_structured || []).flatMap((f) => f.temas.map((t) => t.nombre.toLowerCase())))]);
      const tb = new Set([...(b.areas || []).map((x) => x.toLowerCase()), ...((b.fingerprints_structured || []).flatMap((f) => f.temas.map((t) => t.nombre.toLowerCase())))]);
      [...ta].forEach((t) => { if (tb.has(t)) topicCount[t] = (topicCount[t] || 0) + 1; });
    });
    let items = Object.entries(topicCount).sort((a, b) => b[1] - a[1]).slice(0, 20);
    // fall back to most common fields if no shared topics on cross edges
    if (!items.length) {
      const fc = {};
      g.fingerprint_fields.forEach((f) => f.fields.forEach((x) => fc[x] = (fc[x] || 0) + 1));
      items = Object.entries(fc).sort((a, b) => b[1] - a[1]).slice(0, 15);
    }
    const max = d3.max(items, (d) => d[1]) || 1;
    el.innerHTML = `<div class="card"><div class="card-head"><h2>Topics that pull fields together</h2></div>
      <div class="card-body">${desc("Research topics that recur on both sides of <strong>cross-department</strong> co-authorships — the themes that drive interdisciplinary work.", "tab-areas")}
      <div class="rank-list">${items.map(([t, c], i) => `<div class="rank-row" style="cursor:default">
        <span class="rank-n">${i + 1}</span>
        <div class="rank-main"><div class="n" style="text-transform:capitalize">${t}</div></div>
        <div class="rank-bar-wrap"><div class="rank-bar" style="width:${(c / max * 100).toFixed(0)}%"></div></div>
        <div class="rank-val">${c}</div></div>`).join("")}</div></div></div>`;
  }

  /* ---- 5. Opportunities (predicted + cross-group + topic twins) ---- */
  function tabOpps(el) {
    const g = NM.state.graph;
    el.innerHTML = `
      <div class="card-grid">
        <div class="card"><div class="card-head"><h2>Cross-group potential</h2><span class="badge predicted">${g.cross_group_opportunities.length}</span></div>
          <div class="card-body">${desc("Professors in <strong>different research groups</strong> whose research fingerprints overlap strongly, but who have never co-authored. These are the clearest untapped partnerships.", "tab-crossgroup")}
          <div id="cg-list"></div></div></div>
        <div class="card"><div class="card-head"><h2>Predicted links</h2><span class="badge predicted">${g.predicted_links.length}</span></div>
          <div class="card-body">${desc("Likely future collaborations from the <strong>Adamic-Adar</strong> index — pairs who share many network neighbours but no direct tie yet.", "tab-predict")}
          <div id="pl-list"></div></div></div>
      </div>
      <div class="card" style="margin-top:var(--s-5)"><div class="card-head"><h2>Topic twins across departments</h2></div>
        <div class="card-body">${desc("Pairs with the highest <strong>text similarity</strong> in their research fingerprints who sit in different departments — strong candidates for shared grants.", "tab-nlp")}
        <div id="nlp-list"></div></div></div>`;

    const cg = el.querySelector("#cg-list");
    cg.innerHTML = g.cross_group_opportunities.length ? g.cross_group_opportunities.slice(0, 10).map((o) => pairCard(o.source, o.target, o.overlap_count + " shared", "predicted",
      `${o.shared_fields?.length ? `<span style="color:var(--ink-3)">Both work in:</span> ${o.shared_fields.map((f) => `<span class="badge field" style="margin:2px 2px 0 0"><span class="dot" style="background:${NM.fieldColor(f)}"></span>${f}</span>`).join("")}<br>` : ""}${(o.shared_topics || []).slice(0, 5).map((t) => `<span class="topic">${t}</span>`).join("")}`)).join("")
      : `<div class="empty">No cross-group overlaps found.</div>`;

    const pl = el.querySelector("#pl-list");
    pl.innerHTML = g.predicted_links.length ? g.predicted_links.slice(0, 10).map((p) => pairCard(p.source, p.target, p.score.toFixed(2), "predicted",
      `<span style="color:var(--ink-3)">${p.common_neighbors} shared collaborator${p.common_neighbors === 1 ? "" : "s"} · Adamic-Adar ${p.score.toFixed(2)}</span>`)).join("")
      : `<div class="empty">No predictions available.</div>`;

    const nl = el.querySelector("#nlp-list");
    nl.innerHTML = g.semantic_edges.length ? g.semantic_edges.slice(0, 12).map((s) => pairCard(s.source, s.target, s.score.toFixed(2), "nlp",
      `<span style="color:var(--ink-3)">Topic similarity ${(s.score * 100).toFixed(0)}%</span>`)).join("")
      : `<div class="empty">No semantic pairs available.</div>`;

    [cg, pl, nl].forEach(wireGoto);
  }

  function pairCard(aId, bId, score, kind, why) {
    const a = NM.state.nodeById[aId], b = NM.state.nodeById[bId];
    if (!a || !b) return "";
    const av = (n) => NM.photoImg(n, 28, "pa");
    return `<div class="pair">
      <div class="pair-people">
        <div class="pair-person" data-goto="${aId}">${av(a)}<span class="n">${a.name}</span></div>
        <div class="pair-link ${kind === "nlp" ? "nlp" : ""}"><span class="conn"></span><span class="sc">${score}</span></div>
        <div class="pair-person" data-goto="${bId}" style="justify-content:flex-end;text-align:right">${av(b)}<span class="n">${b.name}</span></div>
      </div>
      <div class="pair-why">${why}</div></div>`;
  }

  /* ---- 6. Education (alma mater + degree levels) ---- */
  function tabEdu(el) {
    const g = NM.state.graph;
    const unis = g.education_network.university_stats.slice(0, 12);
    const maxU = d3.max(unis, (u) => u.count) || 1;
    const lv = g.education_levels.by_department;
    const order = ["PhD", "Masters", "Professional", "Bachelor", "Other"];
    const lvColor = { PhD: "#0E7C6B", Masters: "#3B4CCA", Professional: "#C77D0A", Bachelor: "#1E7FC2", Other: "#8A8395" };
    const depts = Object.keys(lv).filter((d) => d !== "UNK").sort((a, b) =>
      (lv[b].PhD || 0) / Math.max(1, sum(lv[b])) - (lv[a].PhD || 0) / Math.max(1, sum(lv[a])));
    const intl = g.education_levels.international_doctorates;

    el.innerHTML = `<div class="card-grid cols-2">
      <div class="card"><div class="card-head"><h2>Where faculty trained</h2></div>
        <div class="card-body">${desc("UTEC's faculty by <strong>alma mater</strong> — universities where at least two professors earned a degree. Click a bar to highlight that alumni network on the map.", "tab-edu")}
        <div class="rank-list">${unis.map((u, i) => `<div class="rank-row" data-uni="${u.university.replace(/"/g, "&quot;")}">
          <span class="rank-n">${i + 1}</span>
          <div class="rank-main"><div class="n">${u.university}</div></div>
          <div class="rank-bar-wrap"><div class="rank-bar" style="width:${(u.count / maxU * 100).toFixed(0)}%"></div></div>
          <div class="rank-val">${u.count}</div></div>`).join("")}</div></div></div>

      <div class="card"><div class="card-head"><h2>Degrees by department</h2></div>
        <div class="card-body"><p class="panel-desc">Highest concentration of PhDs sits at the top. Hover a segment for counts.</p>
        ${depts.map((d) => {
          const tot = sum(lv[d]); if (!tot) return "";
          return `<div class="dist-row"><div class="dist-label"><span class="dot" style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${NM.deptColor(d)}"></span>${NM.deptLabel(d)}</div>
            <div class="dist-track">${order.map((o) => { const c = lv[d][o] || 0; if (!c) return ""; return `<div class="dist-seg" style="width:${c / tot * 100}%;background:${lvColor[o]}" title="${o}: ${c}">${c / tot > 0.12 ? c : ""}</div>`; }).join("")}</div></div>`;
        }).join("")}
        <div class="dist-legend">${order.map((o) => `<div class="it"><span class="sw" style="background:${lvColor[o]}"></span>${o}</div>`).join("")}</div>
        </div></div>
    </div>
    ${intl.length ? `<div class="card" style="margin-top:var(--s-5)"><div class="card-head"><h2>International doctorates</h2><span class="badge intl">${intl.length}</span></div>
      <div class="card-body"><p class="panel-desc">Faculty whose PhD comes from an institution outside Peru.</p>
      <div class="rank-list">${intl.sort((a, b) => (b.h_index || 0) - (a.h_index || 0)).map((d) => `<div class="rank-row" data-goto="${d.id}">
        ${NM.state.nodeById[d.id] ? NM.photoImg(NM.state.nodeById[d.id], 32, "rank-av") : ""}
        <div class="rank-main"><div class="n">${d.name}</div><div class="m">${d.university}</div></div>
        <div class="rank-val">h ${d.h_index}</div></div>`).join("")}</div></div></div>` : ""}`;

    el.querySelectorAll("[data-uni]").forEach((r) => r.addEventListener("click", () => { NM.showSurface("map"); NM.isolateUniversity(r.getAttribute("data-uni")); }));
    wireGoto(el);
  }
  function sum(o) { return Object.values(o).reduce((a, b) => a + b, 0); }

  /* ---- 7. Partners ---- */
  function tabPartners(el) {
    const orgs = NM.state.graph.external_org_stats.filter((o) => o.count >= 2).slice(0, 18);
    const max = d3.max(orgs, (o) => o.count) || 1;
    el.innerHTML = `<div class="card"><div class="card-head"><h2>Shared external partners</h2></div>
      <div class="card-body">${desc("Outside institutions that <strong>several UTEC professors collaborate with independently</strong>. A high count is a candidate for a formal, institution-level partnership.", "tab-partners")}
      <div class="rank-list">${orgs.map((o, i) => `<div class="rank-row" style="cursor:default">
        <span class="rank-n">${i + 1}</span>
        <div class="rank-av" style="background:var(--dept-UNK)">🏛</div>
        <div class="rank-main"><div class="n">${o.organization}</div><div class="m">${o.count} professors · ${o.total_pubs} shared papers</div></div>
        <div class="rank-bar-wrap"><div class="rank-bar" style="width:${(o.count / max * 100).toFixed(0)}%"></div></div>
        <div class="rank-val">${o.count}</div></div>`).join("")}</div></div></div>`;
  }

  /* ---- 8. Multi-field ---- */
  function tabFields(el) {
    const items = NM.state.graph.fingerprint_fields.slice().sort((a, b) => b.field_count - a.field_count).slice(0, 18);
    el.innerHTML = `<div class="card"><div class="card-head"><h2>Interdisciplinary minds</h2></div>
      <div class="card-body">${desc("Professors whose research <strong>fingerprint spans several academic fields</strong>. These people are natural bridges between disciplines — the flat keyword matching in older tools missed them.", "tab-fields")}
      ${items.map((f) => `<div class="pair" style="cursor:pointer" data-goto="${f.id}">
        <div class="pair-people"><div class="pair-person">${NM.state.nodeById[f.id] ? NM.photoImg(NM.state.nodeById[f.id], 28, "pa") : ""}<span class="n">${f.name}</span></div>
        <span class="badge field">${f.field_count} fields</span></div>
        <div class="pair-why">${f.fields.map((x) => `<span class="badge field" style="margin:2px 2px 0 0"><span class="dot" style="background:${NM.fieldColor(x)}"></span>${x}</span>`).join("")}</div></div>`).join("")}
      </div></div>`;
    wireGoto(el);
  }

  /* ---- 9. Collaboration shape (scatter) ---- */
  function tabShape(el) {
    el.innerHTML = `<div class="card"><div class="card-head"><h2>Deep or broad collaborators?</h2></div>
      <div class="card-body">${desc("Each dot is a professor. <strong>Right</strong> = many distinct co-authors (breadth). <strong>Up</strong> = many papers per co-author (depth). Top-right works with many people repeatedly; bottom-right spreads thin.", "tab-shape")}
      <div class="scatter-wrap" id="scatter"></div></div></div>`;
    drawScatter(document.getElementById("scatter"));
  }

  function drawScatter(wrap) {
    const data = NM.state.graph.collaboration_shape.filter((d) => d.breadth > 0);
    const W = Math.min(740, wrap.clientWidth), H = 440, m = { t: 20, r: 20, b: 48, l: 52 };
    // Clamp the depth axis to a robust upper bound (a few data points carry
    // scraped outliers like a single 245-paper collaborator); pin those to the top.
    const depths = data.map((d) => d.depth).sort(d3.ascending);
    const yMax = Math.max(1, (d3.quantile(depths, 0.95) || 1) * 1.15);
    const x = d3.scaleLinear().domain([0, d3.max(data, (d) => d.breadth) * 1.1]).range([m.l, W - m.r]);
    const y = d3.scaleLinear().domain([0, yMax]).range([H - m.b, m.t]);
    const yc = (v) => y(Math.min(v, yMax));
    const svg = d3.select(wrap).append("svg").attr("viewBox", `0 0 ${W} ${H}`).attr("width", "100%");
    const tip = d3.select(wrap).append("div").attr("class", "scatter-tip");

    // axes
    svg.append("g").attr("transform", `translate(0,${H - m.b})`).call(d3.axisBottom(x).ticks(6))
      .selectAll("text").style("font-family", "var(--font-mono)").style("font-size", "10px");
    svg.append("g").attr("transform", `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(5))
      .selectAll("text").style("font-family", "var(--font-mono)").style("font-size", "10px");
    svg.selectAll(".domain,.tick line").style("stroke", "var(--line-strong)");
    svg.append("text").attr("x", (W) / 2).attr("y", H - 8).attr("text-anchor", "middle").style("font-size", "11px").style("fill", "var(--ink-2)").text("Breadth — number of distinct co-authors →");
    svg.append("text").attr("transform", "rotate(-90)").attr("x", -(H) / 2).attr("y", 14).attr("text-anchor", "middle").style("font-size", "11px").style("fill", "var(--ink-2)").text("Depth — papers per co-author →");

    svg.append("g").selectAll("circle").data(data).join("circle")
      .attr("cx", (d) => x(d.breadth)).attr("cy", (d) => yc(d.depth))
      .attr("r", 6).attr("fill", (d) => NM.deptColor(d.dept_code)).attr("fill-opacity", 0.72)
      .attr("stroke", (d) => d.depth > yMax ? "var(--ring-bridge)" : "#fff").attr("stroke-width", (d) => d.depth > yMax ? 2 : 1).style("cursor", "pointer")
      .on("mouseover", (e, d) => { tip.style("opacity", 1).html(`<strong>${d.name}</strong><br>${d.breadth} co-authors · ${d.depth} papers each${d.depth > yMax ? " (off-chart)" : ""}`); })
      .on("mousemove", (e) => { const r = wrap.getBoundingClientRect(); tip.style("left", (e.clientX - r.left + 12) + "px").style("top", (e.clientY - r.top + 12) + "px"); })
      .on("mouseout", () => tip.style("opacity", 0))
      .on("click", (e, d) => goto(d.id));
  }
})();
