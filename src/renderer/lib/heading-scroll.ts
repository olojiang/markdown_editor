export const PREVIEW_HEADING_SCROLL_PADDING = 16;

export interface HeadingScrollAnchor {
  id: string;
  top: number;
}

export interface HeadingSourceAnchor {
  id: string;
  line: number;
}

export function shouldBlockActiveHeadingUpdate(lockedId: string, nextId: string): boolean {
  return lockedId.length > 0 && lockedId !== nextId;
}

export function resolveActiveHeadingIdFromSourceLine(
  headings: HeadingSourceAnchor[],
  line: number,
): string {
  if (headings.length === 0) {
    return '';
  }

  const sorted = [...headings]
    .map((heading, index) => ({ ...heading, index }))
    .sort((first, second) => first.line - second.line || first.index - second.index);
  const current = sorted.filter((heading) => heading.line <= line).at(-1) ?? sorted[0];
  return current?.id ?? '';
}

export function headingElementSelector(id: string): string {
  return `[id="${id.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"]`;
}

export function previewHeadingScrollTarget(
  headingTop: number,
  padding = PREVIEW_HEADING_SCROLL_PADDING,
): number {
  return Math.max(0, headingTop - padding);
}

export function resolveActiveHeadingId(
  headings: HeadingScrollAnchor[],
  scrollTop: number,
  padding = PREVIEW_HEADING_SCROLL_PADDING,
): string {
  if (headings.length === 0) {
    return '';
  }

  const sorted = [...headings]
    .map((heading, index) => ({ ...heading, index }))
    .sort((first, second) => first.top - second.top || first.index - second.index);
  let activeId = sorted[0].id;

  for (const heading of sorted) {
    if (heading.top <= scrollTop + padding) {
      activeId = heading.id;
      continue;
    }
    break;
  }

  return activeId;
}
