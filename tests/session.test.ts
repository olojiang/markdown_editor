import { describe, expect, it } from 'vitest';
import { createDefaultSession, mergeSession } from '@/renderer/lib/session';

describe('session helpers', () => {
  it('creates an empty session when no previous file exists', () => {
    expect(createDefaultSession()).toEqual({
      filePath: null,
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
});
