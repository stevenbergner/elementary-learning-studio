# Local voice and AI: evidence, limits, and a development roadmap

Checked 2026-10-04. Browser and model support is moving quickly; links below are the authority when this document and current software disagree.

## Product decision

Elementary Learning Studio treats privacy as an executable requirement:

1. voice is optional and learner-initiated;
2. the browser must expose `processLocally`, `available()`, and `install()`;
3. the selected language pack must be confirmed available before listening;
4. the recognition object is always configured with `processLocally = true`;
5. failure at any step leaves voice off rather than selecting a remote recognizer;
6. keyboard and touch remain the complete, dependable path.

This establishes a narrow, testable claim: microphone recognition produces no external request containing microphone audio. It does **not** mean that the whole browser is offline. Initial page loading, updates, an explicitly approved model download, and links followed by the user are ordinary network activity.

## What Mozilla currently implements

Firefox runs speech recognition in `HWInference`, a sandboxed native utility process outside both web-content processes and the main browser process. The content page does not get a microphone stream; it gets recognition events containing text. Firefox uses `parakeet.cpp` over `libggml`. The CPU path is cross-platform, while the current accelerated path is Metal on macOS. Vulkan acceleration for Windows, Linux, and Android is identified as later work.

Three independent gates protect the feature: the page's Permissions Policy, the user's Firefox AI control, and a non-persistent browser permission for each model-install transaction. `start()` never downloads a model; only `install()` can do that.

Current model routing is deliberately simple:

| Request | Current Firefox model | Approximate download |
| --- | --- | ---: |
| English | Parakeet Realtime EOU 120M, Q5_K | 141 MB |
| French, German, Vietnamese and other listed languages | Nemotron 3.5 ASR Streaming 0.6B, Q5_K | 785 MB |

The multilingual model manifest puts `fr-FR`, `de-DE`, and `vi-VN` in the upstream model card's core group. The same manifest accepts a broader collection of locales, but accepted does not mean equally accurate for every voice and environment.

Firefox Nightly has the desktop feature enabled. Shipping through ordinary desktop Firefox is still tracked separately. Firefox Android's web-facing implementation bug remains open.

Primary sources:

- [Gecko speech-recognition architecture](https://firefox-source-docs.mozilla.org/media/SpeechRecognition.html)
- [HWInference architecture](https://firefox-source-docs.mozilla.org/toolkit/components/ml/HWInference.html)
- [Current Firefox speech-model manifest](https://searchfox.org/firefox-main/source/dom/media/webspeech/recognition/models.yaml)
- [Desktop release tracking](https://bugzilla.mozilla.org/show_bug.cgi?id=2072585)
- [Android tracking](https://bugzilla.mozilla.org/show_bug.cgi?id=1244242)

## Chrome is compatible only in its local mode

Chrome has long exposed a prefixed Web Speech implementation whose recognition may use a server. That legacy presence is not sufficient for this project's privacy claim.

MDN browser-compatibility data records `processLocally` and the local availability/install options in desktop Chrome from version 139, but not Chrome Android. The studio therefore checks the local methods and pack status rather than treating `webkitSpeechRecognition` or a Chrome user agent as proof of privacy.

This gives Firefox Nightly and current desktop Chrome the same learner-facing experience when each browser satisfies the standard local contract. The engines, models, download prompts, and browser-level controls remain the responsibility of Mozilla and Google respectively.

Sources:

- [MDN on-device Web Speech guide](https://developer.mozilla.org/en-US/docs/Web/API/Web_Speech_API/Using_the_Web_Speech_API)
- [MDN `processLocally`](https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition/processLocally)
- [MDN-maintained browser compatibility data](https://github.com/mdn/browser-compat-data/blob/main/api/SpeechRecognition.json)
- [MDN warning about server-backed recognition](https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition)

## Language learning: useful evidence, not automated judgment

Recognition makes a compelling low-stakes loop: the learner sees a number or phrase, says it, and sees what the local model heard. A correct transcription is tangible evidence that this model understood this attempt under these conditions. Repeated attempts can build fluency and confidence.

It is not a pronunciation score. Automatic speech recognition optimizes transcription, not phonetic instruction. It can accept a broad range of pronunciations, reject a perfectly understandable speaker, or make errors associated with age, dialect, accent, disability, microphone quality, and noise. A responsible activity should:

- show the transcript and let the learner decide whether it matches;
- allow replay/retry without penalty;
- never rank accents or treat one dialect as inherently correct;
- avoid storing audio by default;
- keep teacher or family interpretation above an opaque score;
- validate any future phoneme-level feedback independently across the intended learner populations.

The current number activity is therefore an interaction and confidence scaffold. A later language curriculum should add original prompts, explicit learning goals, and human-reviewable artifacts before making stronger claims.

## Vulkan and local transformer models on phones

Vulkan is a portable GPU compute and graphics interface. It does not itself run a transformer. An inference runtime must translate operations such as matrix multiplication, attention, quantization, and memory transfers into Vulkan compute kernels, manage device buffers, and fall back safely when a driver or operation is unsupported.

For Firefox speech, `libggml` is the numerical layer under `parakeet.cpp`; Mozilla has integrated Metal and describes Vulkan as a second-stage backend. CPU recognition already works across platforms. The remaining Android product work is larger than “turn on Vulkan”: sandboxing, GeckoView lifecycle, model delivery and permission UX, device capability policy, thermals, memory pressure, microphone lifecycle, tests, and web-platform behavior all matter.

The same constraints become sharper for a generative model:

- a 2.5-billion-parameter model quantized to four bits has roughly 1.25 GB of weight payload before metadata, runtime workspaces, activations, and the key/value cache;
- a 16K or 32K context can consume substantial additional memory and bandwidth, depending on the architecture;
- sustained token generation can heat a phone and compete with the browser or operating system for memory;
- model download size and first-use experience exclude users just as surely as CPU requirements;
- “works on a flagship” is not evidence of broad access.

The proposed 2–2.5B range is plausible for newer phones, but it should be a high capability tier rather than the universal baseline. A mass-access design should benchmark at least one much smaller tier and progressively enhance. The curriculum layer should also use deterministic code for arithmetic, policy, storage, and safety boundaries; a language model should interpret or explain within those boundaries, not become the operating system of record.

Gemma 3n is a particularly relevant research target. Its E2B variant uses parameter skipping and per-layer embedding caching to operate with an effective 1.91B parameter load, supports 32K input context, and was designed for phones, laptops, and tablets. Google notes that a standard E2B execution loads more than five billion parameters, so the special runtime behavior is essential rather than decorative. Gemma 3n is open-weight, not an implementation of the Web Speech API.

Android offers several distinct routes:

- Gemini Nano through the device-managed AICore/ML Kit prompt APIs: local and convenient, but limited to supported devices and Google's model/runtime contract;
- Gemma through LiteRT-LM or MediaPipe: application-managed open weights with Android and iOS paths;
- `llama.cpp`/GGUF: highly inspectable and portable, with an Android binding and CPU acceleration; long contexts must be chosen cautiously because memory can cause process termination;
- a future Firefox/Gecko route: attractive for open-web distribution, but neither Web Speech on Android nor a general web-page LLM interface is ready today.

Sources:

- [Gemma 3n overview](https://ai.google.dev/gemma/docs/gemma-3n)
- [Gemma 3n model card](https://ai.google.dev/gemma/docs/gemma-3n/model_card)
- [Gemma mobile deployment](https://ai.google.dev/gemma/docs/integrations/mobile)
- [Android Gemini Nano](https://developer.android.com/ai/gemini-nano)
- [`llama.cpp` Android documentation](https://github.com/ggml-org/llama.cpp/blob/master/docs/android.md)

## Mozilla's local-AI work and the Mistral relationship

Mozilla has two relevant but separate local inference paths:

- `HWInference`, currently used by on-device speech recognition, runs native `parakeet.cpp`/`libggml` in a tightly sandboxed utility process;
- the Firefox AI Runtime supports Transformers.js over native ONNX Runtime, a native `llama.cpp` backend, and an OpenAI-compatible backend. Mozilla has previewed access for Firefox extensions; this is not a general web-page API.

Mozilla is not training the current speech models from scratch. Firefox integrates NVIDIA's Parakeet/Nemotron artifacts through an open native runtime and browser-controlled model delivery. Bugzilla records Paul Adenot as managing the on-device Web Speech implementation. Broader runtime work is publicly described by Mozilla engineers including Tarek Ziadé, Paul Adenot, and Serge Guelton.

Mozilla and Mistral **do** now have an announced partnership. In September 2026 Mozilla said Mistral Small 4 would become a recommended model in Firefox Smart Window beta, with multilingual expansion and continued provider choice. That product partnership is not the speech recognizer, not evidence that microphone audio goes to Mistral, and not currently a local mobile model platform for this studio.

Sources:

- [Firefox AI Runtime architecture](https://firefox-source-docs.mozilla.org/toolkit/components/ml/architecture.html)
- [Running inference in Firefox web extensions](https://blog.mozilla.org/en/firefox/firefox-ai/running-inference-in-web-extensions/)
- [Speeding up Firefox Local AI Runtime](https://blog.mozilla.org/en/firefox/firefox-ai/speeding-up-firefox-local-ai-runtime/)
- [On-device Web Speech implementation bug](https://bugzilla.mozilla.org/show_bug.cgi?id=1940906)
- [Mozilla and Mistral partnership](https://blog.mozilla.org/en/firefox/mozilla-mistral-partnership/)

## A substantive contribution path

The credible route to Mozilla contribution is narrower than announcing a role and stronger than waiting for a job title:

1. Exercise the current Nightly implementation on macOS with English, French, German, and Vietnamese; publish reproducible results without recordings or personal data.
2. Turn failures into minimal test cases and Bugzilla reports in Core :: Web Speech.
3. Read the Android tracking bug and its dependencies, then ask the current owners where an external contribution would be useful before beginning a large port.
4. Build Firefox locally and land a small test, diagnostic, documentation, or lifecycle fix through Bugzilla and Phabricator.
5. Benchmark CPU and proposed Vulkan paths on at least one mid-range Android device, measuring real-time factor, peak resident memory, model-load time, battery/thermal behavior, and transcription quality by language.
6. Keep patches reviewable and upstream-facing; use this studio as an independent integration test and public demonstration, not as a private fork that silently diverges.

Mozilla's contribution documentation explicitly recommends coordinating on an existing unassigned bug, attaching tested patches, and using Phabricator review. The Firefox AI team also invites discussion in its public `#firefox-ai` channel.

- [Firefox contributor quick reference](https://firefox-source-docs.mozilla.org/contributing/contribution_quickref.html)
- [How to submit a patch](https://firefox-source-docs.mozilla.org/contributing/how_to_submit_a_patch.html)

## Repository roadmap

### Now: desktop local voice

- Keep speech fail-closed and capability-detected.
- Test real Nightly model installation and microphone lifecycle on macOS.
- Consume Local Speech Interface for adaptive final-word flushing and observable recognition events.
- Add browser tests for unavailable, downloadable, installed, denied, and unsupported-language states.
- Collect voluntary, non-audio test notes for each language and environment.

Elementary Learning Studio stops at the single-speaker boundary. Diarization,
prosody, ambient-source analysis, and general language-model orchestration are
LSI research or separate application concerns, not additions to the elementary
learner interface.

### Next: language-learning prototype

- Add small, original listen/say/compare activities rather than repurposing arithmetic alone.
- Show recognized text and learner-controlled retry history locally.
- Define evidence and fairness criteria before adding any pronunciation guidance.
- Export artifacts chosen by the learner without background synchronization.

### Research: local educational language model

- Start on Apple Silicon with a small open-weight model and a strict, inspectable tool interface.
- Benchmark a 0.5–1.5B baseline and a roughly 2B enhanced tier before committing to a model family.
- Treat 4K as the first mobile context target; justify longer contexts with measured learning tasks rather than headline capacity.
- Move to an Android native test harness for device coverage while monitoring Mozilla's open-web path.
- Store curriculum rules and learner profiles as explicit local data, not hidden prompt state; use prompts to adapt presentation, not to erase governance.

This sequence produces evidence: a working private speech surface, transparent browser behavior, multilingual learning experiments, device measurements, and upstream contributions. Those artifacts are the substance behind any later claim of senior technical leadership.
