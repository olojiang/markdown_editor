import type {
  SortDirection,
  WorkspaceEntryKind,
  WorkspaceSortKey,
} from '@/renderer/lib/workspace-tree';

export const workspacePreferencesStorageKey = 'markdown-editor.workspace-preferences';

export interface WorkspacePreferences {
  kind: WorkspaceEntryKind;
  sortBy: WorkspaceSortKey;
  direction: SortDirection;
}

export type WorkspacePreferenceStorage = Pick<Storage, 'getItem' | 'setItem'>;

const defaultWorkspacePreferences: WorkspacePreferences = {
  kind: 'all',
  sortBy: 'name',
  direction: 'asc',
};

export function loadWorkspacePreferences(storage: WorkspacePreferenceStorage): WorkspacePreferences {
  try {
    const stored = storage.getItem(workspacePreferencesStorageKey);
    return stored ? normalizeWorkspacePreferences(JSON.parse(stored)) : { ...defaultWorkspacePreferences };
  } catch {
    return { ...defaultWorkspacePreferences };
  }
}

export function saveWorkspacePreferences(
  storage: WorkspacePreferenceStorage,
  preferences: WorkspacePreferences,
): void {
  storage.setItem(workspacePreferencesStorageKey, JSON.stringify(preferences));
}

function normalizeWorkspacePreferences(value: unknown): WorkspacePreferences {
  if (!value || typeof value !== 'object') return { ...defaultWorkspacePreferences };
  const candidate = value as Partial<WorkspacePreferences>;
  return {
    kind: candidate.kind === 'folders' || candidate.kind === 'files' ? candidate.kind : 'all',
    sortBy: candidate.sortBy === 'size' || candidate.sortBy === 'modifiedAt' ? candidate.sortBy : 'name',
    direction: candidate.direction === 'desc' ? 'desc' : 'asc',
  };
}
