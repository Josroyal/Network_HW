import os
import re
import json
import logging
import unicodedata

log = logging.getLogger(__name__)

DEPARTMENT_MAPPING_RULES = [
    ("ciencia de computación",          "CS",   "Computer Science"),
    ("computación",                     "CS",   "Computer Science"),
    ("facultad de computación",         "CS",   "Computer Science"),
    ("sistemas y seguridad",            "SYS",  "Systems & Security"),
    ("ingeniería civil",                "CE",   "Civil Eng."),
    ("civil y ambiental",               "CE",   "Civil Eng."),
    ("ingeniería industrial",           "IE",   "Industrial Eng."),
    ("gestión de la ingeniería",        "IE",   "Industrial Eng."),
    ("negocios",                        "BUS",  "Business"),
    ("ingeniería mecánica",             "ME",   "Mechanical Eng."),
    ("mecánica y de la energía",        "ME",   "Mechanical Eng."),
    ("ingeniería electrónica",          "EE",   "Electronics & Mech."),
    ("electrónica y mecatrónica",       "EE",   "Electronics & Mech."),
    ("bioingeniería",                   "BIO",  "Bioengineering"),
    ("química",                         "BIO",  "Bioengineering"),
    ("humanidades",                     "HUM",  "Humanities"),
    ("artes y ciencias sociales",       "HUM",  "Humanities"),
    ("ciencias",                        "SCI",  "Sciences"),
    # Research groups
    ("analítica de datos",              "DS",   "Data Science"),
    ("dads",                            "DS",   "Data Science"),
    ("inteligencia artificial",         "AI",   "Artificial Intel."),
    ("ginia",                           "AI",   "Artificial Intel."),
    ("robótica",                        "EE",   "Electronics & Mech."),
    ("ric",                             "EE",   "Electronics & Mech."),
    ("energía",                         "ME",   "Mechanical Eng."),
    ("minas",                           "ME",   "Mechanical Eng."),
    ("concreto",                        "CE",   "Civil Eng."),
    ("resucon",                         "CE",   "Civil Eng."),
    ("infraestructura",                 "CE",   "Civil Eng."),
    ("msp",                             "IE",   "Industrial Eng."),
    ("simulación",                      "IE",   "Industrial Eng."),
]

# Patterns that indicate RENACYT level strings in areas arrays
_RENACYT_PATTERN = re.compile(r"^Nivel\s+(I{1,3}|IV|V|VI{0,3}|VII)$", re.IGNORECASE)


def _strip_accents(text: str) -> str:
    """Remove accent marks from Unicode text for fuzzy name matching."""
    nfkd = unicodedata.normalize("NFKD", text)
    return "".join(c for c in nfkd if not unicodedata.combining(c))


def _normalize_name(name: str) -> str:
    """Produce a normalized key for name-based matching.
    Lowercase, strip accents, collapse whitespace, sort name tokens alphabetically
    so 'José Mantari Laureano' matches 'José Luis Mantari Laureano' partially.
    """
    if not name:
        return ""
    cleaned = _strip_accents(name.strip().lower())
    cleaned = re.sub(r"\s+", " ", cleaned)
    return cleaned


def _normalize_name_tokens(name: str) -> frozenset:
    """Return a frozen set of normalized name tokens for fuzzy matching."""
    return frozenset(_normalize_name(name).split())


def resolve_node_id(url: str) -> str:
    """Generates a stable, URL-decoded ID based on the profile URL slug."""
    if not url:
        return "unknown"
    slug = url.rstrip("/").split("/")[-1]
    replacements = {
        "%C3%A9": "e", "%C3%A1": "a", "%C3%AD": "i",
        "%C3%B3": "o", "%C3%BA": "u", "%C3%B1": "n",
        "%c3%a9": "e", "%c3%a1": "a", "%c3%ad": "i",
        "%c3%b3": "o", "%c3%ba": "u", "%c3%b1": "n",
    }
    for encoded, decoded in replacements.items():
        slug = slug.replace(encoded, decoded)
    return slug[:40]


def resolve_department(dept_name: str) -> tuple[str, str]:
    """Classifies a department name string into a structured (code, label) tuple."""
    if not dept_name:
        return ("UNK", "Unknown")
    dept_name_lower = dept_name.lower()
    for substring, code, label in DEPARTMENT_MAPPING_RULES:
        if substring in dept_name_lower:
            return (code, label)
    return ("UNK", "Unknown")


def _parse_pub_count_text(text: str) -> int:
    """Extract integer from strings like '2 resultado de la investigación compartida'."""
    if not text:
        return 0
    match = re.search(r"(\d+)", text)
    return int(match.group(1)) if match else 0


def _flatten_fingerprints(structured_fps: list) -> dict[str, float]:
    """Convert structured fingerprints [{campo, temas: [{puntaje, nombre}]}] to flat {topic: score}."""
    flat = {}
    if not structured_fps:
        return flat
    for field_group in structured_fps:
        for tema in field_group.get("temas", []):
            nombre = tema.get("nombre", "")
            try:
                score = float(tema.get("puntaje", 0))
            except (ValueError, TypeError):
                score = 0.0
            if nombre:
                # Keep highest score if topic appears in multiple fields
                flat[nombre] = max(flat.get(nombre, 0.0), score)
    return flat


def _is_renacyt_level(area: str) -> bool:
    """Check if an area string is actually a RENACYT level like 'Nivel VII'."""
    return bool(_RENACYT_PATTERN.match(area.strip()))


def _parse_degree_level(titulo: str) -> str:
    """Classify an education titulo into PhD, Masters, Bachelor, or Other."""
    if not titulo:
        return "Other"
    t = titulo.lower()
    if "doctorado" in t or "doctor" in t or "phd" in t or "ph.d" in t:
        return "PhD"
    if "máster" in t or "master" in t or "magíster" in t or "magister" in t or "maestría" in t:
        return "Masters"
    if "bachiller" in t or "bachelor" in t:
        return "Bachelor"
    if "título universitario" in t or "título profesional" in t or "licenci" in t:
        return "Professional"
    return "Other"


_PERUVIAN_UNIVERSITIES = {
    "pontificia universidad católica del perú", "pucp",
    "universidad nacional de ingeniería", "uni",
    "universidad nacional mayor de san marcos", "unmsm",
    "universidad de lima", "universidad esan",
    "universidad peruana cayetano heredia",
    "universidad san ignacio de loyola",
    "universidad del pacífico",
    "universidad nacional agraria la molina",
    "universidad nacional de ingenier ía",  # typo variant in data
}


def _is_international_university(universidad: str) -> bool:
    """Heuristic: if university name is not in known Peruvian list, consider international."""
    if not universidad:
        return False
    name_lower = _strip_accents(universidad.strip().lower())
    for peruvian in _PERUVIAN_UNIVERSITIES:
        peruvian_clean = _strip_accents(peruvian)
        if len(peruvian_clean) <= 5:
            # Match short acronyms (e.g., 'uni', 'pucp') as whole words only
            if peruvian_clean in re.findall(r"\b\w+\b", name_lower):
                return False
        else:
            if peruvian_clean in name_lower or name_lower in peruvian_clean:
                return False
    # If it contains 'perú' or 'peru' it's likely Peruvian
    if "peru" in name_lower:
        return False
    return True


def _canonical_university(name: str) -> str:
    """Normalize a university name to merge obvious variants (accents, spacing,
    trailing city/country qualifiers, common typos) into one canonical display label."""
    if not name:
        return ""
    raw = re.sub(r"\s+", " ", name.strip())
    key = _strip_accents(raw.lower())
    # Fix known split-letter typo: "ingenier ia" -> "ingenieria"
    key = key.replace("ingenier ia", "ingenieria")
    # Drop trailing ", city/country" qualifiers and parentheticals for keying
    key = re.split(r",", key)[0].strip()
    key = re.sub(r"\(.*?\)", "", key).strip()

    # Canonical display names for the most common institutions
    aliases = {
        "universidad nacional de ingenieria": "Universidad Nacional de Ingeniería (UNI)",
        "pontificia universidad catolica del peru": "Pontificia Universidad Católica del Perú (PUCP)",
        "universidade de sao paulo": "Universidade de São Paulo (USP)",
        "instituto de quimica de la universidad de sao paulo": "Universidade de São Paulo (USP)",
        "universidad nacional mayor de san marcos": "Universidad Nacional Mayor de San Marcos (UNMSM)",
        "universidad nacional de san agustin": "Universidad Nacional de San Agustín (UNSA)",
        "universidade estadual de campinas": "Universidade Estadual de Campinas (UNICAMP)",
        "universidad nacional agraria la molina": "Universidad Nacional Agraria La Molina (UNALM)",
        "universidad catolica san pablo": "Universidad Católica San Pablo (UCSP)",
        "georgia tech": "Georgia Institute of Technology",
        "universidad peruana de ciencias aplicadas": "Universidad Peruana de Ciencias Aplicadas (UPC)",
        "universidad nacional de san antonio abad del cusco": "Universidad Nacional de San Antonio Abad del Cusco (UNSAAC)",
        "universidad de san martin de porres": "Universidad de San Martín de Porres (USMP)",
        "pontificia universidade catolica do rio de janeiro": "Pontifícia Universidade Católica do Rio de Janeiro (PUC-Rio)",
        "universidad esan": "Universidad ESAN",
        "universidad simon bolivar": "Universidad Simón Bolívar",
        "universidad nacional de colombia": "Universidad Nacional de Colombia",
        "kyoto university": "Kyoto University",
        "universidad nacional autonoma de mexico": "Universidad Nacional Autónoma de México (UNAM)",
        "universidad ricardo palma": "Universidad Ricardo Palma",
        "universidad peruana cayetano heredia": "Universidad Peruana Cayetano Heredia (UPCH)",
        "leland stanford junior university": "Stanford University",
        "universita di bologna": "Università di Bologna",
    }
    if key in aliases:
        return aliases[key]
    # Default: title-case the de-accented base, keep it readable
    return raw


def load_faculty_data(raw_path: str = None) -> list[dict]:
    """Loads and normalizes the enriched detail_professors_description.json dataset."""
    raw_path = raw_path or os.path.join("data", "detail_professors_description.json")

    if not os.path.exists(raw_path):
        # Fallback to legacy file
        fallback = os.path.join("data", "faculty_raw.json")
        if os.path.exists(fallback):
            log.warning("Primary file '%s' not found. Falling back to '%s'", raw_path, fallback)
            raw_path = fallback
        else:
            raise FileNotFoundError(f"Neither '{raw_path}' nor fallback exists.")

    with open(raw_path, "r", encoding="utf-8") as fh:
        raw_entries = json.load(fh)

    # Build name-to-profile_url index for collaborator matching
    name_to_id = {}  # normalized_name -> node_id
    name_tokens_index = []  # list of (frozenset_tokens, node_id, original_name)

    # First pass: build index
    faculty_records = []
    for entry in raw_entries:
        node_id = resolve_node_id(entry["profile_url"])
        name = entry["name"]
        norm = _normalize_name(name)
        name_to_id[norm] = node_id
        name_tokens_index.append((_normalize_name_tokens(name), node_id, name))

    # Second pass: build full records
    total_collabs = 0
    unmatched_collabs = 0

    for entry in raw_entries:
        node_id = resolve_node_id(entry["profile_url"])
        dept_code, dept_label = resolve_department(entry.get("dept", ""))

        # Clean areas: remove RENACYT level strings
        raw_areas = entry.get("areas", [])
        clean_areas = [a for a in raw_areas if not _is_renacyt_level(a)]

        # Structured fingerprints
        structured_fps = entry.get("fingerprints", [])
        if isinstance(structured_fps, dict):
            # Legacy format: already flat
            flat_fps = structured_fps
            structured_fps = []
        else:
            flat_fps = _flatten_fingerprints(structured_fps)

        # Parse collaborators with name matching
        raw_collabs = entry.get("collaborators", [])
        collaborator_urls = []
        collaborator_details = []
        for collab in raw_collabs:
            total_collabs += 1
            collab_name = collab.get("colaborador", collab.get("name", ""))
            collab_norm = _normalize_name(collab_name)
            collab_tokens = _normalize_name_tokens(collab_name)

            # Try exact normalized match first
            matched_id = name_to_id.get(collab_norm)

            # Fuzzy: try token subset matching (≥2 shared tokens and ≥60% overlap)
            if not matched_id and len(collab_tokens) >= 2:
                best_overlap = 0
                best_id = None
                for tokens, nid, orig in name_tokens_index:
                    if nid == node_id:
                        continue
                    shared = collab_tokens & tokens
                    if len(shared) >= 2:
                        overlap = len(shared) / max(len(collab_tokens), len(tokens))
                        if overlap > best_overlap and overlap >= 0.6:
                            best_overlap = overlap
                            best_id = nid
                if best_id:
                    matched_id = best_id

            if matched_id and matched_id != node_id:
                collaborator_urls.append(matched_id)
            else:
                unmatched_collabs += 1

            # Parse publication count
            pub_text = collab.get("num_publicaciones", collab.get("num_publications", ""))
            pub_count = _parse_pub_count_text(pub_text)

            collaborator_details.append({
                "name": collab_name,
                "research_centers": collab.get("research_center", []),
                "role": collab.get("puesto", ""),
                "shared_publications": pub_count,
                "matched_id": matched_id if matched_id and matched_id != node_id else None,
            })

        # Parse education
        education = entry.get("education", [])
        parsed_education = []
        for edu in education:
            titulo = edu.get("titulo", "")
            parsed_education.append({
                "title": titulo,
                "period": edu.get("periodo"),
                "university": edu.get("universidad") or "",
                "university_canonical": _canonical_university(edu.get("universidad") or ""),
                "degree_level": _parse_degree_level(titulo),
                "is_international": _is_international_university(edu.get("universidad") or ""),
            })

        # H-index: field name is "h-index" in new format, "h_index" in old
        h_index = entry.get("h-index") or entry.get("h_index") or 0

        # Extract a RENACYT level from areas (if present in raw) for display
        renacyt = None
        for a in raw_areas:
            if _is_renacyt_level(a):
                renacyt = a.strip()
                break

        faculty_records.append({
            "id": node_id,
            "name": entry["name"],
            "dept": entry.get("dept", "Unknown"),
            "dept_code": dept_code,
            "dept_label": dept_label,
            "areas": clean_areas,
            "h_index": h_index,
            "pubs": entry.get("pub_count") or 0,
            "citations": entry.get("citations") or 0,
            "email": entry.get("email"),
            "photo_url": entry.get("photo_url"),
            "orcid": entry.get("orcid"),
            "scholar_url": entry.get("scholar_url"),
            "scopus_url": entry.get("scopus_url"),
            "linkedin_url": entry.get("linkedin_url"),
            "profile_url": entry["profile_url"],
            "groups": entry.get("groups", []),
            "role": entry.get("role"),
            "bio": entry.get("bio"),
            "renacyt_level": renacyt,
            "concytec_url": entry.get("concytec_url"),
            "education": parsed_education,
            "internal_orgs": entry.get("internal_orgs", []),
            "external_orgs": entry.get("external_orgs", []),
            "fingerprints": flat_fps,
            "fingerprints_structured": structured_fps,
            "collaborator_details": collaborator_details,
            "_collaborator_ids": collaborator_urls,
        })

    # Log matching quality
    if total_collabs > 0:
        rate = unmatched_collabs / total_collabs * 100
        log.info("Collaborator matching: %d/%d unmatched (%.1f%%)",
                 unmatched_collabs, total_collabs, rate)
    else:
        log.info("No collaborator entries found in data.")

    return faculty_records
