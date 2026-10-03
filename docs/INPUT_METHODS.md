# Input methods and privacy

Checked 2026-10-02.

The browser activity keeps its essential path deliberately small: keyboard and touch are the dependable inputs. Optional methods must remain user-initiated, clearly visible, reversible, and scoped to the current exercise.

## Voice input

Voice is a separate answer mode beside the activity, not a primary answer button. Keyboard and touch remain the obvious default. The learner must start voice explicitly and can stop it at any time; it also stops when the page is hidden or the set is completed.

The panel remains visible in unsupported browsers, but its button is disabled and its status explains that the browser does not provide speech recognition. This prevents a partial or absent implementation—such as standard Firefox releases—from looking as though it accepted a click.

The vocabulary is intentionally closed:

- a spoken number fills the current answer field;
- “check” or “enter” checks the answer;
- “next” advances only after a correct answer;
- “stop” turns voice mode off.

Equivalent commands are included for English, French, and German. Voice commands do not navigate away, submit data, modify device settings, or invoke arbitrary actions.

The implementation uses only the browser's Web Speech interface—there is no third-party speech library, model host, or application server. The site does not record, store, or transmit audio itself. When the browser offers an on-device language pack, the site prefers it and sets `processLocally`; in that state the panel explicitly says that audio stays on the device. If a local pack is downloadable, the browser performs and caches that download. The API exposes `downloadable` and `downloading` states but no byte count, so the interface shows honest indeterminate progress rather than inventing a percentage.

When on-device recognition is unavailable but the browser still provides speech recognition, the panel labels the mode “Browser speech service.” In that case the browser—not this site—may use an online service. The UI does not make a local-processing claim in that state.

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
