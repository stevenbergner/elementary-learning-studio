# Sources and scope

Checked 2026-10-02.

## Worksheet-format references

- Math-Drills addition worksheets: <https://math-drills.com/addition.php>
- Five Minute Adding Frenzy, addends 1-10: <https://math-drills.com/addition/addition_five_minute_frenzy1_0110_001.php>
- Math-Drills subtraction worksheets: <https://math-drills.com/subtraction.php>
- Math-Drills multiplication worksheets: <https://math-drills.com/multiplication.php>
- Five Minute Multiplying Frenzy, factors 2-12: <https://math-drills.com/multiplication/multiplication_five_minute_frenzy_right1_0212_001.php>
- Digital multiplication example: <https://5minutefrenzy.com/multiplication-game>

Math-Drills describes Five Minute Frenzy addition and multiplication charts as 10 x 10 grids. Its subtraction page documents three bands:

- minuends 9-18, subtrahends 0-9;
- minuends 29-38, subtrahends 10-19;
- minuends 41-50, subtrahends 16-25.

This project implements familiar arithmetic-grid mechanics independently. It does not copy source worksheets, branding, answer keys, exact shuffled sequences, illustrations, or learner-facing wording. “Five Minute Frenzy” appears only here as a descriptive research reference; the generated pack and public site use original titles and presentation and are not affiliated with the referenced sites.

## Copyright boundary

Mathematical facts, operations, and general teaching methods are used as ideas; the project's wording, problem selection, sequencing, code, visual system, and layouts are independently created. Do not add scans, transcriptions, proprietary problem sequences, or close visual imitations from books or commercial worksheet sites. A book may inform broad subject exploration, but any resulting activity must be expressed, illustrated, and sequenced independently and cited here when relevant.

## Curriculum references

- BC Mathematics 4 curriculum: <https://curriculum.gov.bc.ca/curriculum/mathematics/4/core>
- BC K-4 Foundational Mathematics Learning Progressions: <https://curriculum.gov.bc.ca/sites/curriculum.gov.bc.ca/files/pdf/learning-pathways/k-4-math-foundational-learning-progressions.pdf>
- BC Mathematics introduction: <https://curriculum.gov.bc.ca/curriculum/mathematics/introduction>

Relevant design implications:

- computational fluency grows from number sense;
- Grade 4 develops multiplication and division fact fluency within 100;
- fluent recall is particularly expected for the 2s, 5s, and 10s facts;
- facts should be connected to strategies, patterns, representations, discussion, and problem solving;
- rote memorization alone is not the intended approach.

## District scope

No public evidence was found for an SD43-wide program or mandated sequence named “Five Minute Frenzy.” Treat it as a generic worksheet format that a teacher may choose, not as an SD43 curriculum product.

## Learning records and awards

- xAPI 2.0 specification: <https://github.com/adlnet/xAPI-Spec/tree/master/xAPI-Data>
- 1EdTech Open Badges 3.0: <https://www.imsglobal.org/spec/ob/v3p0/>

The browser exports session statements shaped around xAPI's actor–verb–object model, including completion, score, optional ISO 8601 duration, and project-specific extensions. The download is a portable JSON file; the site does not send statements to a Learning Record Store or claim conformance certification.

The downloadable SVG is called a “practice award,” not an Open Badge. Open Badges are verifiable credentials with an issuer and cryptographic proof. A purely client-side home-practice celebration does not meet that definition.

## Input technology

- W3C Web Speech API draft: <https://webaudio.github.io/web-speech-api/>
- MDN `SpeechRecognition`: <https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition>
- Mistral Voxtral Mini 4B Realtime: <https://docs.mistral.ai/models/voxtral-mini-4b-realtime-2604>
- W3C Pointer Events: <https://www.w3.org/TR/pointerevents3/>
- Wacom Ink SDK for Web: <https://developer-docs.wacom.com/docs/sdk-for-ink/web/overview>
- MyScript iinkJS integration: <https://developer.myscript.com/docs/interactive-ink/4.0/web/overview/integration/>

The implemented voice input uses browser capability detection and a closed vocabulary. It prefers Web Speech on-device language packs through `available()`, `install()`, and `processLocally`, while clearly labelling browser-service fallback. It does not bundle Voxtral or another third-party recognizer. Pen events are feasible, but handwriting recognition remains deferred because the reviewed production integration requires a recognition service and credentials. See `docs/INPUT_METHODS.md` for the usability and privacy boundary.
