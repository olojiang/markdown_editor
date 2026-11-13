import { describe, expect, it } from 'vitest';
import { estimateMarkdownColumnWidths, makeMarkdownTablesResizable } from '../src/renderer/lib/markdown-table-layout';

describe('markdown table layout', () => {
  it('allocates more width to longer values while capping unusually long columns', () => {
    const widths = estimateMarkdownColumnWidths([
      ['Time', 'Revision', 'ReplicaSet', 'Summary'],
      ['2026-11-13 09:00', '66', 'fe-smart-app-server-6dd4f68cf5f', 'A'.repeat(400)],
    ]);

    expect(widths[0]).toBeGreaterThan(widths[1]);
    expect(widths[3]).toBeGreaterThan(widths[0]);
    expect(widths[3]).toBeLessThan(50);
    expect(widths.reduce((sum, width) => sum + width, 0)).toBeCloseTo(100);

    const twoColumnWidths = estimateMarkdownColumnWidths([
      ['Name', 'Summary'],
      ['A', 'A'.repeat(400)],
    ]);
    expect(twoColumnWidths[1]).toBeLessThanOrEqual(45);
  });

  it('adds accessible resize handles to Markdown table headers', () => {
    document.body.innerHTML = '<article><div class="markdown-table-frame"><table><thead><tr><th>Time</th><th>Summary</th></tr></thead><tbody><tr><td>Today</td><td>Updated</td></tr></tbody></table></div></article>';

    makeMarkdownTablesResizable(document.querySelector('article')!);

    expect(document.querySelectorAll('.markdown-table-resizer')).toHaveLength(1);
    expect(document.querySelector('.markdown-table-resizer')?.getAttribute('role')).toBe('separator');
    expect(document.querySelectorAll('colgroup col')).toHaveLength(2);
  });
});
