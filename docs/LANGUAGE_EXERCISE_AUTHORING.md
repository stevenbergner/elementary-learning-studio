# Curated spoken-language exercises

Checked 2026-10-04.

ELS is ready for bounded spoken French activities: one word, a short phrase, or
one of several reviewed answers to the current prompt. It is not yet an
open-ended conversational tutor. A sheet declares the prompt, locale, semantic
answer choices, accepted spoken surfaces, and repeatable recognition receipts.

The runtime order remains:

```text
local ASR transcript and alternatives
  -> current prompt's locale-scoped answer domain
  -> one semantic answer, no answer, or ambiguity
  -> activity-owned feedback
```

The expected answer is not supplied to the recognizer or used to reinterpret
unknown text. A surface collision between two meanings makes sheet compilation
fail. Plausible but unreviewed phrases remain unmatched.

## Authoring gate

The starter sheet is
[`content/exercises/fr-conversation-starter.json`](../content/exercises/fr-conversation-starter.json).
Its receipts were generated with two local macOS French voices and transcribed
offline by `parakeet.cpp` v0.5.0 using the exact Q4_K bytes identified in the
sheet. “Bonjour,” “Merci beaucoup,” “Ça va bien,” and “Au revoir” round-tripped
with both voices. “Salut,” “Oui,” and “Non” did not, so they are recorded as
excluded candidates rather than silently accepted as model mistakes.

This is a smoke gate, not a quality claim. The native Parakeet checkpoint is
not Firefox's browser-managed model, synthetic voices are cleaner than children
in classrooms, and one microphone says little about another. Before publishing
an activity, its matrix should also include:

- the actual Firefox Nightly pack used by the learner-facing site;
- multiple human speakers, including children when ethically and practically
  appropriate;
- at least quiet and ordinary-room conditions;
- the exact device classes the activity claims to support;
- negative phrases that must remain unmatched.

Audio does not need to ship with the public activity. A reproducible private
fixture may produce a text receipt containing model identity, test conditions,
transcript, and expected semantic answer. Human recordings require explicit
consent, limited retention, and must never become public test assets by default.

## Feedback boundary

Exact recognition can support practice feedback such as “I heard *bonjour*.”
It must not be described as a pronunciation grade. Free-form answers can be
captured locally as text and evaluated later through an explicit, separate
rubric step. That permits one optional model call after submission instead of a
continuous language model observing every utterance.
