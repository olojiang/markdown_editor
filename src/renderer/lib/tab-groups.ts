export interface TabGroup {
  id: string;
  name: string;
  tabIds: string[];
  collapsed: boolean;
}

export function normalizeTabGroups(value: unknown, openTabIds: string[]): TabGroup[] {
  if (!Array.isArray(value)) return [];
  const validTabs = new Set(openTabIds);
  const assignedTabs = new Set<string>();
  const groupIds = new Set<string>();
  return value.flatMap((item): TabGroup[] => {
    if (!item || typeof item !== 'object') return [];
    const candidate = item as Partial<TabGroup>;
    if (typeof candidate.id !== 'string' || !candidate.id.trim() || groupIds.has(candidate.id)) return [];
    groupIds.add(candidate.id);
    const groupTabs = new Set<string>();
    const tabIds = Array.isArray(candidate.tabIds)
      ? candidate.tabIds.filter((id): id is string => {
        if (typeof id !== 'string' || !validTabs.has(id) || assignedTabs.has(id) || groupTabs.has(id)) return false;
        groupTabs.add(id);
        return true;
      })
      : [];
    tabIds.forEach((id) => assignedTabs.add(id));
    const name = typeof candidate.name === 'string' ? candidate.name.trim().slice(0, 40) : '';
    return tabIds.length && name
      ? [{ id: candidate.id, name, tabIds, collapsed: candidate.collapsed === true }]
      : [];
  });
}

export function createTabGroup(groups: TabGroup[], id: string, name: string, tabId?: string): TabGroup[] {
  const cleanedName = name.trim().slice(0, 40);
  if (!cleanedName || groups.some((group) => group.id === id)) return groups;
  const next = [...groups, { id, name: cleanedName, tabIds: [], collapsed: false }];
  return tabId ? moveTabToGroup(next, tabId, id) : next;
}

export function moveTabToGroup(groups: TabGroup[], tabId: string, groupId: string | null): TabGroup[] {
  return groups.flatMap((group) => {
    const tabIds = group.tabIds.filter((id) => id !== tabId);
    if (group.id === groupId) tabIds.push(tabId);
    return tabIds.length ? [{ ...group, tabIds }] : [];
  });
}

export function removeTabFromGroups(groups: TabGroup[], tabId: string): TabGroup[] {
  return groups.flatMap((group) => {
    const tabIds = group.tabIds.filter((id) => id !== tabId);
    return tabIds.length ? [{ ...group, tabIds }] : [];
  });
}

export function toggleTabGroup(groups: TabGroup[], groupId: string): TabGroup[] {
  return groups.map((group) => group.id === groupId ? { ...group, collapsed: !group.collapsed } : group);
}
