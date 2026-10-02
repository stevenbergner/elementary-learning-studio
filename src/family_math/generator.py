# %% [markdown]
# Deterministic worksheet and LaTeX generation.

# %%
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
import random
import tomllib
from typing import Any, Iterable


# %%
LATEX_SPECIAL = {
    "&": r"\&",
    "%": r"\%",
    "$": r"\$",
    "#": r"\#",
    "_": r"\_",
    "{": r"\{",
    "}": r"\}",
    "~": r"\textasciitilde{}",
    "^": r"\textasciicircum{}",
}


def escape_latex(value: object) -> str:
    return "".join(LATEX_SPECIAL.get(char, char) for char in str(value))


def load_config(path: Path) -> dict[str, Any]:
    with path.open("rb") as handle:
        return tomllib.load(handle)


@dataclass(frozen=True)
class Worksheet:
    key: str
    title: str
    operation: str
    style: str
    data: dict[str, Any]


# %%
def _preamble(document_title: str, project_title: str, subtitle: str) -> str:
    return rf"""\documentclass[11pt]{{article}}
\usepackage[letterpaper,margin=0.55in,headheight=16pt]{{geometry}}
\usepackage{{fontspec}}
\setmainfont{{DejaVu Sans}}
\usepackage{{array,tabularx,colortbl,xcolor,fancyhdr,lastpage}}
\usepackage{{tikz}}
\definecolor{{navy}}{{HTML}}{{16324F}}
\definecolor{{blue}}{{HTML}}{{2D7DD2}}
\definecolor{{mint}}{{HTML}}{{DDF4E7}}
\definecolor{{sun}}{{HTML}}{{FFE7A3}}
\definecolor{{paper}}{{HTML}}{{F7FAFC}}
\definecolor{{line}}{{HTML}}{{8EA3B5}}
\pagestyle{{fancy}}
\fancyhf{{}}
\lhead{{\small\color{{navy}}\textbf{{{escape_latex(project_title)}}}}}
\rhead{{\small\color{{navy}}{escape_latex(document_title)}}}
\cfoot{{\small\color{{line}}Page \thepage\ of \pageref{{LastPage}}}}
\setlength{{\parindent}}{{0pt}}
\renewcommand{{\arraystretch}}{{1.15}}
\newcommand{{\worksheetheader}}[2]{{%
  \begin{{tikzpicture}}[remember picture,overlay]
    \fill[blue] (current page.north west) rectangle ([yshift=-0.42in]current page.north east);
  \end{{tikzpicture}}
  \vspace*{{0.02in}}
  {{\fontsize{{20}}{{22}}\selectfont\color{{navy}}\textbf{{#1}}}}\\[2pt]
  {{\small\color{{blue}}\textbf{{#2}}}}\hfill
  {{\small Name: \rule{{1.7in}}{{0.4pt}}\quad Date: \rule{{0.9in}}{{0.4pt}}}}
  \vspace{{0.12in}}\par
}}
\newcommand{{\reflection}}[1]{{%
  \vfill
  \colorbox{{mint}}{{\parbox{{0.965\linewidth}}{{\textbf{{Strategy check:}} #1\\[4pt]
  I used: \rule{{2.4in}}{{0.4pt}}\hfill Next time I will focus on: \rule{{2.0in}}{{0.4pt}}}}}}\\[6pt]
  \textbf{{My practice notes:}} Correct \rule{{0.45in}}{{0.4pt}} of \rule{{0.45in}}{{0.4pt}}
  \hfill Time \rule{{0.65in}}{{0.4pt}}
  \hfill Confidence (circle): \(1\;2\;3\;4\;5\)
}}
\begin{{document}}
\color{{navy}}
% {escape_latex(subtitle)}
"""


def _footer() -> str:
    return "\\end{document}\n"


def _timing_text(mode: str) -> str:
    options = {
        "untimed": "Work carefully. Explain a strategy when you can.",
        "optional": "Accuracy first. Use a timer only if it helps you track your own growth.",
        "challenge": "Personal challenge: work accurately, then record your time and compare only with yourself.",
    }
    return options[mode]


def _operation_symbol(operation: str) -> str:
    return {
        "addition": "+",
        "subtraction": r"$-$",
        "multiplication": r"$\times$",
        "division": r"$\div$",
    }[operation]


# %%
def _grid_page(sheet: Worksheet, rng: random.Random, timing: str, set_id: str) -> str:
    rows = list(sheet.data["row_values"])
    columns = list(sheet.data["column_values"])
    rng.shuffle(rows)
    rng.shuffle(columns)
    symbol = _operation_symbol(sheet.operation)

    column_spec = (
        "|>{\\centering\\arraybackslash\\columncolor{sun}}m{0.43in}|"
        + ">{\\centering\\arraybackslash}m{0.58in}|" * len(columns)
    )
    header_cells = " & ".join([symbol, *map(str, columns)]) + r" \\ \hline"
    body_lines = []
    for row in rows:
        blanks = " & ".join([str(row), *([r"\rule{0pt}{0.36in}"] * len(columns))])
        body_lines.append(blanks + r" \\ \hline")

    direction = {
        "addition": "Add the number at the left to the number at the top.",
        "subtraction": "Subtract the number at the left from the number at the top.",
        "multiplication": "Multiply the number at the left by the number at the top.",
    }[sheet.operation]

    return rf"""\worksheetheader{{{escape_latex(sheet.title)}}}{{Set {escape_latex(set_id)}}}
\colorbox{{paper}}{{\parbox{{0.965\linewidth}}{{\textbf{{How to work:}} {escape_latex(direction)} {escape_latex(_timing_text(timing))}}}}}
\vspace{{0.14in}}
\begin{{center}}
\setlength{{\arrayrulewidth}}{{0.55pt}}
\setlength{{\tabcolsep}}{{2pt}}
\arrayrulecolor{{line}}
\begin{{tabular}}{{{column_spec}}}
\hline
{header_cells}
{chr(10).join(body_lines)}
\end{{tabular}}
\end{{center}}
\reflection{{{escape_latex(sheet.data['strategy_prompt'])}}}
"""


def _division_problems(sheet: Worksheet, rng: random.Random) -> list[tuple[int, int]]:
    divisors = list(sheet.data["divisors"])
    quotients = list(sheet.data["quotients"])
    pool = [(divisor * quotient, divisor) for divisor in divisors for quotient in quotients]
    rng.shuffle(pool)
    count = int(sheet.data.get("question_count", 60))
    if count <= len(pool):
        return pool[:count]
    return [rng.choice(pool) for _ in range(count)]


def _equations_page(sheet: Worksheet, rng: random.Random, timing: str, set_id: str) -> str:
    problems = _division_problems(sheet, rng)
    columns = 3
    rows = (len(problems) + columns - 1) // columns
    padded: list[tuple[int, int] | None] = problems + [None] * (rows * columns - len(problems))
    table_rows = []
    for row_index in range(rows):
        cells = []
        for column_index in range(columns):
            item = padded[column_index * rows + row_index]
            if item is None:
                cells.append("")
            else:
                dividend, divisor = item
                number = column_index * rows + row_index + 1
                cells.append(rf"\textcolor{{line}}{{{number:02d}.}}\; ${dividend} \div {divisor} =$ \rule{{0.35in}}{{0.4pt}}")
        table_rows.append(" & ".join(cells) + r" \\[0.11in]")

    return rf"""\worksheetheader{{{escape_latex(sheet.title)}}}{{Set {escape_latex(set_id)}}}
\colorbox{{paper}}{{\parbox{{0.965\linewidth}}{{\textbf{{How to work:}} Find each whole-number quotient. {escape_latex(_timing_text(timing))}}}}}\par
\vspace{{0.18in}}
\small
\setlength{{\tabcolsep}}{{3pt}}
\begin{{tabularx}}{{\linewidth}}{{*{{3}}{{>{{\raggedright\arraybackslash}}X}}}}
{chr(10).join(table_rows)}
\end{{tabularx}}
\reflection{{{escape_latex(sheet.data['strategy_prompt'])}}}
"""


# %%
def _resolve_worksheets(config: dict[str, Any], pack: str | None, worksheet: str | None) -> tuple[str, list[Worksheet]]:
    if (pack is None) == (worksheet is None):
        raise ValueError("Choose exactly one of pack or worksheet")

    if worksheet is not None:
        keys = [worksheet]
        document_title = config["worksheets"][worksheet]["title"]
    else:
        pack_data = config["packs"][pack]
        keys = list(pack_data["worksheets"])
        document_title = pack_data["title"]

    resolved = []
    for key in keys:
        data = config["worksheets"][key]
        resolved.append(
            Worksheet(
                key=key,
                title=data["title"],
                operation=data["operation"],
                style=data["style"],
                data=data,
            )
        )
    return document_title, resolved


def build_document(
    config: dict[str, Any],
    *,
    pack: str | None = None,
    worksheet: str | None = None,
    seed: int = 0,
    timing: str = "optional",
) -> str:
    if timing not in {"untimed", "optional", "challenge"}:
        raise ValueError(f"Unknown timing mode: {timing}")

    document_title, sheets = _resolve_worksheets(config, pack, worksheet)
    project = config["project"]
    parts = [_preamble(document_title, project["title"], project["subtitle"])]

    for index, sheet in enumerate(sheets):
        page_rng = random.Random(f"{seed}:{sheet.key}")
        set_id = f"{seed}-{sheet.operation[:3].upper()}"
        if sheet.style == "grid":
            parts.append(_grid_page(sheet, page_rng, timing, set_id))
        elif sheet.style == "equations":
            parts.append(_equations_page(sheet, page_rng, timing, set_id))
        else:
            raise ValueError(f"Unknown worksheet style: {sheet.style}")
        if index != len(sheets) - 1:
            parts.append("\\newpage\n")

    parts.append(_footer())
    return "".join(parts)


def available_names(config: dict[str, Any], section: str) -> Iterable[str]:
    return sorted(config[section].keys())
