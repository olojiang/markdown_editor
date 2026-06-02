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
require_value "${APPLE_API_KEY:-}" "APPLE_API_KEY"
require_value "${APPLE_API_ISSUER:-}" "APPLE_API_ISSUER"
require_value "${APPLE_API_KEY_PATH:-}" "APPLE_API_KEY_PATH"
require_file "$MODERN_P12" "modern Apple signing PKCS#12"

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

require_file "$APPLE_API_KEY_PATH" "Apple notarization API key"

prepare_signing_keychain

export APPLE_API_KEY
export APPLE_API_ISSUER
export APPLE_API_KEY_PATH
export MAC_CODESIGN_IDENTITY="$APPLE_CERTIFICATE_ID"
export MAC_CODESIGN_KEYCHAIN="$KEYCHAIN_PATH"
export MAC_CODESIGN_ENTITLEMENTS="${MAC_CODESIGN_ENTITLEMENTS:-$ROOT_DIR/build/entitlements.mac.plist}"

pnpm build:mac

case "$(uname -m)" in
  arm64)
    BUILT_APP="${ROOT_DIR}/release/mac-arm64/${APP_NAME}"
    ;;
  *)
    echo "Unsupported macOS architecture for the default ARM64 build: $(uname -m)" >&2
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
