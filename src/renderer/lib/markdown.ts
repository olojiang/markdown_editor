import MarkdownIt from 'markdown-it';
import { escapeHtml } from 'markdown-it/lib/common/utils.mjs';
import type Token from 'markdown-it/lib/token.mjs';

export interface HeadingNode {
  id: string;
  level: number;
  title: string;
  collapsed: boolean;
  children: HeadingNode[];
}

function slugify(value: string): string {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/<[^>]+>/g, '')
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  return slug || 'section';
}

function createSlugger(): (value: string) => string {
  const seen = new Map<string, number>();

  return (value: string) => {
    const base = slugify(value);
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    return count === 0 ? base : `${base}-${count}`;
  };
}

function plainText(tokens: Token[], index: number): string {
  const inline = tokens[index + 1];
  return inline?.children?.map((child) => child.content).join('') ?? inline?.content ?? '';
}

export function buildHeadingTree(markdown: string): HeadingNode[] {
  const md = new MarkdownIt({ html: false, linkify: true, typographer: true });
  const tokens = md.parse(markdown, {});
  const slug = createSlugger();
  const roots: HeadingNode[] = [];
  const stack: HeadingNode[] = [];

  tokens.forEach((token, index) => {
    if (token.type !== 'heading_open') {
      return;
    }

    const level = Number(token.tag.slice(1));
    const node: HeadingNode = {
      id: slug(plainText(tokens, index)),
      level,
      title: plainText(tokens, index),
      collapsed: false,
      children: [],
    };

    while (stack.length > 0 && stack[stack.length - 1].level >= level) {
      stack.pop();
    }

    const parent = stack[stack.length - 1];
    if (parent) {
      parent.children.push(node);
    } else {
      roots.push(node);
    }
    stack.push(node);
  });

  return roots;
}

export function filterHeadingTree(nodes: HeadingNode[], query: string): HeadingNode[] {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return nodes;
  }

  return nodes.flatMap((node) => {
    const children = filterHeadingTree(node.children, normalizedQuery);
    const matches = node.title.toLowerCase().includes(normalizedQuery);

    if (!matches && children.length === 0) {
      return [];
    }

    return [
      {
        ...node,
        collapsed: false,
        children,
      },
    ];
  });
}

export function renderMarkdown(markdown: string): string {
  const md = new MarkdownIt({ html: false, linkify: true, typographer: true });
  const defaultFence = md.renderer.rules.fence?.bind(md.renderer);
  const slug = createSlugger();
  const sourceLineTokenTypes = new Set([
    'blockquote_open',
    'bullet_list_open',
    'code_block',
    'fence',
    'heading_open',
    'hr',
    'ordered_list_open',
    'paragraph_open',
    'table_open',
  ]);

  function tagSourceLine(token: Token): void {
    const line = token.map?.[0];
    if (typeof line === 'number') {
      token.attrSet('data-source-line', String(line + 1));
    }
  }

  md.renderer.rules.heading_open = (tokens, index, options, env, self) => {
    const id = slug(plainText(tokens, index));
    tokens[index].attrSet('id', id);
    tagSourceLine(tokens[index]);
    return self.renderToken(tokens, index, options);
  };

  md.core.ruler.after('block', 'source_line_attrs', (state) => {
    state.tokens.forEach((token) => {
      if (sourceLineTokenTypes.has(token.type)) {
        tagSourceLine(token);
      }
    });
  });

  md.renderer.rules.fence = (tokens, index, options, env, self) => {
    const token = tokens[index];
    const language = token.info.trim().split(/\s+/)[0]?.toLowerCase();
    const sourceLine = token.attrGet('data-source-line');
    const sourceLineAttr = sourceLine ? ` data-source-line="${sourceLine}"` : '';

    if (language === 'mermaid') {
      return [
        `<div class="mermaid-panzoom"${sourceLineAttr} data-scale="1" data-x="0" data-y="0">`,
        `<pre class="mermaid">${escapeHtml(token.content)}</pre>`,
        '</div>',
      ].join('');
    }

    return defaultFence ? defaultFence(tokens, index, options, env, self) : self.renderToken(tokens, index, options);
  };

  return md.render(markdown);
}
