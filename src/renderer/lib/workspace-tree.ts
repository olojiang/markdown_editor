export type WorkspaceEntryKind = 'all' | 'folders' | 'files';
export type WorkspaceSortKey = 'name' | 'size' | 'modifiedAt';
export type SortDirection = 'asc' | 'desc';

export interface WorkspaceTreeFilter {
  query: string;
  kind: WorkspaceEntryKind;
  sortBy: WorkspaceSortKey;
  direction: SortDirection;
}

const nameCollator = new Intl.Collator('zh-CN', { numeric: true, sensitivity: 'base' });

export function filterWorkspaceEntries(
  entries: DirectoryEntry[],
  filter: WorkspaceTreeFilter,
): DirectoryEntry[] {
  const query = filter.query.trim().toLocaleLowerCase();
  return entries
    .filter((entry) => filter.kind === 'all' || (filter.kind === 'folders') === entry.isDirectory)
    .filter((entry) => !query || entry.name.toLocaleLowerCase().includes(query))
    .sort((left, right) => compareEntries(left, right, filter));
}

function compareEntries(left: DirectoryEntry, right: DirectoryEntry, filter: WorkspaceTreeFilter): number {
  if (filter.sortBy === 'size' && (left.size === null || right.size === null)) {
    return left.size === right.size ? nameCollator.compare(left.name, right.name) : left.size === null ? 1 : -1;
  }

  const value = filter.sortBy === 'name'
    ? nameCollator.compare(left.name, right.name)
    : filter.sortBy === 'size'
      ? (left.size ?? 0) - (right.size ?? 0)
      : left.modifiedAt - right.modifiedAt;
  return value === 0 ? nameCollator.compare(left.name, right.name) : filter.direction === 'asc' ? value : -value;
}
