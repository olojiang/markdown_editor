import { describe, expect, it } from 'vitest';
import {
  addFileScrollPosition,
  addRecentFile,
  createDefaultSession,
  findFileEncoding,
  findFileScrollPosition,
  rememberFileEncoding,
  maxFileScrollPositions,
  maxRecentFiles,
  mergeSession,
  normalizeBookmarks,
  normalizeFileEncodings,
  normalizeFileScrollPositions,
  normalizeSession,
  normalizeSessionTabs,
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
      fileEncodings: [],
      fileScrollPositions: [],
      scrollTop: 0,
      tocWidth: 260,
      editorWidth: 560,
      previewHidden: false,
      editorVisible: false,
      editorPreferences: {
        vimEnabled: false,
        configText: '{\n  "tabSize": 2,\n  "wordWrap": "on",\n  "minimap": false\n}',
        richTextPasteEnabled: false,
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
      fileEncodings: [],
      fileScrollPositions: [],
      scrollTop: 42,
      tocWidth: 260,
      editorWidth: 560,
      previewHidden: false,
      editorVisible: false,
      editorPreferences: {
        vimEnabled: false,
        configText: '{\n  "tabSize": 2,\n  "wordWrap": "on",\n  "minimap": false\n}',
        richTextPasteEnabled: false,
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

  it('normalizes separate tab scroll positions with legacy fallback', () => {
    expect(normalizeSessionTabs([
      { id: 'file:/docs/a.md', filePath: '/docs/a.md', name: 'a.md', scrollTop: 42 },
      {
        id: 'file:/docs/b.md',
        filePath: '/docs/b.md',
        name: 'b.md',
        scrollTop: 10,
        editorScrollTop: 20,
        previewScrollTop: 30,
        tocScrollTop: 40,
      },
    ])).toEqual([
      expect.objectContaining({
        scrollTop: 42,
        editorScrollTop: 42,
        previewScrollTop: 42,
        tocScrollTop: 0,
        editorVisible: false,
        previewHidden: false,
        previewFullscreen: false,
      }),
      expect.objectContaining({
        scrollTop: 10,
        editorScrollTop: 20,
        previewScrollTop: 30,
        tocScrollTop: 40,
        editorVisible: false,
        previewHidden: false,
        previewFullscreen: false,
      }),
    ]);
  });

  it('normalizes per-tab view state independently', () => {
    expect(normalizeSessionTabs([
      {
        id: 'file:/docs/edit.md',
        filePath: '/docs/edit.md',
        name: 'edit.md',
        scrollTop: 0,
        editorVisible: true,
        previewHidden: true,
      },
      {
        id: 'file:/docs/preview.md',
        filePath: '/docs/preview.md',
        name: 'preview.md',
        scrollTop: 0,
        previewFullscreen: true,
      },
    ])).toEqual([
      expect.objectContaining({
        editorVisible: true,
        previewHidden: true,
        previewFullscreen: false,
      }),
      expect.objectContaining({
        editorVisible: false,
        previewHidden: false,
        previewFullscreen: true,
      }),
    ]);
  });

  it('uses legacy global view state as defaults for older persisted tabs', () => {
    expect(normalizeSession({
      editorVisible: true,
      previewHidden: true,
      tabs: [
        { id: 'file:/docs/legacy.md', filePath: '/docs/legacy.md', name: 'legacy.md', scrollTop: 0 },
      ] as never,
    }).tabs).toEqual([
      expect.objectContaining({
        editorVisible: true,
        previewHidden: true,
        previewFullscreen: false,
      }),
    ]);
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
        richTextPasteEnabled: false,
      },
    }, {})).toEqual(
      expect.objectContaining({
        editorPreferences: {
          vimEnabled: true,
          configText: '{ "tabSize": 4, "wordWrap": "off", "minimap": true }',
          richTextPasteEnabled: false,
        },
      }),
    );

    expect(mergeSession({
      editorPreferences: {
        vimEnabled: 'yes',
        configText: 42,
        richTextPasteEnabled: 'no',
      },
    } as never, {})).toEqual(
      expect.objectContaining({
        editorPreferences: {
          vimEnabled: false,
          configText: '{\n  "tabSize": 2,\n  "wordWrap": "on",\n  "minimap": false\n}',
          richTextPasteEnabled: false,
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

  it('remembers customized encodings by normalized file path', () => {
    const encodings = rememberFileEncoding([
      { filePath: 'file:///docs/readme.md', encoding: 'utf8', customized: false, updatedAt: 1 },
      { filePath: '/docs/other.md', encoding: 'utf8', customized: false, updatedAt: 2 },
    ], '/DOCS/readme.md', 'gbk', true, 3);

    expect(encodings).toEqual([
      { filePath: '/DOCS/readme.md', encoding: 'gbk', customized: true, updatedAt: 3 },
      { filePath: '/docs/other.md', encoding: 'utf8', customized: false, updatedAt: 2 },
    ]);
    expect(findFileEncoding(encodings, 'file:///docs/readme.md')).toEqual(
      expect.objectContaining({ encoding: 'gbk', customized: true }),
    );
  });

  it('drops invalid persisted file encoding records', () => {
    expect(normalizeFileEncodings([
      { filePath: '/docs/readme.md', encoding: 'gb18030', customized: true, updatedAt: 2 },
      { filePath: '/docs/readme.md', encoding: 'gbk', customized: true, updatedAt: 3 },
      { filePath: '', encoding: 'gbk' },
      { filePath: '/docs/invalid.md', encoding: '' },
    ])).toEqual([
      { filePath: '/docs/readme.md', encoding: 'gb18030', customized: true, updatedAt: 2 },
    ]);
  });

  it('keeps file scroll positions as a capped LRU list', () => {
    const positions = Array.from({ length: 25 }, (_, index) => `/tmp/${index}.md`)
      .reduce<ReturnType<typeof addFileScrollPosition>>(
        (current, filePath, index) => addFileScrollPosition(current, filePath, index * 10, index),
        [],
      );

    expect(positions).toHaveLength(maxFileScrollPositions);
    expect(positions[0]).toMatchObject({ filePath: '/tmp/24.md', scrollTop: 240 });
    expect(positions).not.toEqual(expect.arrayContaining([expect.objectContaining({ filePath: '/tmp/0.md' })]));
    expect(addFileScrollPosition(positions, 'file:///tmp/20.md', 999)[0]).toMatchObject({
      filePath: '/tmp/20.md',
      scrollTop: 999,
    });
  });

  it('normalizes and finds file scroll positions by path', () => {
    const positions = normalizeFileScrollPositions([
      { filePath: 'file:///docs/remote%20image.md', scrollTop: 42, updatedAt: 1 },
      { filePath: '/docs/REMOTE IMAGE.md', scrollTop: 100, updatedAt: 2 },
      { filePath: '', scrollTop: 10, updatedAt: 3 },
    ]);

    expect(positions).toEqual([{ filePath: '/docs/remote image.md', scrollTop: 42, updatedAt: 1 }]);
    expect(findFileScrollPosition(positions, '/docs/REMOTE IMAGE.md')).toMatchObject({ scrollTop: 42 });
  });
});
