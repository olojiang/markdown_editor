# Markdown 纪

Electron + Vue + TypeScript Markdown reader/editor with a collapsible heading tree, source editing, right-side/fullscreen preview, Mermaid rendering, and automatic last-file/session restore.

## Features

- Open and edit local `.md`, `.markdown`, and `.mdown` files.
- Open Markdown files directly from Finder or a default `.md` file association in reader mode.
- Auto-save the current file and restore the last opened file/session on launch.
- Open restored documents in a reader-first layout; switch to source editing with `Cmd/Ctrl+E`.
- Browse headings in a collapsible table of contents, filter headings by keyword, and track the active heading while scrolling.
- Search and replace inside the source editor, with quick insert controls for tables, links, code blocks, and images.
- Paste images into `assets/images/{timestamp}.webp`, import local image assets, then refresh, insert, or delete those image resources from the editor toolbar. A cloud upload entry is present for the next service-backed implementation.
- Export the current document as HTML or PDF.
- Resize the table-of-contents and editor columns, hide the preview, or use fullscreen preview.
- Render Mermaid diagrams with theme-aware colors; zoom with `Cmd/Ctrl` + mouse wheel, drag diagrams inside the preview, open diagrams fullscreen, and export them as SVG, PNG, or WebP.

## Development

```bash
pnpm install
pnpm test
pnpm build
pnpm dev
```

## Testing

```bash
pnpm test
pnpm test:electron
```

`pnpm test` covers Markdown rendering, heading trees, session helpers, and Vue editor interactions. `pnpm test:electron` builds the app and launches the packaged Electron entry with Playwright to verify the desktop shell, preload bridge, and key controls.

## macOS DMG

```bash
pnpm build:mac
```

For local updates, build and install the current machine architecture directly into `/Applications`:

```bash
./update_app.sh
```

The ARM64 DMG is written to `release/` and ignored by git. The current package is unsigned because no Apple Developer ID certificate is configured in this repository; distribute it directly only to trusted machines. On first launch, macOS Gatekeeper may require opening from Finder with `Control` + click, then choosing Open.

The app does not request camera, microphone, location, contacts, or broad filesystem permissions. Markdown files are accessed through the macOS file picker, drag-and-drop, recent files, or Finder's Open With/default-app flow and then saved back to the selected file path.

See [docs/Mac_Distribution.md](docs/Mac_Distribution.md) for packaging and permission notes.

## Windows x64 Installer

```bash
pnpm build:win_x64
```

The Windows installer is written to `release/`. Cross-building the NSIS installer from macOS may require Wine in the local environment; building on Windows avoids that dependency.
