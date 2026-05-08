export interface EditorPreferences {
  vimEnabled: boolean;
  configText: string;
}

export interface ParsedEditorConfig {
  fontSize: number;
  insertSpaces: boolean;
  lineNumbers: 'on' | 'off' | 'relative' | 'interval';
  minimap: boolean;
  tabSize: number;
  vimLeader: string;
  vimKeymaps: VimKeymapConfig[];
  wordWrap: 'on' | 'off' | 'wordWrapColumn' | 'bounded';
}

export interface VimKeymapConfig {
  after: string;
  before: string;
  mode: 'normal' | 'insert' | 'visual';
}

export const defaultEditorConfigText = JSON.stringify({
  tabSize: 2,
  wordWrap: 'on',
  minimap: false,
}, null, 2);

export const defaultEditorPreferences: EditorPreferences = {
  vimEnabled: false,
  configText: defaultEditorConfigText,
};

function stringOption<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === 'string' && allowed.includes(value as T) ? value as T : fallback;
}

function numberOption(value: unknown, fallback: number, min: number, max: number): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(min, Math.min(max, value))
    : fallback;
}

function booleanOption(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function normalizeVimKeymaps(value: unknown): VimKeymapConfig[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item): VimKeymapConfig[] => {
    if (!item || typeof item !== 'object') {
      return [];
    }
    const candidate = item as Partial<VimKeymapConfig>;
    if (typeof candidate.before !== 'string' || typeof candidate.after !== 'string') {
      return [];
    }
    return [{
      before: candidate.before,
      after: candidate.after,
      mode: stringOption(candidate.mode, ['normal', 'insert', 'visual'] as const, 'normal'),
    }];
  });
}

export function normalizeEditorPreferences(value: unknown): EditorPreferences {
  if (!value || typeof value !== 'object') {
    return { ...defaultEditorPreferences };
  }

  const candidate = value as Partial<EditorPreferences>;
  return {
    vimEnabled: candidate.vimEnabled === true,
    configText: typeof candidate.configText === 'string' && candidate.configText.trim()
      ? candidate.configText
      : defaultEditorConfigText,
  };
}

export function parseEditorConfig(configText: string): ParsedEditorConfig {
  const raw = JSON.parse(configText) as Record<string, unknown>;
  const vim = raw.vim && typeof raw.vim === 'object' ? raw.vim as Record<string, unknown> : {};

  return {
    fontSize: numberOption(raw.fontSize, 14, 10, 28),
    insertSpaces: booleanOption(raw.insertSpaces, true),
    lineNumbers: stringOption(raw.lineNumbers, ['on', 'off', 'relative', 'interval'] as const, 'on'),
    minimap: booleanOption(raw.minimap, false),
    tabSize: numberOption(raw.tabSize, 2, 1, 8),
    vimLeader: typeof vim.leader === 'string' && vim.leader ? vim.leader : '\\',
    vimKeymaps: normalizeVimKeymaps(vim.keymaps),
    wordWrap: stringOption(raw.wordWrap, ['on', 'off', 'wordWrapColumn', 'bounded'] as const, 'on'),
  };
}
