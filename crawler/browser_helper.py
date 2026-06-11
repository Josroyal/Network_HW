import os
import shutil
import asyncio
import random
import logging

log = logging.getLogger(__name__)


def find_chrome_binary() -> str:
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


async def goto_page(tab, url: str, delay_min: float = 2.0, delay_max: float = 4.5, content_timeout: int = 30, selector: str = None) -> bool:
    """Helper to navigate to a URL and handle Cloudflare checkbox if it appears."""
    await asyncio.sleep(random.uniform(delay_min, delay_max))
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
