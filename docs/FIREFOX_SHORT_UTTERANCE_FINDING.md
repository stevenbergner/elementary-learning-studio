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


## Update, October 5, 2026: root cause and an opt-in fix

### Root cause in Firefox's source

Reading Firefox's on-device recognition code (`SpeechRecognitionParent.cpp`,
`SpeechRecognitionBackend.cpp`, `models.yaml`) explains the finding above:

- English uses `realtime_eou_120m-v1`, a streaming transducer with an
  end-of-utterance (`<EOU>`) token. Committed words go out as interim results;
  a final result is emitted only at `<EOU>`.
- Firefox's own comment on `media.webspeech.recognition.endpoint_blank_ms`
  says a transducer withholds an utterance's trailing word until the next one
  starts. The blank-run fallback that would release it applies only to models
  without `<EOU>`, so not to English.
- A lone word is that trailing word. If the model emits no `<EOU>` after it, the
  page sees nothing until later speech commits it.
- `soundstart`/`soundend` come from a generic audibility monitor, which room
  noise keeps open.
- Phrase hints (`SpeechRecognitionPhrase`) reach the recognition process but
  are not used by the engine.

The full read, with upstream suggestions, is in LSI's
`docs/FIREFOX_ENDPOINTING_SOURCE_READ_2026_10_05.md`.

### Measurements against the real recognizer

Setup:
- Firefox Nightly 159, headless, in a scratch profile with the English model.
- Synthetic macOS-voice fixtures played through a real `MediaStreamTrack`.
- An optional brown-noise bed at about −45 dBFS standing in for room noise.
- Driven over WebDriver BiDi; no microphone, and nothing leaves the machine.

| Condition | Result |
| --- | --- |
| Lone words, no stop, noise bed | no interim text for any lone word; 13/18 finalized, mostly late |
| `stop()` 250, 450, or 800 ms after the word | mostly `nomatch` at every delay |
| Spoken “okay” played into the recognizer 250 ms after the word | 12/12 words committed, median 766 ms |
| Hum, noise burst, or tone instead of speech | no improvement |
| Full LSI pipeline without the carrier, noise bed | 4/14 single words and phrases |
| Full LSI pipeline with the carrier (final design), noise bed | single words and phrases 21/21; two words 0.6–1.2 s apart 6/6 |
| Same, clean silence | single words and phrases 20/21; two words 0.6–1.2 s apart 6/6 |
| Stress cases, both conditions | two words 0.35 s apart 3/6; three words 0.9 s apart 4/6 |

With the carrier, the median time from the end of a word to its final text was
about 0.8 s (p90 about 1.0 s).

The remaining failures are at the edge of the recognizer:
- In one traced three-word failure, the model never decoded the middle word.
- With a 0.35-second gap, the next word can start while the carrier is still
  playing.

### What ELS now does

- Accepts reviewed English homophones (“for” 4, “to”/“too” 2, “ate” 8, “won”
  1) as a whole utterance or inside a number phrase, never from the end of
  prose. The lab's “The answer is four.” was transcribed “the answer is for”.
- Offers **Help Firefox finish single words** (English, opt-in, off by
  default) in the folded voice options; see
  [Input methods and privacy](INPUT_METHODS.md#opt-in-single-word-help). The
  page opens the microphone itself, detects the end of speech by loudness only,
  and plays a built-in spoken “okay” into the recognizer, never the speakers.
  LSI delivers the released word without stopping the recognizer and removes
  the carrier from the text.
- Reports phrase hints in the trace as passed to the browser, not applied.

### Still open

- Testing with real children's voices and microphones.
- Which carrier recording may ship with the public site. It is generated
  locally by `scripts/generate_speech_carrier.sh` and is not committed; without
  it the option reports itself unavailable.
- Upstream: release the trailing word after a blank run for `<EOU>` models too,
  feed already-captured audio before finalizing on `stop()`, wire the bundled
  voice-activity detector to `speechstart`/`speechend`, and use or refuse
  phrase hints.
