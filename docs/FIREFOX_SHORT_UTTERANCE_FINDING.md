# Firefox Nightly short-utterance finding

Status: reproducible experimental limitation, observed October 5, 2026

Elementary Learning Studio uses Firefox Nightly's experimental on-device Web
Speech implementation. Number entry is already useful, but isolated one-word
turns such as `four`, `next`, or `check` can remain inside the recognizer without
producing any page-visible text or end-of-speech event. A later, longer turn may
then cause the retained word to appear as part of a combined transcript.

This is not an intent-matching or page-rendering delay. When the failure occurs,
the page receives no recognition result on which its bounded finalization logic
could act.

## What the local trace established

The developer trace records lifecycle and text events only; it records no audio
and uploads nothing. In the captured session:

- Firefox emitted one `sound-started` event and left that region open across
  multiple spoken turns;
- short turns sometimes produced no interim result, final result,
  `speechstart`, or `speechend` event;
- a later turn exposed retained text, including a retry sequence rendered as
  `next to the next`;
- once final text reached the page, ELS resolved the permitted intent in less
  than one millisecond;
- graceful stop/restart cycles introduced measured capture gaps of about
  190–201 milliseconds.

The raw diagnostic is intentionally not committed because it contains a user's
spoken text. Contributors can create and explicitly save their own local trace
from **Developer voice trace** when serving the site from `127.0.0.1`.

## Why another JavaScript text timer is insufficient

ELS already shortens the quiet deadline when the complete interim transcript is
an exact allow-listed command. That helps only after Firefox has emitted an
interim result. A timer cannot detect or finalize a turn that produces no DOM
event at all.

Treating combined retry text as a new command surface would encode a symptom
and could make ordinary speech navigate the exercise. Blindly restarting the
recognizer on a fixed interval would also create recurring microphone gaps.

## Upstream boundary

Mozilla's current speech-recognition architecture documents the same missing
boundary: content-side `speechstart` and `speechend` callbacks exist, but the
on-device parent does not yet call them. The document also notes that a Silero
voice-activity-detection model is available but not wired into the speech
pipeline. At the lower layer, `parakeet.cpp` returns committed text together
with EOU/EOB (end-of-utterance/end-of-backchannel) information.

Primary references:

- [Firefox on-device SpeechRecognition architecture](https://github.com/mozilla-firefox/firefox/blob/main/dom/media/docs/SpeechRecognition.md)
- [Firefox on-device Web Speech tracking bug](https://bugzilla.mozilla.org/show_bug.cgi?id=1940906)
- [parakeet.cpp streaming event behavior](https://github.com/mudler/parakeet.cpp/blob/master/docs/parity.md)

## Product boundary and next experiment

Keyboard, touch, printable practice, and ordinary number entry remain the
dependable product path. Voice remains optional and experimental.

The next useful application-level experiment belongs in the Local Speech
Interface layer, not in ELS's command grammar:

1. observe microphone activity locally without recording or retaining audio;
2. derive an explicit speech-start/silence boundary;
3. request graceful recognition finalization after a bounded silence;
4. restart capture and measure the resulting gap;
5. test isolated number and command turns before integrating the adapter into
   the learner-facing site;
6. preserve the separation between recognized evidence, proposed intent, and
   authorized action.

Such a fallback must be visibly optional, local-only, independently testable,
and honest about the fact that the page is examining an audio activity signal.
The preferable long-term solution is upstream: Firefox should surface the
recognizer's reliable utterance boundary so every site does not need to invent
one.

