/* ==========================================================================
   GRAPH COMPILER AND FORCE SIMULATION (graph.js)
   ========================================================================== */

// Compute department centroid angle positions (fixed, deterministic)
NetMap.getDeptCentroids = function(radius, cx, cy) {
  const deptCodes = Object.keys(window.DEPT_COLORS);
  const centroids = {};
  deptCodes.forEach((code, i) => {
    const angle = (2 * Math.PI * i) / deptCodes.length - Math.PI / 2;
    centroids[code] = {
      x: cx + radius * Math.cos(angle),
      y: cy + radius * Math.sin(angle)
    };
  });
  return centroids;
};

NetMap.buildGraph = function(width, height) {
  NetMap.state.svgSelection = d3.select("#nm-network-svg")
    .attr("width", width)
    .attr("height", height);

  NetMap.state.zoomBehavior = d3.zoom()
    .scaleExtent([0.15, 4])
    .on("zoom", (event) => {
      NetMap.state.gMainSelection.attr("transform", event.transform);
    });
  NetMap.state.svgSelection.call(NetMap.state.zoomBehavior);

  NetMap.state.gMainSelection = NetMap.state.svgSelection.append("g");

  // Background cluster group (lowest z-order)
  NetMap.state.gMainSelection.append("g").attr("class", "background-clusters");

  // Semantic ellipses group
  NetMap.state.gMainSelection.append("g").attr("class", "semantic-ellipses");

  // Link grouping container
  NetMap.state.gMainSelection.append("g").attr("class", "links");

  // Pre-assign deterministic starting positions from stablePositions or centroids
  const cx = width / 2, cy = height / 2;
  const centroids = NetMap.getDeptCentroids(280, cx, cy);
  const hasStable = Object.keys(NetMap.state.stablePositions).length > 0;

  NetMap.state.nodes.forEach(n => {
    if (hasStable && NetMap.state.stablePositions[n.id]) {
      n.x = NetMap.state.stablePositions[n.id].x;
      n.y = NetMap.state.stablePositions[n.id].y;
    } else {
      const c = centroids[n.dept_code] || { x: cx, y: cy };
      n.x = c.x + (Math.random() - 0.5) * 60;
      n.y = c.y + (Math.random() - 0.5) * 60;
    }
  });

  NetMap.renderLinks();

  // Node Groups initialization
  const maxNodeVal = d3.max(NetMap.state.nodes, d => NetMap.getMetricValue(d, NetMap.state.sizeMetric)) || 1;
  const rScale = d3.scaleSqrt().domain([0, maxNodeVal]).range([9, 28]);

  const nodeGroups = NetMap.state.gMainSelection.append("g")
    .attr("class", "nodes")
    .selectAll("g")
    .data(NetMap.state.nodes)
    .join("g")
    .attr("class", "nm-node-group")
    .attr("id", d => "node-" + d.id)
    .call(d3.drag()
      .on("start", dragStart)
      .on("drag", dragged)
      .on("end", dragEnd))
    .on("mouseover", handleMouseOver)
    .on("mouseout", handleMouseOut)
    .on("click", handleNodeClick);

  NetMap.state.nodeSelection = nodeGroups;

  const defs = NetMap.state.svgSelection.select("defs");

  // White node bg circle
  nodeGroups.append("circle")
    .attr("class", "bg")
    .attr("r", d => NetMap.getCurrentNodeRadius(d) + 2)
    .attr("fill", "var(--nm-surface)");

  // Coloured body circle
  nodeGroups.append("circle")
    .attr("class", "body")
    .attr("r", d => NetMap.getCurrentNodeRadius(d))
    .attr("fill", d => DEPT_COLORS[d.dept_code] || DEPT_COLORS.UNK);

  // Betweenness bridge ring
  const maxBet = d3.max(NetMap.state.nodes, d => d.betweenness_centrality) || 1;
  const betScale = d3.scaleLinear().domain([0, maxBet]).range([0, 1]);
  nodeGroups.append("circle")
    .attr("class", "nm-bridge-ring")
    .attr("r", d => NetMap.getCurrentNodeRadius(d) + 5)
    .attr("stroke", d => betScale(d.betweenness_centrality) > 0.3 ? "var(--nm-warn)" : "transparent")
    .attr("stroke-opacity", d => betScale(d.betweenness_centrality));

  // Initials (always loaded in background as a fallback)
  nodeGroups.append("text")
    .attr("class", "nm-node-text-initials")
    .text(d => NetMap.initials(d.name))
    .attr("font-size", d => Math.max(8, NetMap.getCurrentNodeRadius(d) * 0.55));

  // Photos loading via CORS Proxy with fade in
  nodeGroups.each(function(d) {
    if (!d.photo_url) return;
    const r = NetMap.getCurrentNodeRadius(d);
    const cpId = "cp-" + d.id;

    defs.append("clipPath").attr("id", cpId)
      .append("circle").attr("r", r);

    const proxiedUrl = "/api/photo?src=" + encodeURIComponent(d.photo_url);
    d3.select(this).append("image")
      .attr("class", "node-photo")
      .attr("href", proxiedUrl)
      .attr("x", -r).attr("y", -r)
      .attr("width", r * 2).attr("height", r * 2)
      .attr("clip-path", `url(#${cpId})`)
      .attr("preserveAspectRatio", "xMidYMid slice")
      .attr("opacity", 0)
      .on("error", function() {
        d3.select(this).remove();
      })
      .transition().duration(300).delay(200)
      .attr("opacity", 1);
  });

  // Label names
  nodeGroups.append("text")
    .attr("class", "nm-node-text-label")
    .attr("dy", d => NetMap.getCurrentNodeRadius(d) + 11)
    .text(d => {
      const base = NetMap.shortName(d.name);
      const metric = NetMap.state.sizeMetric;
      if (metric === 'hindex') return `${base} (h:${d.h_index || 0})`;
      if (metric === 'citations') return `${base} (c:${d.citations || 0})`;
      return base;
    });

  // Drag handlers
  function dragStart(event, d) {
    if (!event.active) NetMap.state.simulation.alphaTarget(0.3).restart();
    d.fx = d.x;
    d.fy = d.y;
  }
  function dragged(event, d) {
    d.fx = event.x;
    d.fy = event.y;
  }
  function dragEnd(event, d) {
    if (!event.active) NetMap.state.simulation.alphaTarget(0);
    if (NetMap.state.hindexOrderActive) {
      d.fx = null;
      d.fy = null;
      d3.select(this).transition().duration(350)
        .attrTween("transform", () => {
          const ix = d3.interpolate(d.x, d.targetX);
          const iy = d3.interpolate(d.y, d.targetY);
          return t => {
            d.x = ix(t);
            d.y = iy(t);
            return `translate(${d.x},${d.y})`;
          };
        })
        .on("end", () => {
          d.fx = d.targetX;
          d.fy = d.targetY;
          d.x = d.targetX;
          d.y = d.targetY;
        });
    } else {
      d.fx = null;
      d.fy = null;
    }
  }

  // Hover handlers
  function handleMouseOver(event, d) {
    const scale = NetMap.state.hindexOrderActive ? 1.0 : 1.2;
    d3.select(this).select("circle.body")
      .transition().duration(150)
      .attr("r", NetMap.getCurrentNodeRadius(d) * scale);

    const tooltip = document.getElementById("nm-tooltip");
    tooltip.style.display = "block";

    const topAreas = (d.areas || []).slice(0, 3);
    const areasHtml = topAreas.map(a => `<span class="nm-detail-area-tag">${a}</span>`).join(" ");

    tooltip.innerHTML = `
      <div class="nm-tt-name">${d.name}</div>
      <div class="nm-tt-dept" style="color:${DEPT_COLORS[d.dept_code]}">${DEPT_LABELS[d.dept_code]}</div>
      <div class="nm-tt-metric-row"><span class="nm-tt-metric-lbl">h-index</span><span class="nm-tt-metric-val">${d.h_index || 0}</span></div>
      <div class="nm-tt-metric-row"><span class="nm-tt-metric-lbl">Publications</span><span class="nm-tt-metric-val">${d.pubs || 0}</span></div>
      <div class="nm-tt-metric-row"><span class="nm-tt-metric-lbl">Connections</span><span class="nm-tt-metric-val">${d.degree || 0}</span></div>
      <div class="nm-tt-metric-row"><span class="nm-tt-metric-lbl">Betweenness</span><span class="nm-tt-metric-val">${(d.betweenness_centrality || 0).toFixed(3)}</span></div>
      <div class="nm-tt-metric-row"><span class="nm-tt-metric-lbl">PageRank</span><span class="nm-tt-metric-val">${(d.pagerank || 0).toFixed(4)}</span></div>
      <div class="nm-detail-areas" style="margin-top: 8px;">${areasHtml}</div>
    `;
    NetMap.positionTooltip(event);
  }

  function handleMouseOut(event, d) {
    d3.select(this).select("circle.body")
      .transition().duration(200)
      .attr("r", NetMap.getCurrentNodeRadius(d));

    if (NetMap.state.selectedNodeId !== d.id) {
      document.getElementById("nm-tooltip").style.display = "none";
    }
  }

  function handleNodeClick(event, d) {
    event.stopPropagation();
    NetMap.selectNodeById(d.id);
  }
};

NetMap.tick = function() {
  if (NetMap.state.linkSelection) {
    NetMap.state.linkSelection
      .attr("x1", d => d.source.x)
      .attr("y1", d => d.source.y)
      .attr("x2", d => d.target.x)
      .attr("y2", d => d.target.y);
  }
  if (NetMap.state.nodeSelection) {
    NetMap.state.nodeSelection
      .attr("transform", d => `translate(${d.x},${d.y})`);
  }

  // Update cluster background circles positions
  if (NetMap.state.activeViewMode === 'cluster') {
    NetMap.updateClusterBubbles();
  }

  // Update semantic ellipses if in semantic mode
  if (NetMap.state.edgeMode === 'semantic') {
    NetMap.updateSemanticEllipses();
  }

  // Save stable positions when simulation settles
  const sim = NetMap.state.simulation;
  if (sim && sim.alpha() < 0.02) {
    NetMap.state.nodes.forEach(n => {
      NetMap.state.stablePositions[n.id] = { x: n.x, y: n.y };
    });
  }

  // Mantra animation check
  if (NetMap.state.simulation && NetMap.state.simulation.alpha() < 0.05 && !NetMap.state.mantraPlayed) {
    NetMap.state.mantraPlayed = true;
    if (!sessionStorage.getItem('nm_mantra_run')) {
      sessionStorage.setItem('nm_mantra_run', 'true');
      NetMap.runMantraAnimation();
    }
  }
};

NetMap.renderLinks = function() {
  const isSemantic = NetMap.state.edgeMode === 'semantic';
  const rawEdges = isSemantic ? NetMap.state.semanticEdges : NetMap.state.edges;

  // Re-map sources and targets to object nodes references
  const nodeMap = {};
  NetMap.state.nodes.forEach(n => { nodeMap[n.id] = n; });
  const mappedLinks = rawEdges.map(e => ({
    ...e,
    source: nodeMap[e.source] || e.source,
    target: nodeMap[e.target] || e.target
  }));

  // Remove old links fully
  const linksG = NetMap.state.gMainSelection.select(".links");
  linksG.selectAll("line").remove();

  const maxWeight = d3.max(NetMap.state.edges, e => e.weight) || 1;
  const edgeScale = d3.scaleLinear().domain([1, maxWeight]).range([1, 5]);

  NetMap.state.linkSelection = linksG.selectAll("line")
    .data(mappedLinks)
    .join("line")
    .attr("class", d => `nm-link ${d.is_cross_dept ? 'cross-dept' : ''}`)
    .attr("stroke-dasharray", isSemantic ? "4 3" : null)
    .attr("stroke", isSemantic ? "var(--nm-accent)" : null)
    .attr("stroke-width", isSemantic ? 1.5 : d => edgeScale(d.weight || 1))
    .attr("stroke-opacity", 0.6);

  // Simulation setup
  if (!NetMap.state.simulation) {
    NetMap.state.simulation = d3.forceSimulation(NetMap.state.nodes)
      .on("tick", NetMap.tick);
  }

  NetMap.updateForces(mappedLinks);
};

// Central force configuration — responds to current view mode
NetMap.updateForces = function(mappedLinks) {
  const mode = NetMap.state.activeViewMode;
  const isSemantic = NetMap.state.edgeMode === 'semantic';
  const cx = NetMap.state.width / 2;
  const cy = NetMap.state.height / 2;
  const maxNodeVal = d3.max(NetMap.state.nodes, d => NetMap.getMetricValue(d, NetMap.state.sizeMetric)) || 1;
  const rScale = d3.scaleSqrt().domain([0, maxNodeVal]).range([9, 28]);

  const sim = NetMap.state.simulation;

  // Use provided links or re-map current edges
  let links = mappedLinks;
  if (!links) {
    const edgeData = isSemantic ? NetMap.state.semanticEdges : NetMap.state.edges;
    const nodeMap = {};
    NetMap.state.nodes.forEach(n => { nodeMap[n.id] = n; });
    links = edgeData.map(e => ({
      ...e,
      source: nodeMap[e.source] || e.source,
      target: nodeMap[e.target] || e.target
    }));
  }

  // Remove custom forces
  sim.force("semantic-pull", null);
  sim.force("cluster-x", null);
  sim.force("cluster-y", null);

  if (mode === 'cluster') {
    // Cluster mode: pull nodes to dept centroids at radius 200
    const centroids = NetMap.getDeptCentroids(200, cx, cy);
    sim.force("cluster-x", d3.forceX(d => {
      const c = centroids[d.dept_code] || { x: cx };
      return c.x;
    }).strength(0.4));
    sim.force("cluster-y", d3.forceY(d => {
      const c = centroids[d.dept_code] || { y: cy };
      return c.y;
    }).strength(0.4));
    sim.force("charge", d3.forceManyBody().strength(-420).distanceMax(450));
    sim.force("collision", d3.forceCollide().radius(d => rScale(NetMap.getMetricValue(d, NetMap.state.sizeMetric)) * 1.15 + 10));
    sim.force("center", d3.forceCenter(cx, cy));
    sim.force("x", d3.forceX(cx).strength(0.01));
    sim.force("y", d3.forceY(cy).strength(0.01));
    sim.force("link", d3.forceLink(links).id(d => d.id).distance(60).strength(0.1));
  } else if (isSemantic) {
    // Semantic mode: semantic-pull custom force + increased repulsion for non-similar nodes
    const semanticPairs = new Map();
    NetMap.state.semanticEdges.forEach(e => {
      const key = (e.source.id || e.source) + "|" + (e.target.id || e.target);
      semanticPairs.set(key, e.score || 0);
    });
    const semanticNodeIds = new Set();
    NetMap.state.semanticEdges.forEach(e => {
      semanticNodeIds.add(e.source.id || e.source);
      semanticNodeIds.add(e.target.id || e.target);
    });

    sim.force("charge", d3.forceManyBody().strength(d =>
      semanticNodeIds.has(d.id) ? -420 : -600
    ).distanceMax(500));
    sim.force("collision", d3.forceCollide().radius(d => rScale(NetMap.getMetricValue(d, NetMap.state.sizeMetric)) + 10));
    sim.force("center", d3.forceCenter(cx, cy));
    sim.force("x", d3.forceX(cx).strength(0.03));
    sim.force("y", d3.forceY(cy).strength(0.03));
    sim.force("link", d3.forceLink(links).id(d => d.id).distance(80).strength(0.4));

    // Custom semantic pull force
    const nodeMap = {};
    NetMap.state.nodes.forEach(n => { nodeMap[n.id] = n; });
    sim.force("semantic-pull", function(alpha) {
      NetMap.state.semanticEdges.forEach(e => {
        const s = nodeMap[e.source.id || e.source];
        const t = nodeMap[e.target.id || e.target];
        if (!s || !t) return;
        const score = e.score || 0;
        const strength = score * 0.6 * alpha;
        const midX = (s.x + t.x) / 2;
        const midY = (s.y + t.y) / 2;
        s.vx += (midX - s.x) * strength;
        s.vy += (midY - s.y) * strength;
        t.vx += (midX - t.x) * strength;
        t.vy += (midY - t.y) * strength;
      });
    });
  } else {
    // Default forces
    sim.force("charge", d3.forceManyBody().strength(-420).distanceMax(450));
    sim.force("collision", d3.forceCollide().radius(d => rScale(NetMap.getMetricValue(d, NetMap.state.sizeMetric)) + 10));
    sim.force("center", d3.forceCenter(cx, cy));
    sim.force("x", d3.forceX(cx).strength(0.035));
    sim.force("y", d3.forceY(cy).strength(0.035));
    sim.force("link", d3.forceLink(links).id(d => d.id).distance(d => {
      const sd = d.source.dept_code, td = d.target.dept_code;
      return sd === td ? 70 : 110;
    }).strength(0.65));
  }

  sim.alpha(0.8).restart();
};

// Update cluster background bubbles on every tick
NetMap.updateClusterBubbles = function() {
  const g = NetMap.state.gMainSelection.select(".background-clusters");
  if (g.empty()) return;

  // Re-compute centroid from actual node positions
  const deptNodes = {};
  NetMap.state.nodes.forEach(n => {
    if (!deptNodes[n.dept_code]) deptNodes[n.dept_code] = [];
    deptNodes[n.dept_code].push(n);
  });

  const circles = g.selectAll("circle.cluster-bubble").data(Object.entries(deptNodes), d => d[0]);
  circles.join(
    enter => enter.append("circle").attr("class", "cluster-bubble"),
    update => update,
    exit => exit.remove()
  )
  .attr("cx", ([code, nodes]) => d3.mean(nodes, n => n.x))
  .attr("cy", ([code, nodes]) => d3.mean(nodes, n => n.y))
  .attr("r", ([code, nodes]) => Math.max(40, Math.sqrt(nodes.length) * 28))
  .attr("fill", ([code]) => DEPT_COLORS[code] || DEPT_COLORS.UNK)
  .attr("fill-opacity", 0.05)
  .attr("stroke", ([code]) => DEPT_COLORS[code] || DEPT_COLORS.UNK)
  .attr("stroke-opacity", 0.15)
  .attr("stroke-width", 1.5);

  // Dept code labels
  const labels = g.selectAll("text.cluster-label").data(Object.entries(deptNodes), d => d[0]);
  labels.join(
    enter => enter.append("text").attr("class", "cluster-label"),
    update => update,
    exit => exit.remove()
  )
  .attr("x", ([code, nodes]) => d3.mean(nodes, n => n.x))
  .attr("y", ([code, nodes]) => d3.mean(nodes, n => n.y))
  .attr("text-anchor", "middle")
  .attr("dominant-baseline", "central")
  .attr("font-size", 24)
  .attr("font-weight", 700)
  .attr("fill", ([code]) => DEPT_COLORS[code] || "#64748b")
  .attr("fill-opacity", 0.10)
  .attr("pointer-events", "none")
  .text(([code]) => code);
};

// Simple union-find for semantic cluster detection
NetMap.buildSemanticComponents = function() {
  const parent = {};
  const find = id => {
    if (parent[id] === undefined) parent[id] = id;
    if (parent[id] !== id) parent[id] = find(parent[id]);
    return parent[id];
  };
  const union = (a, b) => { parent[find(a)] = find(b); };

  NetMap.state.semanticEdges.forEach(e => {
    union(e.source.id || e.source, e.target.id || e.target);
  });

  const components = {};
  NetMap.state.semanticEdges.forEach(e => {
    const sId = e.source.id || e.source;
    const tId = e.target.id || e.target;
    [sId, tId].forEach(id => {
      const root = find(id);
      if (!components[root]) components[root] = new Set();
      components[root].add(id);
    });
  });
  return components;
};

// Update semantic bounding ellipses on every tick
NetMap.updateSemanticEllipses = function() {
  const g = NetMap.state.gMainSelection.select(".semantic-ellipses");
  if (g.empty()) return;

  const components = NetMap.buildSemanticComponents();
  const nodeMap = {};
  NetMap.state.nodes.forEach(n => { nodeMap[n.id] = n; });

  const compData = Object.entries(components).map(([root, ids]) => {
    const nodes = [...ids].map(id => nodeMap[id]).filter(Boolean);
    if (nodes.length < 2) return null;
    const xs = nodes.map(n => n.x), ys = nodes.map(n => n.y);
    const minX = d3.min(xs), maxX = d3.max(xs), minY = d3.min(ys), maxY = d3.max(ys);
    const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
    const rx = Math.max(40, (maxX - minX) / 2 + 40);
    const ry = Math.max(40, (maxY - minY) / 2 + 40);
    // Pick most common dept color
    const deptCount = {};
    nodes.forEach(n => { deptCount[n.dept_code] = (deptCount[n.dept_code] || 0) + 1; });
    const topDept = Object.entries(deptCount).sort((a, b) => b[1] - a[1])[0]?.[0] || 'UNK';
    return { root, cx, cy, rx, ry, color: DEPT_COLORS[topDept] || DEPT_COLORS.UNK };
  }).filter(Boolean);

  g.selectAll("ellipse.semantic-cluster").data(compData, d => d.root)
    .join(
      enter => enter.append("ellipse").attr("class", "semantic-cluster"),
      update => update,
      exit => exit.remove()
    )
    .attr("cx", d => d.cx)
    .attr("cy", d => d.cy)
    .attr("rx", d => d.rx)
    .attr("ry", d => d.ry)
    .attr("fill", d => d.color)
    .attr("fill-opacity", 0.07)
    .attr("stroke", d => d.color)
    .attr("stroke-opacity", 0.2)
    .attr("stroke-width", 1.5)
    .attr("pointer-events", "none");
};
