/* ==========================================================================
   INTERACTION CONTROLS AND TRANSITIONS (controls.js)
   ========================================================================== */

NetMap.toggleEdgeMode = function(mode) {
  NetMap.state.edgeMode = mode;
  NetMap.renderLinks();

  // Sync new edge toggle button text in toolbar
  const edgeLbl = document.getElementById('nm-edge-mode-label');
  if (edgeLbl) {
    edgeLbl.textContent = mode === 'semantic' ? '⟷ Similarity' : '⟷ Co-authors';
  }

  // Clean up semantic ellipses when leaving semantic
  if (mode !== 'semantic') {
    const g = NetMap.state.gMainSelection && NetMap.state.gMainSelection.select(".semantic-ellipses");
    if (g && !g.empty()) g.selectAll("ellipse.semantic-cluster").remove();
  }
};

NetMap.resizeNodes = function(metric) {
  NetMap.state.sizeMetric = metric;

  // Transition SVG bodies, bgs, rings, and images
  NetMap.state.nodeSelection.selectAll("circle.body")
    .transition().duration(400)
    .attr("r", d => NetMap.getCurrentNodeRadius(d));

  NetMap.state.nodeSelection.selectAll("circle.bg")
    .transition().duration(400)
    .attr("r", d => NetMap.getCurrentNodeRadius(d) + 2);

  NetMap.state.nodeSelection.selectAll("circle.nm-bridge-ring")
    .transition().duration(400)
    .attr("r", d => NetMap.getCurrentNodeRadius(d) + 5);

  NetMap.state.nodeSelection.selectAll("image.node-photo")
    .transition().duration(400)
    .attr("x", d => -NetMap.getCurrentNodeRadius(d))
    .attr("y", d => -NetMap.getCurrentNodeRadius(d))
    .attr("width", d => NetMap.getCurrentNodeRadius(d) * 2)
    .attr("height", d => NetMap.getCurrentNodeRadius(d) * 2);

  // Update clip paths
  NetMap.state.nodes.forEach(d => {
    const cpId = "cp-" + d.id;
    d3.select("#" + cpId).select("circle")
      .transition().duration(400)
      .attr("r", NetMap.getCurrentNodeRadius(d));
  });

  // Adjust text baseline and label sizes
  NetMap.state.nodeSelection.selectAll("text.nm-node-text-initials")
    .transition().duration(400)
    .attr("font-size", d => Math.max(8, NetMap.getCurrentNodeRadius(d) * 0.55));

  NetMap.state.nodeSelection.selectAll("text.nm-node-text-label")
    .transition().duration(400)
    .attr("dy", d => NetMap.getCurrentNodeRadius(d) + 11)
    .text(d => {
      const base = NetMap.shortName(d.name);
      if (metric === 'hindex') return `${base} (h:${d.h_index || 0})`;
      if (metric === 'citations') return `${base} (c:${d.citations || 0})`;
      return base;
    });

  // Recalculate collision force
  if (NetMap.state.simulation) {
    NetMap.state.simulation.force("collision")
      .radius(d => NetMap.getCurrentNodeRadius(d) + 10);
    NetMap.state.simulation.alpha(0.25).restart();
  }
};

// VIEW MODE CONTENT — explanation texts
const NM_VIEW_EXPLANATIONS = {
  default: {
    title: "Standard Collaboration Network",
    what: "Who works with whom at UTEC?",
    how: "Edges are direct co-authorship links extracted from the CRIS portal."
  },
  degree: {
    title: "Degree Centrality",
    what: "Who has the most co-authorship connections?",
    how: "Node opacity scales with the number of direct collaborators."
  },
  betweenness: {
    title: "Betweenness Centrality",
    what: "Who acts as a bridge between research clusters?",
    how: "Computed as the fraction of shortest paths passing through each node (NetworkX, normalized)."
  },
  cluster: {
    title: "Department Clustering",
    what: "Which professors belong to the same faculty?",
    how: "Nodes are pulled toward their department centroid using D3 forceX/forceY."
  },
  community: {
    title: "Modularity Communities",
    what: "Which professors form organic research clusters beyond department boundaries?",
    how: "Detected using greedy modularity maximization (Newman-Girvan, NetworkX)."
  },
  semantic: {
    title: "NLP Semantic Similarity",
    what: "Which professors share deep research interests but have never co-authored?",
    how: "Edges computed via TF-IDF cosine similarity on research area keywords (scikit-learn)."
  }
};

NetMap.showExplanation = function(mode) {
  // Clear any existing timer
  if (NetMap.state.explanationTimer) {
    clearTimeout(NetMap.state.explanationTimer);
    NetMap.state.explanationTimer = null;
  }

  const info = NM_VIEW_EXPLANATIONS[mode];
  if (!info) return;

  let card = document.getElementById('nm-view-explanation');
  if (!card) {
    card = document.createElement('div');
    card.id = 'nm-view-explanation';
    card.className = 'nm-explanation-card';
    // Append inside canvas area so it's positioned relative to the graph
    (document.getElementById('nm-canvas-area') || document.querySelector('.nm-main')).appendChild(card);
  }

  card.innerHTML = `
    <div class="nm-exp-title">${info.title}</div>
    <div class="nm-exp-what">${info.what}</div>
    <div class="nm-exp-how">${info.how}</div>
    <button class="nm-exp-close" onclick="NetMap.dismissExplanation()">×</button>
  `;

  // Trigger fade-in
  card.style.opacity = '0';
  card.style.display = 'block';
  requestAnimationFrame(() => { card.style.opacity = '1'; });

  // Auto-dismiss after 5 seconds
  NetMap.state.explanationTimer = setTimeout(() => NetMap.dismissExplanation(), 5000);
};

NetMap.dismissExplanation = function() {
  if (NetMap.state.explanationTimer) {
    clearTimeout(NetMap.state.explanationTimer);
    NetMap.state.explanationTimer = null;
  }
  const card = document.getElementById('nm-view-explanation');
  if (!card) return;
  card.style.opacity = '0';
  setTimeout(() => { if (card.parentNode) card.style.display = 'none'; }, 300);
};

NetMap.applyViewMode = function(mode) {
  const prevMode = NetMap.state.activeViewMode;
  NetMap.state.activeViewMode = mode;

  // ── FIX: Set node colors SYNCHRONOUSLY (no transition) before any resize
  //    transitions fire. D3 unnamed transitions cancel each other on the same
  //    elements, so resetHighlight's fill transition would get killed by
  //    resizeNodes's radius transition, leaving nodes with wrong fill-opacity.
  if (NetMap.state.nodeSelection) {
    // Remove dimmed/highlighted classes immediately
    NetMap.state.nodeSelection.classed('dimmed', false);
    if (NetMap.state.linkSelection) {
      NetMap.state.linkSelection.classed('dimmed highlighted', false);
    }
    if (NetMap.state.gMainSelection) {
      NetMap.state.gMainSelection.selectAll('.pred-link-tmp').remove();
    }

    // Apply correct colors synchronously (no transition = no conflict)
    const commColors = d3.schemeTableau10;
    if (mode === 'community') {
      NetMap.state.nodeSelection.selectAll('circle.body')
        .attr('fill', d => commColors[d.community % commColors.length])
        .attr('fill-opacity', 1);
    } else if (mode === 'degree') {
      const maxVal = d3.max(NetMap.state.nodes, d => d.degree) || 1;
      const sc = d3.scaleLinear().domain([0, maxVal]).range([0.2, 1]);
      NetMap.state.nodeSelection.selectAll('circle.body')
        .attr('fill', d => DEPT_COLORS[d.dept_code] || DEPT_COLORS.UNK)
        .attr('fill-opacity', d => sc(d.degree));
    } else if (mode === 'betweenness') {
      const maxVal = d3.max(NetMap.state.nodes, d => d.betweenness_centrality) || 1;
      const sc = d3.scaleLinear().domain([0, maxVal]).range([0.2, 1]);
      NetMap.state.nodeSelection.selectAll('circle.body')
        .attr('fill', d => DEPT_COLORS[d.dept_code] || DEPT_COLORS.UNK)
        .attr('fill-opacity', d => sc(d.betweenness_centrality));
    } else {
      // default, cluster, semantic — always full dept color
      NetMap.state.nodeSelection.selectAll('circle.body')
        .attr('fill', d => DEPT_COLORS[d.dept_code] || DEPT_COLORS.UNK)
        .attr('fill-opacity', 1);
    }
  }

  // Show explanation card
  NetMap.showExplanation(mode);

  if (!NetMap.state.nodeSelection) {
    // Rebuild legend even if graph isn't ready yet
    NetMap.buildLegend();
    return;
  }

  // Handle leaving cluster mode — clean up backgrounds and restore edges
  if (prevMode === 'cluster' && mode !== 'cluster') {
    const g = NetMap.state.gMainSelection.select('.background-clusters');
    if (!g.empty()) g.selectAll('*').remove();
    if (NetMap.state.linkSelection) {
      NetMap.state.linkSelection.transition().duration(300).attr('stroke-opacity', 0.6);
    }
  }

  if (NetMap.state.hindexOrderActive) {
    NetMap.applyHIndexLayout();
    NetMap.buildLegend();
    return;
  }

  if (mode === 'semantic') {
    NetMap.toggleEdgeMode('semantic');

    const semanticNodeIds = new Set();
    NetMap.state.semanticEdges.forEach(e => {
      semanticNodeIds.add(e.source.id || e.source);
      semanticNodeIds.add(e.target.id || e.target);
    });
    NetMap.state.nodeSelection.classed('dimmed', d => !semanticNodeIds.has(d.id));
    NetMap.state.linkSelection.classed('dimmed', false);
    NetMap.updateForces();

  } else if (mode === 'cluster') {
    if (NetMap.state.edgeMode === 'semantic') NetMap.toggleEdgeMode('collab');
    // resizeNodes only modifies 'r', 'x', 'y', 'width', 'height', 'font-size', 'dy'
    // — fill/fill-opacity are already set synchronously above, so no conflict
    NetMap.resizeNodes(NetMap.state.sizeMetric);
    if (NetMap.state.linkSelection) {
      NetMap.state.linkSelection.transition().duration(300).attr('stroke-opacity', 0);
    }
    NetMap.updateForces();

  } else {
    if (NetMap.state.edgeMode === 'semantic') NetMap.toggleEdgeMode('collab');
    if (prevMode === 'cluster') NetMap.resizeNodes(NetMap.state.sizeMetric);
    NetMap.updateForces();
  }

  // Rebuild legend to reflect current mode (e.g. community colors)
  NetMap.buildLegend();
};

NetMap.filterByDept = function(code) {
  NetMap.closeModal();
  NetMap.state.activeDeptFilter = code;
  NetMap.state.activeAreaFilter = null;
  NetMap.state.activeCommunityFilter = null;

  if (!NetMap.state.nodeSelection) return;

  if (code === "all") {
    NetMap.resetHighlight();
  } else {
    NetMap.state.nodeSelection.classed("dimmed", d => d.dept_code !== code);
    NetMap.state.linkSelection.classed("dimmed", d => d.source_dept !== code && d.target_dept !== code);
  }
};

NetMap.filterByCommunity = function(index) {
  NetMap.closeModal();
  NetMap.state.activeCommunityFilter = index;
  NetMap.state.activeDeptFilter = "all";
  NetMap.state.activeAreaFilter = null;

  if (!NetMap.state.nodeSelection) return;

  NetMap.state.nodeSelection.classed("dimmed", d => d.community !== index);
  NetMap.state.linkSelection.classed("dimmed", d => {
    const s = NetMap.state.nodes.find(n => n.id === (d.source.id || d.source));
    const t = NetMap.state.nodes.find(n => n.id === (d.target.id || d.target));
    return !s || !t || s.community !== index || t.community !== index;
  });
};

NetMap.filterByArea = function(area) {
  NetMap.closeModal();
  NetMap.state.activeAreaFilter = area;
  NetMap.state.activeDeptFilter = "all";
  NetMap.state.activeCommunityFilter = null;

  if (!NetMap.state.nodeSelection) return;

  const matchingIds = new Set(NetMap.state.nodes.filter(n => n.areas.includes(area)).map(n => n.id));

  NetMap.state.nodeSelection.classed("dimmed", d => !matchingIds.has(d.id));
  NetMap.state.linkSelection.classed("dimmed", d => {
    const sId = d.source.id || d.source;
    const tId = d.target.id || d.target;
    return !matchingIds.has(sId) || !matchingIds.has(tId);
  });
};

NetMap.zoomToFit = function(duration = 800) {
  if (!NetMap.state.nodes.length || !NetMap.state.gMainSelection) return;
  const bounds = NetMap.state.gMainSelection.node().getBBox();
  const parent = NetMap.state.svgSelection.node();
  const fullWidth = parent.clientWidth || NetMap.state.width;
  const fullHeight = parent.clientHeight || NetMap.state.height;
  const width = bounds.width, height = bounds.height;
  if (width === 0 || height === 0) return;
  const midX = bounds.x + width / 2, midY = bounds.y + height / 2;

  const scale = Math.max(0.18, Math.min(3, 0.85 / Math.max(width / fullWidth, height / fullHeight)));
  const trans = [fullWidth / 2 - scale * midX, fullHeight / 2 - scale * midY];

  NetMap.state.svgSelection.transition()
    .duration(duration)
    .call(
      NetMap.state.zoomBehavior.transform,
      d3.zoomIdentity.translate(trans[0], trans[1]).scale(scale)
    );
};

NetMap.zoomToNode = function(node, scale = 1.8, duration = 900) {
  if (!NetMap.state.svgSelection) return;
  const parent = NetMap.state.svgSelection.node();
  const W = parent.clientWidth || NetMap.state.width;
  const H = parent.clientHeight || NetMap.state.height;
  const trans = [W / 2 - scale * node.x, H / 2 - scale * node.y];

  NetMap.state.svgSelection.transition()
    .duration(duration)
    .call(
      NetMap.state.zoomBehavior.transform,
      d3.zoomIdentity.translate(trans[0], trans[1]).scale(scale)
    );
};

NetMap.runMantraAnimation = function() {
  // Step 1: Zoom to fit
  NetMap.zoomToFit(800);

  // Step 2: Zoom in on highest-degree node
  setTimeout(() => {
    const topNode = [...NetMap.state.nodes].sort((a, b) => b.degree - a.degree)[0];
    if (topNode) {
      NetMap.zoomToNode(topNode, 1.8, 900);
    }
  }, 1400);

  // Step 3: Show bottom floating hint card
  setTimeout(() => {
    const hint = document.createElement("div");
    hint.id = "nm-hint-bar";
    hint.style.position = "absolute";
    hint.style.bottom = "20px";
    hint.style.left = "50%";
    hint.style.transform = "translateX(-50%) translateY(20px)";
    hint.style.background = "var(--nm-surface)";
    hint.style.color = "var(--nm-text-2)";
    hint.style.padding = "10px 20px";
    hint.style.borderRadius = "var(--nm-radius-pill)";
    hint.style.boxShadow = "var(--nm-shadow-lg)";
    hint.style.fontSize = "0.78rem";
    hint.style.fontWeight = "600";
    hint.style.zIndex = "120";
    hint.style.opacity = "0";
    hint.style.transition = "all 300ms ease";
    hint.style.border = "1px solid var(--nm-border)";
    hint.textContent = "Explore the network · Click a node for details · Use filters to focus";

    const canvas = document.querySelector(".nm-center-canvas");
    canvas.appendChild(hint);

    requestAnimationFrame(() => {
      hint.style.opacity = "1";
      hint.style.transform = "translateX(-50%) translateY(0)";
    });

    // Dismiss hint card after 3.5 seconds
    setTimeout(() => {
      hint.style.opacity = "0";
      hint.style.transform = "translateX(-50%) translateY(20px)";
      setTimeout(() => hint.remove(), 350);
    }, 3500);
  }, 2600);

  // Step 4: Zoom back to fit
  setTimeout(() => {
    NetMap.zoomToFit(700);
  }, 6100);
};

NetMap.getMetricValue = function(node, metric) {
  if (metric === 'hindex') return node.h_index || 0;
  if (metric === 'citations') return node.citations || 0;
  return node.degree || 0;
};

NetMap.getCurrentNodeRadius = function(node) {
  const metric = NetMap.state.sizeMetric || 'degree';
  const isCluster = NetMap.state.activeViewMode === 'cluster';
  const maxNodeVal = d3.max(NetMap.state.nodes, d => NetMap.getMetricValue(d, metric)) || 1;
  const rScale = d3.scaleSqrt().domain([0, maxNodeVal]).range([9, 28]);
  const scaleMult = isCluster ? 1.15 : 1.0;
  return rScale(NetMap.getMetricValue(node, metric)) * scaleMult;
};

// Stub for backward compatibility — no longer renders a left rail but must not crash
NetMap.renderLeftRailChips = function() {
  // Left deck removed — dept filtering now lives in legend pill
  // Community chips are shown inside legend when in community view
};

NetMap.closeModal = function() {
  // Close analysis side panel and update header tab state
  const panel = document.getElementById('nm-analysis-panel');
  if (panel) panel.classList.remove('nm-open');
  document.querySelectorAll('.nm-header-tab').forEach(t => {
    t.classList.toggle('nm-active', t.id === 'nm-tab-graph');
  });
  // Trigger SVG resize after panel closes (wait for CSS transition: 350ms)
  setTimeout(() => NetMap.triggerCanvasResize(), 380);
};

// Re-measure canvas and update SVG + simulation after layout changes
NetMap.triggerCanvasResize = function() {
  if (!NetMap.state.svgSelection) return;
  const svgNode = document.getElementById('nm-network-svg');
  if (!svgNode) return;
  const w = svgNode.parentNode.clientWidth;
  const h = svgNode.parentNode.clientHeight;
  NetMap.state.width = w;
  NetMap.state.height = h;
  NetMap.state.svgSelection.attr('width', w).attr('height', h);
  if (NetMap.state.simulation) {
    NetMap.state.simulation
      .force('center', d3.forceCenter(w / 2, h / 2))
      .force('x', d3.forceX(w / 2).strength(0.02))
      .force('y', d3.forceY(h / 2).strength(0.02));
    NetMap.state.simulation.alpha(0.15).restart();
  }
};

// Reset layout positions (clear stable positions, rebuild graph)
NetMap.resetLayout = function() {
  NetMap.state.stablePositions = {};
  if (!NetMap.state.gMainSelection) return;

  // Re-assign positions deterministically from centroids
  const cx = NetMap.state.width / 2, cy = NetMap.state.height / 2;
  const centroids = NetMap.getDeptCentroids(280, cx, cy);
  NetMap.state.nodes.forEach(n => {
    const c = centroids[n.dept_code] || { x: cx, y: cy };
    n.x = c.x + (Math.random() - 0.5) * 60;
    n.y = c.y + (Math.random() - 0.5) * 60;
    n.vx = 0;
    n.vy = 0;
  });

  if (NetMap.state.simulation) {
    NetMap.state.simulation.alpha(0.8).restart();
  }
};

NetMap.toggleHIndexLayout = function(active) {
  NetMap.state.hindexOrderActive = active;

  // Sync button active class
  const btn = document.getElementById('nm-toolbar-hindex-order');
  if (btn) btn.classList.toggle('nm-active', active);

  if (active) {
    // Save current metric so we can restore it later
    NetMap.state.previousSizeMetric = NetMap.state.sizeMetric;
    
    // Switch size metric to hindex
    NetMap.state.sizeMetric = 'hindex';
    
    // Update active class on sizing chips in details drawer
    document.querySelectorAll('#nm-drawer-sizing-row .nm-size-chip').forEach(c => {
      c.classList.toggle('nm-active', c.getAttribute('data-size') === 'hindex');
    });

    // Resize nodes to hindex sizes
    NetMap.resizeNodes('hindex');

    // Run the layout transition
    NetMap.applyHIndexLayout();
  } else {
    // Restore previous size metric
    const prevMetric = NetMap.state.previousSizeMetric || 'degree';
    NetMap.state.sizeMetric = prevMetric;
    
    // Update active class on sizing chips
    document.querySelectorAll('#nm-drawer-sizing-row .nm-size-chip').forEach(c => {
      c.classList.toggle('nm-active', c.getAttribute('data-size') === prevMetric);
    });

    // Release all fixed coordinates
    NetMap.state.nodes.forEach(n => {
      n.fx = null;
      n.fy = null;
    });

    // Restore sizing
    NetMap.resizeNodes(prevMetric);

    // Restore link opacity
    const isCluster = NetMap.state.activeViewMode === 'cluster';
    if (NetMap.state.linkSelection) {
      NetMap.state.linkSelection.transition().duration(400)
        .attr('stroke-opacity', isCluster ? 0 : 0.6);
    }

    // Reheat simulation
    NetMap.updateForces();
  }
};

NetMap.applyHIndexLayout = function() {
  const isCluster = NetMap.state.activeViewMode === 'cluster';
  const width = NetMap.state.width || 1000;
  const height = NetMap.state.height || 800;

  if (isCluster) {
    // Group nodes by department code
    const deptGroups = {};
    NetMap.state.nodes.forEach(n => {
      if (!deptGroups[n.dept_code]) deptGroups[n.dept_code] = [];
      deptGroups[n.dept_code].push(n);
    });

    const cx = width / 2;
    const cy = height / 2;
    // Radial placement of department centroids
    const centroids = NetMap.getDeptCentroids(200, cx, cy);

    // Sort descending by h-index and place in a local grid centered on centroid
    const dx = 55; // horizontal spacing between nodes in local grid
    const dy = 55; // vertical spacing

    Object.entries(deptGroups).forEach(([code, nodes]) => {
      nodes.sort((a, b) => (b.h_index || 0) - (a.h_index || 0));

      const centroid = centroids[code] || { x: cx, y: cy };
      const n_D = nodes.length;
      const localCols = Math.ceil(Math.sqrt(n_D));
      const localRows = Math.ceil(n_D / localCols);

      const startX = centroid.x - ((localCols - 1) * dx) / 2;
      const startY = centroid.y - ((localRows - 1) * dy) / 2;

      nodes.forEach((node, idx) => {
        const col = idx % localCols;
        const row = Math.floor(idx / localCols);
        node.targetX = startX + col * dx;
        node.targetY = startY + row * dy;
      });
    });
  } else {
    // Global grid layout: sort all nodes by h-index desc
    const sorted = [...NetMap.state.nodes].sort((a, b) => (b.h_index || 0) - (a.h_index || 0));
    const n = sorted.length;
    if (n === 0) return;

    const paddingX = 120;
    const paddingY = 140; // leave room at the top
    const availW = width - 2 * paddingX;
    const availH = height - 2 * paddingY;

    const cols = Math.ceil(Math.sqrt(n * (availW / availH)));
    const rows = Math.ceil(n / cols);

    const cellW = cols > 1 ? availW / (cols - 1) : availW;
    const cellH = rows > 1 ? availH / (rows - 1) : availH;

    sorted.forEach((node, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);

      node.targetX = paddingX + col * cellW;
      node.targetY = paddingY + row * cellH;
    });
  }

  // Stop simulation temporarily to do clean manual transitions
  if (NetMap.state.simulation) {
    NetMap.state.simulation.stop();
  }

  const t = d3.transition().duration(800);

  // Transition link lines opacity and endpoints
  if (NetMap.state.linkSelection) {
    NetMap.state.linkSelection.transition(t)
      .attr('stroke-opacity', isCluster ? 0.0 : 0.15)
      .attrTween("x1", d => d3.interpolate(d.source.x, d.source.targetX))
      .attrTween("y1", d => d3.interpolate(d.source.y, d.source.targetY))
      .attrTween("x2", d => d3.interpolate(d.target.x, d.target.targetX))
      .attrTween("y2", d => d3.interpolate(d.target.y, d.target.targetY));
  }

  // Transition node transforms
  if (NetMap.state.nodeSelection) {
    NetMap.state.nodeSelection.transition(t)
      .attrTween("transform", d => {
        const ix = d3.interpolate(d.x, d.targetX);
        const iy = d3.interpolate(d.y, d.targetY);
        return time => {
          d.x = ix(time);
          d.y = iy(time);
          return `translate(${d.x},${d.y})`;
        };
      })
      .on("end", (d) => {
        // Fix nodes at target coordinates
        d.fx = d.targetX;
        d.fy = d.targetY;
        d.x = d.targetX;
        d.y = d.targetY;
        
        // Re-start simulation at low alpha once to maintain tick sync
        if (NetMap.state.simulation) {
          NetMap.state.simulation.alpha(0.05).restart();
        }
      });
  }
};
