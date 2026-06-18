import MarkdownIt from 'markdown-it';
import { escapeHtml } from 'markdown-it/lib/common/utils.mjs';
import type Token from 'markdown-it/lib/token.mjs';

export interface HeadingNode {
  id: string;
  level: number;
  sourceLine?: number;
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

function renderCodeCopyButton(): string {
  return [
    '<button class="markdown-code-copy icon-button" type="button" data-code-action="copy" aria-label="复制代码" title="复制代码">',
    '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M8 8h10v12H8z M6 16H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>',
    '</button>',
  ].join('');
}

function normalizeSequenceMessage(message: string): string {
  return message
    .replace(/=>/g, '⇒')
    .replace(/,/g, '，')
    .replace(/\.\.\./g, '…')
    .replace(/[{};]/g, ' ');
}

function quoteMermaidText(value: string): string {
  const trimmed = value.trim();
  if (/^["'].*["']$/.test(trimmed)) {
    return trimmed;
  }
  return `"${trimmed.replace(/"/g, '#quot;')}"`;
}

function shouldQuoteFlowchartLabel(value: string): boolean {
  const trimmed = value.trim();
  return Boolean(trimmed) && !/^["'`]/.test(trimmed) && /[^\w\s-]/u.test(trimmed);
}

function normalizeFlowchartSource(source: string): string {
  if (!/^\s*(?:flowchart|graph)\b/m.test(source)) {
    return source;
  }

  return source.replace(
    /(\b[A-Za-z][\w-]*\s*)([\[{])([^\[\]\{\}\n]*[^\w\s-][^\[\]\{\}\n]*)([\]}])/gu,
    (match, id: string, open: string, label: string, close: string) => {
      return shouldQuoteFlowchartLabel(label) ? `${id}${open}${quoteMermaidText(label)}${close}` : match;
    },
  );
}

function normalizeQuadrantChartSource(source: string): string {
  if (!/^\s*quadrantChart\b/m.test(source)) {
    return source;
  }

  return source.split('\n').map((line) => {
    const indent = line.match(/^\s*/)?.[0] ?? '';
    const trimmed = line.trim();
    const axis = trimmed.match(/^(x-axis|y-axis)\s+(.+?)\s+-->\s+(.+)$/);
    if (axis) {
      return `${indent}${axis[1]} ${quoteMermaidText(axis[2])} --> ${quoteMermaidText(axis[3])}`;
    }

    const quadrant = trimmed.match(/^(quadrant-[1-4])\s+(.+)$/);
    if (quadrant) {
      return `${indent}${quadrant[1]} ${quoteMermaidText(quadrant[2])}`;
    }

    const point = trimmed.match(/^(.+?):\s*(\[[\d.\s,-]+\])$/);
    if (point && !/^["'].*["']$/.test(point[1].trim())) {
      return `${indent}${quoteMermaidText(point[1])}: ${point[2]}`;
    }

    return line;
  }).join('\n');
}

export function normalizeMermaidSource(source: string): string {
  const sequenceNormalized = !/^\s*sequenceDiagram\b/m.test(source)
    ? source
    : source.split('\n').map((line) => {
      const message = line.match(/^(\s*\w+\s*(?:--|-)>>[+-]?\s*\w+\s*:)(.*)$/);
      return message ? `${message[1]}${normalizeSequenceMessage(message[2])}` : line;
    }).join('\n');

  return normalizeQuadrantChartSource(normalizeFlowchartSource(sequenceNormalized));
}

const languageAliases = new Map([
  ['bash', 'shell'],
  ['cjs', 'javascript'],
  ['console', 'shell'],
  ['js', 'javascript'],
  ['jsx', 'javascript'],
  ['mjs', 'javascript'],
  ['py', 'python'],
  ['sh', 'shell'],
  ['shell-session', 'shell'],
  ['ts', 'typescript'],
  ['tsx', 'typescript'],
  ['zsh', 'shell'],
]);

const keywordGroups = {
  generic: new Set([
    'async',
    'await',
    'break',
    'case',
    'catch',
    'class',
    'const',
    'continue',
    'default',
    'def',
    'else',
    'export',
    'for',
    'from',
    'function',
    'if',
    'import',
    'in',
    'let',
    'return',
    'switch',
    'try',
    'while',
  ]),
  javascript: new Set([
    'as',
    'async',
    'await',
    'break',
    'case',
    'catch',
    'class',
    'const',
    'continue',
    'default',
    'delete',
    'do',
    'else',
    'export',
    'extends',
    'finally',
    'for',
    'from',
    'function',
    'if',
    'import',
    'in',
    'instanceof',
    'let',
    'new',
    'of',
    'return',
    'static',
    'super',
    'switch',
    'this',
    'throw',
    'try',
    'typeof',
    'var',
    'void',
    'while',
    'yield',
  ]),
  python: new Set([
    'and',
    'as',
    'assert',
    'async',
    'await',
    'break',
    'class',
    'continue',
    'def',
    'del',
    'elif',
    'else',
    'except',
    'finally',
    'for',
    'from',
    'global',
    'if',
    'import',
    'in',
    'is',
    'lambda',
    'nonlocal',
    'not',
    'or',
    'pass',
    'raise',
    'return',
    'try',
    'while',
    'with',
    'yield',
  ]),
  shell: new Set([
    'case',
    'do',
    'done',
    'elif',
    'else',
    'esac',
    'export',
    'fi',
    'for',
    'function',
    'if',
    'in',
    'local',
    'readonly',
    'return',
    'then',
    'while',
  ]),
  typescript: new Set([
    'abstract',
    'as',
    'async',
    'await',
    'break',
    'case',
    'catch',
    'class',
    'const',
    'continue',
    'default',
    'delete',
    'do',
    'else',
    'enum',
    'export',
    'extends',
    'finally',
    'for',
    'from',
    'function',
    'if',
    'implements',
    'import',
    'in',
    'interface',
    'let',
    'namespace',
    'new',
    'of',
    'private',
    'protected',
    'public',
    'readonly',
    'return',
    'static',
    'super',
    'switch',
    'this',
    'throw',
    'try',
    'type',
    'typeof',
    'var',
    'void',
    'while',
    'yield',
  ]),
};

const literals = new Set([
  'False',
  'None',
  'True',
  'false',
  'null',
  'true',
  'undefined',
]);

const builtins = new Set([
  'Array',
  'Boolean',
  'Date',
  'Error',
  'JSON',
  'Math',
  'Number',
  'Object',
  'Promise',
  'Set',
  'String',
  'console',
  'dict',
  'float',
  'int',
  'len',
  'list',
  'map',
  'print',
  'range',
  'set',
  'str',
  'tuple',
]);

function normalizeCodeLanguage(language: string): keyof typeof keywordGroups | 'json' {
  const normalized = language.trim().toLowerCase();
  const aliased = languageAliases.get(normalized) ?? normalized;

  if (aliased === 'json') {
    return 'json';
  }
  if (aliased in keywordGroups) {
    return aliased as keyof typeof keywordGroups;
  }
  return 'generic';
}

function tokenSpan(kind: string, value: string): string {
  return `<span class="code-token code-token-${kind}">${escapeHtml(value)}</span>`;
}

function isWordStart(char: string): boolean {
  return /[A-Za-z_$]/.test(char);
}

function isWordPart(char: string): boolean {
  return /[\w$]/.test(char);
}

function readQuotedToken(content: string, start: number): number {
  const quote = content[start];
  const isTripleQuote = quote !== '`' && content.slice(start, start + 3) === quote.repeat(3);
  const terminator = isTripleQuote ? quote.repeat(3) : quote;
  let index = start + terminator.length;

  while (index < content.length) {
    if (!isTripleQuote && content[index] === '\\') {
      index += 2;
      continue;
    }
    if (content.slice(index, index + terminator.length) === terminator) {
      return index + terminator.length;
    }
    index += 1;
  }

  return content.length;
}

function readPattern(content: string, start: number, pattern: RegExp): number {
  const match = pattern.exec(content.slice(start));
  return match?.index === 0 ? start + match[0].length : start;
}

export function highlightSyntax(content: string, language: string): string {
  const normalizedLanguage = normalizeCodeLanguage(language);
  const keywords = normalizedLanguage === 'json' ? new Set<string>() : keywordGroups[normalizedLanguage];
  const usesHashComments = normalizedLanguage === 'python' || normalizedLanguage === 'shell' || normalizedLanguage === 'generic';
  const usesSlashComments = normalizedLanguage === 'javascript' || normalizedLanguage === 'typescript' || normalizedLanguage === 'generic';
  let html = '';
  let index = 0;

  while (index < content.length) {
    const char = content[index];
    const next = content[index + 1];

    if (/\s/.test(char)) {
      const end = readPattern(content, index, /^\s+/);
      html += escapeHtml(content.slice(index, end));
      index = end;
      continue;
    }

    if (usesHashComments && char === '#') {
      const end = content.indexOf('\n', index);
      const tokenEnd = end === -1 ? content.length : end;
      html += tokenSpan('comment', content.slice(index, tokenEnd));
      index = tokenEnd;
      continue;
    }

    if (usesSlashComments && char === '/' && next === '/') {
      const end = content.indexOf('\n', index);
      const tokenEnd = end === -1 ? content.length : end;
      html += tokenSpan('comment', content.slice(index, tokenEnd));
      index = tokenEnd;
      continue;
    }

    if (usesSlashComments && char === '/' && next === '*') {
      const end = content.indexOf('*/', index + 2);
      const tokenEnd = end === -1 ? content.length : end + 2;
      html += tokenSpan('comment', content.slice(index, tokenEnd));
      index = tokenEnd;
      continue;
    }

    if (char === '"' || char === '\'' || char === '`') {
      const end = readQuotedToken(content, index);
      html += tokenSpan('string', content.slice(index, end));
      index = end;
      continue;
    }

    if (/\d/.test(char)) {
      const end = readPattern(content, index, /^(?:0x[\da-f]+|0b[01]+|\d+(?:\.\d+)?(?:e[+-]?\d+)?)/i);
      html += tokenSpan('number', content.slice(index, end));
      index = end;
      continue;
    }

    if (char === '@' && isWordStart(next ?? '')) {
      const end = readPattern(content, index, /^@[\w$]+/);
      html += tokenSpan('meta', content.slice(index, end));
      index = end;
      continue;
    }

    if (isWordStart(char)) {
      const end = readPattern(content, index, /^[A-Za-z_$][\w$]*/);
      const word = content.slice(index, end);
      const lookahead = content.slice(end).match(/^\s*(\()/);

      if (keywords.has(word)) {
        html += tokenSpan('keyword', word);
      } else if (literals.has(word)) {
        html += tokenSpan('literal', word);
      } else if (builtins.has(word)) {
        html += tokenSpan('builtin', word);
      } else if (lookahead) {
        html += tokenSpan('function', word);
      } else {
        html += escapeHtml(word);
      }
      index = end;
      continue;
    }

    if (/[+\-*/%=!<>&|^~?:.,;()[\]{}]/.test(char)) {
      html += tokenSpan('operator', char);
      index += 1;
      continue;
    }

    html += escapeHtml(char);
    index += 1;
  }

  return html;
}

function renderCopyableCodeBlock(content: string, language: string, sourceLine: string | null | undefined): string {
  const sourceLineAttr = sourceLine ? ` data-source-line="${escapeHtml(sourceLine)}"` : '';
  const classAttr = language ? ` class="language-${escapeHtml(language)}"` : '';

  return [
    `<div class="markdown-code-frame"${sourceLineAttr}>`,
    renderCodeCopyButton(),
    `<pre><code${classAttr}>${highlightSyntax(content, language)}</code></pre>`,
    '</div>',
  ].join('');
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

  md.renderer.rules.link_open = (tokens, index, options, env, self) => {
    const href = tokens[index].attrGet('href')?.trim() ?? '';
    if (href && !href.startsWith('#')) {
      tokens[index].attrSet('target', '_blank');
      tokens[index].attrSet('rel', 'noopener noreferrer');
    }
    return self.renderToken(tokens, index, options);
  };

  md.core.ruler.after('block', 'source_line_attrs', (state) => {
    state.tokens.forEach((token) => {
      if (sourceLineTokenTypes.has(token.type)) {
        tagSourceLine(token);
      }
    });
  });

  md.renderer.rules.fence = (tokens, index) => {
    const token = tokens[index];
    const language = token.info.trim().split(/\s+/)[0] ?? '';
    const sourceLine = token.attrGet('data-source-line');
    const sourceLineAttr = sourceLine ? ` data-source-line="${sourceLine}"` : '';

    if (language.toLowerCase() === 'mermaid') {
      return [
        `<div class="mermaid-panzoom"${sourceLineAttr} data-scale="1" data-x="0" data-y="0">`,
        '<div class="mermaid-actions" aria-label="Mermaid 图表操作">',
        '<button class="icon-button" type="button" data-mermaid-action="fullscreen" aria-label="全屏查看 Mermaid 图" title="全屏查看 Mermaid 图">⛶</button>',
        '<button class="icon-button" type="button" data-mermaid-action="download-svg" aria-label="导出 SVG" title="导出 SVG">↓</button>',
        '<button class="icon-button" type="button" data-mermaid-action="download-png" aria-label="导出 PNG" title="导出 PNG">▧</button>',
        '<button class="icon-button" type="button" data-mermaid-action="download-webp" aria-label="导出 WebP" title="导出 WebP">▣</button>',
        '</div>',
        `<pre class="mermaid">${escapeHtml(normalizeMermaidSource(token.content))}</pre>`,
        '</div>',
      ].join('');
    }

    return renderCopyableCodeBlock(token.content, language, sourceLine);
  };

  md.renderer.rules.code_block = (tokens, index) => {
    const token = tokens[index];
    return renderCopyableCodeBlock(token.content, '', token.attrGet('data-source-line'));
  };

  md.renderer.rules.table_open = (tokens, index, options, env, self) => {
    const sourceLine = tokens[index].attrGet('data-source-line');
    const sourceLineAttr = sourceLine ? ` data-source-line="${sourceLine}"` : '';
    return `<div class="markdown-table-frame"${sourceLineAttr}>${self.renderToken(tokens, index, options)}`;
  };

  md.renderer.rules.table_close = (tokens, index, options, env, self) => {
    return `${self.renderToken(tokens, index, options)}</div>`;
  };

  return md.render(markdown);
}
