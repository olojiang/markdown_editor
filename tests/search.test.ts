import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  SearchHistory,
  escapeRegExp,
  buildSearchRegex,
  searchInContent,
  searchInOpenedTabs,
  groupResultsByFile,
  truncateLineContent,
} from '@/renderer/lib/search';

vi.mock('@/renderer/lib/logger', () => ({
  rendererLog: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

describe('SearchHistory', () => {
  let history: SearchHistory;

  beforeEach(() => {
    history = new SearchHistory(5);
  });

  it('adds items and retrieves in MRU order', () => {
    history.add('alpha');
    history.add('beta');
    history.add('gamma');
    expect(history.getAll()).toEqual(['gamma', 'beta', 'alpha']);
  });

  it('promotes duplicates to the front', () => {
    history.add('alpha');
    history.add('beta');
    history.add('alpha');
    expect(history.getAll()).toEqual(['alpha', 'beta']);
  });

  it('evicts the oldest item when capacity is reached', () => {
    for (let i = 1; i <= 6; i++) {
      history.add(`item${i}`);
    }
    expect(history.size).toBe(5);
    expect(history.getAll()).toEqual(['item6', 'item5', 'item4', 'item3', 'item2']);
  });

  it('ignores empty or whitespace-only queries', () => {
    history.add('');
    history.add('   ');
    expect(history.size).toBe(0);
  });

  it('trims whitespace from queries', () => {
    history.add('  hello  ');
    expect(history.getAll()).toEqual(['hello']);
  });

  it('removes a specific item', () => {
    history.add('alpha');
    history.add('beta');
    history.remove('alpha');
    expect(history.getAll()).toEqual(['beta']);
  });

  it('remove is a no-op for non-existent items', () => {
    history.add('alpha');
    history.remove('nonexistent');
    expect(history.getAll()).toEqual(['alpha']);
  });

  it('clears all items', () => {
    history.add('alpha');
    history.add('beta');
    history.clear();
    expect(history.size).toBe(0);
    expect(history.getAll()).toEqual([]);
  });

  it('defaults to max size of 20', () => {
    const defaultHistory = new SearchHistory();
    for (let i = 0; i < 25; i++) {
      defaultHistory.add(`q${i}`);
    }
    expect(defaultHistory.size).toBe(20);
  });

  it('returns immutable snapshot from getAll', () => {
    history.add('alpha');
    history.add('beta');
    const snapshot = history.getAll();
    history.add('gamma');
    expect(snapshot).toEqual(['beta', 'alpha']);
    expect(history.getAll()).toEqual(['gamma', 'beta', 'alpha']);
  });
});

describe('escapeRegExp', () => {
  it('escapes special regex characters', () => {
    expect(escapeRegExp('hello.*world')).toBe('hello\\.\\*world');
    expect(escapeRegExp('a+b?c')).toBe('a\\+b\\?c');
    expect(escapeRegExp('[test]')).toBe('\\[test\\]');
    expect(escapeRegExp('(foo|bar)')).toBe('\\(foo\\|bar\\)');
    expect(escapeRegExp('price: $10')).toBe('price: \\$10');
  });

  it('leaves normal strings unchanged', () => {
    expect(escapeRegExp('hello world')).toBe('hello world');
    expect(escapeRegExp('')).toBe('');
  });
});

describe('buildSearchRegex', () => {
  it('returns null for empty query', () => {
    expect(buildSearchRegex('', false)).toBeNull();
    expect(buildSearchRegex('', true)).toBeNull();
  });

  it('builds case-insensitive regex for literal search', () => {
    const regex = buildSearchRegex('Hello', false)!;
    expect(regex.flags).toContain('i');
    expect('hello world'.match(regex)).toBeTruthy();
    expect('HELLO'.match(regex)).toBeTruthy();
    expect('no match'.match(regex)).toBeNull();
  });

  it('builds regex from pattern in regex mode', () => {
    const regex = buildSearchRegex('\\d+', true)!;
    expect(regex.test('abc123')).toBe(true);
    expect(regex.test('abc')).toBe(false);
  });

  it('returns null for invalid regex pattern', () => {
    expect(buildSearchRegex('[invalid', true)).toBeNull();
    expect(buildSearchRegex('(unclosed', true)).toBeNull();
  });
});

describe('searchInContent', () => {
  const sampleContent = [
    '# Title',
    '',
    'Hello World',
    'hello again',
    'no match here',
    'Hello at end',
  ].join('\n');

  it('finds literal matches case-insensitively', () => {
    const results = searchInContent(sampleContent, 'hello', false);
    expect(results).toHaveLength(3);
    expect(results[0]).toEqual({ lineNumber: 3, column: 1, lineContent: 'Hello World', matchLength: 5 });
    expect(results[1]).toEqual({ lineNumber: 4, column: 1, lineContent: 'hello again', matchLength: 5 });
    expect(results[2]).toEqual({ lineNumber: 6, column: 1, lineContent: 'Hello at end', matchLength: 5 });
  });

  it('finds regex matches', () => {
    const results = searchInContent(sampleContent, 'Hello', true);
    expect(results).toHaveLength(2);
    expect(results[0].lineNumber).toBe(3);
    expect(results[1].lineNumber).toBe(6);
  });

  it('returns empty array for empty query', () => {
    expect(searchInContent(sampleContent, '', false)).toEqual([]);
  });

  it('returns empty array for invalid regex', () => {
    expect(searchInContent(sampleContent, '[bad', true)).toEqual([]);
  });

  it('finds multiple matches on the same line', () => {
    const content = 'aaa bbb aaa';
    const results = searchInContent(content, 'aaa', false);
    expect(results).toHaveLength(2);
    expect(results[0].column).toBe(1);
    expect(results[1].column).toBe(9);
  });

  it('respects maxResults limit', () => {
    const content = Array(100).fill('match line').join('\n');
    const results = searchInContent(content, 'match', false, 10);
    expect(results).toHaveLength(10);
  });

  it('handles empty content', () => {
    expect(searchInContent('', 'test', false)).toEqual([]);
  });

  it('handles zero-length regex matches without infinite loop', () => {
    const results = searchInContent('abc', '(?=a)', true, 10);
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results.length).toBeLessThanOrEqual(10);
  });

  it('computes correct column for mid-line matches', () => {
    const content = 'prefix target suffix';
    const results = searchInContent(content, 'target', false);
    expect(results).toHaveLength(1);
    expect(results[0].column).toBe(8);
    expect(results[0].matchLength).toBe(6);
  });
});

describe('searchInOpenedTabs', () => {
  const tabs = [
    { filePath: '/a.md', fileName: 'a.md', content: 'hello world\ngoodbye' },
    { filePath: '/b.md', fileName: 'b.md', content: 'no match' },
    { filePath: null, fileName: 'untitled.md', content: 'hello draft' },
  ];

  it('searches across all tabs', () => {
    const results = searchInOpenedTabs(tabs, 'hello', false);
    expect(results).toHaveLength(2);
    expect(results[0].filePath).toBe('/a.md');
    expect(results[1].filePath).toBe('');
    expect(results[1].fileName).toBe('untitled.md');
  });

  it('respects maxResults across tabs', () => {
    const manyTabs = Array.from({ length: 50 }, (_, i) => ({
      filePath: `/file${i}.md`,
      fileName: `file${i}.md`,
      content: 'match\nmatch\nmatch',
    }));
    const results = searchInOpenedTabs(manyTabs, 'match', false, 10);
    expect(results).toHaveLength(10);
  });
});

describe('groupResultsByFile', () => {
  it('groups results by file path', () => {
    const results = [
      { filePath: '/a.md', fileName: 'a.md', lineNumber: 1, column: 1, lineContent: 'a', matchLength: 1 },
      { filePath: '/b.md', fileName: 'b.md', lineNumber: 1, column: 1, lineContent: 'b', matchLength: 1 },
      { filePath: '/a.md', fileName: 'a.md', lineNumber: 2, column: 1, lineContent: 'a2', matchLength: 1 },
    ];
    const groups = groupResultsByFile(results);
    expect(groups.size).toBe(2);
    expect(groups.get('/a.md')).toHaveLength(2);
    expect(groups.get('/b.md')).toHaveLength(1);
  });

  it('uses fileName as key for files without path', () => {
    const results = [
      { filePath: '', fileName: 'untitled.md', lineNumber: 1, column: 1, lineContent: 'x', matchLength: 1 },
    ];
    const groups = groupResultsByFile(results);
    expect(groups.has('untitled.md')).toBe(true);
  });
});

describe('truncateLineContent', () => {
  it('returns short lines as-is', () => {
    expect(truncateLineContent('short line', 1, 200)).toBe('short line');
  });

  it('truncates long lines with ellipsis', () => {
    const longLine = 'A'.repeat(300);
    const result = truncateLineContent(longLine, 1, 50);
    expect(result.length).toBeLessThan(300);
    expect(result.endsWith('...')).toBe(true);
  });

  it('centers around the match column', () => {
    const longLine = 'x'.repeat(100) + 'TARGET' + 'y'.repeat(100);
    const result = truncateLineContent(longLine, 101, 30);
    expect(result).toContain('TARGET');
    expect(result.startsWith('...')).toBe(true);
  });
});
