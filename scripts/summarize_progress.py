# %% [markdown]
# Create a compact Markdown summary from the family practice log.

# %%
from __future__ import annotations

import argparse
import csv
from collections import defaultdict
from pathlib import Path
from statistics import mean


# %%
def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Summarize family math progress")
    parser.add_argument("csv_path", type=Path)
    parser.add_argument("--output", type=Path)
    return parser.parse_args()


def _as_int(value: str) -> int | None:
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def summarize(rows: list[dict[str, str]]) -> str:
    valid = []
    for row in rows:
        correct = _as_int(row.get("correct", ""))
        attempted = _as_int(row.get("attempted", ""))
        if correct is None or attempted in (None, 0):
            continue
        row = dict(row)
        row["accuracy"] = f"{100 * correct / attempted:.1f}"
        valid.append(row)

    lines = ["# Practice progress", ""]
    if not valid:
        lines.append("No completed sessions yet. Add one row to `data/progress.csv` after practice.")
        return "\n".join(lines) + "\n"

    grouped: dict[str, list[dict[str, str]]] = defaultdict(list)
    for row in valid:
        grouped[row.get("operation", "unknown")].append(row)

    lines.extend([
        f"Sessions recorded: **{len(valid)}**",
        "",
        "| Operation | Sessions | Average accuracy | Latest confidence | Latest focus |",
        "| --- | ---: | ---: | ---: | --- |",
    ])
    for operation, items in sorted(grouped.items()):
        accuracy = mean(float(item["accuracy"]) for item in items)
        latest = items[-1]
        lines.append(
            f"| {operation.title()} | {len(items)} | {accuracy:.1f}% | "
            f"{latest.get('confidence_1_5', '') or '-'} | {latest.get('next_focus', '') or '-'} |"
        )

    lines.extend([
        "",
        "## Recent sessions",
        "",
        "| Date | Set | Operation | Accuracy | Strategy |",
        "| --- | --- | --- | ---: | --- |",
    ])
    for row in valid[-8:]:
        lines.append(
            f"| {row.get('date', '')} | {row.get('set_id', '')} | "
            f"{row.get('operation', '').title()} | {row['accuracy']}% | "
            f"{row.get('strategy_used', '') or '-'} |"
        )
    return "\n".join(lines) + "\n"


def main() -> int:
    args = parse_args()
    with args.csv_path.open(newline="", encoding="utf-8") as handle:
        report = summarize(list(csv.DictReader(handle)))
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(report, encoding="utf-8")
        print(args.output)
    else:
        print(report, end="")
    return 0


# %%
if __name__ == "__main__":
    raise SystemExit(main())

