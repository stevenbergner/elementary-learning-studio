# Contributing

Small, reviewable contributions are welcome: new original activities, accessibility improvements, translations, visual explanations, generator features, and corrections.

You do not need a specialized local setup to begin. Clone the repository, tell
your development assistant to read `README.md`, `CONTRIBUTING.md`, and the tests
near the area you want to change, and keep the first contribution narrow enough
to review in one sitting. Human judgment remains responsible for curriculum,
privacy, accessibility, and permission boundaries even when an agent writes
some of the code.

## Good first contribution lanes

- Try, print, and report a concrete usability or accessibility issue.
- Improve keyboard, touch, screen-reader, or printer behavior without weakening
  an existing path.
- Add an original learning activity or language surface with deterministic
  tests.
- Improve local speech diagnostics or reproduce a browser event sequence using
  synthetic fixtures—never committed learner audio.

The current experimental speech frontier is documented in
[`docs/FIREFOX_SHORT_UTTERANCE_FINDING.md`](docs/FIREFOX_SHORT_UTTERANCE_FINDING.md).
Firefox Nightly can retain isolated one-word turns without exposing text or an
end-of-speech event. Work on that limitation should preserve three separations:
audio evidence is not an authorized action, recognized text is not an intent,
and an intent is not permission to control the page. Please discuss a change
before adding a new audio dependency, model download, or browser-extension
permission.

## Copyright-safe contributions

Only contribute material that you created, that is in the public domain, or that has a compatible license you can document. Do not submit:

- scans or transcriptions of commercial worksheets or books;
- copied problem sequences, illustrations, stories, answer keys, or branded layouts;
- teacher-only or subscription material;
- a close visual imitation of another publisher's worksheet;
- learner names, scores, school information, or other personal data.

Mathematical facts and general teaching ideas can inspire new work, but write the wording, examples, sequence, and visual treatment independently. Add any relevant references to `docs/SOURCES.md` and describe what was independently created.

By contributing code, you agree to license it under MIT. By contributing educational content or visual assets, you agree to license them under CC BY 4.0 unless the file clearly documents another compatible license.

## Quality checklist

- Put accuracy and reasoning before speed.
- Make learner-facing controls usable by touch and keyboard.
- Do not require an account or collect learner data.
- Keep language plain and supportive.
- Test code and visually inspect generated materials.
- Include source/configuration changes with any updated reviewed PDF.
- Do not commit microphone recordings or diagnostic transcripts containing a
  person's speech. Reduce a finding to synthetic, non-identifying fixtures.
