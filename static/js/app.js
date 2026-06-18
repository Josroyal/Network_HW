/* ============================================================================
   NetMap — APP BOOT
   ========================================================================== */
(function () {
  NM.showSurface = function (which) {
    const map = which === "map";
    document.getElementById("surface-map").hidden = !map;
    document.getElementById("surface-insights").hidden = map;
    document.getElementById("tab-map").classList.toggle("active", map);
    document.getElementById("tab-insights").classList.toggle("active", !map);
    document.getElementById("tab-map").setAttribute("aria-selected", map);
    document.getElementById("tab-insights").setAttribute("aria-selected", !map);
  };

  function statFigures(g) {
    const s = g.summary || {};
    const figs = [
      { v: s.num_nodes ?? g.nodes.length, l: "Professors" },
      { v: s.num_edges ?? g.edges.length, l: "Co-authorships" },
      { v: s.num_cross_group_opportunities ?? (g.cross_group_opportunities || []).length, l: "Opportunities" },
    ];
    document.getElementById("stat-figures").innerHTML = figs.map((f) =>
      `<div class="figure"><span class="val">${f.v}</span><span class="lbl">${f.l}</span></div>`).join("");
  }

  function wireSearch() {
    const input = document.getElementById("search-input");
    const box = document.getElementById("search-results");
    function render(q) {
      q = q.trim().toLowerCase();
      if (!q) { box.classList.remove("open"); return; }
      const hits = NM.state.graph.nodes
        .filter((n) => n.name.toLowerCase().includes(q)).slice(0, 8);
      if (!hits.length) { box.innerHTML = `<div class="search-hit"><div class="mt">No professor matches "${q}"</div></div>`; box.classList.add("open"); return; }
      box.innerHTML = hits.map((n) => `<div class="search-hit" data-id="${n.id}">
        ${NM.photoImg(n, 30, "pa")}
        <div><div class="nm">${n.name}</div><div class="mt">${NM.deptLabel(n.dept_code)} · ${n.degree || 0} co-authors</div></div></div>`).join("");
      box.classList.add("open");
      box.querySelectorAll(".search-hit[data-id]").forEach((h) => h.addEventListener("click", () => {
        NM.showSurface("map"); NM.openProfile(h.getAttribute("data-id"));
        box.classList.remove("open"); input.value = "";
      }));
    }
    input.addEventListener("input", () => render(input.value));
    input.addEventListener("focus", () => render(input.value));
    document.addEventListener("click", (e) => { if (!e.target.closest(".search")) box.classList.remove("open"); });
  }

  async function boot() {
    let g;
    try { g = await NM.loadGraph(); }
    catch (e) {
      document.getElementById("loading").innerHTML =
        `<div class="loading-txt" style="max-width:340px;text-align:center">Couldn't load the network. Run <code>python pipeline/metrics.py</code> then <code>python server.py</code> and reload.</div>`;
      return;
    }
    NM.state.graph = g;
    statFigures(g);

    document.getElementById("tab-map").onclick = () => NM.showSurface("map");
    document.getElementById("tab-insights").onclick = () => NM.showSurface("insights");

    NM.buildRail();
    NM.buildGraph();
    NM.buildInsights();
    wireSearch();

    document.getElementById("loading").hidden = true;
    NM.maybeOnboard();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
