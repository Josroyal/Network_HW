/* ==========================================================================
   BOOTSTRAP LIFE-CYCLE (boot.js)
   ========================================================================== */

NetMap.boot = function() {
  fetch("/api/graph")
    .then(r => {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.json();
    })
    .then(data => {
      NetMap.state.nodes = data.nodes || [];
      NetMap.state.edges = data.edges || [];
      NetMap.state.semanticEdges = data.semantic_edges || [];
      NetMap.state.predictedLinks = data.predicted_links || [];
      NetMap.state.communities = data.communities || [];
      
      // Set stats counters
      document.getElementById("nm-stat-nodes").textContent = data.summary ? data.summary.num_nodes : NetMap.state.nodes.length;
      document.getElementById("nm-stat-edges").textContent = data.summary ? data.summary.num_edges : NetMap.state.edges.length;
      document.getElementById("nm-stat-comms").textContent = data.summary ? data.summary.num_communities : NetMap.state.communities.length;
      
      NetMap.renderLeftRailChips();
      NetMap.buildLegend();
      NetMap.buildModalPanels();
      
      requestAnimationFrame(() => {
        const svgNode = document.getElementById("nm-network-svg");
        const w = svgNode.clientWidth || svgNode.parentNode.clientWidth || 800;
        const h = svgNode.clientHeight || svgNode.parentNode.clientHeight || 600;
        NetMap.state.width = w;
        NetMap.state.height = h;
        NetMap.buildGraph(w, h);
      });
    })
    .catch(err => {
      console.error("Visualizer data boot failed:", err);
      document.getElementById("nm-loading-spinner").innerHTML = `
        <div style="text-align:center; color:var(--nm-danger); padding:24px;">
          <p style="font-size:1.1rem; font-weight:700">Failed to load graph metrics</p>
          <p style="font-size:0.82rem; margin-top:6px; color:var(--nm-text-2)">${err.message}</p>
          <p style="font-size:0.75rem; color:var(--nm-text-3); margin-top:12px">Please run 'python pipeline/metrics.py' first.</p>
        </div>
      `;
    })
    .finally(() => {
      const spinner = document.getElementById("nm-loading-spinner");
      if (spinner) {
        spinner.style.opacity = '0';
        setTimeout(() => spinner.style.display = 'none', 300);
      }
    });
};

document.addEventListener("DOMContentLoaded", () => {
  NetMap.boot();
});
