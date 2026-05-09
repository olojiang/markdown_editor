# Cursor History Control

## Goal

Edit mode keeps an in-memory cursor movement history so the user can jump backward and forward between meaningful editing locations. The history works across different open Markdown files and across different locations in the same file.

## Key Files

- `src/renderer/App.vue`: owns the cursor history queue, shortcut handling, tab activation, and preview/TOC sync after a history jump.
- `src/renderer/components/MarkdownMonacoEditor.vue`: exposes editor cursor line/column read and write methods for both Monaco and the test-mode textarea fallback.
- `tests/App.test.ts`: covers same-file cross-line history, same-line column updates, and cross-file history navigation.

## Data Structure

Each history item is:

```ts
{
  tabId: string;
  filePath: string | null;
  fileName: string;
  lineNumber: number;
  column: number;
}
```

The queue is stored in memory in `App.vue` as `cursorHistory`. It is capped at 200 entries. When the cap is reached, the oldest item is removed first, preserving FIFO behavior.

`cursorHistoryIndex` points at the current item in the queue. If the user jumps backward and then moves to a new line, the forward branch is discarded, matching common editor navigation behavior.

## Recording Flow

1. `MarkdownMonacoEditor` emits `focus-line-change` when the cursor changes.
2. `App.vue` handles it in `onEditorFocusLineChange`.
3. `rememberCursorPosition` reads the active tab and editor cursor position.
4. If the cursor is still on the same file and line as the current history item, only `column` is updated.
5. If the cursor moved to a different line or file, a new history item is appended.

History jumps set `isNavigatingCursorHistory` while applying the target position. This prevents programmatic jumps from being recorded as new user cursor moves.

## Shortcut Flow

- `Ctrl+[` jumps backward one history item.
- `Ctrl+]` jumps forward one history item.

`onKeyDown` intercepts both shortcuts before other command shortcuts. A jump:

1. Updates the current history item if the user only changed column.
2. Resolves the target tab by `tabId`, then by `filePath`.
3. Activates an already-open tab, or reloads the file by path if it is no longer open.
4. Calls `setCursorPosition({ lineNumber, column })`.
5. Syncs preview scrolling and the active table-of-contents heading to the target line.

## Behavior Notes

- Draft tabs are supported while they remain open because their history records include `tabId`.
- Closed unsaved draft tabs cannot be restored from history because they have no file path.
- The history is session-local and is not persisted to disk.
- Line and column are clamped by the editor component when content has changed since the history item was recorded.

## Verification

Run:

```sh
pnpm vitest run tests/App.test.ts -t "cursor history"
pnpm lint
pnpm test
```
