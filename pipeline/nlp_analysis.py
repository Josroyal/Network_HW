import logging
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

log = logging.getLogger(__name__)

def compute_nlp_similarity(faculty_list: list[dict]) -> tuple[dict[str, list[dict]], list[dict], dict[str, str]]:
    """Computes cosine similarity between faculty text documents using TF-IDF."""
    semantic_neighbors_map = {member["id"]: [] for member in faculty_list}
    global_semantic_edges = []
    documents_map = {}

    if not faculty_list:
        return semantic_neighbors_map, global_semantic_edges, documents_map

    # 1. Build text documents
    for member in faculty_list:
        areas = member.get("areas") or []
        bio = member.get("bio")

        if not areas and bio is None:
            documents_map[member["id"]] = ""
            log.warning("Empty NLP document for %s (no areas, no bio)", member["name"])
        else:
            text_tokens = []
            # Research areas: repeat each area term 3 times
            for area in areas:
                text_tokens.extend([area] * 3)

            # Bio text: append bio if not None and length > 30
            if bio is not None and len(bio) > 30:
                text_tokens.append(bio)

            documents_map[member["id"]] = " ".join(text_tokens).strip()

    # 2. Fit TF-IDF Vectorizer
    doc_ids = [member["id"] for member in faculty_list]
    doc_texts = [documents_map[node_id] for node_id in doc_ids]

    if not any(text for text in doc_texts):
        log.warning("All faculty text documents are empty. Returning empty similarity maps.")
        return semantic_neighbors_map, global_semantic_edges, documents_map

    try:
        vectorizer = TfidfVectorizer(max_features=300, ngram_range=(1, 2))
        tfidf_matrix = vectorizer.fit_transform(doc_texts)
        similarity_matrix = cosine_similarity(tfidf_matrix)
    except Exception as tfidf_error:
        log.warning("TF-IDF Vectorization or Cosine Similarity failed: %s", tfidf_error)
        return semantic_neighbors_map, global_semantic_edges, documents_map

    num_nodes = len(doc_ids)

    # 3. For each faculty, find up to 5 cross-department semantic neighbors with score > 0.25
    for i in range(num_nodes):
        current_id = doc_ids[i]
        current_dept = faculty_list[i]["dept_code"]
        neighbors = []
        for j in range(num_nodes):
            if i == j:
                continue
            score = float(similarity_matrix[i, j])
            other_id = doc_ids[j]
            other_dept = faculty_list[j]["dept_code"]

            if score > 0.25 and current_dept != other_dept:
                neighbors.append({
                    "id": other_id,
                    "name": faculty_list[j]["name"],
                    "score": round(score, 4)
                })

        neighbors.sort(key=lambda x: -x["score"])
        semantic_neighbors_map[current_id] = neighbors[:5]

    # 4. Build global semantic edges (top 40 cross-dept pairs, deduplicated)
    unique_edges = {}
    for i in range(num_nodes):
        for j in range(i + 1, num_nodes):
            score = float(similarity_matrix[i, j])
            dept_i = faculty_list[i]["dept_code"]
            dept_j = faculty_list[j]["dept_code"]

            if dept_i != dept_j and score > 0.20:
                edge_key = (doc_ids[i], doc_ids[j])
                unique_edges[edge_key] = {
                    "source": doc_ids[i],
                    "target": doc_ids[j],
                    "score": round(score, 4),
                    "source_dept": dept_i,
                    "target_dept": dept_j
                }

    sorted_semantic_edges = sorted(unique_edges.values(), key=lambda x: -x["score"])
    global_semantic_edges = sorted_semantic_edges[:40]

    return semantic_neighbors_map, global_semantic_edges, documents_map

def label_communities_with_tfidf(
    communities: list[frozenset],
    faculty_list: list[dict],
    documents: dict[str, str]
) -> list[dict]:
    """Generates representative labels for communities using TF-IDF on member documents."""
    community_records = []

    for index, member_nodes in enumerate(communities):
        member_ids = list(member_nodes)
        community_label = f"Community {index}"

        member_docs = [documents[node_id] for node_id in member_ids if node_id in documents and documents[node_id].strip()]

        if member_docs:
            try:
                mini_vectorizer = TfidfVectorizer(max_features=50, stop_words=None)
                mini_matrix = mini_vectorizer.fit_transform(member_docs)
                feature_names = mini_vectorizer.get_feature_names_out()

                if len(feature_names) > 0:
                    term_scores = mini_matrix.sum(axis=0).A1
                    sorted_indices = term_scores.argsort()[::-1]

                    top_terms = []
                    for term_idx in sorted_indices:
                        term_name = feature_names[term_idx]
                        if len(term_name) > 2:
                            top_terms.append(term_name)
                        if len(top_terms) == 3:
                            break

                    if top_terms:
                        community_label = " · ".join(top_terms)
            except Exception as mini_tfidf_error:
                log.warning("Mini-TF-IDF for community %d failed: %s. Falling back to default label.", index, mini_tfidf_error)

        community_records.append({
            "index": index,
            "label": community_label,
            "member_ids": member_ids
        })

    return community_records
