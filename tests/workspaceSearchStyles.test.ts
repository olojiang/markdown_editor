import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const less = createRequire(import.meta.url)('less') as {
  render(source: string): Promise<{ css: string }>;
};

describe('workspace search focus styles', () => {
  it('keeps the focus ring on the field without a second ring on the input', async () => {
    const source = readFileSync(resolve(process.cwd(), 'src/renderer/styles.less'), 'utf8');
    const { css } = await less.render(source);
    const style = document.createElement('style');
    style.textContent = css;
    document.head.append(style);

    const field = document.createElement('label');
    field.className = 'workspace-search-field';
    field.innerHTML = '<input type="search">';
    document.body.append(field);
    const input = field.querySelector('input')!;
    input.focus();

    expect(css).toMatch(/\.workspace-search-field:focus-within\s*\{[^}]*box-shadow: 0 0 0 3px var\(--accent-soft\)/);
    expect(getComputedStyle(input).boxShadow).toBe('none');

    style.remove();
    field.remove();
  });
});
