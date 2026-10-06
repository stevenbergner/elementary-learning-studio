#!/usr/bin/env python3
"""Mark an assembled branch preview so it cannot be mistaken for the studio.

Adds a visible banner and a noindex robots tag to every HTML page of a
preview built under /b/<branch>/.
"""

from __future__ import annotations

import argparse
import html
from pathlib import Path


def mark(site: Path, branch: str, commit: str) -> int:
    label = html.escape(f"{branch} @ {commit[:7]}")
    banner = (
        '<div role="note" style="position:relative;z-index:10;padding:0.55rem 1rem;'
        "background:#18343b;color:#f8f3e8;font:600 0.9rem/1.4 system-ui,sans-serif;"
        'text-align:center">'
        f"Preview of branch <code>{label}</code>. Experimental, separate from the studio, "
        'and saved separately on this device. <a href="../../" style="color:#f0c35a">'
        "Open the studio</a></div>"
    )
    marked = 0
    for page in site.rglob("*.html"):
        text = page.read_text(encoding="utf-8")
        if "<head>" not in text or "<body" not in text:
            continue
        text = text.replace("<head>", '<head>\n    <meta name="robots" content="noindex">', 1)
        body_end = text.index(">", text.index("<body")) + 1
        text = text[:body_end] + "\n    " + banner + text[body_end:]
        page.write_text(text, encoding="utf-8")
        marked += 1
    return marked


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("site", type=Path, help="Assembled preview directory")
    parser.add_argument("--branch", required=True)
    parser.add_argument("--commit", required=True)
    args = parser.parse_args()
    count = mark(args.site, args.branch, args.commit)
    if not count:
        raise SystemExit("no HTML pages were marked")
    print(f"Marked {count} preview page(s) for {args.branch}")


if __name__ == "__main__":
    main()
