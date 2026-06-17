import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('preview styles', () => {
  it('keeps Markdown heading sizes descending inside the article preview', () => {
    const stylesSource = fs.readFileSync('src/renderer/styles.less', 'utf8');
    const previewStart = stylesSource.indexOf('.preview {');
    const previewEnd = stylesSource.indexOf('.html-preview-frame', previewStart);
    const previewStyles = stylesSource.slice(previewStart, previewEnd);
    const headingSizes = Array.from(previewStyles.matchAll(/h([1-6])\s*\{\s*[^}]*font-size:\s*([0-9.]+)em;/g))
      .sort((left, right) => Number(left[1]) - Number(right[1]))
      .map((match) => Number(match[2]));

    expect(headingSizes).toHaveLength(6);
    expect(headingSizes).toEqual([...headingSizes].sort((left, right) => right - left));
  });

  it('keeps nested Markdown list indentation compact in the article preview', () => {
    const stylesSource = fs.readFileSync('src/renderer/styles.less', 'utf8');
    const previewStart = stylesSource.indexOf('.preview {');
    const previewEnd = stylesSource.indexOf('.html-preview-frame', previewStart);
    const previewStyles = stylesSource.slice(previewStart, previewEnd);

    expect(previewStyles).toContain('padding-left: 1.35em;');
    expect(previewStyles).toContain('li > ul,');
    expect(previewStyles).toContain('padding-left: 1.1em;');
  });
});
