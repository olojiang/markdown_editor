import { describe, expect, it } from 'vitest';
import { buildHeadingTree, filterHeadingTree, renderMarkdown } from '@/renderer/lib/markdown';

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

    expect(html).toContain('id="flow"');
    expect(html).toContain('data-source-line="1"');
    expect(html).toContain('class="mermaid"');
    expect(html).toContain('data-mermaid-action="fullscreen"');
    expect(html).toContain('data-mermaid-action="download-svg"');
    expect(html).toContain('data-mermaid-action="download-png"');
    expect(html).toContain('data-mermaid-action="download-webp"');
    expect(html).toContain('graph TD');
  });

  it('adds source line anchors to rendered block elements', () => {
    const html = renderMarkdown('# Title\n\nParagraph\n\n## Section');

    expect(html).toContain('data-source-line="1"');
    expect(html).toContain('data-source-line="3"');
    expect(html).toContain('data-source-line="5"');
  });

  it('wraps regular code blocks with a copy action', () => {
    const html = renderMarkdown('```python\nprint("hello")\n```\n\n    indented()');

    expect(html).toContain('class="markdown-code-frame"');
    expect(html).toContain('data-code-action="copy"');
    expect(html).toContain('aria-label="复制代码"');
    expect(html).toContain('class="language-python"');
    expect(html).toContain('code-token-builtin">print</span>');
    expect(html).toContain('code-token-string">&quot;hello&quot;</span>');
    expect(html).toContain('code-token-function">indented</span>');
  });

  it('adds syntax token spans without removing the copyable text', () => {
    const html = renderMarkdown('```python\nimport math\n# comment\nreturn None\n```');

    expect(html).toContain('code-token-keyword">import</span>');
    expect(html).toContain('code-token-comment"># comment</span>');
    expect(html).toContain('code-token-keyword">return</span>');
    expect(html).toContain('code-token-literal">None</span>');
  });
});

describe('filterHeadingTree', () => {
  it('keeps matching headings and their parents visible', () => {
    const tree = buildHeadingTree('# Guide\n\n## Install\n\n## Usage');

    expect(filterHeadingTree(tree, 'usage')).toEqual([
      {
        id: 'guide',
        level: 1,
        title: 'Guide',
        collapsed: false,
        children: [
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
});
