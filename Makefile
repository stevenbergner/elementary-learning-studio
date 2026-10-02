PYTHON ?= python3
LATEXMK ?= latexmk
PACK ?= grade4_fluency
SEED ?= 20261002
TEXMFCONFIG_DIR := $(CURDIR)/tmp/texmf-config
TEXMFVAR_DIR := $(CURDIR)/tmp/texmf-var
TEXMF_TREE := {$(TEXMFCONFIG_DIR),$(TEXMFVAR_DIR),/usr/share/texmf,/usr/share/texlive/texmf-dist}
TEX_ENV := TEXMFCONFIG=$(TEXMFCONFIG_DIR) TEXMFVAR=$(TEXMFVAR_DIR) TEXMF='$(TEXMF_TREE)'
XELATEX_FORMAT := $(TEXMFVAR_DIR)/web2c/xetex/xelatex.fmt

.PHONY: starter publish-example bootstrap-tex test progress clean

bootstrap-tex: $(XELATEX_FORMAT)

$(XELATEX_FORMAT): config/fmtutil.cnf
	mkdir -p $(TEXMFCONFIG_DIR)/web2c $(TEXMFVAR_DIR)
	cp config/fmtutil.cnf $(TEXMFCONFIG_DIR)/web2c/fmtutil.cnf
	$(TEX_ENV) fmtutil-user --byfmt xelatex

starter: bootstrap-tex
	mkdir -p build
	$(PYTHON) scripts/build_pack.py --pack $(PACK) --seed $(SEED) --timing optional --output build/$(PACK).tex
	$(TEX_ENV) $(LATEXMK) -xelatex -interaction=nonstopmode -halt-on-error -outdir=build build/$(PACK).tex

publish-example: starter
	mkdir -p output/pdf
	cp build/$(PACK).pdf output/pdf/$(PACK)-starter-pack.pdf

test:
	$(PYTHON) -m unittest discover -s tests -v

progress:
	$(PYTHON) scripts/summarize_progress.py data/progress.csv --output output/progress-summary.md

clean:
	$(TEX_ENV) $(LATEXMK) -C -outdir=build build/*.tex 2>/dev/null || true
	rm -f build/*.tex
