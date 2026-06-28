import { rendererLog } from './logger';

export interface FileSearchMatch {
  filePath: string;
  fileName: string;
  lineNumber: number;
  column: number;
  lineContent: string;
  matchLength: number;
}

export interface FileSearchRequest {
  query: string;
  isRegex: boolean;
  searchDir: string;
  excludeFolders: string[];
  maxResults: number;
}

export type FileSearchScope = 'opened' | 'folder';

export interface ContentMatch {
  lineNumber: number;
  column: number;
  lineContent: string;
  matchLength: number;
}

const SEARCH_HISTORY_MAX = 20;

export class SearchHistory {
  private items: string[];
  private readonly maxSize: number;

  constructor(maxSize = SEARCH_HISTORY_MAX) {
    this.maxSize = maxSize;
    this.items = [];
  }

  add(query: string): void {
    const trimmed = query.trim();
    if (!trimmed) {
      return;
    }
    const index = this.items.indexOf(trimmed);
    if (index !== -1) {
      this.items.splice(index, 1);
    }
    this.items.unshift(trimmed);
    if (this.items.length > this.maxSize) {
      this.items.pop();
    }
    rendererLog.debug('search.history.add', { query: trimmed, size: this.items.length });
  }

  remove(query: string): void {
    const index = this.items.indexOf(query);
    if (index !== -1) {
      this.items.splice(index, 1);
    }
  }

  getAll(): readonly string[] {
    return [...this.items];
  }

  clear(): void {
    this.items = [];
  }

  get size(): number {
    return this.items.length;
  }
}

export function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function buildSearchRegex(query: string, isRegex: boolean): RegExp | null {
  if (!query) {
    return null;
  }
  try {
    const pattern = isRegex ? query : escapeRegExp(query);
    return new RegExp(pattern, isRegex ? 'gm' : 'gi');
  } catch {
    rendererLog.warn('search.regex.invalid', { query, isRegex });
    return null;
  }
}

export function searchInContent(
  content: string,
  query: string,
  isRegex: boolean,
  maxResults = 500,
): ContentMatch[] {
  const regex = buildSearchRegex(query, isRegex);
  if (!regex) {
    return [];
  }

  const lines = content.split('\n');
  const results: ContentMatch[] = [];

  for (let i = 0; i < lines.length && results.length < maxResults; i++) {
    const line = lines[i];
    regex.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(line)) !== null && results.length < maxResults) {
      results.push({
        lineNumber: i + 1,
        column: match.index + 1,
        lineContent: line,
        matchLength: match[0].length,
      });
      if (match[0].length === 0) {
        regex.lastIndex++;
      }
    }
  }

  return results;
}

export function searchInOpenedTabs(
  tabs: { filePath: string | null; fileName: string; content: string }[],
  query: string,
  isRegex: boolean,
  maxResults = 1000,
): FileSearchMatch[] {
  const results: FileSearchMatch[] = [];

  for (const tab of tabs) {
    if (results.length >= maxResults) {
      break;
    }
    const remaining = maxResults - results.length;
    const matches = searchInContent(tab.content, query, isRegex, remaining);
    for (const match of matches) {
      results.push({
        filePath: tab.filePath ?? '',
        fileName: tab.fileName,
        lineNumber: match.lineNumber,
        column: match.column,
        lineContent: match.lineContent,
        matchLength: match.matchLength,
      });
    }
  }

  rendererLog.debug('search.openedTabs.complete', {
    query,
    tabCount: tabs.length,
    resultCount: results.length,
  });
  return results;
}

export function groupResultsByFile(results: FileSearchMatch[]): Map<string, FileSearchMatch[]> {
  const groups = new Map<string, FileSearchMatch[]>();
  for (const result of results) {
    const key = result.filePath || result.fileName;
    const group = groups.get(key) ?? [];
    group.push(result);
    groups.set(key, group);
  }
  return groups;
}

export function truncateLineContent(line: string, column: number, maxLength = 200): string {
  if (line.length <= maxLength) {
    return line;
  }
  const start = Math.max(0, column - 1 - Math.floor(maxLength / 3));
  const end = Math.min(line.length, start + maxLength);
  const prefix = start > 0 ? '...' : '';
  const suffix = end < line.length ? '...' : '';
  return `${prefix}${line.slice(start, end)}${suffix}`;
}
