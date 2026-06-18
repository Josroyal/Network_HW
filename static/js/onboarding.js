/* ============================================================================
   NetMap — ONBOARDING (light-touch orientation, not a heavy walkthrough)
   ========================================================================== */
(function () {
  const overlay = document.getElementById("onboard");
  const coach = document.getElementById("coach");
  const spot = document.getElementById("coach-spot");
  const KEY = "netmap.seen.v2";

  function seen() { try { return localStorage.getItem(KEY) === "1"; } catch (e) { return false; } }
  function markSeen() { try { localStorage.setItem(KEY, "1"); } catch (e) {} }

  NM.maybeOnboard = function () {
    if (seen()) return;
    overlay.hidden = false;
    document.getElementById("onboard-skip").onclick = () => { overlay.hidden = true; markSeen(); };
    document.getElementById("onboard-tour").onclick = () => { overlay.hidden = true; markSeen(); startTour(); };
  };

  const steps = [
    { sel: ".node.bridge, .node", text: "Each circle is a professor. Lines join people who've published together. Click any circle to open its profile.", anchor: "canvas" },
    { sel: "#mode-rail", text: "These lenses re-colour and re-shape the map to answer different questions — who connects departments, who studied where, and more." },
    { sel: "#legend", text: "Whatever the map is showing, this key tells you what every colour, size and line means. Tap an i anywhere to dig deeper." },
    { sel: "#tab-insights", text: "Prefer the answers without reading a network? Insights has ranked lists and charts for every question." },
  ];
  let i = 0;

  function startTour() { i = 0; show(); }
  function show() {
    if (i >= steps.length) { end(); return; }
    const s = steps[i];
    let target = document.querySelector(s.sel);
    if (s.anchor === "canvas") target = document.getElementById("canvas-wrap");
    if (!target) { i++; return show(); }
    const r = target.getBoundingClientRect();
    const pad = 8;
    spot.hidden = false;
    spot.style.left = (r.left - pad) + "px"; spot.style.top = (r.top - pad) + "px";
    spot.style.width = (r.width + pad * 2) + "px"; spot.style.height = (r.height + pad * 2) + "px";

    coach.hidden = false;
    coach.innerHTML = `<div class="cstep">Step ${i + 1} of ${steps.length}</div>
      <div class="ct">${s.text}</div>
      <div class="cact"><button class="coach-skip" id="c-skip">Skip</button>
      <button class="coach-next" id="c-next">${i === steps.length - 1 ? "Done" : "Next"}</button></div>`;
    // position coach near target
    let cx = r.right + 14, cy = r.top;
    if (cx + 250 > window.innerWidth) cx = Math.max(12, r.left - 264);
    if (cy + 160 > window.innerHeight) cy = window.innerHeight - 170;
    coach.style.left = cx + "px"; coach.style.top = Math.max(12, cy) + "px";
    document.getElementById("c-next").onclick = () => { i++; show(); };
    document.getElementById("c-skip").onclick = end;
  }
  function end() { coach.hidden = true; spot.hidden = true; }
  window.addEventListener("resize", () => { if (!coach.hidden) show(); });
})();
