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
        self.assertTrue({"main", "practice", "number-grid", "print", "approach", "privacy"}.issubset(self.parser.ids))

    def test_reviewed_pdf_is_linked(self) -> None:
        self.assertIn("pdfs/grade4_fluency-starter-pack.pdf", self.parser.links)
        self.assertTrue((PROJECT_ROOT / "output/pdf/grade4_fluency-starter-pack.pdf").is_file())

    def test_scripts_are_local(self) -> None:
        self.assertEqual(self.parser.scripts, ["app.js"])
        self.assertTrue((SITE_ROOT / "voice-intent.js").is_file())

    def test_no_tracking_or_remote_assets(self) -> None:
        lowered = self.html.lower()
        for marker in ("google-analytics", "googletagmanager", "facebook.net", "hotjar"):
            self.assertNotIn(marker, lowered)

    def test_public_voice_privacy_brief_is_local_and_fail_closed(self) -> None:
        brief_path = SITE_ROOT / "voice-privacy.html"
        self.assertTrue(brief_path.is_file())
        brief = brief_path.read_text(encoding="utf-8")
        self.assertIn("does not silently fall back", brief)
        self.assertIn("Vietnamese", brief)
        self.assertIn('href="styles.css"', brief)
        self.assertNotIn("<script", brief.lower())

    def test_vendored_local_speech_interface_has_provenance(self) -> None:
        vendor = SITE_ROOT / "vendor" / "local-speech-interface"
        for name in (
            "index.js", "capabilities.js", "domain-grammar.js", "integer-domain.js",
            "local-session.js", "local-policy.js", "speech-event.js", "dom-bridge.js",
        ):
            source = vendor / name
            self.assertTrue(source.is_file())
            self.assertIn("SPDX-License-Identifier: MPL-2.0", source.read_text(encoding="utf-8"))
        provenance = (vendor / "PROVENANCE.md").read_text(encoding="utf-8")
        self.assertIn("0.5.0", provenance)
        self.assertIn("e94d395", provenance)


if __name__ == "__main__":
    unittest.main()
