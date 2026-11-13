import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const less = createRequire(import.meta.url)('less') as {
  render(source: string): Promise<{ css: string }>;
};

describe('editor search highlight styles', () => {
  it('uses a readable yellow background and a stronger active-match state', async () => {
    const source = readFileSync(resolve(process.cwd(), 'src/renderer/styles.less'), 'utf8');
    const { css } = await less.render(source);

    expect(css).toMatch(/\.monaco-editor \.editor-search-match\s*\{[^}]*background-color: #ffe082[^}]*color: #302400/);
    expect(css).toMatch(/\.monaco-editor \.editor-search-match-active\s*\{[^}]*background-color: #ffbd3d[^}]*color: #241600/);
    expect(css).toMatch(/\.preview-search-match\s*\{[^}]*background: #ffe082[^}]*color: #302400/);
    expect(css).toMatch(/\.preview-search-match-active\s*\{[^}]*background: #ffbd3d[^}]*color: #241600/);
  });
});
