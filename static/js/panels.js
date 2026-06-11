/* ==========================================================================
   DISPLAY PANELS, MODALS, AND OVERLAYS (panels.js)
   ========================================================================== */

NetMap.highlightNeighbors = function(d) {
  const neighbors = new Set();
  const activeLinks = NetMap.state.edgeMode === 'semantic' ? NetMap.state.semanticEdges : NetMap.state.edges;

  activeLinks.forEach(e => {
    const s = e.source.id || e.source;
    const t = e.target.id || e.target;
    if (s === d.id) neighbors.add(t);
    if (t === d.id) neighbors.add(s);
  });
  neighbors.add(d.id);

  NetMap.state.nodeSelection.classed("dimmed", n => !neighbors.has(n.id));
  NetMap.state.linkSelection.classed("highlighted", l => {
    const s = l.source.id || l.source;
    const t = l.target.id || l.target;
    return (s === d.id || t === d.id);
  });
  NetMap.state.linkSelection.classed("dimmed", l => {
    const s = l.source.id || l.source;
    const t = l.target.id || l.target;
    return !(s === d.id || t === d.id);
  });
};

NetMap.highlightPredictedLink = function(pl) {
  NetMap.closeModal();
  const ids = new Set([pl.source, pl.target]);

  NetMap.state.nodeSelection.classed("dimmed", d => !ids.has(d.id));
  NetMap.state.linkSelection.classed("dimmed", true);
  NetMap.state.linkSelection.classed("highlighted", false);

  NetMap.state.gMainSelection.selectAll(".pred-link-tmp").remove();

  const sNode = NetMap.state.nodes.find(n => n.id === pl.source);
  const tNode = NetMap.state.nodes.find(n => n.id === pl.target);

  if (sNode && tNode) {
    NetMap.state.gMainSelection.append("line")
      .attr("class", "pred-link-tmp")
      .attr("x1", sNode.x).attr("y1", sNode.y)
      .attr("x2", tNode.x).attr("y2", tNode.y)
      .attr("stroke", "var(--nm-warn)")
      .attr("stroke-width", 2.5)
      .attr("stroke-dasharray", "5 3")
      .attr("stroke-opacity", 0.95);

    const parent = NetMap.state.svgSelection.node();
    const W = parent.clientWidth || NetMap.state.width;
    const H = parent.clientHeight || NetMap.state.height;
    const midX = (sNode.x + tNode.x) / 2;
    const midY = (sNode.y + tNode.y) / 2;

    NetMap.state.svgSelection.transition().duration(600)
      .call(
        NetMap.state.zoomBehavior.transform,
        d3.zoomIdentity.translate(W / 2 - 1.25 * midX, H / 2 - 1.25 * midY).scale(1.25)
      );
  }
};

NetMap.highlightSemanticPair = function(sourceId, targetId) {
  NetMap.closeModal();
  NetMap.toggleEdgeMode('semantic');

  const ids = new Set([sourceId, targetId]);
  NetMap.state.nodeSelection.classed("dimmed", d => !ids.has(d.id));

  NetMap.state.linkSelection.classed("highlighted", d => {
    const s = d.source.id || d.source;
    const t = d.target.id || d.target;
    return (s === sourceId && t === targetId) || (s === targetId && t === sourceId);
  });
  NetMap.state.linkSelection.classed("dimmed", d => {
    const s = d.source.id || d.source;
    const t = d.target.id || d.target;
    const match = (s === sourceId && t === targetId) || (s === targetId && t === sourceId);
    return !match;
  });

  const sNode = NetMap.state.nodes.find(n => n.id === sourceId);
  const tNode = NetMap.state.nodes.find(n => n.id === targetId);

  if (sNode && tNode) {
    const parent = NetMap.state.svgSelection.node();
    const W = parent.clientWidth || NetMap.state.width;
    const H = parent.clientHeight || NetMap.state.height;
    const midX = (sNode.x + tNode.x) / 2;
    const midY = (sNode.y + tNode.y) / 2;

    NetMap.state.svgSelection.transition().duration(600)
      .call(
        NetMap.state.zoomBehavior.transform,
        d3.zoomIdentity.translate(W / 2 - 1.25 * midX, H / 2 - 1.25 * midY).scale(1.25)
      );
  }
};

NetMap.resetHighlight = function() {
  if (!NetMap.state.nodeSelection) return;
  NetMap.state.nodeSelection.classed("dimmed", false);
  NetMap.state.linkSelection.classed("dimmed highlighted", false);
  NetMap.state.gMainSelection.selectAll(".pred-link-tmp").remove();

  const mode = NetMap.state.activeViewMode;
  if (mode === 'default' || mode === 'cluster') {
    NetMap.state.nodeSelection.selectAll("circle.body")
      .transition().duration(300)
      .attr("fill", d => DEPT_COLORS[d.dept_code] || DEPT_COLORS.UNK)
      .attr("fill-opacity", 1);
  } else if (mode === 'degree') {
    const maxVal = d3.max(NetMap.state.nodes, d => d.degree) || 1;
    const scale = d3.scaleLinear().domain([0, maxVal]).range([0.2, 1]);
    NetMap.state.nodeSelection.selectAll("circle.body")
      .transition().duration(300)
      .attr("fill", d => DEPT_COLORS[d.dept_code] || DEPT_COLORS.UNK)
      .attr("fill-opacity", d => scale(d.degree));
  } else if (mode === 'betweenness') {
    const maxVal = d3.max(NetMap.state.nodes, d => d.betweenness_centrality) || 1;
    const scale = d3.scaleLinear().domain([0, maxVal]).range([0.2, 1]);
    NetMap.state.nodeSelection.selectAll("circle.body")
      .transition().duration(300)
      .attr("fill", d => DEPT_COLORS[d.dept_code] || DEPT_COLORS.UNK)
      .attr("fill-opacity", d => scale(d.betweenness_centrality));
  } else if (mode === 'community') {
    const commColors = d3.schemeTableau10;
    NetMap.state.nodeSelection.selectAll("circle.body")
      .transition().duration(300)
      .attr("fill", d => commColors[d.community % commColors.length])
      .attr("fill-opacity", 1);
  } else {
    NetMap.state.nodeSelection.selectAll("circle.body")
      .transition().duration(300)
      .attr("fill", d => DEPT_COLORS[d.dept_code] || DEPT_COLORS.UNK)
      .attr("fill-opacity", 1);
  }
};

NetMap.selectNodeById = function(id) {
  NetMap.closeModal();
  const d = NetMap.state.nodes.find(n => n.id === id);
  if (!d) return;

  NetMap.state.selectedNodeId = id;
  NetMap.highlightNeighbors(d);
  NetMap.showDetail(d);

  // Center view on selected node
  if (d.x && d.y && NetMap.state.svgSelection) {
    const parent = NetMap.state.svgSelection.node();
    const W = parent.clientWidth || NetMap.state.width;
    const H = parent.clientHeight || NetMap.state.height;
    NetMap.state.svgSelection.transition().duration(600)
      .call(
        NetMap.state.zoomBehavior.transform,
        d3.zoomIdentity.translate(W / 2 - 1.8 * d.x, H / 2 - 1.8 * d.y).scale(1.8)
      );
  }
};

NetMap.showDetail = function(d) {
  document.getElementById("nm-detail-drawer").classList.add("nm-open");
  document.getElementById("nm-drawer-placeholder").style.display = "none";
  document.getElementById("nm-drawer-content").style.display = "block";

  document.getElementById("nm-detail-name").textContent = d.name;

  const deptEl = document.getElementById("nm-detail-dept");
  deptEl.textContent = d.dept_label || d.dept;
  deptEl.style.borderColor = DEPT_COLORS[d.dept_code] || DEPT_COLORS.UNK;
  deptEl.style.color = DEPT_COLORS[d.dept_code] || DEPT_COLORS.UNK;

  document.getElementById("nm-detail-pubs").textContent = d.pubs || 0;
  document.getElementById("nm-detail-citations").textContent = d.citations || 0;
  document.getElementById("nm-detail-hindex").textContent = d.h_index || 0;

  const renacytCard = document.getElementById("nm-detail-renacyt");
  if (d.renacyt_level) {
    renacytCard.textContent = d.renacyt_level;
    renacytCard.parentElement.style.background = "var(--nm-accent-lt)";
    renacytCard.parentElement.style.borderColor = "var(--nm-accent)";
  } else {
    renacytCard.textContent = "—";
    renacytCard.parentElement.style.background = "var(--nm-surface-2)";
    renacytCard.parentElement.style.borderColor = "var(--nm-border)";
  }

  document.getElementById("nm-detail-bio").textContent = d.bio || "No biography available.";

  const avatar = document.getElementById("nm-detail-avatar");
  avatar.innerHTML = '';
  avatar.style.background = DEPT_COLORS[d.dept_code] || DEPT_COLORS.UNK;

  if (d.photo_url) {
    const img = document.createElement("img");
    img.src = "/api/photo?src=" + encodeURIComponent(d.photo_url);
    img.style.width = "100%";
    img.style.height = "100%";
    img.style.borderRadius = "50%";
    img.style.objectFit = "cover";
    img.onerror = function() {
      img.remove();
      avatar.textContent = NetMap.initials(d.name);
    };
    avatar.appendChild(img);
  } else {
    avatar.textContent = NetMap.initials(d.name);
  }

  // Node sizing row (moved from left deck)
  const sizingRow = document.getElementById("nm-drawer-sizing-row");
  if (sizingRow) {
    sizingRow.querySelectorAll(".nm-size-chip").forEach(chip => {
      chip.classList.toggle("nm-active", chip.getAttribute("data-size") === NetMap.state.sizeMetric);
    });
  }

  // Areas Tags
  const areasBox = document.getElementById("nm-detail-areas");
  areasBox.innerHTML = '';
  if (d.areas && d.areas.length) {
    d.areas.forEach(a => {
      const span = document.createElement("span");
      span.className = "nm-detail-area-tag";
      span.textContent = a;
      areasBox.appendChild(span);
    });
  } else {
    areasBox.innerHTML = '<span style="font-size:0.75rem; color:var(--nm-text-3)">No areas listed.</span>';
  }

  // External Profile Links
  const linksBox = document.getElementById("nm-detail-links");
  linksBox.innerHTML = '';
  const linkDefs = [
    { k: "scholar_url", lbl: "Google Scholar", icon: "🎓" },
    { k: "orcid", lbl: "ORCID ID", icon: "🆔", pre: "https://orcid.org/" },
    { k: "linkedin_url", lbl: "LinkedIn Profile", icon: "💼" },
    { k: "scopus_url", lbl: "Scopus Profile", icon: "🔬" }
  ];

  let linksRendered = 0;
  linkDefs.forEach(ld => {
    let url = d[ld.pre ? 'orcid' : ld.k];
    if (url) {
      if (ld.pre && !url.startsWith("http")) url = ld.pre + url;
      const a = document.createElement("a");
      a.className = "nm-detail-link-row";
      a.href = url;
      a.target = "_blank";
      a.innerHTML = `<span class="nm-detail-link-icon">${ld.icon}</span> ${ld.lbl}`;
      linksBox.appendChild(a);
      linksRendered++;
    }
  });
  if (!linksRendered) {
    linksBox.innerHTML = '<span style="font-size:0.75rem; color:var(--nm-text-3)">No links listed.</span>';
  }

  // Collaborators list
  const collaborators = [];
  NetMap.state.edges.forEach(e => {
    const s = e.source.id || e.source;
    const t = e.target.id || e.target;
    if (s === d.id) collaborators.push({ id: t, weight: e.weight });
    else if (t === d.id) collaborators.push({ id: s, weight: e.weight });
  });

  const collabList = collaborators
    .map(c => ({ node: NetMap.state.nodes.find(n => n.id === c.id), weight: c.weight }))
    .filter(c => c.node)
    .sort((a, b) => b.weight - a.weight);

  const collabBox = document.getElementById("nm-detail-collaborators");
  collabBox.innerHTML = '';
  if (collabList.length) {
    collabList.forEach(c => {
      const item = document.createElement("div");
      item.className = "nm-detail-list-item";
      item.style.setProperty('--dept-color', DEPT_COLORS[c.node.dept_code]);
      item.innerHTML = `
        <span class="nm-detail-list-dot"></span>
        <span class="nm-detail-list-name">${c.node.name}</span>
        <span class="nm-detail-list-val">${c.weight} papers</span>
      `;
      item.addEventListener("click", () => NetMap.selectNodeById(c.node.id));
      collabBox.appendChild(item);
    });
  } else {
    collabBox.innerHTML = '<span style="font-size:0.75rem; color:var(--nm-text-3)">No collaborators in network.</span>';
  }

  // Semantic Neighbors
  const semanticBox = document.getElementById("nm-detail-semantic-neighbors");
  semanticBox.innerHTML = '';
  const sns = d.semantic_neighbors || [];
  if (sns.length) {
    sns.forEach(sn => {
      const item = document.createElement("div");
      item.className = "nm-detail-list-item";
      const neighborNode = NetMap.state.nodes.find(n => n.id === sn.id);
      if (neighborNode) {
        item.style.setProperty('--dept-color', DEPT_COLORS[neighborNode.dept_code]);
      }
      item.innerHTML = `
        <span class="nm-detail-list-dot"></span>
        <span class="nm-detail-list-name">${sn.name}</span>
        <span class="nm-detail-list-val">${(sn.score * 100).toFixed(0)}%</span>
      `;
      item.addEventListener("click", () => NetMap.selectNodeById(sn.id));
      semanticBox.appendChild(item);
    });
  } else {
    semanticBox.innerHTML = '<span style="font-size:0.75rem; color:var(--nm-text-3)">No semantic neighbors found.</span>';
  }
};

// Full legend names for expandable card
const NM_DEPT_FULL_NAMES = {
  CS:  "Computer Science",
  EE:  "Electronics & Mechatronics",
  ME:  "Mechanical Engineering",
  CE:  "Civil & Environmental Eng.",
  IE:  "Industrial Engineering",
  BIO: "Bioengineering",
  HUM: "Humanities & Social Sciences",
  SCI: "Sciences",
  DS:  "Data Science",
  AI:  "Artificial Intelligence",
  BUS: "Business",
  SYS: "Systems & Security",
  UNK: "Unclassified"
};

NetMap.buildLegend = function() {
  const lg = document.getElementById("nm-legend");
  if (!lg) return;
  const mode = NetMap.state.activeViewMode;

  lg.innerHTML = '';
  lg.classList.remove("nm-legend-expanded");
  // Toggle scrollable layout for community mode (many items)
  lg.classList.toggle("nm-community-mode", mode === 'community');


  // ── COMMUNITY MODE: show community chips ──────────────────────────────────
  if (mode === 'community' && NetMap.state.communities.length) {
    const commColors = d3.schemeTableau10;
    const wrap = document.createElement('div');
    wrap.className = 'nm-legend-compact';

    NetMap.state.communities.forEach(c => {
      const color = commColors[c.index % commColors.length];
      const item = document.createElement('div');
      item.className = 'nm-leg-item nm-leg-item-clickable';
      item.innerHTML = `<div class="nm-leg-dot" style="background:${color}"></div><span>${c.label || ('C' + c.index)}</span>`;
      item.title = 'Filter: ' + (c.label || 'Community ' + c.index);
      if (NetMap.state.activeCommunityFilter === c.index) item.classList.add('nm-leg-active');
      item.addEventListener('click', () => NetMap.filterByCommunity(c.index));
      wrap.appendChild(item);
    });

    // "All" reset chip
    const allItem = document.createElement('div');
    allItem.className = 'nm-leg-item nm-leg-item-clickable';
    allItem.innerHTML = `<div class="nm-leg-dot" style="background:var(--nm-text-3)"></div><span>All</span>`;
    allItem.addEventListener('click', () => {
      NetMap.state.activeCommunityFilter = null;
      NetMap.resetHighlight();
      NetMap.buildLegend();
    });
    wrap.appendChild(allItem);

    lg.appendChild(wrap);
    return;
  }

  // ── DEFAULT/OTHER MODES: dept codes + expand grid ─────────────────────────
  const compactWrap = document.createElement('div');
  compactWrap.className = 'nm-legend-compact';

  Object.entries(DEPT_COLORS).forEach(([code, color]) => {
    const item = document.createElement('div');
    item.className = 'nm-leg-item';
    item.innerHTML = `<div class="nm-leg-dot" style="background:${color}"></div>${code}`;
    item.title = NM_DEPT_FULL_NAMES[code] || code;
    compactWrap.appendChild(item);
  });

  // Bridge indicator
  const bridge = document.createElement('div');
  bridge.className = 'nm-leg-item';
  bridge.style.cssText = 'border-left:1px solid var(--nm-border);padding-left:12px;';
  bridge.innerHTML = `<div class="nm-leg-dot" style="border:2.5px dashed var(--nm-warn);background:transparent;border-radius:50%"></div>Bridge`;
  compactWrap.appendChild(bridge);

  // Expand toggle
  const expandBtn = document.createElement('button');
  expandBtn.className = 'nm-leg-expand-btn';
  expandBtn.id = 'nm-legend-expand-btn';
  expandBtn.innerHTML = '▾ expand';
  compactWrap.appendChild(expandBtn);

  lg.appendChild(compactWrap);

  // Expanded card with full names + dept filter
  const expandedCard = document.createElement('div');
  expandedCard.className = 'nm-legend-expanded-card';
  expandedCard.id = 'nm-legend-expanded-card';

  const grid = document.createElement('div');
  grid.className = 'nm-legend-grid';

  Object.entries(DEPT_COLORS).forEach(([code, color]) => {
    const row = document.createElement('div');
    row.className = 'nm-legend-grid-row';
    row.dataset.code = code;
    if (NetMap.state.activeDeptFilter === code) row.classList.add('nm-active');
    row.innerHTML = `
      <span class="nm-leg-grid-dot" style="background:${color}"></span>
      <span class="nm-leg-grid-code">${code}</span>
      <span class="nm-leg-grid-name">${NM_DEPT_FULL_NAMES[code] || code}</span>
    `;
    row.addEventListener('click', () => {
      const next = NetMap.state.activeDeptFilter === code ? 'all' : code;
      NetMap.filterByDept(next);
      grid.querySelectorAll('.nm-legend-grid-row').forEach(r => {
        r.classList.toggle('nm-active', r.dataset.code === NetMap.state.activeDeptFilter);
      });
    });
    grid.appendChild(row);
  });

  // Bridge description row
  const bridgeRow = document.createElement('div');
  bridgeRow.className = 'nm-legend-grid-row nm-legend-bridge-row';
  bridgeRow.innerHTML = `
    <span class="nm-leg-grid-dot" style="border:2.5px dashed var(--nm-warn);background:transparent;border-radius:50%"></span>
    <span class="nm-leg-grid-code" style="color:var(--nm-warn)">Ring</span>
    <span class="nm-leg-grid-name">Dashed ring = high betweenness (bridge professor)</span>
  `;
  grid.appendChild(bridgeRow);

  expandedCard.appendChild(grid);
  lg.appendChild(expandedCard);

  // Toggle expand/collapse
  expandBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const isExpanded = lg.classList.toggle('nm-legend-expanded');
    expandBtn.innerHTML = isExpanded ? '▴ collapse' : '▾ expand';
  });

  // Click outside → collapse
  document.addEventListener('click', function onOutside(e) {
    if (!lg.contains(e.target) && lg.classList.contains('nm-legend-expanded')) {
      lg.classList.remove('nm-legend-expanded');
      const btn = document.getElementById('nm-legend-expand-btn');
      if (btn) btn.innerHTML = '▾ expand';
      document.removeEventListener('click', onOutside);
    }
  });
};


NetMap.buildModalPanels = function() {
  // T1 - Degree Centrality
  const sortedDeg = [...NetMap.state.nodes].sort((a, b) => b.degree - a.degree).slice(0, 10);
  const maxDeg = sortedDeg[0] ? sortedDeg[0].degree : 1;
  const t1 = document.getElementById("nm-rank-degree");
  t1.innerHTML = '';
  sortedDeg.forEach((n, i) => {
    const li = document.createElement("li");
    li.className = "nm-rank-item";
    li.style.setProperty('--dept-color', DEPT_COLORS[n.dept_code]);
    li.innerHTML = `
      <span class="nm-rank-num">${i + 1}</span>
      <div class="nm-rank-avatar">${NetMap.initials(n.name)}</div>
      <div class="nm-rank-info">
        <div class="nm-rank-name">${n.name}</div>
        <div class="nm-rank-sub">${DEPT_LABELS[n.dept_code]}</div>
      </div>
      <div class="nm-rank-bar-container">
        <div class="nm-rank-bar-bg">
          <div class="nm-rank-bar" style="width: ${(n.degree / maxDeg * 100).toFixed(0)}%"></div>
        </div>
        <span class="nm-rank-val">${n.degree} connections</span>
      </div>
    `;
    li.addEventListener("click", () => NetMap.selectNodeById(n.id));
    t1.appendChild(li);
  });

  // T2 - Bridges (Betweenness)
  const sortedBet = [...NetMap.state.nodes].sort((a, b) => b.betweenness_centrality - a.betweenness_centrality).slice(0, 10);
  const maxBet = sortedBet[0] ? sortedBet[0].betweenness_centrality : 1;
  const t2 = document.getElementById("nm-rank-betweenness");
  t2.innerHTML = '';
  sortedBet.forEach((n, i) => {
    const li = document.createElement("li");
    li.className = "nm-rank-item";
    li.style.setProperty('--dept-color', DEPT_COLORS[n.dept_code]);
    li.innerHTML = `
      <span class="nm-rank-num">${i + 1}</span>
      <div class="nm-rank-avatar">${NetMap.initials(n.name)}</div>
      <div class="nm-rank-info">
        <div class="nm-rank-name">${n.name}</div>
        <div class="nm-rank-sub">${DEPT_LABELS[n.dept_code]}</div>
      </div>
      <div class="nm-rank-bar-container">
        <div class="nm-rank-bar-bg">
          <div class="nm-rank-bar" style="width: ${(n.betweenness_centrality / maxBet * 100).toFixed(0)}%; background:var(--nm-warn)"></div>
        </div>
        <span class="nm-rank-val">${n.betweenness_centrality.toFixed(3)}</span>
      </div>
    `;
    li.addEventListener("click", () => NetMap.selectNodeById(n.id));
    t2.appendChild(li);
  });

  // T3 - Chord Diagram + Stats table
  NetMap.buildChordDiagram();

  // T4 - Research Area Hubs
  const areaCounts = {};
  NetMap.state.edges.filter(e => e.is_cross_dept).forEach(e => {
    const s = NetMap.state.nodes.find(n => n.id === (e.source.id || e.source));
    const t = NetMap.state.nodes.find(n => n.id === (e.target.id || e.target));
    if (s && t) {
      const shared = s.areas.filter(a => t.areas.includes(a));
      shared.forEach(a => { areaCounts[a] = (areaCounts[a] || 0) + 1; });
    }
  });
  const areaDepts = {};
  NetMap.state.nodes.forEach(n => {
    n.areas.forEach(a => {
      if (!areaDepts[a]) areaDepts[a] = new Set();
      areaDepts[a].add(n.dept_code);
    });
  });
  const sortedAreas = Object.entries(areaDepts)
    .map(([a, depts]) => ({ area: a, depts: depts.size, links: areaCounts[a] || 0 }))
    .filter(x => x.depts > 1)
    .sort((a, b) => b.depts - a.depts || b.links - a.links)
    .slice(0, 15);
  const areasBox = document.getElementById("nm-modal-areas");
  areasBox.innerHTML = '';
  sortedAreas.forEach(sa => {
    const div = document.createElement("div");
    div.className = "nm-area-row";
    div.innerHTML = `
      <span class="nm-area-title" title="${sa.area}">${sa.area}</span>
      <div class="nm-area-badges">
        <span class="nm-area-badge nm-area-badge-primary">${sa.depts} depts</span>
        <span class="nm-area-badge nm-area-badge-accent">${sa.links} links</span>
      </div>
    `;
    div.addEventListener("click", () => NetMap.filterByArea(sa.area));
    areasBox.appendChild(div);
  });

  // T5 - Predicted Future Links
  const predictBox = document.getElementById("nm-modal-predict");
  predictBox.innerHTML = '';
  const predictions = NetMap.state.predictedLinks || [];
  if (predictions.length) {
    predictions.slice(0, 8).forEach(pl => {
      const sName = NetMap.state.nodes.find(n => n.id === pl.source)?.name || pl.source;
      const tName = NetMap.state.nodes.find(n => n.id === pl.target)?.name || pl.target;
      const div = document.createElement("div");
      div.className = "nm-predict-item";
      div.innerHTML = `
        <div class="nm-predict-names-row">
          <span style="color:${DEPT_COLORS[pl.source_dept]}">●</span> ${sName.split(" ")[0]}
          <span class="nm-arrow">↔</span>
          <span style="color:${DEPT_COLORS[pl.target_dept]}">●</span> ${tName.split(" ")[0]}
        </div>
        <div class="nm-predict-meta">
          ${pl.source_dept} ↔ ${pl.target_dept} · ${pl.common_neighbors} common neighbors
        </div>
        <div class="nm-predict-score-row">
          <span>Predict AA score:</span>
          <span class="nm-predict-score-val">${pl.score.toFixed(3)}</span>
        </div>
      `;
      div.addEventListener("click", () => NetMap.highlightPredictedLink(pl));
      predictBox.appendChild(div);
    });
  } else {
    predictBox.innerHTML = '<span style="font-size:0.75rem; color:var(--nm-text-3); padding:12px; display:block;">No link predictions available.</span>';
  }

  // T6 - NLP Semantic Similarities
  const nlpBox = document.getElementById("nm-modal-nlp");
  nlpBox.innerHTML = '';
  const nlpEdges = NetMap.state.semanticEdges || [];
  if (nlpEdges.length) {
    nlpEdges.slice(0, 10).forEach(se => {
      const sName = NetMap.state.nodes.find(n => n.id === se.source)?.name || se.source;
      const tName = NetMap.state.nodes.find(n => n.id === se.target)?.name || se.target;
      const div = document.createElement("div");
      div.className = "nm-nlp-item";
      div.innerHTML = `
        <div class="nm-predict-names-row">
          <span style="color:${DEPT_COLORS[se.source_dept]}">●</span> ${sName}
          <span class="nm-arrow">↔</span>
          <span style="color:${DEPT_COLORS[se.target_dept]}">●</span> ${tName}
        </div>
        <div class="nm-predict-meta" style="margin-top:5px;">
          Similarity Score: ${(se.score * 100).toFixed(0)}%
          <div class="nm-rank-bar-bg" style="height:4px; margin-top:3px;">
            <div class="nm-rank-bar" style="width:${(se.score * 100).toFixed(0)}%; background:var(--nm-accent);"></div>
          </div>
        </div>
      `;
      div.addEventListener("click", () => NetMap.highlightSemanticPair(se.source, se.target));
      nlpBox.appendChild(div);
    });
  } else {
    nlpBox.innerHTML = '<span style="font-size:0.75rem; color:var(--nm-text-3); padding:12px; display:block;">No semantic pairs computed.</span>';
  }
};

// D3 Chord Diagram for T3
NetMap.buildChordDiagram = function() {
  const container = document.getElementById("nm-modal-depts");
  if (!container) return;
  container.innerHTML = '';

  // Gather dept codes present in nodes
  const deptSet = new Set();
  NetMap.state.nodes.forEach(n => { if (n.dept_code) deptSet.add(n.dept_code); });
  const depts = [...deptSet].sort();
  const n = depts.length;
  if (n < 2) {
    container.innerHTML = '<p style="color:var(--nm-text-3);font-size:0.82rem;padding:12px;">Not enough departments for chord diagram.</p>';
    return;
  }

  // Build n×n matrix from edges
  const deptIdx = {};
  depts.forEach((d, i) => { deptIdx[d] = i; });
  const matrix = Array.from({ length: n }, () => new Array(n).fill(0));

  NetMap.state.edges.forEach(e => {
    const s = NetMap.state.nodes.find(nd => nd.id === (e.source.id || e.source));
    const t = NetMap.state.nodes.find(nd => nd.id === (e.target.id || e.target));
    if (s && t && deptIdx[s.dept_code] !== undefined && deptIdx[t.dept_code] !== undefined) {
      const si = deptIdx[s.dept_code];
      const ti = deptIdx[t.dept_code];
      matrix[si][ti] += (e.weight || 1);
      if (si !== ti) matrix[ti][si] += (e.weight || 1);
    }
  });

  // Chord diagram SVG
  const size = 400;
  const outerRadius = size / 2 - 30;
  const innerRadius = outerRadius - 20;

  // Chord diagram wrapper
  const wrapper = document.createElement('div');
  wrapper.className = 'nm-chord-wrapper';

  const svgEl = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svgEl.setAttribute("width", size);
  svgEl.setAttribute("height", size);
  svgEl.setAttribute("viewBox", `0 0 ${size} ${size}`);
  svgEl.style.display = "block";
  svgEl.style.margin = "0 auto";
  wrapper.appendChild(svgEl);
  container.appendChild(wrapper);

  const svg = d3.select(svgEl).append("g")
    .attr("transform", `translate(${size/2},${size/2})`);

  const chord = d3.chord().padAngle(0.04).sortSubgroups(d3.descending);
  const chords = chord(matrix);

  const arc = d3.arc().innerRadius(innerRadius).outerRadius(outerRadius);
  const ribbon = d3.ribbon().radius(innerRadius);

  // Tooltip element
  let chordTip = document.getElementById("nm-chord-tooltip");
  if (!chordTip) {
    chordTip = document.createElement("div");
    chordTip.id = "nm-chord-tooltip";
    chordTip.style.cssText = `
      position:fixed;display:none;background:rgba(255,255,255,0.97);border:1px solid var(--nm-border);
      border-radius:8px;padding:8px 12px;font-size:0.76rem;font-weight:500;box-shadow:var(--nm-shadow-lg);
      pointer-events:none;z-index:500;color:var(--nm-text);max-width:200px;
    `;
    document.body.appendChild(chordTip);
  }

  // Draw groups (arcs)
  const group = svg.append("g").selectAll("g")
    .data(chords.groups)
    .join("g");

  group.append("path")
    .attr("class", "nm-chord-arc")
    .attr("d", arc)
    .attr("fill", d => DEPT_COLORS[depts[d.index]] || DEPT_COLORS.UNK)
    .attr("stroke", "white")
    .attr("stroke-width", 1.5)
    .attr("fill-opacity", 0.85)
    .attr("cursor", "pointer")
    .on("mouseover", function(event, d) {
      chordTip.textContent = `${depts[d.index]} — ${DEPT_LABELS[depts[d.index]] || depts[d.index]}`;
      chordTip.style.display = "block";
    })
    .on("mousemove", function(event) {
      chordTip.style.left = (event.clientX + 12) + "px";
      chordTip.style.top = (event.clientY - 20) + "px";
    })
    .on("mouseout", function() {
      chordTip.style.display = "none";
    })
    .on("click", function(event, d) {
      NetMap.filterByDept(depts[d.index]);
    });

  // Dept code labels on arcs
  group.append("text")
    .each(d => { d.angle = (d.startAngle + d.endAngle) / 2; })
    .attr("dy", "0.35em")
    .attr("transform", d => `
      rotate(${(d.angle * 180 / Math.PI - 90)})
      translate(${outerRadius + 8})
      ${d.angle > Math.PI ? "rotate(180)" : ""}
    `)
    .attr("text-anchor", d => d.angle > Math.PI ? "end" : "start")
    .attr("fill", d => DEPT_COLORS[depts[d.index]] || DEPT_COLORS.UNK)
    .attr("font-size", 10)
    .attr("font-weight", 700)
    .attr("font-family", "Inter, sans-serif")
    .attr("pointer-events", "none")
    .text(d => depts[d.index]);

  // Draw ribbons (chords)
  svg.append("g")
    .attr("fill-opacity", 0.55)
    .selectAll("path")
    .data(chords)
    .join("path")
    .attr("d", ribbon)
    .attr("fill", d => DEPT_COLORS[depts[d.target.index]] || DEPT_COLORS.UNK)
    .attr("stroke", "white")
    .attr("stroke-width", 0.5)
    .attr("cursor", "pointer")
    .on("mouseover", function(event, d) {
      const srcDept = depts[d.source.index];
      const tgtDept = depts[d.target.index];
      const count = Math.round(matrix[d.source.index][d.target.index]);
      chordTip.innerHTML = `<strong>${srcDept} ↔ ${tgtDept}</strong><br>${count} collaboration${count !== 1 ? 's' : ''}`;
      chordTip.style.display = "block";
      d3.select(this).attr("fill-opacity", 0.85);
    })
    .on("mousemove", function(event) {
      chordTip.style.left = (event.clientX + 12) + "px";
      chordTip.style.top = (event.clientY - 20) + "px";
    })
    .on("mouseout", function() {
      chordTip.style.display = "none";
      d3.select(this).attr("fill-opacity", 0.55);
    })
    .on("click", function(event, d) {
      NetMap.filterByDept(depts[d.source.index]);
    });

  // Compact stats table below chord
  const deptStats = {};
  NetMap.state.nodes.forEach(n => {
    if (!deptStats[n.dept_code]) deptStats[n.dept_code] = { count: 0, cross: 0, label: DEPT_LABELS[n.dept_code] };
    deptStats[n.dept_code].count++;
  });
  NetMap.state.edges.forEach(e => {
    if (e.is_cross_dept) {
      if (deptStats[e.source_dept]) deptStats[e.source_dept].cross++;
      if (deptStats[e.target_dept]) deptStats[e.target_dept].cross++;
    }
  });

  const statsTitle = document.createElement('p');
  statsTitle.className = 'nm-panel-desc';
  statsTitle.style.marginTop = '16px';
  statsTitle.innerHTML = '<strong>Department Reference</strong> — Click a row or chord arc to filter the graph.';
  container.appendChild(statsTitle);

  const statsGrid = document.createElement('div');
  statsGrid.className = 'nm-depts-list';
  Object.entries(deptStats).forEach(([code, ds]) => {
    const row = document.createElement("div");
    row.className = "nm-dept-row";
    row.style.setProperty('--dept-color', DEPT_COLORS[code]);
    row.innerHTML = `
      <div class="nm-dept-color-bar"></div>
      <div class="nm-dept-info">
        <div class="nm-dept-name">${code} — ${ds.label}</div>
        <div class="nm-dept-stats-row">
          <div class="nm-dept-substat">Faculty: <span>${ds.count}</span></div>
          <div class="nm-dept-substat">Cross-Dept: <span>${ds.cross}</span></div>
        </div>
      </div>
    `;
    row.addEventListener("click", () => NetMap.filterByDept(code));
    statsGrid.appendChild(row);
  });
  container.appendChild(statsGrid);
};

NetMap.initials = function(name) {
  if (!name) return "";
  const cleanStr = name.replace(/[áéíóúÁÉÍÓÚ]/g, c => "aeiouAEIOU"["áéíóúÁÉÍÓÚ".indexOf(c)]);
  const parts = cleanStr.trim().split(/\s+/);
  return (parts[0][0] + (parts[1] ? parts[1][0] : "")).toUpperCase();
};

NetMap.shortName = function(name) {
  if (!name) return "";
  const parts = name.trim().split(/\s+/);
  return parts[0] + " " + (parts[parts.length - 1] || "");
};

NetMap.positionTooltip = function(event) {
  const tooltip = document.getElementById("nm-tooltip");
  const svgNode = document.getElementById("nm-network-svg");
  const svgRect = svgNode.getBoundingClientRect();
  let x = event.clientX - svgRect.left + 14;
  let y = event.clientY - svgRect.top - 10;
  if (x + 240 > svgRect.width) x -= 260;
  if (y + 240 > svgRect.height) y -= 250;
  tooltip.style.left = x + "px";
  tooltip.style.top = y + "px";
};
