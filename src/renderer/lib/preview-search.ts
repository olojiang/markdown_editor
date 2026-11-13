import { escapeRegExp } from './search';

const matchClass = 'preview-search-match';
const activeMatchClass = 'preview-search-match-active';

function clearHighlights(container: HTMLElement): void {
  container.querySelectorAll<HTMLElement>(`.${matchClass}`).forEach((highlight) => {
    highlight.replaceWith(document.createTextNode(highlight.textContent ?? ''));
  });
  container.normalize();
}

export function highlightPreviewSearch(
  container: HTMLElement,
  query: string,
  activeMatchIndex: number | null = null,
): void {
  clearHighlights(container);
  if (!query) return;

  const matcher = new RegExp(escapeRegExp(query), 'gi');
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  const textNodes: Text[] = [];
  while (walker.nextNode()) {
    const node = walker.currentNode as Text;
    if (node.parentElement?.closest('script, style, noscript')) continue;
    textNodes.push(node);
  }

  let matchIndex = 0;
  for (const node of textNodes) {
    const text = node.data;
    matcher.lastIndex = 0;
    const fragment = document.createDocumentFragment();
    let cursor = 0;
    let match: RegExpExecArray | null;
    while ((match = matcher.exec(text))) {
      fragment.append(text.slice(cursor, match.index));
      const highlight = document.createElement('mark');
      highlight.className = matchIndex === activeMatchIndex
        ? `${matchClass} ${activeMatchClass}`
        : matchClass;
      highlight.textContent = match[0];
      fragment.append(highlight);
      cursor = match.index + match[0].length;
      matchIndex += 1;
    }
    if (cursor > 0) {
      fragment.append(text.slice(cursor));
      node.replaceWith(fragment);
    }
  }
}
