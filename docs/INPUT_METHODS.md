# Input methods and privacy

Checked 2026-10-02.

The browser activity keeps its essential path deliberately small: keyboard and touch are the dependable inputs. Optional methods must remain user-initiated, clearly visible, reversible, and scoped to the current exercise.

## Voice experiment

The site exposes voice mode only when the browser provides the Web Speech API's `SpeechRecognition` interface. The learner must start it explicitly and can stop it at any time. It stops when the page is hidden or the set is completed.

The vocabulary is intentionally closed:

- a spoken number fills the current answer field;
- “check” or “enter” checks the answer;
- “next” advances only after a correct answer;
- “stop” turns voice mode off.

Equivalent commands are included for English, French, and German. Voice commands do not navigate away, submit data, modify device settings, or invoke arbitrary actions. The site stores no audio. Browser speech recognition may use an online service, so the interface does not claim that recognition is local or private beyond the site's own behavior.

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
- Mistral Voxtral Mini 4B Realtime: <https://docs.mistral.ai/models/voxtral-mini-4b-realtime-2604>
- W3C Pointer Events: <https://www.w3.org/TR/pointerevents3/>
- Wacom Ink SDK for Web: <https://developer-docs.wacom.com/docs/sdk-for-ink/web/overview>
- MyScript iinkJS integration: <https://developer.myscript.com/docs/interactive-ink/4.0/web/overview/integration/>
