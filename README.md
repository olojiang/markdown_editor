# Markdown 纪

A desktop Markdown document reader/editor built with Electron + Vue 3 + TypeScript + Monaco Editor. Supports Markdown, HTML, Text, and JSON files with live preview, Mermaid diagrams, multi-tab editing, per-file encoding, bookmarks, file search, and more.

## Highlights

- **Multi-tab editing** with per-tab view state: each tab independently remembers editor/preview visibility, editor width, and scroll positions.
- **Live preview** for Markdown and HTML with bidirectional scroll sync, code syntax highlighting, and Mermaid diagram rendering.
- **Markdown formatting shortcuts**: 11 keyboard shortcuts for headings, bold, italic, quote, code, and lists, plus a format toolbar.
- **Full-text file search** across opened tabs or a folder on disk, powered by ripgrep with fallback.
- **Bookmark navigation**: bookmark any line, jump back instantly, manage across files.
- **Per-file encoding**: auto-detect and remember encoding (UTF-8, GB18030, Big5, Shift_JIS, and more) for each file.
- **Plain-text chapter detection**: Chinese chapter patterns (第一章, 第1章) and numbered chapters in `.txt` files are detected for TOC navigation.
- **Vim mode** with `:w`, `:wq`, `:q` commands and configurable keymaps.
- **Three themes**: Light, Dark, and Eye-protection (sepia).
- **Session restore**: full state recovery on relaunch -- tabs, scroll positions, bookmarks, recent files, encodings, theme.

## Features

### Document Support

- Open `.md`, `.markdown`, `.mdown`, `.html`, `.htm`, `.txt`, `.text`, and `.json` files.
- Open from Finder, Windows file associations, or drag-and-drop in reader-first mode.
- Markdown and HTML get live preview; Text and JSON are editor-only.
- JSON formatting: 2-space indentation or compact single-line.
- Rich HTML clipboard paste converts to Markdown (headings, bold, italic, code, links, lists, tables, blockquotes).
- HTML preview runs in a sandboxed iframe via a local `127.0.0.1` static server for relative resource resolution.

### Multi-Tab Editing

- Drag-and-drop tab reordering.
- Tab context menu: close, duplicate, copy path, copy content.
- Switch tabs with `Cmd/Ctrl+1` through `Cmd/Ctrl+9`.
- Per-tab view state: editor visibility, preview visibility, fullscreen, editor width, and scroll positions are all independent per tab.
- Close confirmation for unsaved tabs.
- New untitled Markdown tab with `Cmd/Ctrl+T`; filename suggested from first heading.
- Vim `:w`, `:wq`, `:q`, `:q!` commands to save and close.

### Markdown Formatting

| Shortcut | Action |
|---|---|
| `Cmd/Ctrl+Opt/Alt+1`–`4` | Set H1–H4 heading |
| `Cmd/Ctrl+Opt/Alt+0` | Restore to body text |
| `Cmd/Ctrl+Opt/Alt+Shift+D` | Toggle bold |
| `Cmd/Ctrl+I` | Toggle italic |
| `Cmd/Ctrl+Opt/Alt+Q` | Toggle blockquote |
| `Cmd/Ctrl+Opt/Alt+Shift+C` | Toggle code (inline or fenced) |
| `Cmd/Ctrl+Opt/Alt+C` | Insert code block template |
| `Cmd/Ctrl+Opt/Alt+O` | Toggle ordered list |
| `Cmd/Ctrl+Opt/Alt+L` | Toggle unordered list |

A format toolbar (heading dropdown, bold, italic, quote, code, lists) is visible for Markdown documents when the editor is shown.

### Table of Contents

- Collapsible heading tree with keyword search.
- Expand all / collapse all.
- Active heading tracking while scrolling.
- Navigation lock: clicking a heading locks the active heading until you scroll away.
- Supports Markdown headings, HTML headings, and plain-text chapter detection (Chinese patterns, numbered chapters).

### Sidebar File Search

- Full-text search across opened tabs or a folder on disk.
- Regular expression mode.
- Exclude folders filter.
- Search history (last 20 queries).
- Results grouped by file with line number, column, and matching content.
- Toggle with `Cmd/Ctrl+Shift+F`; `Esc` to close.

### Bookmarks

- Toggle bookmark: `Cmd/Ctrl+Shift+B`.
- Bookmark manager: `Cmd/Ctrl+B`.
- Search, filter by current file, keyboard navigation, click to jump.
- Persists across sessions (up to 500 bookmarks).

### Cursor History

- Navigate backward: `Ctrl+[`, forward: `Ctrl+]`.
- Tracks cursor positions across lines and files (up to 200 entries).
- Auto-opens the target file if not already open.

### Text Encoding

- 9 encodings: UTF-8, UTF-16 LE/BE, GB18030, GBK, Big5, Shift_JIS, Windows-1252, Latin-1.
- Automatic detection via BOM, null-byte analysis, and CJK heuristic scoring.
- Per-file encoding memory: once selected, remembered across sessions (up to 100 files).

### Mermaid Diagrams

- Theme-aware rendering (Light, Dark, Eye-protection).
- Zoom with `Cmd/Ctrl` + mouse wheel; drag to pan.
- Fullscreen view with export as SVG, PNG, or WebP.
- `Esc` to close fullscreen.

### Image Assets

- Paste images from clipboard into `assets/images/{timestamp}.webp`.
- Import local image assets via file picker.
- Image panel: list, refresh, insert, delete.
- Cloud upload mode for remote image hosting.
- Image preview with fullscreen viewer, zoom, and download.

### Code Syntax Highlighting

- Preview highlighting for JavaScript, TypeScript, Python, Shell/Bash, JSON.
- Copy button on every code block.

### Preview

- Live Markdown rendering (markdown-it with linkify and typographer).
- Preview zoom: `Cmd/Ctrl++` / `Cmd/Ctrl+-` / `Cmd/Ctrl+0` (70%–160%).
- Fullscreen preview mode.
- Hide/show preview: `Cmd/Ctrl+P`.
- Reading/editing toggle: `Cmd/Ctrl+E`.
- Bidirectional editor–preview scroll sync.
- Scroll-to-top button.
- External links open in system browser.

### Export

- Export as standalone HTML.
- Export as PDF.
- Preserves current theme styling.

### View Layout

- Three-column: TOC (left), editor (middle), preview (right).
- Resizable TOC column (180–520px).
- Resizable editor column (320–1200px), remembered per tab.
- Collapsible TOC, hideable preview, fullscreen preview, reader mode.

### Themes

- Light, Dark, Eye-protection (sepia).
- Theme affects preview rendering and persists in session.

## Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| `Cmd/Ctrl+T` | New Markdown tab |
| `Cmd/Ctrl+O` | Open file |
| `Cmd/Ctrl+S` | Save file |
| `Cmd/Ctrl+R` | Refresh from disk |
| `Cmd/Ctrl+1`–`9` | Switch to tab 1–9 |
| `Cmd/Ctrl+F` | Search/replace in editor |
| `Cmd/Ctrl+Shift+F` | File search (sidebar) |
| `Cmd/Ctrl+E` | Toggle reading/editing mode |
| `Cmd/Ctrl+B` | Bookmark manager |
| `Cmd/Ctrl+Shift+B` | Toggle bookmark |
| `Cmd/Ctrl+P` | Show/hide preview |
| `Cmd/Ctrl++` / `-` / `0` | Preview zoom in/out/reset |
| `Cmd/Ctrl+Z` / `Shift+Z` | Undo / redo |
| `Ctrl+[` / `Ctrl+]` | Cursor history back / forward |
| `Esc` | Close any overlay |

## Development

```bash
pnpm install
pnpm test
pnpm build
pnpm dev
```

## Testing

```bash
pnpm test          # Vitest unit tests
pnpm test:electron # Playwright Electron integration tests
pnpm test:watch    # Watch mode
```

## Build

### macOS DMG (ARM64)

```bash
pnpm build:mac
```

The ARM64 DMG is written to `release/`. For local updates:

```bash
./update_app.sh
```

See [docs/Mac_Distribution.md](docs/Mac_Distribution.md) for packaging and permission notes.

### Windows x64 Installer

```bash
pnpm build:win_x64
```

The NSIS installer is written to `release/`. Cross-building from macOS may require Wine; building on Windows avoids that dependency.

## Tech Stack

- Electron 35, Vue 3.5+ (setup script), TypeScript, Vite 6
- Monaco Editor 0.55, markdown-it 14, Mermaid 11
- monaco-vim 0.4, iconv-lite 0.6
- pnpm, Vitest, Playwright

## License

Private.
