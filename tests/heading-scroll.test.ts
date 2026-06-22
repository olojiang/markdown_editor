import { describe, expect, it } from 'vitest';
import {
  headingElementSelector,
  PREVIEW_HEADING_SCROLL_PADDING,
  previewHeadingScrollTarget,
  resolveActiveHeadingId,
  resolveActiveHeadingIdFromSourceLine,
  shouldBlockActiveHeadingUpdate,
} from '@/renderer/lib/heading-scroll';

describe('heading-scroll', () => {
  const adjacentHeadings = [
    { id: '3top', top: 400 },
    { id: 'spacebuilder', top: 520 },
  ];

  it('scrolls a heading to a fixed padding below the preview top edge', () => {
    expect(previewHeadingScrollTarget(400)).toBe(400 - PREVIEW_HEADING_SCROLL_PADDING);
    expect(previewHeadingScrollTarget(12)).toBe(0);
  });

  it('keeps the clicked heading active when the next heading is still inside a large viewport band', () => {
    const scrollTop = previewHeadingScrollTarget(400);

    expect(resolveActiveHeadingId(adjacentHeadings, scrollTop)).toBe('3top');
  });

  it('activates the next heading only after scrolling past its top edge', () => {
    expect(resolveActiveHeadingId(adjacentHeadings, 503)).toBe('3top');
    expect(resolveActiveHeadingId(adjacentHeadings, 504)).toBe('spacebuilder');
  });

  it('falls back to the first heading for empty lists', () => {
    expect(resolveActiveHeadingId([], 100)).toBe('');
  });

  it('builds a selector that works for ids starting with digits', () => {
    expect(headingElementSelector('3top')).toBe('[id="3top"]');
  });

  it('blocks active heading downgrades while navigation is locked', () => {
    expect(shouldBlockActiveHeadingUpdate('code-agent', 'bug')).toBe(true);
    expect(shouldBlockActiveHeadingUpdate('code-agent', 'code-agent')).toBe(false);
    expect(shouldBlockActiveHeadingUpdate('', 'bug')).toBe(false);
  });

  it('resolves active heading from source line without overshooting to the next heading', () => {
    const headings = [
      { id: 'bug', line: 3 },
      { id: 'code-agent', line: 7 },
    ];

    expect(resolveActiveHeadingIdFromSourceLine(headings, 2)).toBe('bug');
    expect(resolveActiveHeadingIdFromSourceLine(headings, 3)).toBe('bug');
    expect(resolveActiveHeadingIdFromSourceLine(headings, 4)).toBe('bug');
    expect(resolveActiveHeadingIdFromSourceLine(headings, 7)).toBe('code-agent');
  });

  it('prefers later headings only when their top edge crosses the activation threshold', () => {
    expect(resolveActiveHeadingId([
      { id: 'alpha', top: 120 },
      { id: 'beta', top: 120 },
    ], 103)).toBe('alpha');
    expect(resolveActiveHeadingId([
      { id: 'alpha', top: 120 },
      { id: 'beta', top: 120 },
    ], 104)).toBe('beta');
  });
});
