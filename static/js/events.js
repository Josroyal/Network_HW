/* ==========================================================================
   EVENT REGISTER BINDINGS (events.js)
   ========================================================================== */

document.addEventListener("DOMContentLoaded", () => {

  // ─── HEADER VIEW TABS: Graph ↔ Analysis ───────────────────────────────────
  document.getElementById("nm-tab-graph").addEventListener("click", () => {
    // Close analysis panel → restores full-canvas
    NetMap.closeModal();
    document.querySelectorAll(".nm-header-tab").forEach(t => {
      t.classList.toggle("nm-active", t.id === "nm-tab-graph");
    });
  });

  document.getElementById("nm-tab-analysis").addEventListener("click", () => {
    const panel = document.getElementById("nm-analysis-panel");
    const isOpen = panel.classList.toggle("nm-open");

    // Sync header tab active state
    document.getElementById("nm-tab-graph").classList.toggle("nm-active", !isOpen);
    document.getElementById("nm-tab-analysis").classList.toggle("nm-active", isOpen);

    // Trigger canvas resize after CSS transition
    setTimeout(() => NetMap.triggerCanvasResize(), 380);
  });

  // ─── ANALYSIS SIDE PANEL CLOSE BUTTON ─────────────────────────────────────
  document.getElementById("nm-analysis-panel-close").addEventListener("click", () => {
    NetMap.closeModal();
    document.querySelectorAll(".nm-header-tab").forEach(t => {
      t.classList.toggle("nm-active", t.id === "nm-tab-graph");
    });
  });

  // ─── CLOSE DETAIL DRAWER ──────────────────────────────────────────────────
  document.getElementById("nm-drawer-close").addEventListener("click", () => {
    document.getElementById("nm-detail-drawer").classList.remove("nm-open");
    NetMap.state.selectedNodeId = null;
    NetMap.resetHighlight();
  });

  // ─── ANALYSIS PANEL TABS ─────────────────────────────────────────────────
  document.querySelectorAll("#nm-modal-tabs .nm-tab-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("#nm-modal-tabs .nm-tab-btn").forEach(b => b.classList.remove("nm-active"));
      document.querySelectorAll(".nm-tab-panel").forEach(p => p.classList.remove("nm-active"));
      btn.classList.add("nm-active");
      const tabId = btn.getAttribute("data-tab");
      const panel = document.getElementById("nm-tab-panel-" + tabId);
      if (panel) panel.classList.add("nm-active");
    });
  });

  // ─── CANVAS BACKGROUND CLICK: reset highlight ─────────────────────────────
  document.getElementById("nm-network-svg").addEventListener("click", (e) => {
    if (!e.target.closest(".nm-node-group")) {
      NetMap.state.selectedNodeId = null;
      NetMap.resetHighlight();
      document.getElementById("nm-detail-drawer").classList.remove("nm-open");
      if (NetMap.state.gMainSelection) {
        NetMap.state.gMainSelection.selectAll(".pred-link-tmp").remove();
      }
    }
  });

  // ─── VIEW MODE TOOLBAR BUTTONS ────────────────────────────────────────────
  document.querySelectorAll("#nm-view-modes .nm-view-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      if (btn.classList.contains("nm-edge-toggle-btn")) return; // handled separately
      document.querySelectorAll("#nm-view-modes .nm-view-btn:not(.nm-edge-toggle-btn)").forEach(b => b.classList.remove("nm-active"));
      btn.classList.add("nm-active");
      const viewMode = btn.getAttribute("data-mode");
      if (viewMode) NetMap.applyViewMode(viewMode);
    });
  });

  // ─── EDGE TOGGLE BUTTON ───────────────────────────────────────────────────
  const edgeToggleBtn = document.getElementById("nm-toolbar-edge-toggle");
  if (edgeToggleBtn) {
    edgeToggleBtn.addEventListener("click", () => {
      const newMode = NetMap.state.edgeMode === "collab" ? "semantic" : "collab";
      NetMap.toggleEdgeMode(newMode);
      const lbl = document.getElementById("nm-edge-mode-label");
      if (lbl) lbl.textContent = newMode === "semantic" ? "⟷ Similarity" : "⟷ Co-authors";
      edgeToggleBtn.classList.toggle("nm-active", newMode === "semantic");
    });
  }

  // ─── H-INDEX FLOW TOGGLE BUTTON ──────────────────────────────────────────
  const hindexOrderBtn = document.getElementById("nm-toolbar-hindex-order");
  if (hindexOrderBtn) {
    hindexOrderBtn.addEventListener("click", () => {
      const active = !NetMap.state.hindexOrderActive;
      NetMap.toggleHIndexLayout(active);
    });
  }

  // ─── NODE SIZING CHIPS INSIDE DRAWER ─────────────────────────────────────
  document.querySelectorAll("#nm-drawer-sizing-row .nm-size-chip").forEach(chip => {
    chip.addEventListener("click", () => {
      document.querySelectorAll("#nm-drawer-sizing-row .nm-size-chip").forEach(c => c.classList.remove("nm-active"));
      chip.classList.add("nm-active");
      NetMap.resizeNodes(chip.getAttribute("data-size"));
    });
  });

  // ─── RESET LAYOUT BUTTON ─────────────────────────────────────────────────
  const resetLayoutBtn = document.getElementById("nm-layout-reset");
  if (resetLayoutBtn) {
    resetLayoutBtn.addEventListener("click", () => NetMap.resetLayout());
  }

  // ─── ZOOM FAB ────────────────────────────────────────────────────────────
  document.getElementById("nm-zoom-in").addEventListener("click", () => {
    if (NetMap.state.svgSelection) {
      NetMap.state.svgSelection.transition().duration(250).call(NetMap.state.zoomBehavior.scaleBy, 1.3);
    }
  });
  document.getElementById("nm-zoom-out").addEventListener("click", () => {
    if (NetMap.state.svgSelection) {
      NetMap.state.svgSelection.transition().duration(250).call(NetMap.state.zoomBehavior.scaleBy, 0.7);
    }
  });
  document.getElementById("nm-zoom-reset").addEventListener("click", () => {
    if (NetMap.state.svgSelection) {
      NetMap.state.svgSelection.transition().duration(400).call(NetMap.state.zoomBehavior.transform, d3.zoomIdentity);
    }
  });

  // ─── WINDOW RESIZE ───────────────────────────────────────────────────────
  let resizeTimer;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => NetMap.triggerCanvasResize(), 200);
  });

  // ─── SEARCH BOX ──────────────────────────────────────────────────────────
  document.getElementById("nm-search-box").addEventListener("input", function() {
    const q = this.value.trim().toLowerCase();
    if (!NetMap.state.nodeSelection) return;
    if (!q) { NetMap.resetHighlight(); return; }

    const matches = new Set(NetMap.state.nodes.filter(n => n.name.toLowerCase().includes(q)).map(n => n.id));
    NetMap.state.nodeSelection.classed("dimmed", d => !matches.has(d.id));
    NetMap.state.linkSelection.classed("dimmed", d => {
      const s = d.source.id || d.source;
      const t = d.target.id || d.target;
      return !matches.has(s) && !matches.has(t);
    });

    if (matches.size === 1) {
      NetMap.selectNodeById([...matches][0]);
    }
  });

  document.getElementById("nm-search-box").addEventListener("keypress", function(e) {
    if (e.key === "Enter") {
      const q = this.value.trim().toLowerCase();
      if (!q) return;
      const m = NetMap.state.nodes.find(n => n.name.toLowerCase().includes(q));
      if (m) NetMap.selectNodeById(m.id);
    }
  });
});
