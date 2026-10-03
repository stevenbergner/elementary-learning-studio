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

## Test checklist

1. Open **Help → About Firefox Nightly** and record the version and build ID.
2. Open the learning studio and scroll to **Answer mode → Voice input**.
3. Confirm that the button says **Start voice input**, not **Voice unavailable**.
4. Select English, French, or German, then press **Start voice input**.
5. Accept Firefox's microphone and language-model download prompts.
6. Confirm that download activity is visible and that the studio eventually
   reports **Private on-device speech ready**.
7. Say a numeric answer such as “thirteen”, then try “next”, “left”, “right”,
   “up”, and “down”.
8. Record whether the number reached the focused answer box, whether navigation
   moved focus correctly, and whether stopping voice mode released the
   microphone indicator.

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

Mozilla tracking links:

- Implementation: <https://bugzilla.mozilla.org/show_bug.cgi?id=1940906>
- Nightly activation: <https://bugzilla.mozilla.org/show_bug.cgi?id=2069803>
- Release shipping: <https://bugzilla.mozilla.org/show_bug.cgi?id=2072585>
- Android support: <https://bugzilla.mozilla.org/show_bug.cgi?id=1244242>
