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

export function renderMarkdown(markdown: string): string {
  const md = new MarkdownIt({ html: false, linkify: true, typographer: true });
  const defaultFence = md.renderer.rules.fence?.bind(md.renderer);
  const slug = createSlugger();

  md.renderer.rules.heading_open = (tokens, index, options, env, self) => {
    const id = slug(plainText(tokens, index));
    tokens[index].attrSet('id', id);
    return self.renderToken(tokens, index, options);
  };

  md.renderer.rules.fence = (tokens, index, options, env, self) => {
    const token = tokens[index];
    const language = token.info.trim().split(/\s+/)[0]?.toLowerCase();

    if (language === 'mermaid') {
      return [
        '<div class="mermaid-panzoom" data-scale="1" data-x="0" data-y="0">',
        `<pre class="mermaid">${escapeHtml(token.content)}</pre>`,
        '</div>',
      ].join('');
    }

    return defaultFence ? defaultFence(tokens, index, options, env, self) : self.renderToken(tokens, index, options);
  };

  return md.render(markdown);
}
