import re
import logging
import networkx as nx
from networkx.algorithms import community as nx_comm

log = logging.getLogger(__name__)


def _parse_pub_count(text: str) -> int:
    """Extract integer from strings like '2 resultado de la investigación compartida'."""
    if not text:
        return 0
    match = re.search(r"(\d+)", str(text))
    return int(match.group(1)) if match else 0


def construct_collaboration_network(faculty_list: list[dict]) -> tuple[nx.Graph, dict]:
    """Constructs the NetworkX Graph from collaborator links using name-matched IDs."""
    graph = nx.Graph()
    for member in faculty_list:
        node_properties = {k: v for k, v in member.items()
                          if not k.startswith("_") and k not in ("fingerprints_structured", "collaborator_details")}
        graph.add_node(member["id"], **node_properties)

    collaborations = {}
    for member in faculty_list:
        for collab_id in member.get("_collaborator_ids", []):
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
    """Splits network into communities using modularity maximization."""
    if network.number_of_nodes() < 2:
        single_community = frozenset(network.nodes)
        communities_list = [single_community] if single_community else []
        node_to_community = {node: 0 for node in network.nodes}
        return communities_list, node_to_community

    try:
        communities_list = list(nx_comm.greedy_modularity_communities(network, weight="weight"))
    except Exception as community_error:
        log.warning("Greedy modularity community detection failed: %s. Falling back.", community_error)
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


# ─── NEW ANALYSIS FUNCTIONS ─────────────────────────────────────────────────

def compute_education_network(faculty_list: list[dict]) -> dict:
    """Builds alma mater connections: professors who studied at the same university.
    Returns:
        {
            "university_stats": [{"university": str, "count": int, "member_ids": [str]}],
            "edges": [{"source": str, "target": str, "shared_university": str}]
        }
    """
    uni_to_members = {}
    for member in faculty_list:
        seen_unis = set()
        for edu in member.get("education", []):
            uni = (edu.get("university_canonical") or edu.get("university") or "").strip()
            if uni and uni not in seen_unis:
                seen_unis.add(uni)
                if uni not in uni_to_members:
                    uni_to_members[uni] = []
                uni_to_members[uni].append(member["id"])

    # Build stats
    university_stats = []
    for uni, members in sorted(uni_to_members.items(), key=lambda x: -len(x[1])):
        if len(members) >= 2:
            university_stats.append({
                "university": uni,
                "count": len(members),
                "member_ids": members
            })

    # Build edges (pairs who share a university)
    edges = []
    seen_pairs = set()
    for uni, members in uni_to_members.items():
        if len(members) < 2:
            continue
        for i, a in enumerate(members):
            for b in members[i+1:]:
                pair = tuple(sorted([a, b]))
                if pair not in seen_pairs:
                    seen_pairs.add(pair)
                    edges.append({
                        "source": pair[0],
                        "target": pair[1],
                        "shared_university": uni
                    })

    log.info("Education network: %d universities with 2+ alumni, %d edges", len(university_stats), len(edges))
    return {
        "university_stats": university_stats[:30],
        "edges": edges
    }


def compute_external_org_overlap(faculty_list: list[dict]) -> list[dict]:
    """Identifies external organizations that multiple UTEC professors collaborate with.
    Returns list of {"organization": str, "count": int, "member_ids": [str], "total_pubs": int}.
    """
    org_to_members = {}
    for member in faculty_list:
        for ext_org in member.get("external_orgs", []):
            org_name = ext_org.get("organizacion", "").strip()
            if not org_name:
                continue
            # Skip self-references to UTEC
            if "utec" in org_name.lower() and "ingeniería y tecnología" in org_name.lower():
                continue
            if org_name not in org_to_members:
                org_to_members[org_name] = {"members": [], "total_pubs": 0}
            org_to_members[org_name]["members"].append(member["id"])
            org_to_members[org_name]["total_pubs"] += _parse_pub_count(ext_org.get("num_publications", ""))

    results = []
    for org, data in sorted(org_to_members.items(), key=lambda x: -len(x[1]["members"])):
        if len(data["members"]) >= 2:
            results.append({
                "organization": org,
                "count": len(data["members"]),
                "member_ids": data["members"],
                "total_pubs": data["total_pubs"]
            })

    log.info("External org overlap: %d organizations shared by 2+ faculty", len(results))
    return results[:25]


def compute_cross_group_opportunities(network: nx.Graph, faculty_list: list[dict]) -> list[dict]:
    """Find professor pairs in different groups with high area/fingerprint overlap but no co-authorship.
    Returns list of {"source": str, "target": str, "shared_topics": [str], "source_groups": [str], "target_groups": [str]}.
    """
    faculty_map = {m["id"]: m for m in faculty_list}
    results = []

    # Build area + fingerprint topic sets per professor.
    # Fingerprint topic names (e.g. "Diode Model") are highly specific, so an
    # exact shared topic between two people is already a strong signal; we keep
    # all topics rather than thresholding on score. We also track the broad
    # academic fields (campo) so we can report field-level overlap.
    topic_sets = {}
    field_sets = {}
    for m in faculty_list:
        topics = set(a.lower().strip() for a in m.get("areas", []) if a.strip())
        for topic in m.get("fingerprints", {}).keys():
            topics.add(topic.lower().strip())
        topic_sets[m["id"]] = topics
        field_sets[m["id"]] = set(
            fp.get("campo", "").strip()
            for fp in m.get("fingerprints_structured", [])
            if fp.get("campo")
        )

    # Only consider non-edges
    existing_edges = set()
    for u, v in network.edges():
        existing_edges.add(tuple(sorted([u, v])))

    seen = set()
    for i, a in enumerate(faculty_list):
        a_groups = set(g for g in a.get("groups", []) if "UTEC" not in g)
        if not a_groups:
            continue
        for b in faculty_list[i+1:]:
            pair = tuple(sorted([a["id"], b["id"]]))
            if pair in existing_edges or pair in seen:
                continue

            b_groups = set(g for g in b.get("groups", []) if "UTEC" not in g)
            if not b_groups:
                continue

            # Must be in different groups
            if a_groups & b_groups:
                continue

            shared = topic_sets.get(a["id"], set()) & topic_sets.get(b["id"], set())
            if len(shared) >= 2:
                seen.add(pair)
                shared_fields = sorted(field_sets.get(a["id"], set()) & field_sets.get(b["id"], set()))
                results.append({
                    "source": a["id"],
                    "target": b["id"],
                    "shared_topics": sorted(shared)[:8],
                    "overlap_count": len(shared),
                    "shared_fields": shared_fields,
                    "source_groups": sorted(a_groups),
                    "target_groups": sorted(b_groups),
                    "source_dept": a["dept_code"],
                    "target_dept": b["dept_code"],
                })

    results.sort(key=lambda x: -x["overlap_count"])
    log.info("Cross-group opportunities: %d pairs found", len(results))
    return results[:25]


def compute_education_levels(faculty_list: list[dict]) -> dict:
    """Distribution of degree types per department + international doctorate flag + h-index cross-tab.
    Returns:
        {
            "by_department": {dept_code: {"PhD": int, "Masters": int, ...}},
            "international_doctorates": [{"id": str, "name": str, "university": str, "h_index": int}],
            "degree_hindex": [{"id": str, "name": str, "highest_degree": str, "is_international": bool, "h_index": int}]
        }
    """
    by_dept = {}
    international_docs = []
    degree_hindex = []

    for m in faculty_list:
        dept = m["dept_code"]
        if dept not in by_dept:
            by_dept[dept] = {"PhD": 0, "Masters": 0, "Bachelor": 0, "Professional": 0, "Other": 0}

        highest = "Other"
        highest_international = False
        degree_priority = {"PhD": 4, "Masters": 3, "Professional": 2, "Bachelor": 1, "Other": 0}

        seen_levels = set()
        for edu in m.get("education", []):
            level = edu.get("degree_level", "Other")
            is_intl = edu.get("is_international", False)

            if level not in seen_levels:
                seen_levels.add(level)
                by_dept[dept][level] = by_dept[dept].get(level, 0) + 1

            if degree_priority.get(level, 0) > degree_priority.get(highest, 0):
                highest = level
                highest_international = is_intl

            if level == "PhD" and is_intl:
                international_docs.append({
                    "id": m["id"],
                    "name": m["name"],
                    "university": edu.get("university", ""),
                    "h_index": m.get("h_index", 0),
                })

        degree_hindex.append({
            "id": m["id"],
            "name": m["name"],
            "dept_code": dept,
            "highest_degree": highest,
            "is_international": highest_international,
            "h_index": m.get("h_index", 0),
        })

    log.info("Education levels: %d departments analyzed, %d international doctorates",
             len(by_dept), len(international_docs))
    return {
        "by_department": by_dept,
        "international_doctorates": international_docs,
        "degree_hindex": degree_hindex,
    }


def compute_collaboration_shape(faculty_list: list[dict]) -> list[dict]:
    """Per professor: depth (avg shared pubs per collaborator) vs breadth (distinct collaborator count).
    Returns list of {"id": str, "name": str, "dept_code": str, "breadth": int, "depth": float, "total_shared_pubs": int}.
    """
    results = []
    for m in faculty_list:
        details = m.get("collaborator_details", [])
        breadth = len(details)
        total_pubs = sum(d.get("shared_publications", 0) for d in details)
        depth = total_pubs / breadth if breadth > 0 else 0.0

        results.append({
            "id": m["id"],
            "name": m["name"],
            "dept_code": m["dept_code"],
            "breadth": breadth,
            "depth": round(depth, 2),
            "total_shared_pubs": total_pubs,
        })

    log.info("Collaboration shape: %d professors analyzed", len(results))
    return results
