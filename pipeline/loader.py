import os
import json
import logging

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

def load_faculty_data(raw_path: str) -> list[dict]:
    """Loads and normalizes raw scraped JSON datasets, explicitly preserving newly added metrics."""
    if not os.path.exists(raw_path):
        fallback_path = os.path.join("data", "faculty_raw_1.json")
        if os.path.exists(fallback_path):
            log.warning("Primary file '%s' not found. Falling back to test file '%s'", raw_path, fallback_path)
            raw_path = fallback_path
        else:
            raise FileNotFoundError(f"Neither '{raw_path}' nor '{fallback_path}' exists.")

    with open(raw_path, "r", encoding="utf-8") as file_handle:
        raw_entries = json.load(file_handle)

    faculty_records = []
    for entry in raw_entries:
        node_id = resolve_node_id(entry["profile_url"])
        dept_code, dept_label = resolve_department(entry.get("dept", ""))

        faculty_records.append({
            "id": node_id,
            "name": entry["name"],
            "dept": entry.get("dept", "Unknown"),
            "dept_code": dept_code,
            "dept_label": dept_label,
            "areas": entry.get("areas", []),
            "h_index": entry.get("h_index") or 0,
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
            "renacyt_level": entry.get("renacyt_level"),
            "fingerprints": entry.get("fingerprints", {}),
            "_collaborator_urls": [c["profile_url"] for c in entry.get("collaborators", [])]
        })
    return faculty_records
