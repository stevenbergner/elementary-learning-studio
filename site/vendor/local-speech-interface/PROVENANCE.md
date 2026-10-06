# Local Speech Interface browser snapshot

This directory vendors the browser-facing modules from Local Speech Interface
0.5.0, revision `7effdad`.

- Source repository at integration time: sibling `local-speech-interface`
- Covered files: `src/browser/{local-session,loudness-endpointer,recognition-input}.js`, `src/capabilities.js`,
  `src/local-policy.js`, `src/speech-event.js`, `src/dom-bridge.js`,
  `src/page-control.js`, `src/stable-interim.js`, the package
  export surface, and `packages/domain-grammar/src/{index,integer}.js`
- License: Mozilla Public License 2.0
- Runtime dependencies: none

The snapshot keeps Elementary Learning Studio deployable as an independent
static GitHub Pages artifact before LSI has a public package release. Its
recognition lifecycle must not be edited independently. Changes belong in LSI
first and are then synchronized here with updated provenance and tests.

The MPL-2.0 text and canonical source are maintained in the LSI repository.
Every covered JavaScript file retains its SPDX license header.
