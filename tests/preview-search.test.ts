import { describe, expect, it } from 'vitest';
import { highlightPreviewSearch } from '@/renderer/lib/preview-search';

describe('preview search highlighting', () => {
  it('highlights every rendered match and marks only the active match', () => {
    const preview = document.createElement('article');
    preview.innerHTML = '<p>Server and server</p><p><strong>server</strong> room</p>';

    highlightPreviewSearch(preview, 'server', 1);

    expect(preview.querySelectorAll('.preview-search-match')).toHaveLength(3);
    expect(preview.querySelectorAll('.preview-search-match-active')).toHaveLength(1);
    expect(preview.querySelector('.preview-search-match-active')?.textContent).toBe('server');
  });

  it('clears prior marks before applying a new query', () => {
    const preview = document.createElement('article');
    preview.innerHTML = '<p>server side</p>';

    highlightPreviewSearch(preview, 'server', 0);
    highlightPreviewSearch(preview, 'side', null);

    expect(preview.querySelectorAll('.preview-search-match')).toHaveLength(1);
    expect(preview.querySelector('.preview-search-match')?.textContent).toBe('side');
    expect(preview.textContent).toBe('server side');
  });
});
