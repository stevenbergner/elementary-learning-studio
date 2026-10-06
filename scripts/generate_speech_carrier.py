#!/usr/bin/env python3
"""Generate the spoken carrier for the opt-in single-word help.

The carrier is a short spoken "okay" that the studio plays only into the
recognizer's input after the learner falls silent, so Firefox releases a lone
word it would otherwise hold back. It is synthesized with an open TTS stack
whose licenses permit publishing the result:

- engine: piper-tts (GPL-3.0-or-later). Program output is not covered by the
  program's license (GNU GPL FAQ), and the audio is synthesized from our text.
- voice: rhasspy/piper-voices en_US-ljspeech-high (MIT), trained on the LJ
  Speech dataset, which is in the public domain.

macOS system voices are not used: section 2F of Apple's published macOS
Sequoia agreement limits their output to personal, non-commercial use and
forbids publishing it.

Run with `uv` available on PATH. The voice download (about 114 MB) and the
engine are cached under the ignored tmp/ directory.
"""

from __future__ import annotations

import argparse
import array
import datetime as dt
import hashlib
import math
from pathlib import Path
import subprocess
import urllib.request
import wave


PROJECT_ROOT = Path(__file__).resolve().parents[1]
CACHE = PROJECT_ROOT / "tmp" / "tts"
OUTPUT = PROJECT_ROOT / "site" / "audio" / "speech-carrier-en.wav"
PROVENANCE = PROJECT_ROOT / "site" / "audio" / "speech-carrier-en.md"

PIPER_VERSION = "1.8.0"
VOICE_REPO = "rhasspy/piper-voices"
VOICE_REVISION = "c10ece1aade47bb51c153c893d14e5bf8e5b7117"
VOICE_PATH = "en/en_US/ljspeech/high"
VOICE_NAME = "en_US-ljspeech-high"
VOICE_FILES = {
    f"{VOICE_NAME}.onnx": "5d4f08ba6a2a48c44592eed3ce56bf85e9de3dd4e20df90541ae68a8310c029a",
    f"{VOICE_NAME}.onnx.json": None,  # small config; its digest is recorded in the provenance file
}

TEXT = "Okay."
# Zero sampling noise makes the synthesis reproducible.
SYNTHESIS = {"--noise-scale": "0", "--noise-w-scale": "0", "--length-scale": "1.0"}

PEAK_DBFS = -3.0
SILENCE_BELOW_PEAK_DB = 40.0
LEAD_MS = 30
TAIL_MS = 60
FADE_MS = 8


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1 << 20), b""):
            digest.update(block)
    return digest.hexdigest()


def fetch_voice() -> dict[str, str]:
    CACHE.mkdir(parents=True, exist_ok=True)
    digests = {}
    for name, expected in VOICE_FILES.items():
        target = CACHE / name
        if not target.exists() or (expected and sha256(target) != expected):
            url = f"https://huggingface.co/{VOICE_REPO}/resolve/{VOICE_REVISION}/{VOICE_PATH}/{name}"
            print(f"Downloading {url}")
            urllib.request.urlretrieve(url, target)
        digest = sha256(target)
        if expected and digest != expected:
            raise SystemExit(f"{name} digest {digest} does not match the pinned {expected}")
        digests[name] = digest
    return digests


def synthesize(raw: Path) -> None:
    command = [
        "uvx", "--from", f"piper-tts=={PIPER_VERSION}", "piper",
        "--model", str(CACHE / f"{VOICE_NAME}.onnx"),
        "--config", str(CACHE / f"{VOICE_NAME}.onnx.json"),
        "--output-file", str(raw),
    ]
    for flag, value in SYNTHESIS.items():
        command += [flag, value]
    subprocess.run(command, input=TEXT, text=True, check=True, capture_output=True)


def trim_and_normalize(raw: Path, output: Path) -> tuple[int, int]:
    with wave.open(str(raw), "rb") as source:
        if source.getsampwidth() != 2 or source.getnchannels() != 1:
            raise SystemExit("expected 16-bit mono audio from piper")
        rate = source.getframerate()
        samples = array.array("h", source.readframes(source.getnframes()))

    peak = max(abs(sample) for sample in samples) or 1
    threshold = peak * 10 ** (-SILENCE_BELOW_PEAK_DB / 20)
    frame = max(1, rate // 100)
    loud = [
        index for index in range(0, len(samples), frame)
        if math.sqrt(sum(s * s for s in samples[index:index + frame]) / len(samples[index:index + frame])) > threshold
    ]
    if not loud:
        raise SystemExit("no speech found in the synthesized audio")
    start = max(0, loud[0] - rate * LEAD_MS // 1000)
    end = min(len(samples), loud[-1] + frame + rate * TAIL_MS // 1000)
    clip = samples[start:end]

    gain = (32767 * 10 ** (PEAK_DBFS / 20)) / peak
    fade = max(1, rate * FADE_MS // 1000)
    shaped = array.array("h")
    for index, sample in enumerate(clip):
        envelope = min(1.0, index / fade, (len(clip) - 1 - index) / fade)
        shaped.append(max(-32768, min(32767, round(sample * gain * envelope))))

    output.parent.mkdir(parents=True, exist_ok=True)
    with wave.open(str(output), "wb") as target:
        target.setnchannels(1)
        target.setsampwidth(2)
        target.setframerate(rate)
        target.writeframes(shaped.tobytes())
    return rate, round(len(shaped) * 1000 / rate)


def write_provenance(digests: dict[str, str], rate: int, duration_ms: int) -> None:
    flags = " ".join(f"{flag} {value}" for flag, value in SYNTHESIS.items())
    PROVENANCE.write_text(f"""# Speech carrier provenance

`speech-carrier-en.wav` is a synthesized spoken “{TEXT}” used by the opt-in
single-word help. The studio plays it only into the speech recognizer's input,
never to the speakers. Regenerate it with `scripts/generate_speech_carrier.py`.

- Engine: [piper-tts](https://github.com/OHF-Voice/piper1-gpl) {PIPER_VERSION}
  (GPL-3.0-or-later). The GPL does not cover a program's output that is not
  copied from the program; this audio is synthesized from the text above.
- Voice: [{VOICE_REPO}](https://huggingface.co/{VOICE_REPO}) `{VOICE_NAME}`
  (MIT) at revision `{VOICE_REVISION}`.
  - `{VOICE_NAME}.onnx` sha256 `{digests[f"{VOICE_NAME}.onnx"]}`
  - `{VOICE_NAME}.onnx.json` sha256 `{digests[f"{VOICE_NAME}.onnx.json"]}`
- Voice training data: [LJ Speech](https://keithito.com/LJ-Speech-Dataset/),
  public-domain LibriVox recordings of public-domain texts.
- Synthesis: `{flags}`; then trimmed, normalized to {PEAK_DBFS:g} dBFS peak, and
  given {FADE_MS} ms fades. {rate} Hz, 16-bit mono, {duration_ms} ms.
- Output sha256: `{sha256(OUTPUT)}`
- Generated: {dt.date.today().isoformat()}

This audio file is part of the studio's educational content and is licensed
under CC BY 4.0 (see `CONTENT_LICENSE.md`).

macOS system voices are deliberately not used: section 2F of Apple's published
macOS Sequoia agreement limits their output to personal, non-commercial use and
forbids publishing it:
https://www.apple.com/legal/sla/docs/macOSSequoia.pdf
""", encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.parse_args()
    digests = fetch_voice()
    raw = CACHE / "carrier-raw.wav"
    synthesize(raw)
    rate, duration_ms = trim_and_normalize(raw, OUTPUT)
    write_provenance(digests, rate, duration_ms)
    print(f"Wrote {OUTPUT.relative_to(PROJECT_ROOT)} ({duration_ms} ms, {rate} Hz) and its provenance")


if __name__ == "__main__":
    main()
