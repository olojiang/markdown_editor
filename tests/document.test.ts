import {
  buildDocumentHeadingTree,
  documentKindFromFileName,
  formatJsonDocument,
  htmlToMarkdown,
  isPreviewableDocumentKind,
  renderDocumentPreview,
} from '@/renderer/lib/document';

describe('document helpers', () => {
  it('detects supported document kinds by extension', () => {
    expect(documentKindFromFileName('/tmp/readme.md')).toBe('markdown');
    expect(documentKindFromFileName('/tmp/page.HTML')).toBe('html');
    expect(documentKindFromFileName('/tmp/notes.txt')).toBe('text');
    expect(documentKindFromFileName('/tmp/data.json')).toBe('json');
  });

  it('allows preview panes only for Markdown and HTML documents', () => {
    expect(isPreviewableDocumentKind('markdown')).toBe(true);
    expect(isPreviewableDocumentKind('html')).toBe(true);
    expect(isPreviewableDocumentKind('text')).toBe(false);
    expect(isPreviewableDocumentKind('json')).toBe(false);
  });

  it('renders non-markdown previews without interpreting text as HTML', () => {
    const html = renderDocumentPreview('<hello>', 'text');

    expect(html).toContain('&lt;hello&gt;');
    expect(html).toContain('plain-text-preview');
  });

  it('renders JSON previews with syntax tokens', () => {
    const html = renderDocumentPreview('{"ok":true,"count":2}', 'json');

    expect(html).toContain('language-json');
    expect(html).toContain('code-token-string');
    expect(html).toContain('code-token-literal');
    expect(html).toContain('code-token-number');
  });

  it('sanitizes active HTML preview content and keeps headings addressable', () => {
    const html = renderDocumentPreview('<h1>Title</h1><img src="javascript:alert(1)" onerror="x"><script>alert(1)</script>', 'html');

    expect(html).toContain('id="html-heading-1"');
    expect(html).toContain('data-source-line="1"');
    expect(html).not.toContain('<script');
    expect(html).not.toContain('onerror');
    expect(html).not.toContain('javascript:');
  });

  it('builds an HTML heading tree for the table of contents', () => {
    expect(buildDocumentHeadingTree('<h1>Title</h1><h2 id="child">Child</h2>', 'html')).toEqual([
      expect.objectContaining({
        id: 'html-heading-1',
        level: 1,
        title: 'Title',
        children: [expect.objectContaining({ id: 'child', level: 2, title: 'Child' })],
      }),
    ]);
  });

  it('builds a text heading tree from common chapter markers', () => {
    const tree = buildDocumentHeadingTree([
      '序',
      '',
      '’  第一章 差点迟到‘',
      '正文',
      '1. 数字章节',
      '一、中文数字章节',
    ].join('\n'), 'text');

    expect(tree).toEqual([
      expect.objectContaining({ level: 1, sourceLine: 3, title: '第一章 差点迟到' }),
      expect.objectContaining({ level: 1, sourceLine: 5, title: '1. 数字章节' }),
      expect.objectContaining({ level: 1, sourceLine: 6, title: '一、中文数字章节' }),
    ]);
  });

  it('includes Markdown-style headings in text document tables of contents', () => {
    const tree = buildDocumentHeadingTree([
      '# “人母”前篇',
      '正文',
      '## 第二节',
      '### 细节',
      '# C#',
    ].join('\n'), 'text');

    expect(tree).toEqual([
      expect.objectContaining({
        level: 1,
        sourceLine: 1,
        title: '“人母”前篇',
        children: [
          expect.objectContaining({
            level: 2,
            sourceLine: 3,
            title: '第二节',
            children: [
              expect.objectContaining({ level: 3, sourceLine: 4, title: '细节' }),
            ],
          }),
        ],
      }),
      expect.objectContaining({ level: 1, sourceLine: 5, title: 'C#' }),
    ]);
  });

  it('formats JSON with two spaces or a compact single line', () => {
    expect(formatJsonDocument('{"b":1,"a":{"c":2}}')).toBe('{\n  "b": 1,\n  "a": {\n    "c": 2\n  }\n}');
    expect(formatJsonDocument('{"b":1,"a":{"c":2}}', true)).toBe('{"b":1,"a":{"c":2}}');
  });

  it('converts copied rich HTML into Markdown blocks and inline formatting', () => {
    const markdown = htmlToMarkdown(`
      <h2>Why Impeccable?</h2>
      <p>Anthropic's <a href="https://example.com/frontend">frontend-design</a> was <strong>first</strong>.</p>
      <p>Commands include <code>polish</code>, <code>audit</code>, and <em>more</em>.</p>
      <ul>
        <li><strong>7 domain reference files</strong> (<a href="https://example.com/source">view source</a>).</li>
        <li><strong>23 commands.</strong> Shared vocabulary.</li>
      </ul>
    `);

    expect(markdown).toBe([
      '## Why Impeccable?',
      '',
      "Anthropic's [frontend-design](https://example.com/frontend) was **first**.",
      '',
      'Commands include `polish`, `audit`, and *more*.',
      '',
      '- **7 domain reference files** ([view source](https://example.com/source)).',
      '- **23 commands.** Shared vocabulary.',
    ].join('\n'));
  });

  it('converts copied HTML tables into Markdown tables', () => {
    expect(htmlToMarkdown('<table><tr><th>Name</th><th>Count</th></tr><tr><td>Rules</td><td>27</td></tr></table>')).toBe([
      '| Name | Count |',
      '| --- | --- |',
      '| Rules | 27 |',
    ].join('\n'));
  });
});
