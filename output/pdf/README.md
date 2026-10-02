# Reviewed PDF examples

This directory contains small, shareable snapshots that have been visually reviewed. It is not the normal build directory.

- Run `make starter` for routine work. Generated TeX, PDF, and LaTeX intermediates stay under the ignored `build/` directory.
- Inspect `build/grade4_fluency.pdf` before publishing it.
- Run `make publish-example` only when a reviewed snapshot should replace the committed example.
- Commit the changed PDF together with the source and configuration that produced it.

A clearly described commit is enough versioning for now. Tags or GitHub Releases can be added later when there is a meaningful named milestone to distribute.
