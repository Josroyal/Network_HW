import asyncio
import json
import logging
import os
import random
import re
import shutil
from bs4 import BeautifulSoup
import nodriver

# Configure logging
logging.basicConfig(level=logging.INFO, format="%(levelname)s  %(message)s")
log = logging.getLogger(__name__)


class FacultyCrawler:
    """Crawler to scrape faculty information from UTEC's CRIS portal."""

    def __init__(self, output_path: str = None, max_profiles: int = None):
        self.base_url = "https://cris.utec.edu.pe"
        self.directory_url = "https://cris.utec.edu.pe/es/persons/"
        self.output_path = output_path or os.path.join("data", "faculty_raw.json")
        self.max_profiles = max_profiles
        self.delay_minimum = 2.0
        self.delay_maximum = 4.5

        # Selectors
        self.list_selector = "a.link.person"
        self.profile_selector = "h1"

        # Keywords to identify research groups vs departments
        self.group_keywords = (
            "grupo", "centre", "centro", "laboratorio", "lab",
            "research group", "ginia", "dads", "ric", "msp",
            "resucon", "bio-"
        )

    def find_chrome_binary(self) -> str:
        """Locates the path to Chrome or Edge binary on the current OS."""
        candidates = [
            "/opt/google/chrome/chrome", "/opt/google/chrome-beta/chrome",
            "/snap/bin/google-chrome", "/snap/bin/chromium",
            "google-chrome-stable", "google-chrome",
            "chromium-browser", "chromium", "microsoft-edge", "brave-browser",
            r"C:\Program Files\Google\Chrome\Application\chrome.exe",
            r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
            r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
        ]
        for candidate in candidates:
            resolved_path = candidate if os.path.isabs(candidate) else shutil.which(candidate)
            if resolved_path and os.path.isfile(resolved_path):
                log.info("Browser binary located: %s", resolved_path)
                return resolved_path
        raise FileNotFoundError("No Chrome/Chromium installation found. Set CHROME_PATH environment variable.")

    async def goto_page(self, tab, url: str, content_timeout: int = 30, selector: str = None) -> bool:
        """Helper to navigate to a URL and handle Cloudflare checkbox if it appears."""
        await asyncio.sleep(random.uniform(self.delay_minimum, self.delay_maximum))
        try:
            await tab.get(url)
            await tab.sleep(6)
            try:
                await tab.verify_cf()
                await tab.sleep(3)
            except Exception:
                pass
            if selector:
                await tab.wait_for(selector=selector, timeout=content_timeout)
            return True
        except Exception as navigation_exception:
            log.warning("Navigation failed for URL (%s): %s", url, navigation_exception)
            return False

    def is_research_group(self, organisation_name: str) -> bool:
        """Determines if the given organisation name represents a research group."""
        name_lowercase = organisation_name.lower()
        return any(keyword in name_lowercase for keyword in self.group_keywords)

    def clean_photo_url(self, image_source: str) -> str | None:
        """Cleans and generates an absolute URL for a photo if valid."""
        if not image_source or image_source.startswith("data:") or len(image_source) < 10:
            return None
        return image_source if image_source.startswith("http") else self.base_url + image_source

    def extract_email_address(self, page_text: str) -> str | None:
        """Helper to scan text for the UTEC email address pattern."""
        match_email = re.search(r"[a-z0-9._%+\-]+@utec\.edu\.pe", page_text, re.IGNORECASE)
        return match_email.group(0).lower() if match_email else None

    def parse_directory(self, html_content: str) -> list[dict]:
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
                profile_url = href if href.startswith("http") else self.base_url + href

                # Email extraction
                email_link = item.select_one("a[href^='mailto:'], .email a, span.email a")
                if email_link:
                    email = (email_link.get_text(strip=True)
                             or email_link["href"].replace("mailto:", "").strip())
                else:
                    email = self.extract_email_address(item.get_text())

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
                    if self.is_research_group(org_name):
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
                        photo = self.clean_photo_url(image_src)
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

    def parse_profile(self, html_content: str, base_info: dict) -> dict:
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
            info["email"] = self.extract_email_address(full_page_text)

        # Photo fallback
        if not info.get("photo_url"):
            for selector in ["figure.portrait img", ".rendering-portrait img",
                             ".portrait img", "img.photo", ".profile-image img",
                             "div.picture img", ".person-image img"]:
                img = soup.select_one(selector)
                if img:
                    image_src = img.get("src") or img.get("data-src") or ""
                    photo = self.clean_photo_url(image_src)
                    if photo:
                        info["photo_url"] = photo
                        break
            # Last resort
            if not info["photo_url"]:
                for img in soup.select("img"):
                    src = img.get("src", "")
                    if any(key in src for key in ("/photo", "/image", "/portrait", "/portalPhoto", "/Person")):
                        photo = self.clean_photo_url(src)
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

        # New: Renacyt level extraction from the profile page text
        match_renacyt = re.search(r"Nivel\s+[IVX]+", full_page_text)
        if match_renacyt:
            info["renacyt_level"] = match_renacyt.group(0)

        return info

    async def scrape_collaborators(self, tab, profile_url: str) -> list[dict]:
        """Scrapes collaborators list by visiting {profile_url}network-persons/."""
        network_url = profile_url.rstrip("/") + "/network-persons/"
        try:
            await asyncio.sleep(random.uniform(1.5, 3.0))
            await tab.get(network_url)
            await tab.sleep(5)
            try:
                await tab.verify_cf()
                await tab.sleep(2)
            except Exception:
                pass

            try:
                await tab.wait_for(selector="a.link.person, .no-result, h1", timeout=20)
            except Exception:
                pass

            html_content = await tab.get_content()
            soup = BeautifulSoup(html_content, "lxml")

            collaborators = []
            seen_urls = set()
            for anchor in soup.select("a.link.person, h3.title a, h2.title a"):
                name = anchor.get_text(strip=True)
                href = anchor.get("href", "")
                collaborator_url = href if href.startswith("http") else self.base_url + href
                if ("/es/persons/" in collaborator_url and collaborator_url not in seen_urls
                        and collaborator_url.rstrip("/") != profile_url.rstrip("/")):
                    seen_urls.add(collaborator_url)
                    collaborators.append({"name": name, "profile_url": collaborator_url})

            log.info("    Collaborators parsed: %d", len(collaborators))
            return collaborators

        except Exception as collaborator_exception:
            log.debug("network-persons sub-page failed for %s: %s", profile_url, collaborator_exception)
            return []

    async def scrape_fingerprints(self, tab, profile_url: str) -> dict[str, float]:
        """Scrapes research fingerprints by visiting {profile_url}fingerprints/."""
        fingerprints_url = profile_url.rstrip("/") + "/fingerprints/"
        try:
            await asyncio.sleep(random.uniform(1.5, 3.0))
            await tab.get(fingerprints_url)
            await tab.sleep(5)
            try:
                await tab.verify_cf()
                await tab.sleep(2)
            except Exception:
                pass

            try:
                await tab.wait_for(selector=".concept-badge-small, .no-result, #page-footer", timeout=20)
            except Exception:
                pass

            html_content = await tab.get_content()
            soup = BeautifulSoup(html_content, "lxml")

            fingerprints_dict = {}
            # Pure Portal encapsulates each concept with weight in elements like .concept-wrapper
            for concept_wrapper in soup.select(".concept-wrapper"):
                concept_element = concept_wrapper.select_one(".concept")
                value_element = concept_wrapper.select_one(".value")
                if concept_element and value_element:
                    concept_name = concept_element.get_text(strip=True)
                    value_text = value_element.get_text(strip=True)
                    match_percentage = re.search(r"(\d+)%", value_text)
                    if match_percentage:
                        # Normalize percentage e.g., "81%" -> 0.81
                        weight = float(match_percentage.group(1)) / 100.0
                        fingerprints_dict[concept_name] = weight

            log.info("    Fingerprints parsed: %d keys", len(fingerprints_dict))
            return fingerprints_dict

        except Exception as fingerprints_exception:
            log.warning("    Fingerprints sub-page failed for %s: %s", profile_url, fingerprints_exception)
            return {}

    def get_next_page_url(self, html_content: str) -> str | None:
        """Parses page HTML to locate the 'Siguiente' page URL."""
        soup = BeautifulSoup(html_content, "lxml")
        for anchor in soup.select("a"):
            anchor_text = anchor.get_text(strip=True).lower()
            if any(token in anchor_text for token in ("siguiente", "next", "›", "»")):
                href = anchor.get("href", "").strip()
                if href and href != "#":
                    return href if href.startswith("http") else self.base_url + href
        return None

    def save_output(self, data: list[dict]):
        """Saves scraped data into JSON file format."""
        output_directory = os.path.dirname(self.output_path)
        if output_directory:
            os.makedirs(output_directory, exist_ok=True)
        with open(self.output_path, "w", encoding="utf-8") as file_handle:
            json.dump(data, file_handle, ensure_ascii=False, indent=2)
        log.info("✓ Successfully wrote %d professors to %s", len(data), self.output_path)

    async def run(self) -> list[dict]:
        """Main execution flow for FacultyCrawler."""
        chrome_path = os.environ.get("CHROME_PATH") or self.find_chrome_binary()
        browser = await nodriver.start(
            headless=False,
            lang="es-PE",
            browser_executable_path=chrome_path,
            browser_args=["--start-maximized"],
        )
        tab = browser.main_tab

        log.info("Browser opened. Cloudflare auto-resolves in ~6 s.")
        log.info("Solve any checkbox CAPTCHA manually if it appears.")

        # 1. Fetch directory listings
        success = await self.goto_page(tab, self.directory_url, content_timeout=120, selector=self.list_selector)
        if not success:
            log.error("Persons directory list never loaded.")
            browser.stop()
            return []

        professors_list = []
        page_number = 1
        while True:
            directory_html = await tab.get_content()
            batch_professors = self.parse_directory(directory_html)
            professors_list.extend(batch_professors)
            log.info("  Page %d: +%d persons (total %d)", page_number, len(batch_professors), len(professors_list))

            # Stop directory collection early if we hit the test limit
            if self.max_profiles and len(professors_list) >= self.max_profiles:
                professors_list = professors_list[:self.max_profiles]
                break

            next_url = self.get_next_page_url(directory_html)
            if not next_url:
                log.info("  Last directory page reached.")
                break

            success = await self.goto_page(tab, next_url, selector=self.list_selector)
            if not success:
                break
            page_number += 1

        log.info("Directory listings parsing finished. Total collected: %d professors.", len(professors_list))

        # 2. Enrich profile data with details, collaborators, and fingerprints
        enriched_results = []
        for index, professor_info in enumerate(professors_list):
            log.info("[%d/%d] Scraping details for: %s", index + 1, len(professors_list), professor_info["name"])

            success = await self.goto_page(tab, professor_info["profile_url"],
                                           content_timeout=20, selector=self.profile_selector)
            if success:
                profile_html = await tab.get_content()
                full_info = self.parse_profile(profile_html, professor_info)
                full_info["collaborators"] = await self.scrape_collaborators(tab, professor_info["profile_url"])
                full_info["fingerprints"] = await self.scrape_fingerprints(tab, professor_info["profile_url"])
            else:
                # Fallback configuration on navigation error
                full_info = {
                    **professor_info,
                    "areas": [], "orcid": None, "scholar_url": None,
                    "scopus_url": None, "linkedin_url": None,
                    "h_index": None, "citations": None,
                    "pub_count": None, "bio": None, "renacyt_level": None,
                    "collaborators": [], "fingerprints": {}
                }
            enriched_results.append(full_info)

        browser.stop()
        self.save_output(enriched_results)
        return enriched_results


def main():
    # In test runs or directly launch, you can override max_profiles if wanted
    crawler = FacultyCrawler(max_profiles=None)
    nodriver.loop().run_until_complete(crawler.run())


if __name__ == "__main__":
    main()
