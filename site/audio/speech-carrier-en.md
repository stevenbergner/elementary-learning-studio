# Speech carrier provenance

`speech-carrier-en.wav` is a synthesized spoken “Okay.” used by the opt-in
single-word help. The studio plays it only into the speech recognizer's input,
never to the speakers. Regenerate it with `scripts/generate_speech_carrier.py`.

- Engine: [piper-tts](https://github.com/OHF-Voice/piper1-gpl) 1.8.0
  (GPL-3.0-or-later). The GPL does not cover a program's output that is not
  copied from the program; this audio is synthesized from the text above.
- Voice: [rhasspy/piper-voices](https://huggingface.co/rhasspy/piper-voices) `en_US-ljspeech-high`
  (MIT) at revision `c10ece1aade47bb51c153c893d14e5bf8e5b7117`.
  - `en_US-ljspeech-high.onnx` sha256 `5d4f08ba6a2a48c44592eed3ce56bf85e9de3dd4e20df90541ae68a8310c029a`
  - `en_US-ljspeech-high.onnx.json` sha256 `7e1f4634af596d83cca997fb7a931ba80b70f8a316a2655ee69c55365e0ace14`
- Voice training data: [LJ Speech](https://keithito.com/LJ-Speech-Dataset/),
  public-domain LibriVox recordings of public-domain texts.
- Synthesis: `--noise-scale 0 --noise-w-scale 0 --length-scale 1.0`; then trimmed, normalized to -3 dBFS peak, and
  given 8 ms fades. 22050 Hz, 16-bit mono, 599 ms.
- Output sha256: `689ae59b18baf7f1d188c8fdf76bdab25e92880a4883306d5e9e28069d1fe041`
- Generated: 2026-10-05

This audio file is part of the studio's educational content and is licensed
under CC BY 4.0 (see `CONTENT_LICENSE.md`).

macOS system voices are deliberately not used: section 2F of Apple's published
macOS Sequoia agreement limits their output to personal, non-commercial use and
forbids publishing it:
https://www.apple.com/legal/sla/docs/macOSSequoia.pdf
