/* ============================================================================
   NetMap — PROFILE DRAWER
   ========================================================================== */
(function () {
  const drawer = document.getElementById("drawer");
  const content = document.getElementById("drawer-content");

  function highestDegree(node) {
    const order = { PhD: 4, Masters: 3, Professional: 2, Bachelor: 1, Other: 0 };
    let best = null;
    (node.education || []).forEach((e) => {
      if (!best || (order[e.degree_level] || 0) > (order[best.degree_level] || 0)) best = e;
    });
    return best;
  }

  function fields(node) {
    const seen = new Set();
    (node.fingerprints_structured || []).forEach((f) => { if (f.campo) seen.add(f.campo); });
    return [...seen];
  }

  function shape(node) {
    const cs = NM.state.graph.collaboration_shape?.find((s) => s.id === node.id);
    return cs || { breadth: (node.collaborator_details || []).length, depth: 0, total_shared_pubs: 0 };
  }

  function personRow(name, dept, value, targetId) {
    const node = targetId ? NM.state.nodeById[targetId] : null;
    const av = node ? NM.photoImg(node, 30, "pa") :
      `<div class="pa" style="background:${NM.deptColor(dept)}">${NM.initials(name)}</div>`;
    const click = targetId ? ` data-goto="${targetId}"` : "";
    return `<div class="person-row"${click}>
      ${av}
      <div class="pm"><div class="n">${name}</div><div class="d">${dept ? NM.deptLabel(dept) : "External collaborator"}</div></div>
      <div class="pv">${value}</div>
    </div>`;
  }

  NM.openProfile = function (id) {
    const d = NM.state.nodeById[id];
    if (!d) return;
    NM.state.selectedId = id;
    NM.applyFilters();

    const best = highestDegree(d);
    const fl = fields(d);
    const sh = shape(d);
    const areas = (d.areas || []).slice(0, 10);
    const semNeighbors = (d.semantic_neighbors || []).slice(0, 5);

    // co-authors that resolve to faculty get a goto; others listed plainly
    const collabs = (d.collaborator_details || [])
      .slice().sort((a, b) => (b.shared_publications || 0) - (a.shared_publications || 0)).slice(0, 8);

    const extOrgs = (d.external_orgs || [])
      .filter((o) => !/utec|ingenieria y tecnologia/i.test(o.organizacion || ""))
      .slice(0, 5);

    content.innerHTML = `
      <div class="drawer-top">
        <button class="drawer-close" id="drawer-close" aria-label="Close">&times;</button>
        ${NM.photoImg(d, 64, "avatar")}
        <div class="drawer-id">
          <div class="nm">${d.name}</div>
          <div class="role">${best ? best.title.replace(/,\s*$/, "").replace(/→.*/, "") : "UTEC Faculty"}</div>
          <div class="dept"><span class="badge"><span class="dot" style="background:${NM.deptColor(d.dept_code)}"></span>${NM.deptLabel(d.dept_code)}</span></div>
        </div>
      </div>
      <div class="drawer-body">
        <div class="metric-row">
          <div class="metric"><div class="v">${d.degree || 0}</div><div class="k">Co-authors</div></div>
          <div class="metric"><div class="v">${d.h_index || 0}</div><div class="k">h-index</div></div>
          <div class="metric"><div class="v">${d.citations || 0}</div><div class="k">Citations</div></div>
        </div>

        ${fl.length ? `<div>
          <div class="section-title">Research fingerprint <button class="info-dot" data-explain="drawer-fields">i</button></div>
          <div class="area-tags">${fl.map((f) => `<span class="badge field"><span class="dot" style="background:${NM.fieldColor(f)}"></span>${f}</span>`).join("")}</div>
          ${fl.length >= 2 ? `<div style="font-size:var(--t-xs);color:var(--ink-2);margin-top:8px">Works across <strong>${fl.length} fields</strong> — an interdisciplinary profile.</div>` : ""}
        </div>` : ""}

        ${areas.length ? `<div>
          <div class="section-title">Declared areas</div>
          <div class="area-tags">${areas.map((a) => `<span class="area-tag">${a}</span>`).join("")}</div>
        </div>` : ""}

        <div>
          <div class="section-title">Collaboration style <button class="info-dot" data-explain="drawer-shape">i</button></div>
          <div style="display:flex;gap:var(--s-3)">
            <div class="metric" style="flex:1"><div class="v">${sh.breadth}</div><div class="k">Breadth · people</div></div>
            <div class="metric" style="flex:1"><div class="v">${sh.depth}</div><div class="k">Depth · papers/person</div></div>
          </div>
          <div style="font-size:var(--t-xs);color:var(--ink-2);margin-top:8px">${shapeNote(sh)}</div>
        </div>

        ${collabs.length ? `<div>
          <div class="section-title">Co-authors <button class="info-dot" data-explain="drawer-coauthors">i</button></div>
          ${collabs.map((c) => personRow(c.name, c.matched_id ? NM.state.nodeById[c.matched_id]?.dept_code : null, (c.shared_publications || 0) + "p", c.matched_id)).join("")}
        </div>` : ""}

        ${semNeighbors.length ? `<div>
          <div class="section-title">Topic twins <button class="info-dot" data-explain="drawer-twins">i</button></div>
          ${semNeighbors.map((s) => personRow(s.name, NM.state.nodeById[s.id]?.dept_code, (s.score).toFixed(2), s.id)).join("")}
        </div>` : ""}

        ${(d.education || []).length ? `<div>
          <div class="section-title">Education <button class="info-dot" data-explain="drawer-edu">i</button></div>
          ${(d.education || []).map((e) => `
            <div class="edu-item edu-uni-link" data-uni="${(e.university_canonical || e.university || "").replace(/"/g, "&quot;")}">
              <div class="lvl">${e.degree_level === "Professional" ? "Prof." : e.degree_level}${e.is_international ? " ·🌐" : ""}</div>
              <div><div class="eu">${e.university_canonical || e.university || "—"}</div><div class="ep">${(e.title || "").replace(/,\s*$/, "").replace(/→.*/, "")} · ${e.period || ""}</div></div>
            </div>`).join("")}
        </div>` : ""}

        ${extOrgs.length ? `<div>
          <div class="section-title">External partners</div>
          ${extOrgs.map((o) => `<div class="person-row"><div class="pa" style="background:var(--dept-UNK)">🏛</div><div class="pm"><div class="n">${o.organizacion}</div></div><div class="pv">${NM.parsePub(o.num_publications)}p</div></div>`).join("")}
        </div>` : ""}

        <div style="display:flex;gap:var(--s-3);flex-wrap:wrap;padding-top:var(--s-2)">
          ${d.profile_url ? `<a class="btn btn-ghost" href="${d.profile_url}" target="_blank" rel="noopener">CRIS profile ↗</a>` : ""}
          ${d.scholar_url ? `<a class="btn btn-ghost" href="${d.scholar_url}" target="_blank" rel="noopener">Scholar ↗</a>` : ""}
        </div>
      </div>`;

    drawer.classList.add("open");
    drawer.setAttribute("aria-hidden", "false");
    NM.focusNode(id);

    document.getElementById("drawer-close").onclick = (e) => { e.stopPropagation(); NM.closeProfile(); };
    content.querySelectorAll("[data-goto]").forEach((el) =>
      el.addEventListener("click", () => NM.openProfile(el.getAttribute("data-goto"))));
    content.querySelectorAll("[data-uni]").forEach((el) =>
      el.addEventListener("click", () => { NM.showSurface("map"); NM.isolateUniversity(el.getAttribute("data-uni")); }));
  };

  function shapeNote(sh) {
    if (sh.breadth === 0) return "No recorded co-authors yet.";
    if (sh.depth >= 2) return "Collaborates deeply — repeated work with the same partners.";
    if (sh.breadth >= 10) return "Collaborates broadly — many partners, often one paper each.";
    return "A balanced mix of partners.";
  }

  NM.closeProfile = function () {
    drawer.classList.remove("open");
    drawer.setAttribute("aria-hidden", "true");
    NM.state.selectedId = null;
    NM.applyFilters();
  };
})();
