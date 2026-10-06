# Input methods and privacy

Checked 2026-10-04.

The browser activity keeps its essential path deliberately small: keyboard and touch are the dependable inputs. Optional methods must remain user-initiated, clearly visible, reversible, and scoped to the current exercise.

## Voice input

Voice is an optional page-wide input facility, not a property of one exercise and not a primary answer button. Keyboard and touch remain complete without it. The learner must start voice explicitly and can stop it at any time; it stays available while moving among supported activities and stops when the page is hidden.

Once activated, a persistent bottom status strip remains visible while the setup panel scrolls away. It shows the current answer target, interim or final browser text, and the application outcome. The microphone animation alone means only that speech evidence is arriving; the text and outcome distinguish recognition from acceptance. The full in-memory developer trace remains optional.

The panel remains visible in unsupported browsers, but its button is disabled and its status explains that the browser cannot prove local recognition. This prevents a partial, server-backed, or absent implementation from looking as though it accepted a click.

The vocabulary is intentionally closed and commands must match the whole recognized phrase:

- a spoken number fills the current answer field and waits for “check” or “done” by default;
- optional immediate-checking mode checks each spoken number and advances automatically after a correct answer, including completing question ten;
- “check” or “enter” checks an answer entered by another input method;
- “next” advances only when the current answer is already correct;
- “stop” turns voice mode off.

Equivalent commands and number words are included for English, French, German, and Vietnamese. Narrow variants include “done”/“I’m done,” “go on”/“next question,” French “j’ai fini”/“question suivante,” German “fertig”/“nächste Frage,” and Vietnamese “xong rồi”/“câu tiếp theo.” Checking phrases submit only the current answer; continuation phrases remain unavailable until that answer is correct. Voice commands do not navigate away, submit data outside the exercise, modify device settings, or invoke arbitrary actions.

A number may be spoken alone or inside one reviewed answer frame: “the answer is …,” “la réponse est …,” “die Antwort ist …,” or “câu trả lời là ….” These frames remain exact and deterministic; arbitrary surrounding prose is rejected. This also accommodates a multilingual recognizer that transcribes spoken number words as digits—for example, the locally observed German sentence “Die Antwort ist zweiundvierzig” becoming “Die Antwort ist 42”—without treating open-ended language as an instruction.

The final browser result can contain several ranked transcript alternatives. The studio resolves them with LSI's deterministic domain grammar rather than an LLM. Integer phrases are generated from canonical values for each selected locale, compiled into collision-checked lookup tables, and exhaustively round-tripped from 0–999. A valid primary candidate wins; when the primary candidate is unusable, alternatives such as “forty-two,” “42,” and “the answer is forty two” collapse to the same canonical meaning. Conflicting meanings are rejected and the learner is asked to repeat.

Recognition and permission are distinct. The parser can report `answer.number(42)` even when the answer field is disabled; application policy then rejects that recognized meaning as unavailable in the current state. Likewise, “next” remains a recognized command when a question is incomplete but cannot act. The resolver never consults the correct arithmetic answer while interpreting speech, so recognition cannot manufacture a successful response from the answer key. The proposed meaning, selected evidence, current permission, and acceptance or rejection remain visible in the local event stream.

The 4×4 number grid makes the answer target explicit. Hovering an editable cell with a mouse, focusing it with the keyboard, or selecting it by touch highlights that cell and updates the visible speech-target label. One finalized spoken number fills one highlighted cell. The activity policy permits only 1–4, never changes fixed clues, and routes “check” or “done” to whole-grid validation. It does not interpret a stream such as “one two three four” as four separate DOM actions; that would require a separately designed and observable multi-action policy.

The implementation uses the sibling Local Speech Interface (LSI) browser adapter over the browser's Web Speech interface—there is no application speech server and no model shipped by the site. By default the page never receives an audio stream: the browser captures microphone input and returns recognized text. Only the opt-in single-word help described below routes the microphone through the page. The site does not record, store, or transmit that text or audio.

LSI also has an optional native `parakeet.cpp` adapter for file-based development work. Its multilingual `nvidia/parakeet-tdt-0.6b-v3` manifests bind a requested run to exact model bytes, quantization, language scope, and tokenizer identity before inference. That roughly 600-million-parameter model is not downloaded or bundled by this studio, and its model card does not include Vietnamese. The learning site therefore continues to use the browser's installed local language pack; it receives the browser's declared capabilities and requested locale rather than pretending to know the browser's hidden checkpoint or detected language.

LSI also works around a current Firefox streaming edge case in which the decoder can retain the final word until more speech arrives. Because Firefox keeps true word timing inside its inference process, LSI uses an observable, bounded heuristic: it learns the cadence of recent interim results, waits 650–1400 milliseconds after the result stream becomes quiet, gracefully finalizes the browser stream, and immediately opens the next segment. ELS shortens that boundary to 500 milliseconds while the complete interim text is already one exact reviewed command. If Firefox still withholds final text, LSI's stable-interim helper lets ELS commit that unchanged, allow-listed command at the same boundary. Any continuation such as “next okay” cancels the pending command; repeated identical evidence such as “next next” retains one idempotent meaning without restarting the clock. A later browser-final result for that utterance is displayed but cannot run the action twice. The developer trace records the baseline deadline, the selected deadline, stable-interim commits, and duplicate suppression; none is represented as native word timing. This stop-based heuristic helps when Firefox has already shown interim text; it cannot release a lone word that produced none (see [Opt-in single-word help](#opt-in-single-word-help)).

Finalized speech may contain more than a bare answer. For answer values only, ELS asks the generated integer domain for its longest valid trailing surface, so “I read nine plus six and I think the answer is fifteen” yields `15`. The evidence records both the matched suffix and the discarded prefix. It does not search for numbers in the middle of an utterance, and it does not apply suffix extraction to commands: “next,” “check,” and “stop” remain exact reviewed command surfaces. Consecutive repetitions of the same complete command collapse to one idempotent command, while mixed commands and surrounding prose remain rejected. This adds conversational tolerance without introducing an open-ended language-model decision.

“Next” composes existing application events. If an answer is present, it invokes the same check path as the **Check my answer** button. A correct result then schedules the existing next-question transition; an incorrect result shows the ordinary feedback and stays on the question. If no answer is present, “next” is rejected. No separate navigation authority bypasses the exercise state.

Number-grid direction words compose the grid's selection operation in the same way. A fully recognized sequence such as “up, up, left,” “en haut puis à gauche,” “nach oben und links,” or the reviewed Vietnamese equivalents becomes an ordered list of reversible moves. Every clause must belong to the closed direction grammar; otherwise none of the sequence runs. Movement skips fixed clues and stops at grid boundaries. It is authorized only while a blank grid cell is the active target.

Click, touch, and keyboard focus are the standard ways to select a grid cell. Merely hovering does not retarget an answer by default. An experimental **Let the number-grid target follow the mouse** checkbox is available under the folded voice options for users who explicitly prefer point-and-speak behavior; it does not affect touch or keyboard interaction.

When the page becomes hidden, the published studio still closes microphone capture immediately and does not restart it in the background. That lifecycle stop is graceful rather than an abort: Firefox may finish the interim words it already received, so switching applications just after speaking does not deliberately discard the pending answer. An explicit learner stop remains an immediate abort. On loopback development hosts only, the developer trace exposes a remembered opt-in switch that can retain the already-local voice session while the tab is in the background. The switch is not shown on the published site and does not weaken its default.

The learner-facing indicator follows browser events rather than pretending to be an audio meter: it distinguishes preparation, a started speech session, confirmed audio capture, detected sound, local interpretation, and the off state. The Web Speech interface does not give this page raw audio levels, and the studio deliberately does not open a second `getUserMedia` stream merely to animate a waveform. The opt-in single-word help opens one only to find the end of speech.

Firefox's current on-device backend does not dispatch `speechstart` and `speechend`, even though those DOM callbacks exist. It does dispatch `soundstart` and `soundend`. LSI therefore assigns utterance identity at the sound boundary and asks Firefox to finalize synchronously at `soundend`. This can drain a short command that reached the decoder, but it cannot reconstruct a word when Firefox returns `nomatch` without any interim or final text. Firefox derives `soundstart`/`soundend` from a generic audibility monitor rather than a voice detector, so ordinary room noise can keep the sound region open for a whole session.

An optional developer trace shows sound lifecycle, interim and final browser text, reported alternatives and confidence when present, the studio's closed-set interpretation, and the resulting action. It is disabled by default on the published site but enabled by default on loopback development hosts; that checkbox preference survives reloads within the tab. Event contents still exist only in the current page's memory, store no audio, and are cleared by the explicit clear control or a page reload. Final results start a new logical utterance even when Firefox keeps one broad sound region open, so repeated one-word attempts are counted separately. It is a debugging and accountability aid, not a learner score.

ELS supplies the browser with locale-specific contextual hints for its reviewed command vocabulary through the standard `SpeechRecognitionPhrase` interface, with the strongest boost on navigation phrases. As of October 2026, Firefox accepts these phrases and forwards their text to its recognition process, but its on-device engine does not use them, and the boost values are not forwarded. The trace therefore reports hints as passed to the browser, not applied. ELS keeps sending them so that a browser that implements biasing can use them, but the studio does not depend on them. Closed-domain matching in ELS does the work hints cannot: reviewed English homophones such as “for” (4), “to”/“too” (2), “ate” (8), and “won” (1) are accepted as a whole utterance or inside a number phrase such as “the answer is for”, never from the end of ordinary prose.

### Opt-in single-word help

Firefox's English on-device model is a streaming transducer with an end-of-utterance token. Firefox's source documents that such a transducer holds back an utterance's last word until the next word starts, and for this model the only other release is that end-of-utterance token, which a short isolated word often does not receive. A lone “four” is both the first and the last word: no interim text appears, and nothing is finalized until the learner says something else. Stopping the recognizer does not reliably release it: in a real-recognizer fixture lab under a −45 dBFS noise bed, stopping 250–800 ms after the word still produced `nomatch` for most lone words.

The folded voice options include **Help Firefox finish single words** (English only; off by default on the published site, on by default on loopback development hosts, and remembered for the tab). When enabled, ELS asks LSI to open the microphone through Web Audio and route it to the recognizer. LSI measures only loudness, as decibel levels computed from short blocks and never stored, to notice when the learner has been quiet for 300 ms. If Firefox has produced no final text for that speech, LSI plays a short built-in spoken “okay” into the recognizer's input only: not to the speakers, and not into the loudness analyser. The carrier starts a next word, so Firefox commits the learner's word. Because the carrier was added only after silence, that first committed text is a complete turn: LSI delivers it as final text without stopping the recognizer (a stop would drop a quick follow-up word), and removes the carrier's “ok”/“okay” and the already delivered words from Firefox's later results. The developer trace records each carrier, the raw browser text, and what was removed. A non-speech carrier (hum, noise burst, or tone) did not work in the lab; it must be speech.

Limitations: English only (the multilingual model ends an utterance after 800 ms of blank output and does not need a carrier). The carrier is a 0.6-second “okay” synthesized with Piper (GPL engine; MIT voice trained on the public-domain LJ Speech dataset) by `scripts/generate_speech_carrier.py`, which pins the voice by checksum and writes a [provenance record](../site/audio/speech-carrier-en.md). macOS system voices are not used, because Apple's license forbids publishing their output. A learner who resumes speaking while the roughly 0.4-second carrier plays can overlap it. While the option is on, the page itself receives the microphone stream for the session. The evidence comes from synthetic voices on one machine. The strong results used the same synthetic voice for the word and the carrier; with words from three other voices the benefit was small or absent (see the finding below). Whether the option helps a real speaker, child or adult, is still untested. See [Firefox Nightly short-utterance finding](FIREFOX_SHORT_UTTERANCE_FINDING.md) for the measurements.

The deterministic Playwright tests use a fake `SpeechRecognition` object to test event wiring, parsing, permissions, and UI actions. They now reproduce Firefox's sound-only `nomatch` lifecycle, but they do not claim to test an acoustic model. LSI separately supplies a real-fixture lab that passes a locally generated WAV through a genuine `MediaStreamTrack` into Firefox Nightly. On the current test machine, one-word “next” finalized correctly while one-word “four” returned `nomatch`; the longer phrase produced text. This matches the human microphone trace and locates that failure below the studio parser.

The page also dispatches versioned `local-speech-interface:event` DOM events. These follow the sibling Local Speech Interface v0.1 schema and separate audio state, interim/final recognition, proposed intent, and accepted or rejected action. The static studio vendors the MPL-2.0 browser modules until LSI has a public package release, so it remains independently deployable without duplicating the recognizer lifecycle. The event contract is the interoperability boundary; the studio's deterministic resolver remains application policy rather than recognizer code.

This studio intentionally assumes one learner speaking near the device. Speaker diarization, identity, emotion inference, background-media classification, and open-ended assistant behavior are out of scope here. Those capabilities belong in separate LSI adapters or consumers rather than in the elementary learning surface.

The privacy contract is fail-closed. Before listening, the site requires all three local mechanisms: `SpeechRecognition.processLocally`, `SpeechRecognition.available()`, and `SpeechRecognition.install()`. It sets `processLocally` to true, verifies or installs the browser-managed language pack, and starts only after the browser reports that pack available. It does not fall back to ordinary browser speech, because that path may send audio to a browser vendor's service.

If a local pack is downloadable, the browser asks permission, downloads it, and caches it. That one-time model download is network traffic, but it contains no microphone audio. The API exposes `downloadable` and `downloading` states but no byte count, so the interface shows honest indeterminate progress rather than inventing a percentage.

Mozilla's current model manifest lists French, German, and Vietnamese in the multilingual model's core coverage. A successful transcription can be useful, immediate practice evidence for a language learner. It is not a standardized pronunciation assessment: recognition varies with microphones, noise, age, accent, dialect, disability, and model bias. The studio must not turn “the model transcribed this” into a grade or a claim that one accent is correct.

Curated language sheets use the same separation. A prompt declares semantic answers and reviewed spoken surfaces before a learner session. Offline synthetic or consented human fixtures may produce model-identified transcription receipts during authoring, but those receipts are evidence about a test matrix—not additional answers and not proof of pronunciation quality. See [Curated spoken-language exercises](LANGUAGE_EXERCISE_AUTHORING.md).

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
