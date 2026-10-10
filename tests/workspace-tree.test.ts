import { describe, expect, it } from 'vitest';
import { filterWorkspaceEntries, type WorkspaceTreeFilter } from '@/renderer/lib/workspace-tree';

const entries: DirectoryEntry[] = [
  { name: 'Images', path: '/root/Images', isDirectory: true, size: null, modifiedAt: 30 },
  { name: 'guide.md', path: '/root/guide.md', isDirectory: false, size: 120, modifiedAt: 10 },
  { name: 'README.md', path: '/root/README.md', isDirectory: false, size: 900, modifiedAt: 20 },
];

const filter: WorkspaceTreeFilter = {
  query: '',
  kind: 'all',
  sortBy: 'name',
  direction: 'asc',
};

describe('workspace tree filtering and sorting', () => {
  it('filters by case-insensitive names and entry kind', () => {
    expect(filterWorkspaceEntries(entries, { ...filter, query: 'read', kind: 'files' }).map(({ name }) => name))
      .toEqual(['README.md']);
    expect(filterWorkspaceEntries(entries, { ...filter, kind: 'folders' }).map(({ name }) => name))
      .toEqual(['Images']);
  });

  it('sorts by size descending and keeps folders after sized files', () => {
    expect(filterWorkspaceEntries(entries, { ...filter, sortBy: 'size', direction: 'desc' }).map(({ name }) => name))
      .toEqual(['README.md', 'guide.md', 'Images']);
  });

  it('sorts by modified time descending and supports reverse order', () => {
    expect(filterWorkspaceEntries(entries, { ...filter, sortBy: 'modifiedAt', direction: 'desc' }).map(({ name }) => name))
      .toEqual(['Images', 'README.md', 'guide.md']);
    const ascendingNames = filterWorkspaceEntries(entries, { ...filter, sortBy: 'name', direction: 'asc' }).map(({ name }) => name);
    expect(filterWorkspaceEntries(entries, { ...filter, sortBy: 'name', direction: 'desc' }).map(({ name }) => name))
      .toEqual(ascendingNames.reverse());
  });
});
