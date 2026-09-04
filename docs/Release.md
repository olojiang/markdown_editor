# GitHub Release

The supported release entry point is `publish_release.sh`. It builds the
macOS and Windows artifacts from the same checkout and publishes them to one
GitHub Release:

```bash
./publish_release.sh
```

The same command is available as `pnpm release`.

For a public macOS distribution, notarize and staple the macOS app as part of
the same flow:

```bash
./publish_release.sh --sign
```

The release flow keeps the DMG and its blockmap/metadata byte-consistent;
stapling a DMG after those files are generated would invalidate their hashes.

## Preconditions

Run the flow on macOS after committing the source and documentation changes.
The script refuses to publish from a dirty worktree so the release tag points
to the code that was actually built.

The macOS signing inputs are read from `/Users/hunter/Workspace/apple_keys` by
default. Override that location with `APPLE_KEYS_DIR` when needed. The Windows
cross-build uses Wine on macOS; `USE_SYSTEM_WINE=1` is set automatically so a
broken electron-builder Wine cache does not get selected.

The GitHub CLI must be authenticated and the repository can be overridden with
`GH_REPO`:

```bash
gh auth status
GH_REPO=olojiang/markdown_editor ./publish_release.sh
```

## What the script publishes

For version `<version>`, the release contains these six assets:

- `markdown-editor-<version>-arm64.dmg`
- `markdown-editor-<version>-arm64.dmg.blockmap`
- `latest-mac.yml`
- `markdown-editor-setup-<version>.exe`
- `markdown-editor-setup-<version>.exe.blockmap`
- `latest.yml`

The artifact names are intentionally ASCII. GitHub can normalize non-ASCII
asset names, which would make the update metadata point at a file that does
not exist. `package.json` therefore uses stable ASCII artifact names for all
future releases.

The script creates the release when the tag is new and updates the existing
release when the tag already exists. Uploads use `--clobber`, so rerunning a
failed upload repairs the assets without creating a second release.

## Verification

After publishing, check the asset states and update metadata:

```bash
TAG="v$(node -p "require('./package.json').version")"
gh release view "$TAG" --repo olojiang/markdown_editor \
  --json tagName,url,assets \
  --jq '{tagName,url,assets:[.assets[]|{name,size,state}]}'

curl -fsSL "https://github.com/olojiang/markdown_editor/releases/download/${TAG}/latest.yml"
curl -fsSL "https://github.com/olojiang/markdown_editor/releases/download/${TAG}/latest-mac.yml"
```

Both installer URLs in the metadata must match actual Release asset names, and
every asset should report `state: uploaded`.

## Recovery

If a build fails before upload, fix the local error and rerun the command. If
the release already exists, the script uploads the regenerated assets to the
same tag. Do not manually rename a Windows installer after the build: the
filename must remain consistent with `latest.yml` and its blockmap.

To build only one platform for investigation:

```bash
./update_app.sh --release       # macOS signed build, no installation
pnpm build:win_x64              # Windows x64 installer
```

These commands do not publish anything to GitHub.
