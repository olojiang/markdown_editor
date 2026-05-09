import {
  defaultEditorPreferences,
  normalizeEditorPreferences,
  type EditorPreferences,
} from '@/renderer/lib/editorConfig';

export type ThemeMode = 'light' | 'dark' | 'eye';
export type BookmarkViewMode = 'all' | 'current';
export const maxRecentFiles = 20;
export const maxBookmarks = 500;

export interface MarkdownBookmark {
  id: string;
  tabId: string;
  filePath: string | null;
  fileName: string;
  lineNumber: number;
  column: number;
  excerpt: string;
  createdAt: number;
  updatedAt: number;
}

export interface MarkdownSessionTab {
  id: string;
  filePath: string | null;
  name: string;
  scrollTop: number;
  content?: string;
  lastSavedContent?: string;
}

export interface MarkdownSession {
  filePath: string | null;
  tabs: MarkdownSessionTab[];
  activeTabId: string | null;
  bookmarks: MarkdownBookmark[];
  bookmarkViewMode: BookmarkViewMode;
  recentFiles: string[];
  scrollTop: number;
  tocWidth: number;
  editorWidth: number;
  previewHidden: boolean;
  editorVisible: boolean;
  editorPreferences: EditorPreferences;
  theme: ThemeMode;
}

export function createDefaultSession(): MarkdownSession {
  return {
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
    editorPreferences: { ...defaultEditorPreferences },
    theme: 'light',
  };
}

function normalizeTheme(theme: unknown): ThemeMode {
  return theme === 'dark' || theme === 'eye' ? theme : 'light';
}

function normalizeBookmarkViewMode(viewMode: unknown): BookmarkViewMode {
  return viewMode === 'current' ? 'current' : 'all';
}

export function normalizeRecentFiles(recentFiles: unknown): string[] {
  if (!Array.isArray(recentFiles)) {
    return [];
  }

  const seen = new Set<string>();
  return recentFiles.flatMap((filePath): string[] => {
    if (typeof filePath !== 'string') {
      return [];
    }
    const normalized = normalizeRecentFilePath(filePath);
    const key = recentFileKey(normalized);
    if (!normalized || seen.has(key)) {
      return [];
    }
    seen.add(key);
    return [normalized];
  }).slice(0, maxRecentFiles);
}

export function addRecentFile(recentFiles: unknown, filePath: string): string[] {
  return normalizeRecentFiles([filePath, ...normalizeRecentFiles(recentFiles)]);
}

export function removeRecentFile(recentFiles: unknown, filePath: string): string[] {
  const removedKey = recentFileKey(filePath);
  return normalizeRecentFiles(recentFiles).filter((recent) => recentFileKey(recent) !== removedKey);
}

export function normalizeRecentFilePath(filePath: string): string {
  let normalized = filePath.trim();
  if (normalized.startsWith('file://')) {
    try {
      const url = new URL(normalized);
      normalized = decodeURIComponent(url.pathname);
      if (/^\/[A-Za-z]:\//.test(normalized)) {
        normalized = normalized.slice(1);
      }
    } catch {
      // Keep the original value when it is not a valid file URL.
    }
  }

  normalized = normalized.replace(/\\/g, '/');
  return normalized.length > 1 ? normalized.replace(/\/+$/g, '') : normalized;
}

function recentFileKey(filePath: string): string {
  return normalizeRecentFilePath(filePath).toLocaleLowerCase();
}

function bookmarkTargetKey(bookmark: Pick<MarkdownBookmark, 'column' | 'filePath' | 'lineNumber' | 'tabId'>): string {
  const target = bookmark.filePath ? normalizeRecentFilePath(bookmark.filePath) : bookmark.tabId;
  return `${target.toLocaleLowerCase()}:${bookmark.lineNumber}:${bookmark.column}`;
}

export function normalizeBookmarks(bookmarks: unknown): MarkdownBookmark[] {
  if (!Array.isArray(bookmarks)) {
    return [];
  }

  const seen = new Set<string>();
  return bookmarks.flatMap((bookmark): MarkdownBookmark[] => {
    if (!bookmark || typeof bookmark !== 'object') {
      return [];
    }
    const candidate = bookmark as Partial<MarkdownBookmark>;
    if (candidate.filePath !== null && typeof candidate.filePath !== 'string') {
      return [];
    }
    if (typeof candidate.tabId !== 'string' || candidate.tabId.trim() === '') {
      return [];
    }
    const lineNumber = Number.isFinite(candidate.lineNumber) ? Math.max(1, Math.floor(candidate.lineNumber ?? 1)) : 1;
    const column = Number.isFinite(candidate.column) ? Math.max(1, Math.floor(candidate.column ?? 1)) : 1;
    const filePath = typeof candidate.filePath === 'string' ? normalizeRecentFilePath(candidate.filePath) : null;
    const fileName = typeof candidate.fileName === 'string' && candidate.fileName.trim()
      ? candidate.fileName.trim()
      : filePath?.split(/[\\/]/).pop() ?? '未命名.md';
    const normalized: MarkdownBookmark = {
      id: typeof candidate.id === 'string' && candidate.id.trim()
        ? candidate.id
        : `bookmark:${candidate.tabId}:${lineNumber}:${column}`,
      tabId: candidate.tabId,
      filePath,
      fileName,
      lineNumber,
      column,
      excerpt: typeof candidate.excerpt === 'string' ? candidate.excerpt : '',
      createdAt: typeof candidate.createdAt === 'number' ? candidate.createdAt : Date.now(),
      updatedAt: typeof candidate.updatedAt === 'number' ? candidate.updatedAt : Date.now(),
    };
    const key = bookmarkTargetKey(normalized);
    if (seen.has(key)) {
      return [];
    }
    seen.add(key);
    return [normalized];
  }).slice(0, maxBookmarks);
}

export function tabIdForPath(filePath: string): string {
  return `file:${filePath}`;
}

export function normalizeSessionTabs(tabs: unknown): MarkdownSessionTab[] {
  if (!Array.isArray(tabs)) {
    return [];
  }

  const seen = new Set<string>();
  return tabs.flatMap((tab): MarkdownSessionTab[] => {
    if (!tab || typeof tab !== 'object') {
      return [];
    }
    const candidate = tab as Partial<MarkdownSessionTab>;
    if (candidate.filePath !== null && typeof candidate.filePath !== 'string') {
      return [];
    }
    const id = typeof candidate.id === 'string'
      ? candidate.id
      : candidate.filePath ? tabIdForPath(candidate.filePath) : `draft:${candidate.name ?? 'untitled'}`;
    if (seen.has(id)) {
      return [];
    }
    seen.add(id);
    const fallbackName = candidate.filePath?.split(/[\\/]/).pop() ?? '未命名.md';
    return [{
      id,
      filePath: candidate.filePath ?? null,
      name: typeof candidate.name === 'string' ? candidate.name : fallbackName,
      scrollTop: typeof candidate.scrollTop === 'number' ? Math.max(0, candidate.scrollTop) : 0,
      content: typeof candidate.content === 'string' ? candidate.content : undefined,
      lastSavedContent: typeof candidate.lastSavedContent === 'string' ? candidate.lastSavedContent : undefined,
    }];
  });
}

export function normalizeSession(session: Partial<MarkdownSession> | null | undefined): MarkdownSession {
  const tabs = normalizeSessionTabs(session?.tabs);
  const activeTabId = typeof session?.activeTabId === 'string' && tabs.some((tab) => tab.id === session.activeTabId)
    ? session.activeTabId
    : tabs[0]?.id ?? null;

  return {
    ...createDefaultSession(),
    ...session,
    filePath: typeof session?.filePath === 'string' ? session.filePath : null,
    tabs,
    activeTabId,
    bookmarks: normalizeBookmarks(session?.bookmarks),
    bookmarkViewMode: normalizeBookmarkViewMode(session?.bookmarkViewMode),
    recentFiles: normalizeRecentFiles(session?.recentFiles),
    scrollTop: typeof session?.scrollTop === 'number' ? session.scrollTop : 0,
    tocWidth: Math.max(180, Math.min(520, typeof session?.tocWidth === 'number' ? session.tocWidth : 260)),
    editorWidth: Math.max(320, Math.min(1200, typeof session?.editorWidth === 'number' ? session.editorWidth : 560)),
    previewHidden: session?.previewHidden === true,
    editorVisible: session?.editorVisible === true,
    editorPreferences: normalizeEditorPreferences(session?.editorPreferences),
    theme: normalizeTheme(session?.theme),
  };
}

export function mergeSession(
  current: Partial<MarkdownSession>,
  patch: Partial<MarkdownSession>,
): MarkdownSession {
  const normalized = normalizeSession(current);
  return {
    ...normalized,
    ...patch,
    filePath: patch.filePath === undefined ? normalized.filePath : patch.filePath,
    tabs: patch.tabs === undefined ? normalized.tabs : normalizeSessionTabs(patch.tabs),
    activeTabId: patch.activeTabId === undefined ? normalized.activeTabId : patch.activeTabId,
    bookmarks: patch.bookmarks === undefined ? normalized.bookmarks : normalizeBookmarks(patch.bookmarks),
    bookmarkViewMode: patch.bookmarkViewMode === undefined
      ? normalized.bookmarkViewMode
      : normalizeBookmarkViewMode(patch.bookmarkViewMode),
    recentFiles: patch.recentFiles === undefined ? normalized.recentFiles : normalizeRecentFiles(patch.recentFiles),
    scrollTop: patch.scrollTop === undefined ? normalized.scrollTop : patch.scrollTop,
    editorPreferences: patch.editorPreferences === undefined
      ? normalized.editorPreferences
      : normalizeEditorPreferences(patch.editorPreferences),
  };
}
