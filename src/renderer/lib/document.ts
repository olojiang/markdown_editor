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

function markdownText(value: string): string {
  return value
    .replace(/\s+/g, ' ')
    .replace(/\\/g, '\\\\')
    .replace(/([`*_[\]])/g, '\\$1');
}

function normalizeInlineWhitespace(value: string): string {
  return value.replace(/[ \t\r\n]+/g, ' ');
}

function trimMarkdownBlock(value: string): string {
  return value
    .split('\n')
    .map((line) => line.replace(/[ \t]+$/g, ''))
    .join('\n')
    .trim();
}

function escapeMarkdownUrl(value: string): string {
  return value.replace(/\s/g, '%20').replace(/\)/g, '%29');
}

function slugifyTextHeading(value: string): string {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  return slug || 'chapter';
}

function createTextHeadingSlugger(): (value: string) => string {
  const seen = new Map<string, number>();

  return (value: string) => {
    const base = slugifyTextHeading(value);
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    return count === 0 ? base : `${base}-${count}`;
  };
}

function codeFenceFor(value: string): string {
  const longestFence = value.match(/`{3,}/g)?.reduce((max, fence) => Math.max(max, fence.length), 2) ?? 2;
  return '`'.repeat(longestFence + 1);
}

function inlineMarkdownForNode(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) {
    return markdownText(node.textContent ?? '');
  }
  if (node.nodeType !== Node.ELEMENT_NODE) {
    return '';
  }

  const element = node as HTMLElement;
  const tagName = element.tagName.toLowerCase();
  if (tagName === 'br') {
    return '  \n';
  }
  if (tagName === 'script' || tagName === 'style' || tagName === 'meta') {
    return '';
  }
  if (tagName === 'img') {
    const src = element.getAttribute('src')?.trim() ?? '';
    if (!src || isUnsafeUrl(src)) {
      return markdownText(element.getAttribute('alt') ?? '');
    }
    const alt = (element.getAttribute('alt') ?? '').replace(/]/g, '\\]');
    return `![${alt}](${escapeMarkdownUrl(src)})`;
  }

  const children = normalizeInlineWhitespace(Array.from(element.childNodes).map(inlineMarkdownForNode).join(''));
  if (!children.trim()) {
    return '';
  }
  if (tagName === 'strong' || tagName === 'b') {
    return `**${children.trim()}**`;
  }
  if (tagName === 'em' || tagName === 'i') {
    return `*${children.trim()}*`;
  }
  if (tagName === 'code') {
    const content = (element.textContent ?? '').replace(/`/g, '\\`');
    return `\`${content}\``;
  }
  if (tagName === 'a') {
    const href = element.getAttribute('href')?.trim() ?? '';
    if (!href || isUnsafeUrl(href)) {
      return children;
    }
    return `[${children.trim().replace(/]/g, '\\]')}](${escapeMarkdownUrl(href)})`;
  }

  return children;
}

function inlineMarkdownForElement(element: Element): string {
  return normalizeInlineWhitespace(Array.from(element.childNodes).map(inlineMarkdownForNode).join('')).trim();
}

function tableMarkdownForElement(table: Element): string {
  const rows = Array.from(table.querySelectorAll('tr'))
    .map((row) => Array.from(row.children)
      .filter((cell) => ['td', 'th'].includes(cell.tagName.toLowerCase()))
      .map((cell) => inlineMarkdownForElement(cell).replace(/\|/g, '\\|')));
  if (rows.length === 0 || rows[0].length === 0) {
    return '';
  }

  const columnCount = Math.max(...rows.map((row) => row.length));
  const normalizedRows = rows.map((row) => Array.from({ length: columnCount }, (_, index) => row[index] ?? ''));
  const header = normalizedRows[0];
  const divider = Array.from({ length: columnCount }, () => '---');
  const body = normalizedRows.slice(1);
  return [header, divider, ...body].map((row) => `| ${row.join(' | ')} |`).join('\n');
}

function listMarkdownForElement(list: Element, depth: number): string {
  const ordered = list.tagName.toLowerCase() === 'ol';
  const items = Array.from(list.children).filter((child) => child.tagName.toLowerCase() === 'li');
  return items.map((item, index) => {
    const nestedLists: Element[] = [];
    const parts = Array.from(item.childNodes).map((child) => {
      if (child.nodeType === Node.ELEMENT_NODE) {
        const childElement = child as Element;
        const tagName = childElement.tagName.toLowerCase();
        if (tagName === 'ul' || tagName === 'ol') {
          nestedLists.push(childElement);
          return '';
        }
        if (['p', 'div'].includes(tagName)) {
          return inlineMarkdownForElement(childElement);
        }
      }
      return inlineMarkdownForNode(child);
    });
    const marker = ordered ? `${index + 1}.` : '-';
    const indent = '  '.repeat(depth);
    const text = normalizeInlineWhitespace(parts.join('')).trim();
    const nested = nestedLists.map((nestedList) => listMarkdownForElement(nestedList, depth + 1)).filter(Boolean).join('\n');
    return [`${indent}${marker} ${text}`, nested].filter(Boolean).join('\n');
  }).join('\n');
}

function blockMarkdownForElement(element: Element, depth = 0): string {
  const tagName = element.tagName.toLowerCase();
  if (tagName === 'script' || tagName === 'style' || tagName === 'meta') {
    return '';
  }
  if (/^h[1-6]$/.test(tagName)) {
    const level = Number(tagName.slice(1));
    return `${'#'.repeat(level)} ${inlineMarkdownForElement(element)}`;
  }
  if (tagName === 'p') {
    return inlineMarkdownForElement(element);
  }
  if (tagName === 'blockquote') {
    return blockMarkdownForNodes(Array.from(element.childNodes), depth)
      .split('\n')
      .map((line) => line ? `> ${line}` : '>')
      .join('\n');
  }
  if (tagName === 'pre') {
    const code = element.textContent?.replace(/\n+$/g, '') ?? '';
    const fence = codeFenceFor(code);
    return `${fence}\n${code}\n${fence}`;
  }
  if (tagName === 'ul' || tagName === 'ol') {
    return listMarkdownForElement(element, depth);
  }
  if (tagName === 'table') {
    return tableMarkdownForElement(element);
  }
  if (tagName === 'hr') {
    return '---';
  }
  if (tagName === 'img') {
    return inlineMarkdownForNode(element);
  }
  if (['div', 'section', 'article', 'main', 'body'].includes(tagName)) {
    return blockMarkdownForNodes(Array.from(element.childNodes), depth);
  }

  return inlineMarkdownForElement(element);
}

function blockMarkdownForNodes(nodes: Node[], depth = 0): string {
  return nodes.map((node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      return markdownText(node.textContent ?? '').trim();
    }
    if (node.nodeType !== Node.ELEMENT_NODE) {
      return '';
    }
    return blockMarkdownForElement(node as Element, depth);
  }).map(trimMarkdownBlock).filter(Boolean).join('\n\n');
}

export function htmlToMarkdown(source: string): string {
  if (!source.trim()) {
    return '';
  }
  if (typeof DOMParser === 'undefined') {
    return source.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').trim();
  }

  const document = new DOMParser().parseFromString(source, 'text/html');
  return trimMarkdownBlock(blockMarkdownForElement(document.body));
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

const chineseChapterNumber = '[零〇一二两三四五六七八九十百千万壹贰叁肆伍陆柒捌玖拾佰仟萬]+';
const arabicChapterNumber = '[0-9０-９]+';
const chapterNumber = `(?:${arabicChapterNumber}|${chineseChapterNumber})`;
const explicitChapterPattern = new RegExp(`^第\\s*${chapterNumber}\\s*(?:章节|章|节|回|卷|部|篇|集)`, 'u');
const numberedChapterPattern = new RegExp(`^${chapterNumber}\\s*(?:[、.．,，:：)）-]|\\s+)`, 'u');
const bareChapterNumberPattern = new RegExp(`^${chapterNumber}$`, 'u');
const markdownTextHeadingPattern = /^(#{1,6})[ \t]+(.+?)(?:[ \t]+#+[ \t]*)?$/u;
const surroundingQuotePattern = /^[\s'"‘’“”「」『』《》【】([{（]+|[\s'"‘’“”「」『』《》【】)\]}）]+$/gu;

function normalizeTextChapterLine(line: string): string {
  return line.replace(surroundingQuotePattern, '').trim();
}

function isTextChapterLine(line: string): boolean {
  const title = normalizeTextChapterLine(line);
  if (!title || title.length > 80) {
    return false;
  }

  return explicitChapterPattern.test(title)
    || numberedChapterPattern.test(title)
    || bareChapterNumberPattern.test(title);
}

export function buildTextHeadingTree(source: string): HeadingNode[] {
  const slug = createTextHeadingSlugger();
  const headings = source
    .split('\n')
    .flatMap((line, index) => {
      const markdownHeading = normalizeTextChapterLine(line).match(markdownTextHeadingPattern);
      if (markdownHeading) {
        const title = markdownHeading[2].trim();
        return title
          ? [{
            id: slug(title),
            level: markdownHeading[1].length,
            sourceLine: index + 1,
            title,
            collapsed: false,
            children: [],
          }]
          : [];
      }

      const title = normalizeTextChapterLine(line);
      if (!isTextChapterLine(title)) {
        return [];
      }
      return [{
        id: slug(title),
        level: 1,
        sourceLine: index + 1,
        title,
        collapsed: false,
        children: [],
      }];
    });

  return nestHeadingNodes(headings);
}

export function buildDocumentHeadingTree(source: string, kind: DocumentKind): HeadingNode[] {
  if (kind === 'markdown') {
    return buildHeadingTree(source);
  }
  if (kind === 'text') {
    return buildTextHeadingTree(source);
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
