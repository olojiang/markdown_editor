export interface MarkdownSession {
  filePath: string | null;
  scrollTop: number;
}

export function createDefaultSession(): MarkdownSession {
  return {
    filePath: null,
    scrollTop: 0,
  };
}

export function mergeSession(
  current: MarkdownSession,
  patch: Partial<MarkdownSession>,
): MarkdownSession {
  return {
    filePath: patch.filePath === undefined ? current.filePath : patch.filePath,
    scrollTop: patch.scrollTop === undefined ? current.scrollTop : patch.scrollTop,
  };
}
