import { describe, expect, it } from 'vitest';
import { addRecentFile, createDefaultSession, maxRecentFiles, mergeSession } from '@/renderer/lib/session';

describe('session helpers', () => {
  it('creates an empty session when no previous file exists', () => {
    expect(createDefaultSession()).toEqual({
      filePath: null,
      tabs: [],
      activeTabId: null,
      recentFiles: [],
      scrollTop: 0,
      tocWidth: 260,
      editorWidth: 560,
      previewHidden: false,
      editorVisible: false,
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
      recentFiles: [],
      scrollTop: 42,
      tocWidth: 260,
      editorWidth: 560,
      previewHidden: false,
      editorVisible: false,
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

  it('keeps recent files as a capped LRU list', () => {
    const files = Array.from({ length: 25 }, (_, index) => `/tmp/${index}.md`);
    const recentFiles = files.reduce<string[]>((recent, filePath) => addRecentFile(recent, filePath), []);

    expect(recentFiles).toHaveLength(maxRecentFiles);
    expect(recentFiles[0]).toBe('/tmp/24.md');
    expect(recentFiles).not.toContain('/tmp/0.md');
    expect(addRecentFile(recentFiles, '/tmp/20.md')[0]).toBe('/tmp/20.md');
  });
});
