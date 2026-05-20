import {
  buildDocumentHeadingTree,
  documentKindFromFileName,
  formatJsonDocument,
  renderDocumentPreview,
} from '@/renderer/lib/document';

describe('document helpers', () => {
  it('detects supported document kinds by extension', () => {
    expect(documentKindFromFileName('/tmp/readme.md')).toBe('markdown');
    expect(documentKindFromFileName('/tmp/page.HTML')).toBe('html');
    expect(documentKindFromFileName('/tmp/notes.txt')).toBe('text');
    expect(documentKindFromFileName('/tmp/data.json')).toBe('json');
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

  it('formats JSON with two spaces or a compact single line', () => {
    expect(formatJsonDocument('{"b":1,"a":{"c":2}}')).toBe('{\n  "b": 1,\n  "a": {\n    "c": 2\n  }\n}');
    expect(formatJsonDocument('{"b":1,"a":{"c":2}}', true)).toBe('{"b":1,"a":{"c":2}}');
  });
});
