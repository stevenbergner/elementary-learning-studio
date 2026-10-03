#!/usr/bin/env bash

set -euo pipefail

site_url="${ELEMENTARY_STUDIO_URL:-https://stevenbergner.github.io/elementary-learning-studio/}"
nightly_lang="${FIREFOX_NIGHTLY_LANG:-en-US}"
data_home="${XDG_DATA_HOME:-${HOME}/.local/share}"
state_home="${XDG_STATE_HOME:-${HOME}/.local/state}"
nightly_home="${FIREFOX_NIGHTLY_HOME:-${data_home}/firefox-nightly}"
profile_dir="${FIREFOX_NIGHTLY_PROFILE:-${state_home}/elementary-learning-studio/firefox-nightly-profile}"
current_link="${nightly_home}/current"
install_only=false
force_update=false
create_desktop=false

usage() {
  printf '%s\n' \
    "Usage: $0 [--install-only] [--update] [--desktop]" \
    "" \
    "Installs Mozilla's official Linux Firefox Nightly build without root access" \
    "and opens Elementary Learning Studio in a separate test profile." \
    "" \
    "  --install-only  Install Nightly but do not launch it" \
    "  --update        Download the newest Nightly even when one is installed" \
    "  --desktop       Add an Elementary Learning Studio Nightly launcher" \
    "  --help          Show this help"
}

while (($#)); do
  case "$1" in
    --install-only) install_only=true ;;
    --update) force_update=true ;;
    --desktop) create_desktop=true ;;
    --help|-h) usage; exit 0 ;;
    *) printf 'Unknown option: %s\n\n' "$1" >&2; usage >&2; exit 2 ;;
  esac
  shift
done

if [[ "$(uname -s)" != "Linux" || "$(uname -m)" != "x86_64" ]]; then
  printf '%s\n' "This launcher currently supports x86-64 Linux only." >&2
  exit 1
fi

install_nightly() (
  command -v curl >/dev/null || { printf '%s\n' "curl is required." >&2; exit 1; }
  command -v tar >/dev/null || { printf '%s\n' "tar is required." >&2; exit 1; }

  local download_url archive_dir archive_file extracted_dir build_id release_dir link_tmp
  download_url="https://download.mozilla.org/?product=firefox-nightly-latest-ssl&os=linux64&lang=${nightly_lang}"
  archive_dir="$(mktemp -d "${TMPDIR:-/tmp}/firefox-nightly.XXXXXXXX")"
  archive_file="${archive_dir}/firefox-nightly.tar"
  extracted_dir="${archive_dir}/unpacked"
  trap '[[ -n "${archive_dir:-}" && -d "${archive_dir:-}" ]] && rm -rf -- "${archive_dir}"' EXIT

  printf '%s\n' "Downloading Firefox Nightly from Mozilla…"
  curl --fail --location --retry 3 --show-error --output "$archive_file" "$download_url"
  mkdir -p "$extracted_dir"
  tar -xf "$archive_file" -C "$extracted_dir"

  if [[ ! -x "${extracted_dir}/firefox/firefox" ]]; then
    printf '%s\n' "Mozilla's archive did not contain the expected Firefox executable." >&2
    exit 1
  fi

  build_id="$(awk -F= '$1 == "BuildID" { print $2; exit }' "${extracted_dir}/firefox/application.ini")"
  [[ -n "$build_id" ]] || build_id="$(date -u +%Y%m%d%H%M%S)"
  release_dir="${nightly_home}/releases/${build_id}"
  mkdir -p "${nightly_home}/releases"

  if [[ ! -d "$release_dir" ]]; then
    mv "${extracted_dir}/firefox" "$release_dir"
  fi

  link_tmp="${nightly_home}/.current-${build_id}"
  ln -s "$release_dir" "$link_tmp"
  mv -Tf "$link_tmp" "$current_link"
  printf 'Installed Firefox Nightly build %s in %s\n' "$build_id" "$release_dir"
)

if [[ ! -x "${current_link}/firefox" || "$force_update" == true ]]; then
  install_nightly
fi

mkdir -p "$profile_dir"

if [[ "$create_desktop" == true ]]; then
  applications_dir="${data_home}/applications"
  desktop_file="${applications_dir}/elementary-learning-studio-nightly.desktop"
  mkdir -p "$applications_dir"
  desktop_tmp="${desktop_file}.tmp"
  {
    printf '%s\n' \
      '[Desktop Entry]' \
      'Type=Application' \
      'Name=Learning Studio — Firefox Nightly' \
      'Comment=Test Elementary Learning Studio with on-device Web Speech' \
      "Exec=\"${current_link}/firefox\" --no-remote --profile \"${profile_dir}\" \"${site_url}\"" \
      "Icon=${current_link}/browser/chrome/icons/default/default128.png" \
      'Terminal=false' \
      'Categories=Development;Education;WebBrowser;'
  } >"$desktop_tmp"
  chmod 0644 "$desktop_tmp"
  mv -f "$desktop_tmp" "$desktop_file"
  printf 'Installed desktop launcher: %s\n' "$desktop_file"
fi

if [[ "$install_only" == true ]]; then
  exit 0
fi

printf '%s\n' "Opening the learning studio in an isolated Firefox Nightly profile…"
exec "${current_link}/firefox" --no-remote --profile "$profile_dir" "$site_url"
