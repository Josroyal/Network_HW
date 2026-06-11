import logging
import networkx as nx
from networkx.algorithms import community as nx_comm

log = logging.getLogger(__name__)

def construct_collaboration_network(faculty_list: list[dict]) -> tuple[nx.Graph, dict]:
    """Constructs the NetworkX Graph from collaborator links, with fallback if edges count is small."""
    profile_to_id = {}
    for member in faculty_list:
        profile_to_id[member["profile_url"]] = member["id"]
        profile_to_id[member["profile_url"].rstrip("/")] = member["id"]

    graph = nx.Graph()
    for member in faculty_list:
        node_properties = {k: v for k, v in member.items() if not k.startswith("_")}
        graph.add_node(member["id"], **node_properties)

    collaborations = {}
    for member in faculty_list:
        for collab_url in member["_collaborator_urls"]:
            collab_id = profile_to_id.get(collab_url) or profile_to_id.get(collab_url.rstrip("/"))
            if collab_id and collab_id != member["id"]:
                edge_key = tuple(sorted([member["id"], collab_id]))
                collaborations[edge_key] = collaborations.get(edge_key, 0) + 1

    for (source_id, target_id), collab_weight in collaborations.items():
        graph.add_edge(source_id, target_id, weight=collab_weight)

    if graph.number_of_edges() < 10:
        log.info("Sparse collaborations (under 10 edges). Injecting shared-area links as fallback.")
        for i, member_a in enumerate(faculty_list):
            for member_b in faculty_list[i + 1:]:
                shared_areas = set(member_a["areas"]) & set(member_b["areas"])
                if shared_areas:
                    edge_key = tuple(sorted([member_a["id"], member_b["id"]]))
                    if edge_key not in collaborations:
                        graph.add_edge(member_a["id"], member_b["id"], weight=len(shared_areas))
                        collaborations[edge_key] = len(shared_areas)

    return graph, collaborations

def compute_centralities(network: nx.Graph) -> dict[str, dict[str, float]]:
    """Computes 5 centrality metrics for all nodes in the network."""
    degree_c = nx.degree_centrality(network)
    between_c = nx.betweenness_centrality(network, weight="weight", normalized=True)
    closeness_c = nx.closeness_centrality(network)
    pagerank_c = nx.pagerank(network, weight="weight", alpha=0.85)

    try:
        eigenvector_c = nx.eigenvector_centrality(network, weight="weight", max_iter=1000)
    except nx.PowerIterationFailedConvergence:
        log.warning("Eigenvector centrality power iteration failed to converge. Zeroing out.")
        eigenvector_c = {node: 0.0 for node in network.nodes}

    return {
        "degree_centrality": degree_c,
        "betweenness_centrality": between_c,
        "closeness_centrality": closeness_c,
        "pagerank": pagerank_c,
        "eigenvector_centrality": eigenvector_c
    }

def detect_communities_modularity(network: nx.Graph) -> tuple[list[frozenset], dict[str, int]]:
    """Splits network into communities using modularity maximization, with a safe fallback."""
    if network.number_of_nodes() < 2:
        single_community = frozenset(network.nodes)
        communities_list = [single_community] if single_community else []
        node_to_community = {node: 0 for node in network.nodes}
        return communities_list, node_to_community

    try:
        communities_list = list(nx_comm.greedy_modularity_communities(network, weight="weight"))
    except Exception as community_error:
        log.warning("Greedy modularity community detection failed: %s. Falling back to single community.", community_error)
        communities_list = [frozenset(network.nodes)]

    node_to_community = {}
    for index, community_nodes in enumerate(communities_list):
        for node in community_nodes:
            node_to_community[node] = index

    return communities_list, node_to_community

def predict_cross_dept_links(network: nx.Graph, faculty_list: list[dict]) -> list[dict]:
    """Predicts potential links using Adamic-Adar on non-edges between different departments."""
    if network.number_of_nodes() < 2:
        return []

    faculty_map = {member["id"]: member for member in faculty_list}
    non_edges = list(nx.non_edges(network))
    if not non_edges:
        return []

    try:
        adamic_adar_iterable = nx.adamic_adar_index(network, ebunch=non_edges)
        scores_map = {(u, v): s for u, v, s in adamic_adar_iterable}
    except Exception as pred_error:
        log.warning("Link prediction calculation error: %s", pred_error)
        scores_map = {}

    common_neighbors_map = {}
    for u, v in non_edges:
        try:
            common_neighbors_map[(u, v)] = len(list(nx.common_neighbors(network, u, v)))
        except Exception:
            common_neighbors_map[(u, v)] = 0

    predictions = []
    for (u, v), score in scores_map.items():
        if score > 0:
            dept_u = faculty_map[u]["dept_code"]
            dept_v = faculty_map[v]["dept_code"]
            if dept_u != dept_v:
                predictions.append({
                    "source": u,
                    "target": v,
                    "score": round(score, 4),
                    "common_neighbors": common_neighbors_map.get((u, v), 0),
                    "source_dept": dept_u,
                    "target_dept": dept_v
                })

    predictions.sort(key=lambda x: -x["score"])
    return predictions[:15]
