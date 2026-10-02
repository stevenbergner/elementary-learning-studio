# Family Learning Materials

A small, reproducible project for creating attractive, print-at-home mathematics practice. The starter pack is inspired by the 10 x 10 "Five Minute Frenzy" worksheet format, but it is designed around accuracy, strategy, reflection, and steady progress. Timing is always optional.

The generated student PDFs contain no solutions. Answer-key generation is intentionally not part of the default workflow.

## Quick start

Requirements:

- Python 3.11 or newer
- XeLaTeX and `latexmk`
- Poppler (`pdftoppm`) for visual checking

Build the complete Grade 4 starter pack:

```bash
make starter
```

`make starter` creates a project-local XeLaTeX format when needed. It does not modify the system TeX configuration.

Build a different deterministic version:

```bash
python3 scripts/build_pack.py --pack grade4_fluency --seed 20261008 --timing optional
latexmk -xelatex -interaction=nonstopmode -halt-on-error -outdir=build build/grade4_fluency.tex
```

Generate one worksheet:

```bash
python3 scripts/build_pack.py --worksheet multiplication_2_12 --seed 42
latexmk -xelatex -interaction=nonstopmode -halt-on-error -outdir=build build/multiplication_2_12.tex
```

Summarize progress entered in `data/progress.csv`:

```bash
python3 scripts/summarize_progress.py data/progress.csv
```

Run tests:

```bash
make test
```

## Project map

| Path | Purpose |
| --- | --- |
| `config/worksheets.toml` | Editable worksheet presets and pack definitions |
| `src/family_math/generator.py` | Deterministic problem and LaTeX generation |
| `scripts/build_pack.py` | Command-line entry point |
| `scripts/summarize_progress.py` | Turns the CSV log into a compact Markdown report |
| `data/progress.csv` | Family-owned practice log; one row per session |
| `docs/LEARNING_GUIDE.md` | How to use the materials without making speed the goal |
| `docs/SOURCES.md` | Source links, curriculum notes, and design decisions |
| `output/pdf/` | Final printable PDFs |

## Design choices

- Letter paper and generous writing space for home printing.
- Deterministic seeds: the same seed creates the same worksheet.
- Shuffled headers reduce position memorization.
- Division uses whole-number fact families only.
- Subtraction presets keep every result non-negative.
- A short reflection box asks for a strategy, not only a score.
- Progress is compared with the learner's own earlier work, never with another child.

See `docs/LEARNING_GUIDE.md` before using timed practice.
