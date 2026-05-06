export type ThemeMode = 'light' | 'dark' | 'eye';
export const maxRecentFiles = 20;

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
  recentFiles: string[];
  scrollTop: number;
  tocWidth: number;
  editorWidth: number;
  previewHidden: boolean;
  editorVisible: boolean;
  theme: ThemeMode;
}

export function createDefaultSession(): MarkdownSession {
  return {
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
  };
}

function normalizeTheme(theme: unknown): ThemeMode {
  return theme === 'dark' || theme === 'eye' ? theme : 'light';
}

export function normalizeRecentFiles(recentFiles: unknown): string[] {
  if (!Array.isArray(recentFiles)) {
    return [];
  }

  return Array.from(new Set(recentFiles.filter((filePath): filePath is string => typeof filePath === 'string')))
    .slice(0, maxRecentFiles);
}

export function addRecentFile(recentFiles: unknown, filePath: string): string[] {
  return normalizeRecentFiles([filePath, ...normalizeRecentFiles(recentFiles).filter((recent) => recent !== filePath)]);
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
    recentFiles: normalizeRecentFiles(session?.recentFiles),
    scrollTop: typeof session?.scrollTop === 'number' ? session.scrollTop : 0,
    tocWidth: Math.max(180, Math.min(520, typeof session?.tocWidth === 'number' ? session.tocWidth : 260)),
    editorWidth: Math.max(320, Math.min(1200, typeof session?.editorWidth === 'number' ? session.editorWidth : 560)),
    previewHidden: session?.previewHidden === true,
    editorVisible: session?.editorVisible === true,
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
    recentFiles: patch.recentFiles === undefined ? normalized.recentFiles : normalizeRecentFiles(patch.recentFiles),
    scrollTop: patch.scrollTop === undefined ? normalized.scrollTop : patch.scrollTop,
  };
}
