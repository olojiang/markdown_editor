import { describe, expect, it } from 'vitest';
import {
  loadWorkspacePreferences,
  saveWorkspacePreferences,
  type WorkspacePreferenceStorage,
} from '@/renderer/lib/workspace-preferences';

function createStorage(initial: Record<string, string> = {}): WorkspacePreferenceStorage {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
}

describe('workspace preferences', () => {
  it('loads the default filter and sort when no preference has been saved', () => {
    expect(loadWorkspacePreferences(createStorage())).toEqual({
      kind: 'all',
      sortBy: 'name',
      direction: 'asc',
    });
  });

  it('saves and reloads the selected filter, sort, and direction', () => {
    const storage = createStorage();
    const preferences = { kind: 'folders' as const, sortBy: 'modifiedAt' as const, direction: 'desc' as const };

    saveWorkspacePreferences(storage, preferences);

    expect(loadWorkspacePreferences(storage)).toEqual(preferences);
  });

  it('falls back safely when stored values are malformed or unsupported', () => {
    const storage = createStorage({
      'markdown-editor.workspace-preferences': '{"kind":"unknown","sortBy":"random","direction":4}',
    });

    expect(loadWorkspacePreferences(storage)).toEqual({
      kind: 'all',
      sortBy: 'name',
      direction: 'asc',
    });
  });

  it('uses defaults when the saved preference is not valid JSON', () => {
    const storage = createStorage({ 'markdown-editor.workspace-preferences': '{invalid' });

    expect(loadWorkspacePreferences(storage)).toEqual({
      kind: 'all',
      sortBy: 'name',
      direction: 'asc',
    });
  });
});
