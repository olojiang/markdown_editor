# Recent Open Files Duplicate Display

## Problem

The recent files dropdown can show many rows with the same visible text, for example `remote image.md` or `finder launch.md`. There are two different cases:

1. The same file path is persisted with different spellings, such as `file:///docs/a.md`, `/docs/a.md`, case differences, or trailing separators.
2. Different files in different directories share the same basename. These are valid separate recent files, but showing only the basename makes them look duplicated.

## Key Files

- `src/renderer/lib/session.ts`: owns renderer-side session normalization, recent-file LRU insertion, and normalized removal.
- `src/renderer/App.vue`: renders the recent-file dropdown, opens selected recent files, removes unreadable entries, and emits renderer diagnostics.
- `electron/main.ts`: owns persisted session reads/writes, main-process path normalization, canonical file opening, and debug-log persistence.
- `tests/session.test.ts`: covers normalized LRU insertion and normalized removal.
- `tests/App.test.ts`: covers dropdown deduplication, same-basename label disambiguation, and unreadable recent-file removal.

## Current Design

Recent files remain a `string[]` of full paths in the session. The app does not collapse different directories by basename, because that would make it impossible to keep two legitimate files such as:

```text
/projects/alpha/remote image.md
/projects/beta/remote image.md
```

Instead, the algorithm separates data identity from display identity:

- Data identity uses normalized full-path keys.
- UI display uses basename for unique names.
- UI display adds a parent directory for duplicate basenames, for example `remote image.md (alpha)`.
- If parent-directory labels still collide, the label falls back to the full directory path.

## Data Flow

1. Main process opens a Markdown file through file picker, Finder launch, drag/drop read, or recent-file read.
2. `electron/main.ts` resolves the path and uses `fs.realpath` when possible, so the renderer receives a canonical file path.
3. `App.vue` calls `addRecentFile()` when a file becomes active.
4. `src/renderer/lib/session.ts` normalizes the new file path and existing recent list, removes duplicate normalized keys, keeps LRU order, and caps the list at 20 items.
5. `saveSession()` sends the normalized session back to the main process.
6. `electron/main.ts` normalizes again before writing `markdown-session.json`, so stale or manually edited session data is cleaned on persistence.

## Failure Handling

When a recent file cannot be opened, `App.vue` removes it with `removeRecentFile()` instead of an exact string comparison. This removes equivalent entries such as `file:///docs/recent.md` when the failed selected value is `/docs/recent.md`.

## Diagnostics

The app writes debug records to:

```text
<Electron userData>/markdown-editor-debug.log
```

Useful recent-file events:

- `recent-files.diagnostics`: emitted by the main process when persisted recent files are normalized, deduplicated, or contain same-basename groups.
- `renderer.recent-files.duplicate-basename.detected`: emitted by the renderer when the current dropdown has multiple distinct paths with the same basename.

Important payload fields:

- `originalCount`: number of persisted array entries before filtering.
- `originalStringCount`: number of string entries before normalization.
- `normalizedCount`: number of entries after normalization and duplicate-key removal.
- `normalizedChanged`: whether paths were rewritten or removed during normalization.
- `duplicateBasenameGroups`: same visible filename grouped with full paths.

If the dropdown still appears wrong after a restart, reproduce once and inspect these events first. If `duplicateBasenameGroups` contains different full paths, the rows are separate files and should be visually disambiguated. If `normalizedChanged` is true repeatedly for the same entries, some code path is still writing non-normalized paths.

## Verification

Run:

```sh
pnpm vitest run tests/session.test.ts tests/App.test.ts -t "recent|opens a recent|unreadable"
pnpm test
pnpm lint
```

