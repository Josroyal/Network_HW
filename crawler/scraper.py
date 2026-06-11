import asyncio
import json
import logging
import os
import random

import nodriver

# Modular imports
from crawler.browser_helper import find_chrome_binary, goto_page
from crawler.parser import (
    parse_directory,
    parse_profile,
    parse_collaborators,
    parse_fingerprints,
    get_next_page_url
)

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

    async def scrape_collaborators(self, tab, profile_url: str) -> list[dict]:
        """Scrapes collaborators list by visiting {profile_url}network-persons/."""
        network_url = profile_url.rstrip("/") + "/network-persons/"
        try:
            success = await goto_page(
                tab, network_url,
                self.delay_minimum, self.delay_maximum,
                content_timeout=20, selector="a.link.person, .no-result, h1"
            )
            if not success:
                return []

            html_content = await tab.get_content()
            collaborators = parse_collaborators(html_content, profile_url, self.base_url)
            log.info("    Collaborators parsed: %d", len(collaborators))
            return collaborators

        except Exception as collaborator_exception:
            log.debug("network-persons sub-page failed for %s: %s", profile_url, collaborator_exception)
            return []

    async def scrape_fingerprints(self, tab, profile_url: str) -> dict[str, float]:
        """Scrapes research fingerprints by visiting {profile_url}fingerprints/."""
        fingerprints_url = profile_url.rstrip("/") + "/fingerprints/"
        try:
            success = await goto_page(
                tab, fingerprints_url,
                self.delay_minimum, self.delay_maximum,
                content_timeout=20, selector=".concept-badge-small, .no-result, #page-footer"
            )
            if not success:
                return {}

            html_content = await tab.get_content()
            fingerprints_dict = parse_fingerprints(html_content)
            log.info("    Fingerprints parsed: %d keys", len(fingerprints_dict))
            return fingerprints_dict

        except Exception as fingerprints_exception:
            log.warning("    Fingerprints sub-page failed for %s: %s", profile_url, fingerprints_exception)
            return {}

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
        chrome_path = os.environ.get("CHROME_PATH") or find_chrome_binary()
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
        success = await goto_page(
            tab, self.directory_url,
            self.delay_minimum, self.delay_maximum,
            content_timeout=120, selector=self.list_selector
        )
        if not success:
            log.error("Persons directory list never loaded.")
            browser.stop()
            return []

        professors_list = []
        page_number = 1
        while True:
            directory_html = await tab.get_content()
            batch_professors = parse_directory(directory_html, self.base_url)
            professors_list.extend(batch_professors)
            log.info("  Page %d: +%d persons (total %d)", page_number, len(batch_professors), len(professors_list))

            # Stop directory collection early if we hit the test limit
            if self.max_profiles and len(professors_list) >= self.max_profiles:
                professors_list = professors_list[:self.max_profiles]
                break

            next_url = get_next_page_url(directory_html, self.base_url)
            if not next_url:
                log.info("  Last directory page reached.")
                break

            success = await goto_page(tab, next_url, self.delay_minimum, self.delay_maximum, selector=self.list_selector)
            if not success:
                break
            page_number += 1

        log.info("Directory listings parsing finished. Total collected: %d professors.", len(professors_list))

        # 2. Enrich profile data with details, collaborators, and fingerprints
        enriched_results = []
        for index, professor_info in enumerate(professors_list):
            log.info("[%d/%d] Scraping details for: %s", index + 1, len(professors_list), professor_info["name"])

            success = await goto_page(
                tab, professor_info["profile_url"],
                self.delay_minimum, self.delay_maximum,
                content_timeout=20, selector=self.profile_selector
            )
            if success:
                profile_html = await tab.get_content()
                full_info = parse_profile(profile_html, professor_info, self.base_url)
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
    crawler = FacultyCrawler(max_profiles=None)
    nodriver.loop().run_until_complete(crawler.run())


if __name__ == "__main__":
    main()
