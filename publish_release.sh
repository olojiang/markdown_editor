#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="${GH_REPO:-olojiang/markdown_editor}"
APPLE_KEYS_DIR="${APPLE_KEYS_DIR:-/Users/hunter/Workspace/apple_keys}"
export APPLE_KEYS_DIR
NOTARIZE=false
RELEASE_TAG=""
RELEASE_TITLE=""

usage() {
  cat <<'USAGE'
Usage: ./publish_release.sh [--sign] [--tag TAG] [--title TITLE]

Build and publish the macOS and Windows release assets to one GitHub Release.

Options:
  --sign           Notarize and staple the macOS app before publishing.
  --tag TAG        Release tag (default: v<package.json version>).
  --title TITLE    Release title (default: Markdown 纪 <version>).
  -h, --help       Show this help.

Run this from a clean macOS checkout after committing the changes to release.
The macOS build uses /Users/hunter/Workspace/apple_keys by default and the
Windows cross-build requires Wine on macOS.
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --sign)
      NOTARIZE=true
      shift
      ;;
    --tag)
      [[ $# -ge 2 ]] || { echo "Missing value for --tag" >&2; exit 2; }
      RELEASE_TAG="$2"
      shift 2
      ;;
    --title)
      [[ $# -ge 2 ]] || { echo "Missing value for --title" >&2; exit 2; }
      RELEASE_TITLE="$2"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

cd "$ROOT_DIR"

require_command() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "Required command not found: $1" >&2
    exit 1
  }
}

require_file() {
  local path="$1"
  local label="$2"
  if [[ ! -f "$path" ]]; then
    echo "Missing $label: $path" >&2
    exit 1
  fi
}

require_command gh
require_command node
require_command pnpm
require_command git

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "Run the combined macOS + Windows release from macOS." >&2
  exit 1
fi

if [[ -n "$(git status --porcelain)" ]]; then
  echo "Working tree is not clean. Commit source and documentation changes before publishing." >&2
  git status --short >&2
  exit 1
fi

APP_VERSION="$(node -p "require('./package.json').version")"
RELEASE_TAG="${RELEASE_TAG:-v${APP_VERSION}}"
RELEASE_TITLE="${RELEASE_TITLE:-Markdown 纪 ${APP_VERSION}}"
MAC_ARCH="$(uname -m)"
case "$MAC_ARCH" in
  arm64) MAC_ARCH="arm64" ;;
  x86_64) MAC_ARCH="x64" ;;
  *) echo "Unsupported macOS architecture: $(uname -m)" >&2; exit 1 ;;
esac

if ! command -v wine >/dev/null 2>&1; then
  echo "Wine is required for the Windows cross-build. Install it before publishing." >&2
  exit 1
fi

if [[ "$NOTARIZE" == true ]]; then
  ./update_app.sh --release --sign
else
  ./update_app.sh --release
fi

USE_SYSTEM_WINE=1 WINEDEBUG=-all pnpm build:win_x64

MAC_DMG="${ROOT_DIR}/release/markdown-editor-${APP_VERSION}-${MAC_ARCH}.dmg"
MAC_BLOCKMAP="${MAC_DMG}.blockmap"
WIN_EXE="${ROOT_DIR}/release/markdown-editor-setup-${APP_VERSION}.exe"
WIN_BLOCKMAP="${WIN_EXE}.blockmap"
MAC_UPDATE="${ROOT_DIR}/release/latest-mac.yml"
WIN_UPDATE="${ROOT_DIR}/release/latest.yml"

require_file "$MAC_DMG" "macOS DMG"
require_file "$MAC_BLOCKMAP" "macOS blockmap"
require_file "$WIN_EXE" "Windows installer"
require_file "$WIN_BLOCKMAP" "Windows blockmap"
require_file "$MAC_UPDATE" "macOS update metadata"
require_file "$WIN_UPDATE" "Windows update metadata"

if gh release view "$RELEASE_TAG" --repo "$REPO" >/dev/null 2>&1; then
  echo "Updating existing GitHub Release ${RELEASE_TAG}."
else
  echo "Creating GitHub Release ${RELEASE_TAG}."
  gh release create "$RELEASE_TAG" \
    --repo "$REPO" \
    --target main \
    --title "$RELEASE_TITLE" \
    --generate-notes
fi

gh release upload "$RELEASE_TAG" \
  "$MAC_DMG" \
  "$MAC_BLOCKMAP" \
  "$MAC_UPDATE" \
  "$WIN_EXE" \
  "$WIN_BLOCKMAP" \
  "$WIN_UPDATE" \
  --repo "$REPO" \
  --clobber

gh release view "$RELEASE_TAG" --repo "$REPO" \
  --json tagName,url,assets \
  --jq '{tagName,url,assets:[.assets[]|{name,size,state}]}'

echo "Published macOS and Windows artifacts for ${RELEASE_TAG}."
