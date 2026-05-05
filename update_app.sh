#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_NAME="Markdown 纪.app"
OLD_APP_NAME="Markdown Editor.app"
TARGET_DIR="/Applications"
TARGET_APP="${TARGET_DIR}/${APP_NAME}"
OLD_TARGET_APP="${TARGET_DIR}/${OLD_APP_NAME}"

cd "$ROOT_DIR"

pnpm build:mac

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

rm -rf "$TARGET_APP"
rm -rf "$OLD_TARGET_APP"
cp -R "$BUILT_APP" "$TARGET_APP"
xattr -dr com.apple.quarantine "$TARGET_APP" 2>/dev/null || true

LSREGISTER="/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister"
if [[ -x "$LSREGISTER" ]]; then
  "$LSREGISTER" -f "$TARGET_APP" >/dev/null 2>&1 || true
fi

echo "Updated ${TARGET_APP}"
