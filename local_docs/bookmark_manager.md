# Bookmark Manager

## Scope

Bookmark Manager lets the editor save a cursor location as a quick-jump target. A bookmark records the active tab/file, line, column, and a short line excerpt. The manager can show bookmarks for all files or only the current file, with the last selected scope persisted in the session.

## Key Files

- `src/renderer/App.vue`: UI state, bookmark actions, keyboard handling, jump behavior, and manager dialog.
- `src/renderer/lib/session.ts`: canonical bookmark/session types and normalization.
- `src/renderer/styles.less`: bookmark manager modal, list, filter, and row styles.
- `src/renderer/env.d.ts`: renderer bridge session type.
- `electron/main.ts`: main-process session read/write normalization.
- `electron/preload.ts`: bridge session payload type.
- `tests/App.test.ts`: renderer behavior coverage.
- `tests/session.test.ts`: bookmark/session normalization coverage.

## Data Model

Bookmarks are persisted inside the normal session JSON:

```ts
interface MarkdownBookmark {
  id: string;
  tabId: string;
  filePath: string | null;
  fileName: string;
  lineNumber: number;
  column: number;
  excerpt: string;
  createdAt: number;
  updatedAt: number;
}
```

Session-level fields:

- `bookmarks`: normalized list, capped at 500 entries.
- `bookmarkViewMode`: `'all' | 'current'`; defaults to `'all'` and remembers the last manager view.

Normalization removes malformed entries, clamps line/column to at least `1`, normalizes persisted file URLs/paths, and deduplicates by file/tab + line + column.

## Data Flow

1. Startup loads session through `bridge.getSession()`.
2. Renderer normalizes session via `normalizeSession()`.
3. Adding a bookmark reads the exposed editor cursor, active tab, file path/name, and current source line excerpt.
4. The new bookmark is inserted at the front after removing any existing bookmark for the same target.
5. `persistSession({ bookmarks })` saves through the existing session bridge.
6. Jumping first activates an already-open tab when possible; otherwise it opens `filePath` from disk with `openFilePath()`.
7. After activation/open, the editor is shown, cursor is set to `lineNumber`/`column`, preview is synced, and the manager closes.

## Usage

- Add current cursor position: `Cmd/Ctrl+Shift+B` or the bookmark button in the editor toolbar.
- Open bookmark manager: `Cmd/Ctrl+B` or the bookmark button in the top toolbar.
- Search: type in the manager search box; it matches file name, path, `line:column`, and excerpt.
- View scope: choose `所有文件` or `当前文件`; this choice is persisted.
- Move selection: `Up` / `Down`.
- Page selection: `Ctrl+Up` / `Ctrl+Down`.
- Jump: `Enter`, double click a row, or click `跳转`.
- Delete: row trash button, or `Delete` / `Backspace` when the list has focus.
- Close: `Esc` or click the modal backdrop/close button.

## Edge Behavior

- Bookmarks in saved files can reopen the file from disk.
- Bookmarks in unsaved draft tabs can jump only while that tab still exists or is restored from session.
- If a saved file cannot be opened, the existing `openFilePath()` error path reports failure and removes unreadable recent-file entries.
- Bookmarks are positional, not semantic; edits before a bookmark can make the saved line/column point to new content.
- Search text is temporary and clears when closing the manager; view scope is persisted.

## Verification

- `pnpm lint`
- `pnpm test -- session App`

