#!/usr/bin/env bash
# Generate the local speech carrier used by the opt-in single-word help.
#
# The carrier is a short spoken "okay" that the studio plays only into the
# recognizer's input after the learner falls silent. It is generated locally
# with macOS speech synthesis and is not committed: which voice may be
# redistributed with the published site is still an open decision.
set -euo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
output="${project_root}/site/audio/speech-carrier-en.wav"
voice="${1:-Samantha}"

if [[ "$(uname)" != "Darwin" ]]; then
  echo "This generator uses macOS speech synthesis." >&2
  exit 1
fi

mkdir -p "$(dirname "$output")"
scratch="$(mktemp -d)"
trap 'rm -rf -- "$scratch"' EXIT
/usr/bin/say -v "$voice" -o "$scratch/carrier.aiff" "Okay."
/usr/bin/afconvert "$scratch/carrier.aiff" "$output" -f WAVE -d LEI16@16000 -c 1
echo "Wrote ${output} (voice: ${voice}; local only, not committed)"
