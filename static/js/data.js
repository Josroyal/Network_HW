/* ============================================================================
   NetMap — DATA LAYER
   Loads /api/graph (falls back to embedded data), and provides the shared
   namespace, color maps, helpers and the canonical "explain" copy.
   ========================================================================== */
window.NM = window.NM || {};

NM.state = {
  graph: null,
  nodeById: {},
  mode: "default",
  edgeMode: "coauthor",   // "coauthor" | "nlp"
  selectedId: null,
  deptFilter: null,        // dept_code to isolate, or null
  uniFilter: null,         // university to isolate, or null
};

/* ---- Department vocabulary (matches CSS tokens) ---- */
NM.DEPT = {
  CS:  { c: "#3B4CCA", label: "Computer Science" },
  EE:  { c: "#C77D0A", label: "Electronics & Mechatronics" },
  ME:  { c: "#0E8C7F", label: "Mechanical & Energy" },
  CE:  { c: "#B0413E", label: "Civil & Environmental" },
  IE:  { c: "#7A3FBF", label: "Industrial Eng." },
  BIO: { c: "#1E7FC2", label: "Bioengineering & Chemistry" },
  HUM: { c: "#C44D24", label: "Humanities & Arts" },
  SCI: { c: "#2E8B40", label: "Sciences" },
  DS:  { c: "#0E7490", label: "Data Science" },
  AI:  { c: "#6D28D9", label: "Artificial Intelligence" },
  BUS: { c: "#9A6B12", label: "Business" },
  SYS: { c: "#BE2A52", label: "Systems & Security" },
  UNK: { c: "#8A8395", label: "Other / Institutional" },
};
NM.deptColor = (code) => (NM.DEPT[code] || NM.DEPT.UNK).c;
NM.deptLabel = (code) => (NM.DEPT[code] || NM.DEPT.UNK).label;

/* Community palette (categorical, distinct from dept hues by being lighter) */
NM.COMMUNITY_PALETTE = [
  "#3B4CCA","#0E8C7F","#C77D0A","#B0413E","#6D28D9","#2E8B40",
  "#1E7FC2","#C44D24","#BE2A52","#0E7490","#9A6B12","#7A3FBF",
];

/* Field palette for fingerprint fields */
NM.FIELD_PALETTE = [
  "#3B4CCA","#0E8C7F","#C77D0A","#6D28D9","#B0413E","#1E7FC2",
  "#2E8B40","#BE2A52","#C44D24","#0E7490","#9A6B12","#7A3FBF",
  "#5B6BD6","#1FA193","#8A8395",
];
NM._fieldColorCache = {};
NM.fieldColor = function (field) {
  if (!(field in NM._fieldColorCache)) {
    const keys = Object.keys(NM._fieldColorCache);
    NM._fieldColorCache[field] = NM.FIELD_PALETTE[keys.length % NM.FIELD_PALETTE.length];
  }
  return NM._fieldColorCache[field];
};

/* ---- The single source of explanatory copy. Plain language, end-user voice. ---- */
NM.EXPLAIN = {
  rail: { t: "Lenses", b: "Each lens re-colours or re-arranges the same map to answer a different question. The key in the corner updates to match — so you always know what you're looking at." },
  legend: { t: "The visual key", b: "Everything on this map is a code: a colour, a size, a line style, a ring. This key tells you what each one means right now. Tap an item to highlight it." },

  "mode-default":     { t: "Network", b: "The plain map. Circles are professors; lines join people who have published together. Bigger circles have more co-authors." },
  "mode-degree":      { t: "Most-connected", b: "Circle size grows with the number of distinct co-authors a professor has. The largest circles are the busiest collaborators." },
  "mode-betweenness": { t: "Bridges", b: "An orange ring marks a professor who sits on the shortest path between otherwise-separate groups. Remove them and the network would fragment." },
  "mode-cluster":     { t: "By department", b: "Professors are pulled together by their department, so you can see which departments work tightly and which keep to themselves." },
  "mode-community":   { t: "Natural groups", b: "Colour comes from a community-detection algorithm, not official departments. It reveals the research clusters that actually form through co-authorship." },
  "mode-semantic":    { t: "Shared interests", b: "Dashed violet lines connect professors whose research topics overlap (by text analysis) but who have not yet published together — potential collaborators." },
  "mode-almamater":   { t: "Shared alma mater", b: "Thin blue lines join professors who studied at the same university. Reveals hidden alumni networks behind the formal org chart." },
  "mode-flow":        { t: "By impact (h-index)", b: "Professors line up in a grid, sorted by h-index (a measure of citation impact). Forces switch off so the ranking stays exact." },

  "edge-toggle": { t: "Which lines?", b: "Switch between confirmed co-authorship (solid grey) and predicted topic similarity (dashed violet)." },

  "encoding-size":   { t: "Circle size", b: "Larger circles mean a higher value on the current measure — usually the number of co-authors." },
  "encoding-color":  { t: "Circle colour", b: "Colour groups professors. Here it encodes their department; in other lenses it encodes a detected community." },
  "encoding-coauthor": { t: "Solid grey line", b: "A confirmed co-authorship. The thicker the line, the more papers the pair share." },
  "encoding-nlp":    { t: "Dashed violet line", b: "A predicted match: similar research topics, no shared paper yet." },
  "encoding-predicted": { t: "Dashed amber line", b: "A predicted future link from shared network neighbours (Adamic-Adar)." },
  "encoding-alumni": { t: "Thin blue line", b: "The two professors graduated from the same university." },
  "encoding-bridge": { t: "Orange ring", b: "A bridge: this professor connects groups that would otherwise be separate (high betweenness)." },

  "tab-leaders":   { t: "Degree centrality", b: "Ranks professors by how many distinct co-authors they have. The hubs of the network." },
  "tab-bridges":   { t: "Betweenness", b: "Ranks professors by how often they sit on the shortest path between others — the connectors who hold the network together." },
  "tab-depts":     { t: "Department flow", b: "A chord diagram of co-publications between departments. Thick ribbons mean tight cross-department work; missing ribbons reveal silos." },
  "tab-areas":     { t: "Bridging topics", b: "Research keywords that recur across co-authored work between different departments — the themes pulling fields together." },
  "tab-predict":   { t: "Predicted links", b: "Likely future collaborations, from the Adamic-Adar index over shared network neighbours." },
  "tab-crossgroup":{ t: "Cross-group potential", b: "Pairs in different research groups with strongly overlapping research fingerprints who have not co-authored — partnerships waiting to happen." },
  "tab-nlp":       { t: "Topic twins", b: "Professor pairs with the highest text similarity in their research fingerprints, across departments." },
  "tab-edu":       { t: "Where faculty trained", b: "The universities UTEC's faculty graduated from, and how degree levels are distributed across departments." },
  "tab-partners":  { t: "External partners", b: "Outside institutions that several UTEC professors collaborate with independently — candidate institutional partnerships." },
  "tab-fields":    { t: "Multi-field minds", b: "Professors whose research fingerprints span several distinct academic fields — natural interdisciplinary bridges." },
  "tab-shape":     { t: "Depth vs breadth", b: "Does a professor collaborate deeply with a few people, or broadly with many? Each dot is a professor." },

  "drawer-coauthors": { t: "Co-authors", b: "People this professor has published with. The number is shared papers." },
  "drawer-twins":     { t: "Topic twins", b: "Professors with similar research interests by text analysis — possible collaborators, click to compare." },
  "drawer-edu":       { t: "Education", b: "Degrees earned, newest first. Click a university to highlight fellow alumni on the map." },
  "drawer-shape":     { t: "Collaboration style", b: "Breadth is the count of distinct co-authors; depth is the average papers per co-author." },
  "drawer-fields":    { t: "Research fingerprint", b: "Academic fields this professor's work touches, from Scopus topic fingerprints. Several fields = interdisciplinary." },
};

/* ---- Helpers ---- */
NM.initials = function (name) {
  if (!name) return "?";
  const p = name.trim().split(/\s+/);
  return ((p[0]?.[0] || "") + (p[p.length - 1]?.[0] || "")).toUpperCase();
};

// Photo: try server proxy first, then direct URL, then fall back to initials avatar.
NM.photoImg = function (node, size, cls) {
  const url = node.photo_url;
  const init = NM.initials(node.name);
  const color = NM.deptColor(node.dept_code);
  if (!url) {
    return `<div class="${cls}" style="width:${size}px;height:${size}px;background:${color}">${init}</div>`;
  }
  const proxied = "/api/photo?src=" + encodeURIComponent(url);
  // onerror chain: proxy -> direct -> initials
  return `<img class="${cls}" src="${proxied}" alt="" style="width:${size}px;height:${size}px;background:${color}"
            onerror="NM._imgFallback(this, '${url.replace(/'/g, "%27")}', '${init}', '${color}')" />`;
};
NM._imgFallback = function (img, directUrl, init, color) {
  if (!img.dataset.tried) {
    img.dataset.tried = "1";
    img.src = directUrl;
  } else {
    const span = document.createElement("div");
    span.className = img.className;
    span.style.cssText = img.style.cssText;
    span.style.display = "grid";
    span.style.placeItems = "center";
    span.style.color = "#fff";
    span.style.fontWeight = "700";
    span.textContent = init;
    img.replaceWith(span);
  }
};

NM.parsePub = function (text) {
  if (typeof text === "number") return text;
  const m = String(text || "").match(/(\d+)/);
  return m ? parseInt(m[1], 10) : 0;
};

NM.loadGraph = async function () {
  try {
    const r = await fetch("/api/graph");
    if (r.ok) {
      const j = await r.json();
      if (j && j.nodes) return j;
    }
  } catch (e) { /* fall through */ }
  if (window.__GRAPH_DATA__) return window.__GRAPH_DATA__;
  throw new Error("Could not load network data from /api/graph.");
};
