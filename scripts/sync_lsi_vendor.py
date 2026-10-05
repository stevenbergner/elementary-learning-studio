#!/usr/bin/env python3
"""Vendor the browser-facing Local Speech Interface modules at one revision.

The vendored copy keeps the static site deployable without a package
release. Files are taken from a committed LSI revision (default: HEAD), their
relative imports are flattened into one directory, and PROVENANCE.md records
the revision. Edit LSI first, commit there, then run this script.
"""

from __future__ import annotations

import argparse
from pathlib import Path
import re
import subprocess


PROJECT_ROOT = Path(__file__).resolve().parents[1]
VENDOR = PROJECT_ROOT / "site" / "vendor" / "local-speech-interface"
DEFAULT_LSI = PROJECT_ROOT.parent / "local-speech-interface"

# LSI source path -> vendored file name. index.js is maintained by hand
# because the site exposes a narrower surface than LSI's package entry point.
FILES = {
    "src/browser/local-session.js": "local-session.js",
    "src/browser/loudness-endpointer.js": "loudness-endpointer.js",
    "src/browser/recognition-input.js": "recognition-input.js",
    "src/capabilities.js": "capabilities.js",
    "src/dom-bridge.js": "dom-bridge.js",
    "src/local-policy.js": "local-policy.js",
    "src/page-control.js": "page-control.js",
    "src/speech-event.js": "speech-event.js",
    "src/stable-interim.js": "stable-interim.js",
    "packages/domain-grammar/src/index.js": "domain-grammar.js",
    "packages/domain-grammar/src/integer.js": "integer-domain.js",
}


def git(lsi: Path, *args: str) -> str:
    return subprocess.run(["git", "-C", str(lsi), *args], check=True, capture_output=True, text=True).stdout


def flatten_imports(source: str, lsi_path: str) -> str:
    # Every vendored module sits in one directory, so a relative import keeps
    # only its file name; the grammar package's own index becomes
    # domain-grammar.js.
    def rewrite(match: re.Match[str]) -> str:
        target = match.group(2)
        is_grammar_index = lsi_path.startswith("packages/domain-grammar/") and target == "./index.js"
        name = "domain-grammar.js" if is_grammar_index else Path(target).name
        return f'{match.group(1)}"./{name}"'

    return re.sub(r'(from\s+)"(\.{1,2}/[^"]+)"', rewrite, source)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--lsi", type=Path, default=DEFAULT_LSI, help="Path to the LSI checkout")
    parser.add_argument("--rev", default="HEAD", help="LSI revision to vendor")
    parser.add_argument(
        "--worktree",
        action="store_true",
        help="Development only: copy uncommitted LSI files and mark provenance as a working tree",
    )
    args = parser.parse_args()

    revision = git(args.lsi, "rev-parse", "--short", args.rev).strip()
    for lsi_path, vendored in FILES.items():
        if args.worktree:
            source = (args.lsi / lsi_path).read_text(encoding="utf-8")
        else:
            source = git(args.lsi, "show", f"{revision}:{lsi_path}")
        if "SPDX-License-Identifier: MPL-2.0" not in source:
            raise SystemExit(f"{lsi_path} lacks its MPL-2.0 SPDX header")
        (VENDOR / vendored).write_text(flatten_imports(source, lsi_path), encoding="utf-8")

    provenance = VENDOR / "PROVENANCE.md"
    text = provenance.read_text(encoding="utf-8")
    label = f"{revision}+worktree" if args.worktree else revision
    text = re.sub(r"revision `[0-9a-f]{7,40}(\+worktree)?`", f"revision `{label}`", text, count=1)
    provenance.write_text(text, encoding="utf-8")
    print(f"Vendored {len(FILES)} LSI files at {label}")


if __name__ == "__main__":
    main()
