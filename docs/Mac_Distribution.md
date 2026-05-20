# macOS Distribution

## Build Command

```bash
pnpm build:mac
```

This command regenerates `build/icon.icns` from `build/icon.svg`, runs the typecheck/build pipeline, creates a macOS ARM64 DMG installer with `electron-builder`, and signs the packaged `.app` with the configured Developer ID identity.

Output files are written to `release/`:

- `Markdown 纪-0.1.7-arm64.dmg` for Apple Silicon Macs.

For local development updates, run:

```bash
./update_app.sh
```

The script rebuilds the macOS ARM64 app, signs and verifies the packaged app, stops any running copy, copies the app to `/Applications/Markdown 纪.app`, verifies the installed copy, removes the old `/Applications/Markdown Editor.app` if present, clears the local quarantine flag, refreshes LaunchServices registration, and launches the app from `/Applications`.

For a notarized local install, run:

```bash
./update_app.sh --sign
```

With `--sign`, the script also submits the signed app to Apple notarization, staples and validates the notarization ticket, and runs Gatekeeper assessment before relaunching the installed app.

To clear generated release artifacts:

```bash
./clear_release.sh
```

## Install Flow

1. Open the DMG.
2. Drag `Markdown 纪.app` to `Applications`.
3. Launch the app from `Applications`.

The local app bundle is Developer ID signed by `./update_app.sh`; add `--sign` to notarize and staple it. When distributing a DMG rather than the installed `.app`, notarize and staple the final DMG artifact too.

## Icon

The macOS icon source is `build/icon.svg`. It renders a rounded app tile on a transparent canvas; `pnpm build:icon` converts it into `build/icon.icns` through macOS `sips` and `iconutil`. `pnpm build:mac` runs icon generation automatically before packaging.

## Permissions

The app is configured as a regular, non-sandboxed Electron desktop app.

It does not request:

- Camera access.
- Microphone access.
- Location access.
- Contacts, calendar, photos, or media library access.
- Broad/full disk access.

Markdown files are selected through Electron's native open-file dialog, drag-and-drop, recent files, or Finder's Open With/default-app flow. Finder-launched files open in reader mode first; source editing can be enabled inside the app. Because this is a user-selected document workflow, no extra macOS privacy usage strings are required for the current feature set.

The packaging hook removes Electron's default camera, microphone, and Bluetooth usage-description keys from the macOS `Info.plist` so the installed app metadata matches the actual permission surface.

If future features add folder watching, recursive folder import, camera capture, microphone input, Apple Events, or sandboxed Mac App Store distribution, add the matching macOS entitlement and `Info.plist` usage description before release.

## Signing And Notarization

The repository intentionally disables automatic certificate discovery for local DMG builds and then applies an explicit Developer ID signature in `scripts/after-pack.cjs`:

```bash
CSC_IDENTITY_AUTO_DISCOVERY=false
```

The explicit signing path uses hardened runtime and `build/entitlements.mac.plist`. Keep the entitlements aligned with the Electron runtime and any future native modules before releasing new builds.
