import re
import logging
from bs4 import BeautifulSoup

log = logging.getLogger(__name__)

# Keywords to identify research groups vs departments
GROUP_KEYWORDS = (
    "grupo", "centre", "centro", "laboratorio", "lab",
    "research group", "ginia", "dads", "ric", "msp",
    "resucon", "bio-"
)

def is_research_group(organisation_name: str) -> bool:
    """Determines if the given organisation name represents a research group."""
    name_lowercase = organisation_name.lower()
    return any(keyword in name_lowercase for keyword in GROUP_KEYWORDS)

def clean_photo_url(image_source: str, base_url: str) -> str | None:
    """Cleans and generates an absolute URL for a photo if valid."""
    if not image_source or image_source.startswith("data:") or len(image_source) < 10:
        return None
    return image_source if image_source.startswith("http") else base_url + image_source

def extract_email_address(page_text: str) -> str | None:
    """Helper to scan text for the UTEC email address pattern."""
    match_email = re.search(r"[a-z0-9._%+\-]+@utec\.edu\.pe", page_text, re.IGNORECASE)
    return match_email.group(0).lower() if match_email else None

def parse_directory(html_content: str, base_url: str) -> list[dict]:
    """Parses the directory listing page for basic faculty card profiles."""
    soup = BeautifulSoup(html_content, "lxml")
    results = []

    items = soup.select("article.list-result-item, li.list-result-item")
    if not items:
        items = soup.select("div.rendering_person_short, div.rendering.person")
    if not items:
        seen_profile_urls = set()
        pseudo_items = []
        for link in soup.select("a[href*='/es/persons/']"):
            href = link.get("href", "")
            if href in seen_profile_urls:
                continue
            seen_profile_urls.add(href)
            node = link
            for _ in range(5):
                if node.name in ("article", "li", "div", "section"):
                    break
                node = node.parent
            pseudo_items.append(node)
        items = pseudo_items

    log.info("  Parsed %d person blocks on directory page", len(items))

    for item in items:
        try:
            # Name and profile URL
            link = (item.select_one("a.link.person")
                    or item.select_one("h3.title a, h2.title a")
                    or item.select_one("a[href*='/es/persons/']"))
            if not link:
                continue
            name = link.get_text(strip=True)
            href = link.get("href", "")
            profile_url = href if href.startswith("http") else base_url + href

            # Email extraction
            email_link = item.select_one("a[href^='mailto:'], .email a, span.email a")
            if email_link:
                email = (email_link.get_text(strip=True)
                         or email_link["href"].replace("mailto:", "").strip())
            else:
                email = extract_email_address(item.get_text())

            # Department vs Research Groups separation
            org_links = item.select(
                "a[href*='/es/organisations/'], "
                "a[href*='/es/organisational-units/'], "
                "a[href*='/es/research-groups/']"
            )
            department = "Unknown"
            groups = []
            department_set = False
            for org_link in org_links:
                org_name = org_link.get_text(strip=True)
                if not org_name:
                    continue
                if is_research_group(org_name):
                    groups.append(org_name)
                elif not department_set:
                    department = org_name
                    department_set = True
                elif org_name != department:
                    groups.append(org_name)

            # Role parsing
            role = None
            role_element = item.select_one("span.type, span.role, .person-role")
            if role_element:
                role = role_element.get_text(strip=True).strip("- ").strip()
            if not role:
                relations_block = item.select_one(".relations, .person-info")
                if relations_block:
                    full_relation_text = relations_block.get_text(" ", strip=True)
                    match_role = re.search(r"[-–]\s*([A-ZÁÉÍÓÚa-záéíóú][^-–\n]{5,60})", full_relation_text)
                    if match_role:
                        role = match_role.group(1).strip()

            # Profile image (from list page)
            photo = None
            for selector in [".portrait img", "figure img", "img.avatar", "img"]:
                img = item.select_one(selector)
                if img:
                    image_src = img.get("src") or img.get("data-src") or img.get("data-lazy-src", "")
                    photo = clean_photo_url(image_src, base_url)
                    if photo:
                        break

            results.append(dict(
                name=name, email=email, dept=department,
                groups=groups, role=role,
                photo_url=photo, profile_url=profile_url,
            ))
            log.info("    + %s  [%s]", name, department)

        except Exception as parse_item_exception:
            log.debug("Error parsing item in list: %s", parse_item_exception)

    return results

def parse_profile(html_content: str, base_info: dict, base_url: str) -> dict:
    """Parses the detailed profile page of a faculty member."""
    soup = BeautifulSoup(html_content, "lxml")
    full_page_text = soup.get_text(" ", strip=True)

    info = {
        **base_info,
        "areas": [],
        "orcid": None,
        "scholar_url": None,
        "scopus_url": None,
        "linkedin_url": None,
        "h_index": None,
        "citations": None,
        "pub_count": None,
        "bio": None,
        "renacyt_level": None,
    }

    # Email fallback
    if not info.get("email"):
        info["email"] = extract_email_address(full_page_text)

    # Photo fallback
    if not info.get("photo_url"):
        for selector in ["figure.portrait img", ".rendering-portrait img",
                         ".portrait img", "img.photo", ".profile-image img",
                         "div.picture img", ".person-image img"]:
            img = soup.select_one(selector)
            if img:
                image_src = img.get("src") or img.get("data-src") or ""
                photo = clean_photo_url(image_src, base_url)
                if photo:
                    info["photo_url"] = photo
                    break
        # Last resort
        if not info["photo_url"]:
            for img in soup.select("img"):
                src = img.get("src", "")
                if any(key in src for key in ("/photo", "/image", "/portrait", "/portalPhoto", "/Person")):
                    photo = clean_photo_url(src, base_url)
                    if photo:
                        info["photo_url"] = photo
                        break

    # External Links
    for anchor in soup.select("a[href]"):
        href = anchor["href"]
        if "scholar.google" in href and not info["scholar_url"]:
            info["scholar_url"] = href
        if "scopus.com" in href and "authid" in href and not info["scopus_url"]:
            info["scopus_url"] = href
        if re.search(r"linkedin\.com/(in|pub)/", href) and not info["linkedin_url"]:
            info["linkedin_url"] = href
        if "orcid.org" in href and not info["orcid"]:
            match_orcid = re.search(r"\d{4}-\d{4}-\d{4}-\d{3}[\dX]", href)
            if match_orcid:
                info["orcid"] = match_orcid.group(0)

    # Metrics (Citations and h-index)
    match_citations = re.search(r"(\d+)\s*Citas?(?:\s|$)", full_page_text, re.IGNORECASE)
    if match_citations:
        info["citations"] = int(match_citations.group(1))

    match_h_index = re.search(r"(\d+)\s*[ÍI]ndice\s*h(?:\s|$)", full_page_text, re.IGNORECASE)
    if match_h_index:
        info["h_index"] = int(match_h_index.group(1))

    # Publication count
    match_publications = re.search(r"[Pp]ublicaciones?\s*\((\d+)\)", full_page_text)
    if match_publications:
        info["pub_count"] = int(match_publications.group(1))

    # Research Area Keywords
    areas = []
    for selector in ["div.fingerprints a", "span.concept-tag", "a.concept",
                     "ul.keywords li", "div.keywords a", ".research-areas li"]:
        for element in soup.select(selector):
            keyword = element.get_text(strip=True)
            if keyword and 3 < len(keyword) < 80:
                areas.append(keyword)
    info["areas"] = list(dict.fromkeys(areas))[:25]

    # Bio Paragraph
    for selector in [".profile-text p", ".person-profile p",
                     "div.rendering_person_long p",
                     "div.textblock p", ".bio p", "p.bio"]:
        element = soup.select_one(selector)
        if element:
            bio_text = element.get_text(strip=True)
            if len(bio_text) >= 60 and "@" not in bio_text:
                info["bio"] = bio_text[:400]
                break

    # Renacyt level extraction
    match_renacyt = re.search(r"Nivel\s+[IVX]+", full_page_text)
    if match_renacyt:
        info["renacyt_level"] = match_renacyt.group(0)

    return info

def parse_collaborators(html_content: str, profile_url: str, base_url: str) -> list[dict]:
    """Parses collaborators list from html markup."""
    soup = BeautifulSoup(html_content, "lxml")

    collaborators = []
    seen_urls = set()
    for anchor in soup.select("a.link.person, h3.title a, h2.title a"):
        name = anchor.get_text(strip=True)
        href = anchor.get("href", "")
        collaborator_url = href if href.startswith("http") else base_url + href
        if ("/es/persons/" in collaborator_url and collaborator_url not in seen_urls
                and collaborator_url.rstrip("/") != profile_url.rstrip("/")):
            seen_urls.add(collaborator_url)
            collaborators.append({"name": name, "profile_url": collaborator_url})

    return collaborators

def parse_fingerprints(html_content: str) -> dict[str, float]:
    """Parses research fingerprints from html markup."""
    soup = BeautifulSoup(html_content, "lxml")

    fingerprints_dict = {}
    for concept_wrapper in soup.select(".concept-wrapper"):
        concept_element = concept_wrapper.select_one(".concept")
        value_element = concept_wrapper.select_one(".value")
        if concept_element and value_element:
            concept_name = concept_element.get_text(strip=True)
            value_text = value_element.get_text(strip=True)
            match_percentage = re.search(r"(\d+)%", value_text)
            if match_percentage:
                weight = float(match_percentage.group(1)) / 100.0
                fingerprints_dict[concept_name] = weight

    return fingerprints_dict

def get_next_page_url(html_content: str, base_url: str) -> str | None:
    """Parses page HTML to locate the 'Siguiente' page URL."""
    soup = BeautifulSoup(html_content, "lxml")
    for anchor in soup.select("a"):
        anchor_text = anchor.get_text(strip=True).lower()
        if any(token in anchor_text for token in ("siguiente", "next", "›", "»")):
            href = anchor.get("href", "").strip()
            if href and href != "#":
                return href if href.startswith("http") else base_url + href
    return None
