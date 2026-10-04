# Input methods and privacy

Checked 2026-10-04.

The browser activity keeps its essential path deliberately small: keyboard and touch are the dependable inputs. Optional methods must remain user-initiated, clearly visible, reversible, and scoped to the current exercise.

## Voice input

Voice is a separate answer mode beside the activity, not a primary answer button. Keyboard and touch remain the obvious default. The learner must start voice explicitly and can stop it at any time; it also stops when the page is hidden or the set is completed.

The panel remains visible in unsupported browsers, but its button is disabled and its status explains that the browser cannot prove local recognition. This prevents a partial, server-backed, or absent implementation from looking as though it accepted a click.

The vocabulary is intentionally closed and commands must match the whole recognized phrase:

- a spoken number fills and checks the current answer field;
- a correct spoken answer advances automatically, including completing question ten;
- “check” or “enter” checks an answer entered by another input method;
- “next” advances only when the current answer is already correct;
- “stop” turns voice mode off.

Equivalent commands and number words are included for English, French, German, and Vietnamese. Voice commands do not navigate away, submit data, modify device settings, or invoke arbitrary actions.

The final browser result can contain several ranked transcript alternatives. The studio resolves them with a deterministic structured grammar rather than an LLM: a valid primary candidate wins; when the primary candidate is unusable, one distinct number or exact command among the remaining alternatives may be selected; conflicting actionable alternatives are rejected and the learner is asked to repeat. The resolver uses interface state to prevent unavailable actions such as advancing an incomplete question. It never consults the correct arithmetic answer while resolving speech, so recognition cannot manufacture a successful response from the answer key. The proposed intent, selected candidate, confidence, and acceptance or rejection remain visible in the local event stream.

The implementation uses the sibling Local Speech Interface (LSI) browser adapter over the browser's Web Speech interface—there is no application speech server and no model shipped by the site. The page never receives an audio stream: the browser captures microphone input and returns recognized text. The site does not record, store, or transmit that text or audio.

LSI also works around a current Firefox streaming edge case in which the decoder can retain the final word until more speech arrives. Because Firefox keeps true word timing inside its inference process, LSI uses an observable, bounded heuristic: it learns the cadence of recent interim results, waits 650–1400 milliseconds after the result stream becomes quiet, gracefully finalizes the browser stream, and immediately opens the next segment. A live Nightly test confirmed that this releases the retained final word with conversational pacing. The developer trace records the selected deadline; it is not represented as native word timing.

The learner-facing indicator follows browser events rather than pretending to be an audio meter: it distinguishes preparation, a started speech session, confirmed audio capture, detected speech, local interpretation, and the off state. The Web Speech interface does not give this page raw audio levels, and the studio deliberately does not open a second `getUserMedia` stream merely to animate a waveform.

An optional developer trace shows interim and final browser text, reported alternatives and confidence when present, the studio's closed-set interpretation, and the resulting action. It is disabled by default, exists only in the current page's memory, stores no audio, and is cleared when disabled or when the page reloads. It is a debugging and accountability aid, not a learner score.

The page also dispatches versioned `local-speech-interface:event` DOM events. These follow the sibling Local Speech Interface v0.1 schema and separate audio state, interim/final recognition, proposed intent, and accepted or rejected action. The static studio vendors the MPL-2.0 browser modules until LSI has a public package release, so it remains independently deployable without duplicating the recognizer lifecycle. The event contract is the interoperability boundary; the studio's deterministic resolver remains application policy rather than recognizer code.

This studio intentionally assumes one learner speaking near the device. Speaker diarization, identity, emotion inference, background-media classification, and open-ended assistant behavior are out of scope here. Those capabilities belong in separate LSI adapters or consumers rather than in the elementary learning surface.

The privacy contract is fail-closed. Before listening, the site requires all three local mechanisms: `SpeechRecognition.processLocally`, `SpeechRecognition.available()`, and `SpeechRecognition.install()`. It sets `processLocally` to true, verifies or installs the browser-managed language pack, and starts only after the browser reports that pack available. It does not fall back to ordinary browser speech, because that path may send audio to a browser vendor's service.

If a local pack is downloadable, the browser asks permission, downloads it, and caches it. That one-time model download is network traffic, but it contains no microphone audio. The API exposes `downloadable` and `downloading` states but no byte count, so the interface shows honest indeterminate progress rather than inventing a percentage.

Mozilla's current model manifest lists French, German, and Vietnamese in the multilingual model's core coverage. A successful transcription can be useful, immediate practice evidence for a language learner. It is not a standardized pronunciation assessment: recognition varies with microphones, noise, age, accent, dialect, disability, and model bias. The studio must not turn “the model transcribed this” into a grade or a claim that one accent is correct.

Desktop Firefox Nightly and Chrome 139 or newer can expose the required local contract. Browser names are not trusted; the runtime capability check is authoritative. Standard Firefox release shipping is still being tracked, and the necessary interface is not currently available in Firefox or Chrome on Android or in Safari. See [Local voice and AI](LOCAL_VOICE_AND_AI.md) for the dated evidence and mobile roadmap.

No speech model is bundled. Mistral documents Voxtral Mini 4B Realtime as a four-billion-parameter model, recommends a vLLM server, and labels its ExecuTorch on-device path untested. That is not a moderate browser download for this project.

## Pen and handwriting

Pointer Events already give the web a common input model for mouse, touch, and pen, including pressure and pointer type. That would make a future ink canvas straightforward, including input from many Wacom devices.

Ink capture is not the difficult part; reliable mathematical handwriting recognition is. Wacom's web tooling focuses on digital ink, while MyScript's iinkJS web integration sends recognition requests to the MyScript Cloud and requires application credentials. The studio will not disguise a remote recognition service as a local feature or maintain home-grown character-recognition code.

Handwriting recognition is therefore deferred until a well-supported, lightweight, privacy-appropriate browser solution is available. Mouse, touch, stylus, and keyboard continue to work through the ordinary controls.

## Webcam and sign language

Webcam gesture or sign-language recognition is out of scope. The site does not request camera access.

## References

- W3C Web Speech API draft: <https://webaudio.github.io/web-speech-api/>
- MDN `SpeechRecognition`: <https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition>
- MDN `SpeechRecognition.available()`: <https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition/available_static>
- MDN `SpeechRecognition.install()`: <https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition/install_static>
- MDN `SpeechRecognition.processLocally`: <https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition/processLocally>
- Mistral Voxtral Mini 4B Realtime: <https://docs.mistral.ai/models/voxtral-mini-4b-realtime-2604>
- W3C Pointer Events: <https://www.w3.org/TR/pointerevents3/>
- Wacom Ink SDK for Web: <https://developer-docs.wacom.com/docs/sdk-for-ink/web/overview>
- MyScript iinkJS integration: <https://developer.myscript.com/docs/interactive-ink/4.0/web/overview/integration/>
