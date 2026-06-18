import argparse
import json
import logging
import os
import networkx as nx

# Modular imports from submodules
from pipeline.loader import load_faculty_data
from pipeline.graph_analysis import (
    construct_collaboration_network,
    compute_centralities,
    detect_communities_modularity,
    predict_cross_dept_links,
    compute_education_network,
    compute_external_org_overlap,
    compute_cross_group_opportunities,
    compute_education_levels,
    compute_collaboration_shape,
)
from pipeline.nlp_analysis import (
    compute_nlp_similarity,
    label_communities_with_tfidf,
    compute_fingerprint_field_overlap,
)

# Configure logging
logging.basicConfig(level=logging.INFO, format="%(levelname)s  %(message)s")
log = logging.getLogger(__name__)


class NetworkBuilder:
    """Orchestrates network construction, NLP similarity, centrality analysis, community discovery, and new analytics."""

    def __init__(self, raw_path: str = None, graph_path: str = None):
        self.raw_path = raw_path or os.path.join("data", "detail_professors_description.json")
        self.graph_path = graph_path or os.path.join("data", "graph.json")

    def run(self) -> dict:
        """Orchestrates the entire metrics and network visualizer pipeline."""
        log.info("Starting Metrics and Network visualizer pipeline...")

        # 1. Load and normalize faculty records from enriched JSON
        faculty_list = load_faculty_data(self.raw_path)
        log.info("Successfully loaded %d faculty entries.", len(faculty_list))

        # 2. Compile collaboration network links
        network, edge_dict = construct_collaboration_network(faculty_list)
        log.info("Network graph constructed with %d nodes and %d edges.", network.number_of_nodes(), network.number_of_edges())

        # 3. Calculate structural graph centralities
        centrality_metrics = compute_centralities(network)
        log.info("Centrality metrics computed.")

        # 4. Partition modularity groups
        communities, community_mapping = detect_communities_modularity(network)
        log.info("Detected %d modular communities.", len(communities))

        # 5. Predict potential cross-department links
        predicted_links = predict_cross_dept_links(network, faculty_list)
        log.info("Link prediction complete: %d potential links found.", len(predicted_links))

        # 6. Apply NLP vectorization and similarities (now with structured fingerprints)
        semantic_neighbors_map, semantic_edges, documents_map = compute_nlp_similarity(faculty_list)
        log.info("NLP similarity computed: %d global semantic edges.", len(semantic_edges))

        # 7. Summarize and label community keyword tags
        communities_structure = label_communities_with_tfidf(communities, faculty_list, documents_map)
        log.info("Community labeling completed.")

        # 8. NEW: Education network (alma mater connections)
        education_network = compute_education_network(faculty_list)
        log.info("Education network: %d university groups, %d edges.",
                 len(education_network["university_stats"]), len(education_network["edges"]))

        # 9. NEW: External organization overlap
        external_org_stats = compute_external_org_overlap(faculty_list)
        log.info("External org overlap: %d shared organizations.", len(external_org_stats))

        # 10. NEW: Fingerprint field overlap (multi-disciplinary researchers)
        fingerprint_fields = compute_fingerprint_field_overlap(faculty_list)
        log.info("Fingerprint field overlap: %d multi-field researchers.", len(fingerprint_fields))

        # 11. NEW: Cross-group collaboration opportunities
        cross_group_opportunities = compute_cross_group_opportunities(network, faculty_list)
        log.info("Cross-group opportunities: %d pairs.", len(cross_group_opportunities))

        # 12. NEW: Education level distribution
        education_levels = compute_education_levels(faculty_list)
        log.info("Education levels analyzed for %d departments.", len(education_levels["by_department"]))

        # 13. NEW: Collaboration shape (depth vs breadth)
        collaboration_shape = compute_collaboration_shape(faculty_list)
        log.info("Collaboration shape computed for %d professors.", len(collaboration_shape))

        # 14. Consolidate and write unified dashboard JSON payload
        graph_data = self.assemble_graph_data(
            faculty_list=faculty_list,
            network=network,
            edge_dict=edge_dict,
            centrality_metrics=centrality_metrics,
            community_mapping=community_mapping,
            predicted_links=predicted_links,
            semantic_neighbors_map=semantic_neighbors_map,
            semantic_edges=semantic_edges,
            communities_structure=communities_structure,
            education_network=education_network,
            external_org_stats=external_org_stats,
            fingerprint_fields=fingerprint_fields,
            cross_group_opportunities=cross_group_opportunities,
            education_levels=education_levels,
            collaboration_shape=collaboration_shape,
        )

        output_dir = os.path.dirname(self.graph_path)
        if output_dir:
            os.makedirs(output_dir, exist_ok=True)

        with open(self.graph_path, "w", encoding="utf-8") as file_handle:
            json.dump(graph_data, file_handle, ensure_ascii=False, indent=2)

        log.info("✓ Saved final network visualizer JSON to %s", self.graph_path)
        return graph_data

    def assemble_graph_data(
        self,
        faculty_list: list[dict],
        network: nx.Graph,
        edge_dict: dict[tuple[str, str], int],
        centrality_metrics: dict[str, dict[str, float]],
        community_mapping: dict[str, int],
        predicted_links: list[dict],
        semantic_neighbors_map: dict[str, list[dict]],
        semantic_edges: list[dict],
        communities_structure: list[dict],
        education_network: dict,
        external_org_stats: list[dict],
        fingerprint_fields: list[dict],
        cross_group_opportunities: list[dict],
        education_levels: dict,
        collaboration_shape: list[dict],
    ) -> dict:
        """Assembles all calculated parameters into the final standardized JSON structure."""
        nodes_output = []
        for member in faculty_list:
            node_id = member["id"]

            degree_val = network.degree(node_id) if network.has_node(node_id) else 0

            if network.has_node(node_id):
                weighted_degree_val = sum(data.get("weight", 1) for _, _, data in network.edges(node_id, data=True))
            else:
                weighted_degree_val = 0

            # Build node output — include new fields for frontend
            node_data = {
                k: v for k, v in member.items()
                if not k.startswith("_") and k not in ("fingerprints", "collaborator_details")
            }
            node_data.update({
                "degree": degree_val,
                "weighted_degree": weighted_degree_val,
                "degree_centrality": round(centrality_metrics["degree_centrality"].get(node_id, 0.0), 4),
                "betweenness_centrality": round(centrality_metrics["betweenness_centrality"].get(node_id, 0.0), 4),
                "closeness_centrality": round(centrality_metrics["closeness_centrality"].get(node_id, 0.0), 4),
                "pagerank": round(centrality_metrics["pagerank"].get(node_id, 0.0), 5),
                "eigenvector_centrality": round(centrality_metrics["eigenvector_centrality"].get(node_id, 0.0), 4),
                "community": community_mapping.get(node_id, 0),
                "semantic_neighbors": semantic_neighbors_map.get(node_id, []),
                "collaborator_details": member.get("collaborator_details", []),
            })
            nodes_output.append(node_data)

        edges_output = []
        faculty_map = {member["id"]: member for member in faculty_list}
        for (source_id, target_id), edge_weight in edge_dict.items():
            if source_id in faculty_map and target_id in faculty_map:
                dept_s = faculty_map[source_id]["dept_code"]
                dept_t = faculty_map[target_id]["dept_code"]
                edges_output.append({
                    "source": source_id,
                    "target": target_id,
                    "weight": edge_weight,
                    "source_dept": dept_s,
                    "target_dept": dept_t,
                    "is_cross_dept": dept_s != dept_t
                })

        summary_info = {
            "num_nodes": len(nodes_output),
            "num_edges": len(edges_output),
            "num_semantic_edges": len(semantic_edges),
            "num_communities": len(communities_structure),
            "num_education_edges": len(education_network.get("edges", [])),
            "num_external_orgs": len(external_org_stats),
            "num_multi_field_researchers": len(fingerprint_fields),
            "num_cross_group_opportunities": len(cross_group_opportunities),
        }

        graph_data = {
            "nodes": nodes_output,
            "edges": edges_output,
            "semantic_edges": semantic_edges,
            "predicted_links": predicted_links,
            "communities": communities_structure,
            "education_network": education_network,
            "external_org_stats": external_org_stats,
            "fingerprint_fields": fingerprint_fields,
            "cross_group_opportunities": cross_group_opportunities,
            "education_levels": education_levels,
            "collaboration_shape": collaboration_shape,
            "summary": summary_info
        }

        return graph_data


def main():
    parser = argparse.ArgumentParser(description="Faculty network visualizer preprocessing pipeline")
    parser.add_argument("--raw", type=str, default=os.path.join("data", "detail_professors_description.json"))
    parser.add_argument("--graph", type=str, default=os.path.join("data", "graph.json"))
    args = parser.parse_args()

    builder = NetworkBuilder(raw_path=args.raw, graph_path=args.graph)
    graph_data = builder.run()

    # Printed summary
    print("\n" + "=" * 60)
    print("METRICS PIPELINE PROCESS COMPLETE SUMMARY")
    print("=" * 60)
    print(f"Total Nodes Processed:          {graph_data['summary']['num_nodes']}")
    print(f"Total Collaboration Edges:      {graph_data['summary']['num_edges']}")
    print(f"Total NLP Semantic Edges:       {graph_data['summary']['num_semantic_edges']}")
    print(f"Total Communities:              {graph_data['summary']['num_communities']}")
    print(f"Education Network Edges:        {graph_data['summary']['num_education_edges']}")
    print(f"External Orgs (shared):         {graph_data['summary']['num_external_orgs']}")
    print(f"Multi-Field Researchers:        {graph_data['summary']['num_multi_field_researchers']}")
    print(f"Cross-Group Opportunities:      {graph_data['summary']['num_cross_group_opportunities']}")

    print("\nCommunities:")
    for comm in graph_data["communities"]:
        print(f"  Community {comm['index']}: '{comm['label']}' ({len(comm['member_ids'])} members)")

    print("\nTop 5 Nodes by degree:")
    sorted_nodes = sorted(graph_data["nodes"], key=lambda x: -x["degree"])
    for node in sorted_nodes[:5]:
        print(f"  - {node['name']} (Dept: {node['dept_code']}, Degree: {node['degree']}, PR: {node['pagerank']:.5f})")

    if graph_data["predicted_links"]:
        print("\nTop 3 Predicted Links:")
        for link in graph_data["predicted_links"][:3]:
            print(f"  - {link['source']} <--> {link['target']} (Score: {link['score']}, Shared neighbors: {link['common_neighbors']})")

    if graph_data["education_network"]["university_stats"]:
        print("\nTop 5 Alma Mater Universities:")
        for uni in graph_data["education_network"]["university_stats"][:5]:
            print(f"  - {uni['university']}: {uni['count']} faculty")

    if graph_data["cross_group_opportunities"]:
        print("\nTop 3 Cross-Group Opportunities:")
        for opp in graph_data["cross_group_opportunities"][:3]:
            print(f"  - {opp['source']} <--> {opp['target']} ({opp['overlap_count']} shared topics)")

    print("=" * 60)


if __name__ == "__main__":
    main()
