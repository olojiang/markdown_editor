import { buildHeadingTree, highlightSyntax, renderMarkdown, type HeadingNode } from '@/renderer/lib/markdown';

export type DocumentKind = 'html' | 'json' | 'markdown' | 'text';

const htmlExtensions = new Set(['htm', 'html']);
const jsonExtensions = new Set(['json']);
const markdownExtensions = new Set(['markdown', 'md', 'mdown']);
const textExtensions = new Set(['text', 'txt']);

export const supportedDocumentExtensions = [
  'md',
  'markdown',
  'mdown',
  'html',
  'htm',
  'txt',
  'text',
  'json',
] as const;

export function extensionFromFileName(fileName: string | null | undefined): string {
  const name = fileName ?? '';
  const dotIndex = name.lastIndexOf('.');
  return dotIndex >= 0 ? name.slice(dotIndex + 1).toLowerCase() : '';
}

export function documentKindFromFileName(fileName: string | null | undefined): DocumentKind {
  const extension = extensionFromFileName(fileName);
  if (htmlExtensions.has(extension)) {
    return 'html';
  }
  if (jsonExtensions.has(extension)) {
    return 'json';
  }
  if (textExtensions.has(extension)) {
    return 'text';
  }
  return 'markdown';
}

export function documentLabel(kind: DocumentKind): string {
  if (kind === 'html') {
    return 'HTML';
  }
  if (kind === 'json') {
    return 'JSON';
  }
  if (kind === 'text') {
    return 'Text';
  }
  return 'Markdown';
}

export function isPreviewableDocumentKind(kind: DocumentKind): boolean {
  return kind === 'markdown' || kind === 'html';
}

export function monacoLanguageForDocument(kind: DocumentKind): string {
  if (kind === 'html') {
    return 'html';
  }
  if (kind === 'json') {
    return 'json';
  }
  if (kind === 'text') {
    return 'plaintext';
  }
  return 'markdown';
}

export function escapeHtmlText(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function isUnsafeUrl(value: string): boolean {
  return /^\s*javascript:/i.test(value);
}

function headingLineNumber(source: string, level: number, text: string, index: number): number {
  const lines = source.split('\n');
  const escapedText = text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const headingPattern = new RegExp(`<h${level}\\b[^>]*>.*${escapedText}.*<\\/h${level}>`, 'i');
  const lineIndex = lines.findIndex((line) => headingPattern.test(line));
  return lineIndex >= 0 ? lineIndex + 1 : index + 1;
}

export function sanitizeHtmlPreview(source: string): string {
  if (typeof DOMParser === 'undefined') {
    return source.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
  }

  const document = new DOMParser().parseFromString(source, 'text/html');
  document.querySelectorAll('script, iframe, object, embed, style').forEach((node) => node.remove());
  document.body.querySelectorAll<HTMLElement>('h1, h2, h3, h4, h5, h6').forEach((heading, index) => {
    if (!heading.id) {
      heading.id = `html-heading-${index + 1}`;
    }
    const level = Number(heading.tagName.slice(1));
    heading.dataset.sourceLine = String(headingLineNumber(source, level, heading.textContent?.trim() ?? '', index));
  });
  document.querySelectorAll<HTMLElement>('*').forEach((node) => {
    Array.from(node.attributes).forEach((attribute) => {
      const name = attribute.name.toLowerCase();
      if (name.startsWith('on') || name === 'srcdoc') {
        node.removeAttribute(attribute.name);
        return;
      }
      if ((name === 'href' || name === 'src') && isUnsafeUrl(attribute.value)) {
        node.removeAttribute(attribute.name);
      }
    });
  });

  return document.body.innerHTML;
}

export function renderDocumentPreview(source: string, kind: DocumentKind): string {
  if (kind === 'markdown') {
    return renderMarkdown(source);
  }
  if (kind === 'html') {
    return sanitizeHtmlPreview(source);
  }

  if (kind === 'json') {
    return `<pre class="plain-text-preview language-json"><code class="language-json">${highlightSyntax(source, 'json')}</code></pre>`;
  }

  return `<pre class="plain-text-preview language-text"><code>${escapeHtmlText(source)}</code></pre>`;
}

function nestHeadingNodes(nodes: HeadingNode[]): HeadingNode[] {
  const roots: HeadingNode[] = [];
  const stack: HeadingNode[] = [];

  nodes.forEach((node) => {
    const nextNode = { ...node, children: [] };
    while (stack.length > 0 && stack[stack.length - 1].level >= nextNode.level) {
      stack.pop();
    }
    const parent = stack[stack.length - 1];
    if (parent) {
      parent.children.push(nextNode);
    } else {
      roots.push(nextNode);
    }
    stack.push(nextNode);
  });

  return roots;
}

export function buildDocumentHeadingTree(source: string, kind: DocumentKind): HeadingNode[] {
  if (kind === 'markdown') {
    return buildHeadingTree(source);
  }
  if (kind !== 'html' || typeof DOMParser === 'undefined') {
    return [];
  }

  const document = new DOMParser().parseFromString(source, 'text/html');
  const headings = Array.from(document.body.querySelectorAll('h1, h2, h3, h4, h5, h6'));
  return nestHeadingNodes(headings.map((heading, index) => {
    const text = heading.textContent?.trim() || `Heading ${index + 1}`;
    const tagLevel = Number(heading.tagName.slice(1));
    const sourceLine = headingLineNumber(source, tagLevel, text, index);
    return {
      id: heading.id || `html-heading-${index + 1}`,
      level: tagLevel,
      title: text,
      collapsed: false,
      children: [],
      sourceLine,
    } as HeadingNode & { sourceLine: number };
  }));
}

export function formatJsonDocument(source: string, compact = false): string {
  return JSON.stringify(JSON.parse(source), null, compact ? 0 : 2);
}
