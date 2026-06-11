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
    predict_cross_dept_links
)
from pipeline.nlp_analysis import (
    compute_nlp_similarity,
    label_communities_with_tfidf
)

# Configure logging
logging.basicConfig(level=logging.INFO, format="%(levelname)s  %(message)s")
log = logging.getLogger(__name__)


class NetworkBuilder:
    """Orchestrates network construction, NLP similarity calculations, centrality analysis, and community discovery."""

    def __init__(self, raw_path: str = None, graph_path: str = None):
        self.raw_path = raw_path or os.path.join("data", "faculty_raw.json")
        self.graph_path = graph_path or os.path.join("data", "graph.json")

    def run(self) -> dict:
        """Orchestrates the entire metrics and community modeling pipeline."""
        log.info("Starting Metrics and Network visualizer pipeline...")

        # 1. Load and normalize raw faculty records
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

        # 6. Apply NLP vectorization and similarities
        semantic_neighbors_map, semantic_edges, documents_map = compute_nlp_similarity(faculty_list)
        log.info("NLP similarity computed: %d global semantic edges.", len(semantic_edges))

        # 7. Summarize and label community keyword tags
        communities_structure = label_communities_with_tfidf(communities, faculty_list, documents_map)
        log.info("Community labeling completed.")

        # 8. Consolidate and write unified dashboard JSON payload
        graph_data = self.assemble_graph_data(
            faculty_list=faculty_list,
            network=network,
            edge_dict=edge_dict,
            centrality_metrics=centrality_metrics,
            community_mapping=community_mapping,
            predicted_links=predicted_links,
            semantic_neighbors_map=semantic_neighbors_map,
            semantic_edges=semantic_edges,
            communities_structure=communities_structure
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
        communities_structure: list[dict]
    ) -> dict:
        """Assembles all calculated parameters and outputs into the final standardized JSON structure."""
        nodes_output = []
        for member in faculty_list:
            node_id = member["id"]

            degree_val = network.degree(node_id) if network.has_node(node_id) else 0

            if network.has_node(node_id):
                weighted_degree_val = sum(data.get("weight", 1) for _, _, data in network.edges(node_id, data=True))
            else:
                weighted_degree_val = 0

            nodes_output.append({
                **{k: v for k, v in member.items() if not k.startswith("_")},
                "degree": degree_val,
                "weighted_degree": weighted_degree_val,
                "degree_centrality": round(centrality_metrics["degree_centrality"].get(node_id, 0.0), 4),
                "betweenness_centrality": round(centrality_metrics["betweenness_centrality"].get(node_id, 0.0), 4),
                "closeness_centrality": round(centrality_metrics["closeness_centrality"].get(node_id, 0.0), 4),
                "pagerank": round(centrality_metrics["pagerank"].get(node_id, 0.0), 5),
                "eigenvector_centrality": round(centrality_metrics["eigenvector_centrality"].get(node_id, 0.0), 4),
                "community": community_mapping.get(node_id, 0),
                "semantic_neighbors": semantic_neighbors_map.get(node_id, [])
            })

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
            "num_communities": len(communities_structure)
        }

        graph_data = {
            "nodes": nodes_output,
            "edges": edges_output,
            "semantic_edges": semantic_edges,
            "predicted_links": predicted_links,
            "communities": communities_structure,
            "summary": summary_info
        }

        return graph_data


def main():
    parser = argparse.ArgumentParser(description="Faculty network visualizer preprocessing pipeline")
    parser.add_argument("--raw", type=str, default=os.path.join("data", "faculty_raw.json"))
    parser.add_argument("--graph", type=str, default=os.path.join("data", "graph.json"))
    args = parser.parse_args()

    builder = NetworkBuilder(raw_path=args.raw, graph_path=args.graph)
    graph_data = builder.run()

    # Printed summary
    print("\n" + "=" * 50)
    print("METRICS PIPELINE PROCESS COMPLETE SUMMARY")
    print("=" * 50)
    print(f"Total Nodes Processed:      {graph_data['summary']['num_nodes']}")
    print(f"Total Collaboration Edges:  {graph_data['summary']['num_edges']}")
    print(f"Total NLP Semantic Edges:   {graph_data['summary']['num_semantic_edges']}")
    print(f"Total Communities:          {graph_data['summary']['num_communities']}")

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
    print("=" * 50)


if __name__ == "__main__":
    main()
