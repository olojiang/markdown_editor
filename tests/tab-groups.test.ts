import { describe, expect, it } from 'vitest';
import {
  createTabGroup,
  moveTabToGroup,
  normalizeTabGroups,
  removeTabFromGroups,
  toggleTabGroup,
} from '@/renderer/lib/tab-groups';

describe('tab groups', () => {
  it('normalizes groups to existing unique tabs and valid names', () => {
    expect(normalizeTabGroups([
      { id: 'g1', name: ' Work ', tabIds: ['a', 'missing', 'a'], collapsed: true },
      { id: 'g2', name: 'Work', tabIds: ['a', 'b'] },
    ], ['a', 'b'])).toEqual([
      { id: 'g1', name: 'Work', tabIds: ['a'], collapsed: true },
      { id: 'g2', name: 'Work', tabIds: ['b'], collapsed: false },
    ]);
  });

  it('creates and moves tabs between groups', () => {
    const groups = createTabGroup([], 'g1', 'Research', 'a');
    expect(moveTabToGroup(groups, 'a', 'g1')).toEqual(groups);
    expect(moveTabToGroup(groups, 'b', 'g1')).toEqual([{ ...groups[0], tabIds: ['a', 'b'] }]);
  });

  it('toggles collapse state and removes empty groups', () => {
    const groups = createTabGroup([], 'g1', 'Work', 'a');
    expect(toggleTabGroup(groups, 'g1')[0].collapsed).toBe(true);
    expect(removeTabFromGroups(groups, 'a')).toEqual([]);
  });
});
