# Changelog

## 0.1.12

### Added

- **Per-tab editor width**: each tab now independently remembers its editor/preview split width. Tabs without a saved width fall back to the default.
- **Markdown formatting shortcuts**: 11 keyboard shortcuts for headings (H1–H4, body text), bold, italic, blockquote, code (inline/fenced), code block template, ordered list, and unordered list.
- **Format toolbar**: heading dropdown, bold, italic, quote, code, and list buttons for Markdown documents.
- **Sidebar file search**: full-text search across opened tabs or a folder on disk, with regex mode, exclude filters, and search history (last 20 queries).
- **Mac Alt-key compatibility**: formatting shortcuts use `event.code` matching so Option key combinations work correctly on macOS.
- **Plain-text chapter detection**: Chinese chapter patterns (第一章, 第1章) and numbered chapters in `.txt` files are detected for TOC navigation.
- **Per-file encoding memory**: once you select an encoding for a file, it is remembered across sessions (up to 100 files).
- **Expanded encoding support**: GB18030, GBK, Big5, Shift_JIS, Windows-1252, Latin-1 in addition to UTF-8 and UTF-16.
- **Cursor history navigation**: `Ctrl+[` / `Ctrl+]` to move backward/forward through cursor positions across files.
- **TOC heading navigation lock**: clicking a heading locks the active heading until you scroll away.

### Changed

- Extracted pure formatting functions into `editor-format.ts` with full unit test coverage (56 tests).
- Extracted renderer-side encoding utilities into `src/renderer/lib/text-encoding.ts`.
- Consolidated bookmark key functions into `session.ts` (DRY).
- Per-tab view state now includes `editorWidth` alongside `editorVisible`, `previewHidden`, and `previewFullscreen`.

### Fixed

- `shift_jis` and other underscore-containing encoding names now correctly round-trip through normalization.
- Editor recovery and paste behavior made predictable: rich text and image paste modes no longer conflict.
- Scroll state no longer leaks between tabs when switching quickly.
- Local macOS signing updates no longer overwrite incorrect app bundles.

## 0.1.11

### Added

- Persistent bookmark navigation with bookmark manager dialog.
- Bookmark line indicators in the editor gutter.
- Controllable recent file history with LRU management.
- Editor history tracking for undo/redo across session restores.

### Fixed

- Manual edits protected from implicit auto-saves.
- Collapsed table of contents no longer shifts preview position.
- Rich clipboard structure preserved when pasting Markdown.

## 0.1.10

### Added

- Broadened document support: HTML, Text, and JSON files alongside Markdown.
- Live HTML preview via local static server for relative resource resolution.
- JSON formatting (2-space and compact modes).
- Vim mode integration with configurable keymaps.
- Mermaid diagram rendering with pan, zoom, fullscreen, and SVG/PNG/WebP export.
- Image asset management: paste, import, insert, delete, cloud upload.
- Code syntax highlighting in preview for JavaScript, TypeScript, Python, Shell, JSON.
- Three themes: Light, Dark, Eye-protection.
- Export as HTML and PDF.
- Session restore with full state recovery.
- Collapsible table of contents with heading search and active heading tracking.
- Search and replace within the editor.
- Multi-tab editing with drag-and-drop reordering.
- macOS DMG and Windows NSIS installer builds.
