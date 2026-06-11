/* ==========================================================================
   STATE DEFINITIONS (state.js)
   ========================================================================== */
window.NetMap = {
  state: {
    nodes: [],
    edges: [],
    semanticEdges: [],
    predictedLinks: [],
    communities: [],
    simulation: null,
    selectedNodeId: null,
    activeViewMode: 'default', // default | degree | betweenness | cluster | community | semantic
    edgeMode: 'collab',       // collab | semantic
    sizeMetric: 'degree',      // degree | hindex | citations
    activeDeptFilter: 'all',
    activeCommunityFilter: null,
    activeAreaFilter: null,
    zoomBehavior: null,
    svgSelection: null,
    gMainSelection: null,
    linkSelection: null,
    nodeSelection: null,
    width: 0,
    height: 0,
    mantraPlayed: false,
    stablePositions: {},       // keyed by node id, { x, y }
    explanationTimer: null,     // auto-dismiss timer for explanation card
    hindexOrderActive: false,  // whether H-Index Flow Layout is active
    previousSizeMetric: 'degree' // previously active size metric
  }
};
