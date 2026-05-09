import { describe, expect, it } from 'vitest';
import {
  addRecentFile,
  createDefaultSession,
  maxRecentFiles,
  mergeSession,
  normalizeBookmarks,
  removeRecentFile,
} from '@/renderer/lib/session';

describe('session helpers', () => {
  it('creates an empty session when no previous file exists', () => {
    expect(createDefaultSession()).toEqual({
      filePath: null,
      tabs: [],
      activeTabId: null,
      bookmarks: [],
      bookmarkViewMode: 'all',
      recentFiles: [],
      scrollTop: 0,
      tocWidth: 260,
      editorWidth: 560,
      previewHidden: false,
      editorVisible: false,
      editorPreferences: {
        vimEnabled: false,
        configText: '{\n  "tabSize": 2,\n  "wordWrap": "on",\n  "minimap": false\n}',
      },
      theme: 'light',
    });
  });

  it('updates the remembered file path and scroll position independently', () => {
    expect(
      mergeSession({ filePath: '/tmp/a.md', scrollTop: 10 }, { scrollTop: 42 }),
    ).toEqual({
      filePath: '/tmp/a.md',
      tabs: [],
      activeTabId: null,
      bookmarks: [],
      bookmarkViewMode: 'all',
      recentFiles: [],
      scrollTop: 42,
      tocWidth: 260,
      editorWidth: 560,
      previewHidden: false,
      editorVisible: false,
      editorPreferences: {
        vimEnabled: false,
        configText: '{\n  "tabSize": 2,\n  "wordWrap": "on",\n  "minimap": false\n}',
      },
      theme: 'light',
    });
  });

  it('normalizes persisted theme values', () => {
    expect(mergeSession({ theme: 'dark' }, {})).toEqual(
      expect.objectContaining({ theme: 'dark' }),
    );
    expect(mergeSession({ theme: 'eye' }, {})).toEqual(
      expect.objectContaining({ theme: 'eye' }),
    );
    expect(mergeSession({ theme: 'unknown' } as never, {})).toEqual(
      expect.objectContaining({ theme: 'light' }),
    );
  });

  it('normalizes bookmarks and remembers the bookmark view mode', () => {
    expect(mergeSession({
      bookmarkViewMode: 'current',
      bookmarks: [
        {
          id: 'first',
          tabId: 'file:/docs/a.md',
          filePath: 'file:///docs/a.md',
          fileName: 'a.md',
          lineNumber: 4.8,
          column: 2,
          excerpt: 'Alpha',
          createdAt: 10,
          updatedAt: 11,
        },
        {
          id: 'duplicate',
          tabId: 'file:/docs/a.md',
          filePath: '/docs/a.md',
          fileName: 'a.md',
          lineNumber: 4,
          column: 2,
          excerpt: 'Duplicate',
          createdAt: 12,
          updatedAt: 13,
        },
      ],
    }, {})).toEqual(expect.objectContaining({
      bookmarkViewMode: 'current',
      bookmarks: [
        expect.objectContaining({
          id: 'first',
          filePath: '/docs/a.md',
          lineNumber: 4,
          column: 2,
          excerpt: 'Alpha',
        }),
      ],
    }));

    expect(normalizeBookmarks([{ filePath: '/docs/missing-tab.md' }])).toEqual([]);
  });

  it('normalizes persisted Monaco and Vim editor preferences', () => {
    expect(mergeSession({
      editorPreferences: {
        vimEnabled: true,
        configText: '{ "tabSize": 4, "wordWrap": "off", "minimap": true }',
      },
    }, {})).toEqual(
      expect.objectContaining({
        editorPreferences: {
          vimEnabled: true,
          configText: '{ "tabSize": 4, "wordWrap": "off", "minimap": true }',
        },
      }),
    );

    expect(mergeSession({
      editorPreferences: {
        vimEnabled: 'yes',
        configText: 42,
      },
    } as never, {})).toEqual(
      expect.objectContaining({
        editorPreferences: {
          vimEnabled: false,
          configText: '{\n  "tabSize": 2,\n  "wordWrap": "on",\n  "minimap": false\n}',
        },
      }),
    );
  });

  it('keeps recent files as a capped LRU list', () => {
    const files = Array.from({ length: 25 }, (_, index) => `/tmp/${index}.md`);
    const recentFiles = files.reduce<string[]>((recent, filePath) => addRecentFile(recent, filePath), []);

    expect(recentFiles).toHaveLength(maxRecentFiles);
    expect(recentFiles[0]).toBe('/tmp/24.md');
    expect(recentFiles).not.toContain('/tmp/0.md');
    expect(addRecentFile(recentFiles, '/tmp/20.md')[0]).toBe('/tmp/20.md');
  });

  it('deduplicates recent files by normalized path when moving entries to the front', () => {
    expect(addRecentFile([
      '/docs/remote image.md',
      '/docs/other.md',
      '/docs/REMOTE IMAGE.md',
      'file:///docs/remote%20image.md',
    ], '/docs/remote image.md')).toEqual([
      '/docs/remote image.md',
      '/docs/other.md',
    ]);
  });

  it('removes recent files by normalized path', () => {
    expect(removeRecentFile([
      '/docs/remote image.md',
      '/docs/other.md',
      'file:///docs/REMOTE%20IMAGE.md',
    ], 'file:///docs/remote%20image.md')).toEqual([
      '/docs/other.md',
    ]);
  });
});
