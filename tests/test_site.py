from __future__ import annotations

from html.parser import HTMLParser
from pathlib import Path
import unittest


PROJECT_ROOT = Path(__file__).resolve().parents[1]
SITE_ROOT = PROJECT_ROOT / "site"


class _SiteParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.ids: set[str] = set()
        self.links: list[str] = []
        self.scripts: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        values = dict(attrs)
        if values.get("id"):
            self.ids.add(values["id"] or "")
        if tag == "a" and values.get("href"):
            self.links.append(values["href"] or "")
        if tag == "script" and values.get("src"):
            self.scripts.append(values["src"] or "")


class SiteTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.html = (SITE_ROOT / "index.html").read_text(encoding="utf-8")
        cls.parser = _SiteParser()
        cls.parser.feed(cls.html)

    def test_required_sections_are_present(self) -> None:
        self.assertTrue({"main", "practice", "print", "approach"}.issubset(self.parser.ids))

    def test_reviewed_pdf_is_linked(self) -> None:
        self.assertIn("pdfs/grade4_fluency-starter-pack.pdf", self.parser.links)
        self.assertTrue((PROJECT_ROOT / "output/pdf/grade4_fluency-starter-pack.pdf").is_file())

    def test_scripts_are_local(self) -> None:
        self.assertEqual(self.parser.scripts, ["app.js"])

    def test_no_tracking_or_remote_assets(self) -> None:
        lowered = self.html.lower()
        for marker in ("google-analytics", "googletagmanager", "facebook.net", "hotjar"):
            self.assertNotIn(marker, lowered)


if __name__ == "__main__":
    unittest.main()
