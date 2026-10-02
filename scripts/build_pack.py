# %% [markdown]
# CLI entry point for generating a LaTeX worksheet or pack.

# %%
from __future__ import annotations

import argparse
from pathlib import Path
import sys

PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT / "src"))

from family_math.generator import available_names, build_document, load_config  # noqa: E402


# %%
def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Build printable family math worksheets")
    selection = parser.add_mutually_exclusive_group(required=True)
    selection.add_argument("--pack", help="Pack name from config/worksheets.toml")
    selection.add_argument("--worksheet", help="Single worksheet name from config/worksheets.toml")
    parser.add_argument("--seed", type=int, default=0, help="Deterministic shuffle seed")
    parser.add_argument(
        "--timing",
        choices=("untimed", "optional", "challenge"),
        default="optional",
        help="How timing is described to the learner",
    )
    parser.add_argument("--config", type=Path, default=PROJECT_ROOT / "config" / "worksheets.toml")
    parser.add_argument("--output", type=Path, help="Output .tex path")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    config = load_config(args.config)

    section = "packs" if args.pack else "worksheets"
    selected = args.pack or args.worksheet
    if selected not in config[section]:
        choices = ", ".join(available_names(config, section))
        raise SystemExit(f"Unknown {section[:-1]} {selected!r}. Choose from: {choices}")

    tex = build_document(
        config,
        pack=args.pack,
        worksheet=args.worksheet,
        seed=args.seed,
        timing=args.timing,
    )
    output = args.output or PROJECT_ROOT / "build" / f"{selected}.tex"
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(tex, encoding="utf-8")
    print(output)
    return 0


# %%
if __name__ == "__main__":
    raise SystemExit(main())

