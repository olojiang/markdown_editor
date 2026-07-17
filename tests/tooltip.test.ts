import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

function rendererSourceFiles(directory = 'src/renderer'): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      return rendererSourceFiles(entryPath);
    }
    return /\.(?:ts|vue)$/.test(entry.name) ? [entryPath] : [];
  });
}

function buttonStartTags(source: string): Array<{ line: number; tag: string }> {
  const tags: Array<{ line: number; tag: string }> = [];
  let start = source.indexOf('<button');

  while (start !== -1) {
    let quote = '';
    let end = start + '<button'.length;
    for (; end < source.length; end += 1) {
      const character = source[end];
      if (quote) {
        if (character === quote && source[end - 1] !== '\\') {
          quote = '';
        }
      } else if (character === '"' || character === "'") {
        quote = character;
      } else if (character === '>') {
        break;
      }
    }

    tags.push({
      line: source.slice(0, start).split('\n').length,
      tag: source.slice(start, end + 1),
    });
    start = source.indexOf('<button', end + 1);
  }

  return tags;
}

describe('tooltip policy', () => {
  it('does not render a second CSS tooltip from icon button aria labels', () => {
    const stylesSource = fs.readFileSync('src/renderer/styles.less', 'utf8');

    expect(stylesSource).not.toMatch(/\.icon-button[^\{]*::after\s*\{[^}]*content:\s*attr\(aria-label\)/s);
  });

  it('gives every icon button across renderer sources one native title tooltip', () => {
    const missingTitles = rendererSourceFiles().flatMap((file) => {
      const source = fs.readFileSync(file, 'utf8');
      return buttonStartTags(source)
        .filter(({ tag }) => /\bclass\s*=\s*["'][^"']*\bicon-button\b/.test(tag))
        .filter(({ tag }) => !/\s:?title\s*=\s*["']/.test(tag))
        .map(({ line }) => `${file}:${line}`);
    });

    expect(missingTitles).toEqual([]);
  });
});
