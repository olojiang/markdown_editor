import { describe, expect, it } from 'vitest';
import { findAllMatches, findNextMatch, findPreviousMatch, replaceAllMatches } from '@/renderer/lib/editor-search';

describe('editor search', () => {
  const source = 'Git Pull origin master\ngit status';

  it('finds matches without case sensitivity and wraps from the cursor', () => {
    expect(findNextMatch(source, 'git pull', source.indexOf('git status'))).toEqual({ start: 0, end: 8 });
    expect(findNextMatch(source, 'GIT STATUS', 0)).toEqual({ start: 23, end: 33 });
  });

  it('finds the previous match and wraps to the end', () => {
    expect(findPreviousMatch(source, 'git', source.length)).toEqual({ start: 23, end: 26 });
    expect(findPreviousMatch(source, 'pull', 0)).toEqual({ start: 4, end: 8 });
  });

  it('returns every match range for editor highlighting', () => {
    expect(findAllMatches('Git pull\ngit PULL\nno match', 'git pull')).toEqual([
      { start: 0, end: 8 },
      { start: 9, end: 17 },
    ]);
  });

  it('replaces all literal matches regardless of case', () => {
    expect(replaceAllMatches('Hello hello HELLO', 'hello', 'hi')).toEqual({
      count: 3,
      value: 'hi hi hi',
    });
  });

  it('treats search text as a literal, including regex punctuation', () => {
    expect(findNextMatch('price $10, price $20', '$10', 0)).toEqual({ start: 6, end: 9 });
  });
});
