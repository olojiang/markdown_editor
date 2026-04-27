import { describe, expect, it } from 'vitest';
import { buildHeadingTree, renderMarkdown } from '@/renderer/lib/markdown';

describe('buildHeadingTree', () => {
  it('returns collapsible heading nodes with stable slugs', () => {
    const tree = buildHeadingTree('# Guide\n\n## Install\n\n### pnpm\n\n## Usage');

    expect(tree).toEqual([
      {
        id: 'guide',
        level: 1,
        title: 'Guide',
        collapsed: false,
        children: [
          {
            id: 'install',
            level: 2,
            title: 'Install',
            collapsed: false,
            children: [
              {
                id: 'pnpm',
                level: 3,
                title: 'pnpm',
                collapsed: false,
                children: [],
              },
            ],
          },
          {
            id: 'usage',
            level: 2,
            title: 'Usage',
            collapsed: false,
            children: [],
          },
        ],
      },
    ]);
  });

  it('keeps duplicate headings addressable', () => {
    const tree = buildHeadingTree('# API\n\n## API\n\n## API');

    expect(tree[0].id).toBe('api');
    expect(tree[0].children.map((node) => node.id)).toEqual(['api-1', 'api-2']);
  });
});

describe('renderMarkdown', () => {
  it('renders headings with ids and replaces mermaid fences with diagrams', () => {
    const html = renderMarkdown('# Flow\n\n```mermaid\ngraph TD\nA-->B\n```');

    expect(html).toContain('<h1 id="flow">Flow</h1>');
    expect(html).toContain('class="mermaid"');
    expect(html).toContain('graph TD');
  });
});
