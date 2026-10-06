# Elementary Learning Studio

An open, reproducible studio for creating thoughtful elementary mathematics practice on paper and in the browser. The first printable pack uses the familiar 10 x 10 arithmetic-grid format, redesigned independently around accuracy, strategy, reflection, and steady progress. Timing is always optional.

## Try it online

[Open the browser-based learning studio](https://stevenbergner.github.io/elementary-learning-studio/) on a tablet or laptop. It supports touch and keyboard input, gives strategy hints, works offline after the first visit, and keeps named learner profiles and detailed session history only on that device.

The progress panel shows first-try accuracy, retries, hints, facts worth revisiting, confidence, and recent sessions. Timing is opt-in per set and hidden in the standard view. Families can download ordinary CSV or xAPI-compatible JSON without sending learner data to a server. A downloadable practice award is deliberately labelled as an informal celebration, not a graded or verified credential.

A child-sized 4×4 Sudoku (numbers 1–4) offers a short logic break. Click, touch, keyboard, and on-screen number buttons all select and fill the same cells, and checking highlights cells to revisit without revealing the solution.

The studio has no voice input and never asks for the microphone: keyboard and touch are the dependable inputs. Voice input was explored and is parked on the `voice-integration` branch until it works reliably. See [Input methods and privacy](docs/INPUT_METHODS.md) for that decision and for deferring handwriting recognition.

The generated student PDFs contain no solutions. Answer-key generation is intentionally not part of the default workflow.

## Example printable pack

[Open the four-page Grade 4 fluency starter pack](output/pdf/grade4_fluency-starter-pack.pdf). It includes addition, subtraction, multiplication, and whole-number division practice with strategy prompts and learner reflection.

The repository keeps a small number of reviewed PDFs as examples. Routine builds stay in the ignored `build/` directory; replacing a committed example is an explicit `make publish-example` step. This keeps source changes separate from shareable snapshots without requiring a release process yet.

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

After reviewing the generated `build/grade4_fluency.pdf`, deliberately update the committed example with:

```bash
make publish-example
```

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

Assemble the same static artifact that GitHub Pages deploys:

```bash
make site
```

Browser quality checks run in GitHub Actions at desktop, iPad, and school-laptop viewport sizes. They exercise keyboard answering, touch-target sizing, responsive overflow, JavaScript errors, and the published PDF. To run them locally after installing the Node development dependency and Playwright's Chromium browser:

```bash
npm ci
npx playwright install chromium
npm run build:site
npm run test:browser
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
| `docs/INPUT_METHODS.md` | Input, voice, pen, handwriting, and privacy decisions |
| `build/` | Ignored TeX, PDF, and LaTeX intermediate files from local builds |
| `output/pdf/` | Small, reviewed example PDFs that are intentionally committed |
| `site/` | Dependency-free browser practice and project landing page |
| `.github/workflows/pages.yml` | Publishes the site and reviewed PDFs to GitHub Pages |
| `.github/workflows/quality.yml` | Runs generator, structure, desktop, iPad, and laptop checks |

## Public-use and copyright policy

Source code is available under the [MIT license](LICENSE). Original learning content and reviewed PDFs are shared under [CC BY 4.0](CONTENT_LICENSE.md). See [CONTRIBUTING.md](CONTRIBUTING.md) before submitting material: copied worksheets, scans, proprietary problem sequences, and learner data are not accepted.

External sources are cited for curriculum context and format research only. This project does not copy external worksheets, branding, answer keys, or shuffled sequences, and is not affiliated with the referenced publishers.

## Design choices

- Letter paper and generous writing space for home printing.
- Deterministic seeds: the same seed creates the same worksheet.
- Shuffled headers reduce position memorization.
- Division uses whole-number fact families only.
- Subtraction presets keep every result non-negative.
- A short reflection box asks for a strategy, not only a score.
- Progress is compared with the learner's own earlier work, never with another child.
- A malformed entry is input feedback, not a recorded mathematical mistake.
- Timing and downloads are each explicit learner or family choices; the site never requests the microphone or camera.

See `docs/LEARNING_GUIDE.md` before using timed practice.
