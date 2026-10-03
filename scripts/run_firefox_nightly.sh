#!/usr/bin/env bash

set -euo pipefail

site_url="${ELEMENTARY_STUDIO_URL:-https://stevenbergner.github.io/elementary-learning-studio/}"
nightly_lang="${FIREFOX_NIGHTLY_LANG:-en-US}"
nightly_app="${FIREFOX_NIGHTLY_APP:-${HOME}/Applications/Firefox Nightly.app}"
profile_dir="${FIREFOX_NIGHTLY_PROFILE:-${HOME}/Library/Application Support/Elementary Learning Studio/Firefox Nightly Profile}"
browser_executable="${nightly_app}/Contents/MacOS/firefox"
install_only=false
force_update=false

usage() {
  printf '%s\n' \
    "Usage: $0 [--install-only] [--update]" \
    "" \
    "Installs Mozilla's official Apple Silicon Firefox Nightly build without" \
    "administrator access and opens Elementary Learning Studio in a separate" \
    "test profile." \
    "" \
    "  --install-only  Install Nightly but do not launch it" \
    "  --update        Download the newest Nightly even when one is installed" \
    "  --help          Show this help"
}

while (($#)); do
  case "$1" in
    --install-only) install_only=true ;;
    --update) force_update=true ;;
    --desktop) ;; # Retained for compatibility; the macOS app is the launcher.
    --help|-h) usage; exit 0 ;;
    *) printf 'Unknown option: %s\n\n' "$1" >&2; usage >&2; exit 2 ;;
  esac
  shift
done

if [[ "$(uname -s)" != "Darwin" || "$(uname -m)" != "arm64" ]]; then
  printf '%s\n' "This launcher supports Apple Silicon macOS only." >&2
  exit 1
fi

install_nightly() (
  command -v curl >/dev/null || { printf '%s\n' "curl is required." >&2; exit 1; }
  command -v hdiutil >/dev/null || { printf '%s\n' "hdiutil is required." >&2; exit 1; }
  command -v ditto >/dev/null || { printf '%s\n' "ditto is required." >&2; exit 1; }
  command -v lipo >/dev/null || { printf '%s\n' "lipo is required." >&2; exit 1; }

  local download_url work_dir dmg_file mount_dir source_app new_app new_executable backup_app mounted
  download_url="https://download.mozilla.org/?product=firefox-nightly-latest-ssl&os=osx&lang=${nightly_lang}"
  work_dir="$(mktemp -d "${TMPDIR:-/tmp}/firefox-nightly.XXXXXXXX")"
  dmg_file="${work_dir}/firefox-nightly.dmg"
  mount_dir="${work_dir}/mounted"
  mounted=false
  trap 'if [[ "${mounted:-false}" == true ]]; then hdiutil detach "${mount_dir}" >/dev/null || true; fi; [[ -n "${work_dir:-}" && -d "${work_dir:-}" ]] && rm -rf -- "${work_dir}"' EXIT

  printf '%s\n' "Downloading Firefox Nightly from Mozilla…"
  curl --fail --location --retry 3 --show-error --output "$dmg_file" "$download_url"
  mkdir -p "$mount_dir"
  hdiutil attach -nobrowse -readonly -mountpoint "$mount_dir" "$dmg_file" >/dev/null
  mounted=true

  source_app=""
  for candidate in "${mount_dir}/Firefox Nightly.app" "${mount_dir}/Firefox.app"; do
    if [[ -d "$candidate" ]]; then
      source_app="$candidate"
      break
    fi
  done
  if [[ -z "$source_app" ]]; then
    printf '%s\n' "Mozilla's disk image did not contain the expected Firefox app." >&2
    exit 1
  fi

  mkdir -p "$(dirname "$nightly_app")"
  new_app="${nightly_app}.new.$(date -u +%Y%m%d%H%M%S)"
  ditto "$source_app" "$new_app"
  new_executable="${new_app}/Contents/MacOS/firefox"
  if [[ ! -x "$new_executable" ]] || ! lipo -archs "$new_executable" | tr ' ' '\n' | grep -qx arm64; then
    printf '%s\n' "Mozilla's downloaded app does not contain a native arm64 Firefox executable." >&2
    exit 1
  fi
  hdiutil detach "$mount_dir" >/dev/null
  mounted=false

  if [[ -e "$nightly_app" ]]; then
    backup_app="${nightly_app}.previous.$(date -u +%Y%m%d%H%M%S)"
    mv "$nightly_app" "$backup_app"
    if ! mv "$new_app" "$nightly_app"; then
      mv "$backup_app" "$nightly_app"
      exit 1
    fi
    printf 'Previous Nightly retained at %s\n' "$backup_app"
  else
    mv "$new_app" "$nightly_app"
  fi

  printf 'Installed Firefox Nightly in %s\n' "$nightly_app"
)

if [[ ! -x "$browser_executable" || "$force_update" == true ]]; then
  install_nightly
fi

mkdir -p "$profile_dir"

if [[ "$install_only" == true ]]; then
  exit 0
fi

printf '%s\n' "Opening the learning studio in an isolated Firefox Nightly profile…"
open -na "$nightly_app" --args --no-remote --profile "$profile_dir" "$site_url"
