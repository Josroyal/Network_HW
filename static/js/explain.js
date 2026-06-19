/* ============================================================================
   NetMap — THE EXPLANATORY PATTERN
   One popover for every "i" affordance, plus the mode-aware legend key.
   Learn it once on the map; it works identically in the drawer and every tab.
   ========================================================================== */
(function () {
  const pop = document.getElementById("explain-pop");
  let pinnedKey = null;   // set only by click; hover never pins

  function place(target) {
    const r = target.getBoundingClientRect();
    let left = r.right + 10;
    let top = r.top + r.height / 2 - 24;
    const pw = 270, ph = pop.offsetHeight || 90;
    if (left + pw > window.innerWidth - 12) left = r.left - pw - 10;
    if (left < 12) left = 12;
    if (top + ph > window.innerHeight - 12) top = window.innerHeight - ph - 12;
    if (top < 12) top = 12;
    pop.style.left = left + "px";
    pop.style.top = top + "px";
  }
  function show(target, key) {
    const info = NM.EXPLAIN[key];
    if (!info) return;
    pop.innerHTML = `<div class="ep-title">${info.t}</div>${info.b}`;
    pop.classList.add("open");
    place(target);
  }
  function hide() { pop.classList.remove("open"); pinnedKey = null; }

  // Click pins/unpins; hover only previews when nothing is pinned.
  document.addEventListener("click", (e) => {
    const trigger = e.target.closest("[data-explain]");
    if (trigger) {
      e.stopPropagation();
      const key = trigger.getAttribute("data-explain");
      if (pinnedKey === key) { hide(); }
      else { show(trigger, key); pinnedKey = key; }
      return;
    }
    if (!e.target.closest("#explain-pop")) hide();
  });
  document.addEventListener("mouseover", (e) => {
    const trigger = e.target.closest("[data-explain]");
    if (trigger && !pinnedKey) show(trigger, trigger.getAttribute("data-explain"));
  });
  document.addEventListener("mouseout", (e) => {
    const trigger = e.target.closest("[data-explain]");
    if (trigger && !pinnedKey) pop.classList.remove("open");
  });
  window.addEventListener("scroll", () => { if (!pinnedKey) pop.classList.remove("open"); }, true);
  window.addEventListener("resize", hide);

  NM.explain = { show, hide };

  /* ---------------- Legend (mode-aware "What am I seeing?") ---------------- */
  function row(keyHTML, label, explainKey) {
    const info = explainKey
      ? `<button class="info-dot" data-explain="${explainKey}" style="margin-left:auto">i</button>` : "";
    return `<div class="legend-row"><span class="key">${keyHTML}</span><span>${label}</span>${info}</div>`;
  }

  function deptChips() {
    const g = NM.state.graph;
    const present = {};
    g.nodes.forEach((n) => { present[n.dept_code] = (present[n.dept_code] || 0) + 1; });
    const codes = Object.keys(present).sort((a, b) => present[b] - present[a]);
    const chips = codes.map((c) => {
      const dim = NM.state.deptFilter && NM.state.deptFilter !== c ? " dim" : "";
      return `<span class="legend-chip${dim}" data-dept="${c}"><span class="dot" style="background:${NM.deptColor(c)}"></span>${NM.deptLabel(c)}</span>`;
    }).join("");
    return `<div class="legend-section-label">Department · colour</div><div class="legend-chips">${chips}</div>`;
  }

  function groupChips() {
    const g = NM.state.graph;
    const present = {};
    g.nodes.forEach((n) => {
      NM.getResearchGroups(n).forEach((groupName) => {
        if (groupName !== "None") {
          present[groupName] = (present[groupName] || 0) + 1;
        }
      });
    });
    const sortedGroups = Object.keys(present).sort((a, b) => present[b] - present[a]);
    const chips = sortedGroups.map((groupName) => {
      const dim = NM.state.groupFilter && NM.state.groupFilter !== groupName ? " dim" : "";
      return `<span class="legend-chip${dim}" data-group="${groupName}"><span class="dot" style="background:${NM.groupColor(groupName)}"></span>${groupName}</span>`;
    }).join("");
    return `<div class="legend-section-label">Research group · colour</div><div class="legend-chips">${chips}</div>`;
  }

  // Build the legend for the current mode + edge mode.
  NM.renderLegend = function () {
    const body = document.getElementById("legend-body");
    const mode = NM.state.mode;
    const edge = NM.state.edgeMode;
    let html = "";

    // Size encoding (constant across most modes)
    if (mode === "degree") {
      html += row(`<span class="sz-s"></span>`, "Few co-authors", "encoding-size");
      html += row(`<span class="sz-l"></span>`, "Many co-authors", "encoding-size");
    } else if (mode === "flow") {
      html += row(`<span class="sz-s"></span>`, "Low h-index", "encoding-size");
      html += row(`<span class="sz-l"></span>`, "High h-index", "encoding-size");
    } else {
      html += row(`<span class="sz-l"></span>`, "Circle = a professor (size ∝ co-authors)", "encoding-size");
    }

    // Line encoding follows the edge toggle (except in pure-structure modes)
    if (mode === "semantic") {
      html += row(`<span class="line-dash"></span>`, "Shared topics, no paper yet", "encoding-nlp");
    } else if (mode === "almamater") {
      html += row(`<span class="line-solid" style="border-top-color:var(--link-alumni);opacity:.5"></span>`, "Studied at same university", "encoding-alumni");
    } else if (edge === "nlp") {
      html += row(`<span class="line-dash"></span>`, "Topic similarity (NLP)", "encoding-nlp");
    } else {
      html += row(`<span class="line-solid"></span>`, "Co-authorship (thicker = more papers)", "encoding-coauthor");
    }

    // Bridge ring always meaningful when betweenness highlighted
    if (mode === "betweenness") {
      html += row(`<span class="ring"></span>`, "Bridge between groups", "encoding-bridge");
    }

    // Color section
    if (mode === "groups") {
      html += groupChips();
    } else if (mode === "flow") {
      html += `<div class="legend-section-label">Position · h-index rank (high → low)</div>`;
      html += deptChips();
    } else {
      html += deptChips();
    }

    body.innerHTML = html;

    // Wire chip clicks → department isolate filter
    body.querySelectorAll(".legend-chip[data-dept]").forEach((chip) => {
      chip.addEventListener("click", () => {
        const c = chip.getAttribute("data-dept");
        NM.state.deptFilter = NM.state.deptFilter === c ? null : c;
        NM.applyFilters();
        NM.renderLegend();
      });
    });

    // Wire chip clicks → research group isolate filter
    body.querySelectorAll(".legend-chip[data-group]").forEach((chip) => {
      chip.addEventListener("click", () => {
        const g = chip.getAttribute("data-group");
        NM.state.groupFilter = NM.state.groupFilter === g ? null : g;
        NM.applyFilters();
        NM.renderLegend();
      });
    });
  };

  // Legend collapse
  document.getElementById("legend-toggle").addEventListener("click", () => {
    const lg = document.getElementById("legend");
    lg.classList.toggle("collapsed");
    document.getElementById("legend-toggle").textContent = lg.classList.contains("collapsed") ? "+" : "–";
  });
})();
