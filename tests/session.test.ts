import { describe, expect, it } from 'vitest';
import { createDefaultSession, mergeSession } from '@/renderer/lib/session';

describe('session helpers', () => {
  it('creates an empty session when no previous file exists', () => {
    expect(createDefaultSession()).toEqual({ filePath: null, scrollTop: 0 });
  });

  it('updates the remembered file path and scroll position independently', () => {
    expect(
      mergeSession({ filePath: '/tmp/a.md', scrollTop: 10 }, { scrollTop: 42 }),
    ).toEqual({ filePath: '/tmp/a.md', scrollTop: 42 });
  });
});
