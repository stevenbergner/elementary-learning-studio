# Testing voice input in Firefox Nightly

Mozilla's current Web Speech work is strictly on-device. Firefox downloads a
browser-managed language model after permission and performs recognition in a
sandboxed inference process. Ordinary Firefox releases may not expose the API
yet, so this test uses Nightly in a separate profile.

## Install and open the studio on Apple Silicon macOS

From the repository root:

```bash
./scripts/run_firefox_nightly.sh
```

The launcher downloads Mozilla's official Nightly disk image over HTTPS and
installs `Firefox Nightly.app` under `~/Applications`. It creates an isolated
profile under `~/Library/Application Support/Elementary Learning Studio` and
opens the public learning studio. It does not replace or alter the normal
Firefox installation and does not require administrator access.

Use `--update` to fetch the newest build or `--install-only` to prepare Nightly
without opening it. The installed app is available through Finder and
Spotlight.

During development, use the working tree instead of the published site:

```bash
./scripts/run_firefox_nightly.sh --local
```

This builds the static artifact, serves it only on `127.0.0.1:4173`, and keeps
the server attached to the terminal. Press Control-C when finished.

## Test checklist

1. Open **Help → About Firefox Nightly** and record the version and build ID.
2. Open the learning studio and find **Optional page-wide input → Local voice**.
3. Confirm that the button says **Start voice input**, not **Voice unavailable**.
4. Select English, French, German, or Vietnamese, then press **Start voice input**.
5. Accept Firefox's microphone and language-model download prompts.
6. Confirm that download activity is visible and that the studio eventually
   reports **Private on-device speech ready**.
7. Confirm that the visible microphone indicator changes only after Firefox
   reports audio capture. Optionally open **Developer voice trace**, enable it,
   and verify that interim browser text, final text, interpretation, and action
   are distinguishable.
   Scroll to another activity and confirm the bottom status strip remains
   visible with the current target and recognized browser text.
8. Say the current numeric answer. Confirm it fills the field but waits for
   “check” or “done.” Then enable **Check spoken answers immediately** and
   confirm that a correct answer advances after a short feedback pause.
   Continue through all ten questions and confirm the completed-set view
   appears without using the keyboard. Also try “check” or “enter” after
   typing, “next” only after a correct answer, and “stop”.
9. Say a short phrase ending in a distinctive word, then remain quiet. Confirm
   that the final word appears without beginning another sentence. The LSI
   adaptive boundary should normally finalize within 650–1400 ms after interim
   results stop, although inference itself may add a small delay.
10. Record whether each number was interpreted correctly, whether an incorrect
   answer stayed on the same question, whether commands behaved as described,
   and whether stopping voice mode released the microphone indicator.
11. After a pack is installed, disconnect Wi-Fi, reload the local development
   page, and repeat recognition. It should continue working. This distinguishes
   local inference from a server-backed speech service.
12. Select an unsupported or unavailable language in a diagnostic build and
    confirm that the studio leaves voice off rather than falling back online.

If the API is missing, open `about:config` and inspect
`media.webspeech.recognition.enable`. Current Nightly builds are intended to
enable it on desktop. Also check **Settings → Firefox AI** to ensure Speech
Recognition is not blocked.

## Reporting useful findings

Avoid posting recordings, learner names, or other personal information. A
useful report contains:

- Firefox Nightly version and build ID
- operating system and language
- the studio URL and selected recognition language
- exact visible status/error text
- minimal reproduction steps
- whether a fresh isolated profile changes the result
- whether recognition still works with the Mac disconnected from the network
- whether the transcript matched the utterance; do not describe this as a
  pronunciation score

Mozilla tracking links:

- Implementation: <https://bugzilla.mozilla.org/show_bug.cgi?id=1940906>
- Nightly activation: <https://bugzilla.mozilla.org/show_bug.cgi?id=2069803>
- Release shipping: <https://bugzilla.mozilla.org/show_bug.cgi?id=2072585>
- Android support: <https://bugzilla.mozilla.org/show_bug.cgi?id=1244242>

## Current local observation

On 2026-10-04, Firefox Nightly 159.0a1 (build `20261003091520`) on Apple
Silicon macOS exposed the unprefixed local API to the studio served from
`127.0.0.1`. `available()` reported the English command pack as downloadable,
and Firefox displayed its own consent message:

> Set up speech recognition? Nightly runs speech recognition locally, so the
> audio never leaves your device. To set this up, a ~141 MB download will start
> when you continue.

The user continued the model setup and granted the isolated Nightly profile
microphone access. Firefox then reported the English local pack ready. A live
test produced `audiostart`, interim-result, final-result, and `audioend` events.
Firefox initially retained the last word until later speech. LSI 0.5.0's
adaptive 650–1400 ms graceful-finalization policy was then tested in the live
microphone session: the retained word appeared after the speaker paused,
without another utterance, and the user described the resulting delay as
pleasant conversational pacing. Using the button stopped capture and returned
the indicator to **Microphone off**. Numeric insertion, every spoken command,
other languages, and disconnected-network operation still need live
verification; do not report those as passing yet.

### Captured command-turn follow-up

A later live trace on the same machine separated recognizer behavior from
studio policy. Firefox finalized `eight`, `next`, and `nine`; the studio
accepted all three, and `next` checked the entered answer and advanced. On the
next attempt, Firefox first exposed interim `next` but finalized the rapid
retry as `next done`, which the earlier exact single-command grammar rejected.
In a subsequent explanatory sentence, interim `next` expanded to `next okay`
after 285 ms and then to ordinary commentary. Rejecting that longer utterance
was correct: accepting a command merely because it occurs inside prose would
make discussion capable of navigating the exercise.

The resulting policy keeps final-only execution but uses two narrow recovery
mechanisms. While the entire interim transcript is one reviewed command, ELS
asks LSI to finalize after 500 ms rather than the normal adaptive 650–1400 ms;
any continued text cancels that shorter timer. ELS also accepts the exact
coalesced retry pairs `next done`, `done next`, `next check`, and `check next`
as the existing check-and-advance operation. The captured explanatory sentence
remains unmatched. Automated browser coverage replays both shapes so future
timing work cannot make embedded commentary actionable.

The next development pass found two observability and integration omissions.
ELS had not passed its reviewed command vocabulary into LSI's already-tested
contextual-hint path, so Firefox received zero application hints. It now
requests locale-specific hints with the strongest boost on navigation phrases.
Also, Firefox can finalize several attempts while leaving one `soundstart`
region open; LSI now numbers every post-final result as a new logical utterance
so the diagnostic summary exposes repeated attempts instead of merging them.
These changes can improve candidate ranking and diagnosis, but they do not
claim to recover an utterance when Firefox emits `nomatch` without text.
