export type ThemeMode = 'light' | 'dark' | 'eye';

export interface MarkdownSession {
  filePath: string | null;
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

export function normalizeSession(session: Partial<MarkdownSession> | null | undefined): MarkdownSession {
  return {
    ...createDefaultSession(),
    ...session,
    filePath: typeof session?.filePath === 'string' ? session.filePath : null,
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
    scrollTop: patch.scrollTop === undefined ? normalized.scrollTop : patch.scrollTop,
  };
}
