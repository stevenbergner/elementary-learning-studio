# Elementary Learning Studio

**An open framework for learner-owned studios.** The repository is a reproducible maker and governance layer: it holds the generators, activity contracts, curriculum decisions, privacy rules, tests, and reviewed examples. A **studio** is the experience those materials create on a learner's own device.

The first activities focus on elementary mathematics. The first printable pack uses the familiar 10 x 10 arithmetic-grid format, redesigned independently around accuracy, strategy, reflection, and steady progress. Timing is always optional. The architecture is intentionally broader: language practice, spoken interaction, visual explanation, and other forms of elementary learning can grow here without turning learner activity into a cloud data product.

## Try it online

[Open the browser-based learning studio](https://stevenbergner.github.io/elementary-learning-studio/) on a tablet or laptop. It supports touch and keyboard input, gives strategy hints, works offline after the first visit, and keeps named learner profiles and detailed session history only on that device.

The progress panel shows first-try accuracy, retries, hints, facts worth revisiting, confidence, and recent sessions. Timing is opt-in per set and hidden in the standard view. Families can download ordinary CSV or xAPI-compatible JSON without sending learner data to a server. A downloadable practice award is deliberately labelled as an informal celebration, not a graded or verified credential.

An optional page-wide panel offers strictly on-device, browser-provided speech recognition for English, French, German, and Vietnamese numbers and a closed set of safe commands. Keyboard and touch remain complete without it. While voice is active, a persistent status strip shows the current exercise target, live browser text, and the accepted or rejected result even after the setup panel scrolls away. By default, speech fills the answer and waits for “check” or “done”; an explicit immediate-checking mode checks each spoken number and advances after a correct answer. Exact commands can commit from unchanged interim text after a bounded 500 ms boundary when Firefox withholds its final result; continued prose cancels them, repeated identical commands remain idempotent, and late final results are deduplicated. The studio verifies the local-processing API and language pack before listening, shows language-pack setup progress, and **never falls back to an online speech service**. LSI's generated domain grammar exhaustively covers the declared integer range from 0–999, resolves ranked transcripts by canonical meaning, and rejects conflicts rather than guessing; it does not consult the correct answer. Recognition and current permission remain separate, so a number heard while the answer field is unavailable is reported as recognized but rejected—not misreported as unintelligible. Unsupported browsers stay visibly unavailable while keyboard and touch continue to work. Its observable events implement the sibling Local Speech Interface v0.1 contract, keeping recognition, intent, and accepted action distinct. See the public [Local voice and privacy brief](https://stevenbergner.github.io/elementary-learning-studio/voice-privacy.html), [Input methods and privacy](docs/INPUT_METHODS.md), and the technical [Local voice and AI research brief](docs/LOCAL_VOICE_AND_AI.md).

A child-sized 4×4 Sudoku demonstrates scoped point-and-speak entry without turning speech into general page control. Mouse hover, touch, keyboard, and on-screen buttons all select or fill the same cells; voice accepts only 1–4 for the highlighted editable cell. Four reviewed grids each have exactly one solution. The separate [language-exercise authoring contract](docs/LANGUAGE_EXERCISE_AUTHORING.md) compiles prompt-specific accepted phrases and checks model-specific transcription receipts, providing a bounded path toward spoken French practice without an always-running language-model judge.

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

Browser quality checks run in GitHub Actions in Chromium and Firefox, including upright-phone, iPad, desktop, and school-laptop viewport sizes. They exercise keyboard answering, point-and-speak Sudoku, voice capability fallbacks, touch-target sizing, responsive overflow, JavaScript errors, and the published PDF. To run them locally after installing the Node development dependency and Playwright's Chromium browser:

```bash
npm ci
npx playwright install chromium
npm run build:site
npm run test:browser
```

To try Mozilla's experimental, strictly on-device speech recognition in an
isolated Firefox Nightly profile on an Apple Silicon Mac:

```bash
./scripts/run_firefox_nightly.sh
```

This user-local launcher keeps Nightly separate from normal Firefox and opens
the public studio. See [the Firefox Nightly voice test checklist](docs/FIREFOX_NIGHTLY_TEST.md)
before reporting results upstream.

For local development, build the site, serve it only on this Mac, and open that
working copy in the same isolated Nightly profile:

```bash
./scripts/run_firefox_nightly.sh --local
```

Keep that command running while testing and press Control-C to close the local
server. Microphone access is still controlled by Firefox.

## Project map

| Path | Purpose |
| --- | --- |
| `config/worksheets.toml` | Editable worksheet presets and pack definitions |
| `src/family_math/generator.py` | Deterministic problem and LaTeX generation |
| `scripts/build_pack.py` | Command-line entry point |
| `scripts/summarize_progress.py` | Turns the CSV log into a compact Markdown report |
| `scripts/run_firefox_nightly.sh` | Installs and launches an isolated Firefox Nightly voice-test profile |
| `data/progress.csv` | Family-owned practice log; one row per session |
| `docs/LEARNING_GUIDE.md` | How to use the materials without making speed the goal |
| `docs/SOURCES.md` | Source links, curriculum notes, and design decisions |
| `docs/INPUT_METHODS.md` | Voice, pen, handwriting, and privacy decisions |
| `docs/LOCAL_VOICE_AND_AI.md` | Browser evidence, local-AI architecture, mobile limits, and contribution roadmap |
| `site/vendor/local-speech-interface/` | MPL-2.0 browser snapshot providing verified local recognition and adaptive utterance finalization |
| `site/voice-intent.js` | Deterministic multilingual number-and-command resolver over ranked recognition alternatives |
| `docs/POSITIONING_AND_ECOSYSTEM.md` | Brand architecture, market position, sustainable ecosystem, and feedback principles |
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
- Timing, microphone use, and downloads are each explicit learner or family choices.
- Optional intelligence must be local, inspectable, replaceable, and fail closed when its privacy contract cannot be verified.

## Development philosophy

The repository does not present itself as the learner's studio. It is the open workshop that makes and audits studio experiences. That distinction matters:

- curriculum claims belong beside reproducible activities and evidence;
- privacy promises are enforced in code and tests, not left as marketing language;
- exported records remain understandable without this software;
- open source makes the implementation inspectable and forkable, but does not by itself prove that an educational or privacy claim is valid;
- emerging capabilities are introduced as optional experiments with a dependable non-AI path.

The aim is a curriculum that can respond, speak, and adapt while keeping the learner in control. Progress should become visible through artifacts, explanations, successful actions, and growing independence—not through opaque profiling or a single score.

The name **Studio** belongs to that learner-facing experience; the repository is the **Studio framework and reference implementation**. See [Positioning the Studio and its ecosystem](docs/POSITIONING_AND_ECOSYSTEM.md) for the audience model, sustainable-service opportunities, and rules for any future feedback channel.

See `docs/LEARNING_GUIDE.md` before using timed practice.
