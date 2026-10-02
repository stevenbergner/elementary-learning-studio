#!/usr/bin/env python3
"""Assemble the exact static artifact published by GitHub Pages."""

from __future__ import annotations

import argparse
from pathlib import Path
import shutil


PROJECT_ROOT = Path(__file__).resolve().parents[1]


def build_site(destination: Path) -> None:
    source = PROJECT_ROOT / "site"
    pdf_source = PROJECT_ROOT / "output" / "pdf"

    if destination.exists():
        shutil.rmtree(destination)

    shutil.copytree(source, destination)
    pdf_destination = destination / "pdfs"
    pdf_destination.mkdir()

    pdfs = sorted(pdf_source.glob("*.pdf"))
    if not pdfs:
        raise RuntimeError("No reviewed PDFs found in output/pdf")

    for pdf in pdfs:
        shutil.copy2(pdf, pdf_destination / pdf.name)

    (destination / ".nojekyll").touch()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--output",
        type=Path,
        default=PROJECT_ROOT / "build" / "site",
        help="Destination for the assembled static site",
    )
    args = parser.parse_args()
    build_site(args.output.resolve())


if __name__ == "__main__":
    main()
