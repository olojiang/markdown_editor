# macOS Distribution

## Build Command

```bash
pnpm build:mac
```

This command runs the typecheck/build pipeline and then creates macOS DMG installers with `electron-builder`.

Output files are written to `release/`:

- `Markdown Editor-0.1.0-arm64.dmg` for Apple Silicon Macs.
- `Markdown Editor-0.1.0-x64.dmg` for Intel Macs.

## Install Flow

1. Open the DMG.
2. Drag `Markdown Editor.app` to `Applications`.
3. Launch the app from `Applications`.

The DMG is unsigned by default. On another Mac, Gatekeeper may block the first launch. Use Finder to `Control` + click the app and choose Open, or sign/notarize the app with an Apple Developer ID certificate before wider distribution.

## Permissions

The app is configured as a regular, non-sandboxed Electron desktop app.

It does not request:

- Camera access.
- Microphone access.
- Location access.
- Contacts, calendar, photos, or media library access.
- Broad/full disk access.

Markdown files are selected through Electron's native open-file dialog. After a user chooses a file, the app reads and saves that selected path. Because this is a user-selected document workflow, no extra macOS privacy usage strings are required for the current feature set.

The packaging hook removes Electron's default camera, microphone, and Bluetooth usage-description keys from the macOS `Info.plist` so the installed app metadata matches the actual permission surface.

If future features add folder watching, recursive folder import, camera capture, microphone input, Apple Events, or sandboxed Mac App Store distribution, add the matching macOS entitlement and `Info.plist` usage description before release.

## Signing And Notarization

The repository intentionally disables automatic certificate discovery for local DMG builds:

```bash
CSC_IDENTITY_AUTO_DISCOVERY=false
```

For public distribution, replace that local-only flow with Developer ID signing and Apple notarization. Do not enable hardened runtime without also adding the correct entitlements for the Electron runtime and any future native modules.
