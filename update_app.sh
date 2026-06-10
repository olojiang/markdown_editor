#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APPLE_KEYS_DIR="${APPLE_KEYS_DIR:-/Users/hunter/Workspace/apple_keys}"
APPLE_KEY_METADATA_ENV="$APPLE_KEYS_DIR/apple_key_metadata.env"
APPLE_KEY_SECRETS_ENV="$APPLE_KEYS_DIR/apple_key_secrets.env"
APP_NAME="Markdown 纪.app"
APP_BUNDLE_ID="com.olojiang.markdowneditor"
APP_PROCESS_NAME="Markdown 纪"
OLD_APP_NAME="Markdown Editor.app"
TARGET_DIR="/Applications"
TARGET_APP="${TARGET_DIR}/${APP_NAME}"
OLD_TARGET_APP="${TARGET_DIR}/${OLD_APP_NAME}"
NOTARIZE=false
BUILD_DIR="${ROOT_DIR}/build"
MAC_ICON_SVG="${BUILD_DIR}/icon.svg"
MAC_ENTITLEMENTS="${BUILD_DIR}/entitlements.mac.plist"

usage() {
  cat <<'USAGE'
Usage: ./update_app.sh [--sign]

Build, sign, install, and relaunch Markdown 纪.app.

Options:
  --sign      Also submit to Apple notarization, staple the ticket, and run Gatekeeper checks.
  -h, --help  Show this help.

Without --sign the app is still codesigned, but notarization and stapler checks are skipped.
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --sign)
      NOTARIZE=true
      shift
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

require_file() {
  local path="$1"
  local label="$2"
  if [[ ! -f "$path" ]]; then
    echo "Missing $label: $path" >&2
    exit 1
  fi
}

require_value() {
  local value="$1"
  local label="$2"
  if [[ -z "$value" ]]; then
    echo "Missing $label" >&2
    exit 1
  fi
}

ensure_macos_build_assets() {
  mkdir -p "$BUILD_DIR"

  if [[ ! -f "$MAC_ENTITLEMENTS" ]]; then
    echo "Creating missing macOS entitlements: $MAC_ENTITLEMENTS"
    cat >"$MAC_ENTITLEMENTS" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>com.apple.security.cs.allow-jit</key>
  <true/>
  <key>com.apple.security.cs.allow-unsigned-executable-memory</key>
  <true/>
  <key>com.apple.security.cs.disable-library-validation</key>
  <true/>
</dict>
</plist>
PLIST
  fi

  if [[ ! -f "$MAC_ICON_SVG" ]]; then
    echo "Creating missing macOS icon source: $MAC_ICON_SVG"
    cat >"$MAC_ICON_SVG" <<'SVG'
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">
  <defs>
    <linearGradient id="tile" x1="132" y1="96" x2="872" y2="928" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#f9fffd"/>
      <stop offset="1" stop-color="#bfeee5"/>
    </linearGradient>
    <linearGradient id="page" x1="328" y1="214" x2="704" y2="804" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#ffffff"/>
      <stop offset="1" stop-color="#d9f3ed"/>
    </linearGradient>
    <linearGradient id="edge" x1="260" y1="220" x2="760" y2="820" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#42e6cf"/>
      <stop offset="1" stop-color="#0b7a75"/>
    </linearGradient>
    <linearGradient id="fold" x1="628" y1="226" x2="772" y2="378" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#dffaf5"/>
      <stop offset="1" stop-color="#5cd2c4"/>
    </linearGradient>
    <filter id="tileShadow" x="-16%" y="-16%" width="132%" height="132%">
      <feDropShadow dx="0" dy="26" stdDeviation="30" flood-color="#071116" flood-opacity="0.22"/>
    </filter>
    <filter id="pageShadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="18" stdDeviation="18" flood-color="#071116" flood-opacity="0.18"/>
    </filter>
  </defs>
  <rect x="92" y="92" width="840" height="840" rx="188" fill="url(#tile)" filter="url(#tileShadow)"/>
  <rect x="134" y="134" width="756" height="756" rx="152" fill="none" stroke="#ffffff" stroke-opacity="0.55" stroke-width="26"/>
  <path d="M306 216h356l150 150v446c0 49-39 88-88 88H306c-49 0-88-39-88-88V304c0-49 39-88 88-88z" fill="url(#edge)" filter="url(#pageShadow)"/>
  <path d="M332 256h314l126 126v408c0 39-31 70-70 70H332c-39 0-70-31-70-70V326c0-39 31-70 70-70z" fill="url(#page)"/>
  <path d="M646 256v90c0 31 25 56 56 56h70L646 256z" fill="url(#fold)"/>
  <path d="M346 652V420h64l78 116 78-116h64v232h-64V520l-60 88h-36l-60-88v132h-64z" fill="#12313c"/>
  <path d="M346 722h334" stroke="#0b7a75" stroke-width="30" stroke-linecap="round"/>
  <path d="M346 790h214" stroke="#5cd2c4" stroke-width="26" stroke-linecap="round"/>
</svg>
SVG
  fi
}

build_macos_app() {
  case "$(uname -m)" in
    arm64)
      pnpm build:mac
      ;;
    x86_64)
      pnpm build:icon
      pnpm build
      CSC_IDENTITY_AUTO_DISCOVERY=false pnpm exec electron-builder --mac dmg --x64 --publish never
      ;;
    *)
      echo "Unsupported macOS architecture: $(uname -m)" >&2
      exit 1
      ;;
  esac
}

ensure_macos_build_assets

require_file "$APPLE_KEY_METADATA_ENV" "Apple signing metadata"
require_file "$APPLE_KEY_SECRETS_ENV" "Apple signing secrets"

# shellcheck disable=SC1090
source "$APPLE_KEY_METADATA_ENV"
# shellcheck disable=SC1090
source "$APPLE_KEY_SECRETS_ENV"

KEYCHAIN_NAME="${KEYCHAIN_NAME:-apple-build-signing.keychain-db}"
KEYCHAIN_PASSWORD="${KEYCHAIN_PASSWORD:-${APPLE_CERTIFICATE_PASSWORD:-}}"
KEYCHAIN_PATH="${MAC_CODESIGN_KEYCHAIN:-$HOME/Library/Keychains/$KEYCHAIN_NAME}"

require_value "${APPLE_CERTIFICATE_ID:-}" "APPLE_CERTIFICATE_ID"
require_value "${APPLE_CERTIFICATE_PASSWORD:-}" "APPLE_CERTIFICATE_PASSWORD"
require_value "${KEYCHAIN_PASSWORD:-}" "KEYCHAIN_PASSWORD or APPLE_CERTIFICATE_PASSWORD"
require_value "${MODERN_P12:-}" "MODERN_P12"
require_file "$MODERN_P12" "modern Apple signing PKCS#12"

if [[ "$NOTARIZE" == true ]]; then
  require_value "${APPLE_API_KEY:-}" "APPLE_API_KEY"
  require_value "${APPLE_API_ISSUER:-}" "APPLE_API_ISSUER"
  require_value "${APPLE_API_KEY_PATH:-}" "APPLE_API_KEY_PATH"
  require_file "$APPLE_API_KEY_PATH" "Apple notarization API key"
fi

identity_available() {
  security find-identity -v -p codesigning "$KEYCHAIN_PATH" | grep -F "$APPLE_CERTIFICATE_ID" >/dev/null
}

prepare_signing_keychain() {
  if [[ -f "$KEYCHAIN_PATH" ]]; then
    echo "Using existing signing keychain: $KEYCHAIN_PATH"
  else
    echo "Creating signing keychain: $KEYCHAIN_PATH"
    mkdir -p "$(dirname "$KEYCHAIN_PATH")"
    security create-keychain -p "$KEYCHAIN_PASSWORD" "$KEYCHAIN_PATH"
  fi

  security unlock-keychain -p "$KEYCHAIN_PASSWORD" "$KEYCHAIN_PATH"
  security set-keychain-settings -lut 21600 "$KEYCHAIN_PATH"

  local existing_keychains=()
  while IFS= read -r keychain; do
    existing_keychains+=("$keychain")
  done < <(security list-keychains -d user | sed 's/^[[:space:]]*"\(.*\)"[[:space:]]*$/\1/')

  if ! printf '%s\n' "${existing_keychains[@]}" | grep -Fx "$KEYCHAIN_PATH" >/dev/null; then
    security list-keychains -d user -s "$KEYCHAIN_PATH" "${existing_keychains[@]}"
  fi

  if identity_available; then
    echo "Signing identity already present in keychain."
  else
    echo "Importing signing identity into keychain."
    security import "$MODERN_P12" \
      -f pkcs12 \
      -k "$KEYCHAIN_PATH" \
      -P "$APPLE_CERTIFICATE_PASSWORD" \
      -T /usr/bin/codesign >/dev/null
  fi

  security set-key-partition-list \
    -S apple-tool:,apple:,codesign: \
    -s \
    -k "$KEYCHAIN_PASSWORD" \
    "$KEYCHAIN_PATH" >/dev/null

  if ! identity_available; then
    echo "Expected signing identity not found after keychain setup: $APPLE_CERTIFICATE_ID" >&2
    security find-identity -v -p codesigning "$KEYCHAIN_PATH" >&2 || true
    exit 1
  fi

  echo "Signing keychain is ready for non-interactive codesign."
}

prepare_signing_keychain

if [[ "$NOTARIZE" == true ]]; then
  export APPLE_API_KEY
  export APPLE_API_ISSUER
  export APPLE_API_KEY_PATH
fi
export MAC_CODESIGN_IDENTITY="$APPLE_CERTIFICATE_ID"
export MAC_CODESIGN_KEYCHAIN="$KEYCHAIN_PATH"
export MAC_CODESIGN_ENTITLEMENTS="${MAC_CODESIGN_ENTITLEMENTS:-$MAC_ENTITLEMENTS}"
if [[ "$NOTARIZE" == true ]]; then
  export MAC_CODESIGN_REQUIRE_TIMESTAMP=1
else
  export MAC_CODESIGN_REQUIRE_TIMESTAMP="${MAC_CODESIGN_REQUIRE_TIMESTAMP:-0}"
fi

build_macos_app

case "$(uname -m)" in
  arm64)
    BUILT_APP="${ROOT_DIR}/release/mac-arm64/${APP_NAME}"
    ;;
  x86_64)
    BUILT_APP="${ROOT_DIR}/release/mac/${APP_NAME}"
    ;;
  *)
    echo "Unsupported macOS architecture: $(uname -m)" >&2
    exit 1
    ;;
esac

if [[ ! -d "$BUILT_APP" ]]; then
  echo "Built app not found: $BUILT_APP" >&2
  exit 1
fi

node scripts/sign-mac-app.cjs "$BUILT_APP"

if [[ "$NOTARIZE" == true ]]; then
  node scripts/notarize-mac-app.cjs "$BUILT_APP"
else
  echo "Skipping Apple notarization. Run ./update_app.sh --sign to notarize and staple."
fi

osascript -e "tell application id \"${APP_BUNDLE_ID}\" to quit" >/dev/null 2>&1 || true
osascript -e "tell application \"${APP_PROCESS_NAME}\" to quit" >/dev/null 2>&1 || true

for _ in {1..20}; do
  if ! pgrep -x "$APP_PROCESS_NAME" >/dev/null 2>&1; then
    break
  fi
  sleep 0.25
done

if pgrep -x "$APP_PROCESS_NAME" >/dev/null 2>&1; then
  pkill -x "$APP_PROCESS_NAME" >/dev/null 2>&1 || true
  sleep 0.5
fi

rm -rf "$TARGET_APP"
rm -rf "$OLD_TARGET_APP"
cp -R "$BUILT_APP" "$TARGET_APP"
codesign --verify --deep --strict --verbose=2 "$TARGET_APP"
if [[ "$NOTARIZE" == true ]]; then
  xcrun stapler validate "$TARGET_APP"
  spctl --assess --type execute --verbose=4 "$TARGET_APP"
fi
xattr -dr com.apple.quarantine "$TARGET_APP" 2>/dev/null || true

LSREGISTER="/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister"
if [[ -x "$LSREGISTER" ]]; then
  "$LSREGISTER" -f "$TARGET_APP" >/dev/null 2>&1 || true
fi

open "$TARGET_APP"

echo "Updated ${TARGET_APP}"
