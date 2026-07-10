import { describe, expect, it } from 'vitest';
import {
  headingLevelOfLine,
  setLineHeading,
  toggleBold,
  toggleCodeBlock,
  toggleItalic,
  toggleOrderedList,
  toggleQuote,
  toggleUnorderedList,
  type FormatResult,
} from '@/renderer/lib/editor-format';

function applyResult(source: string, result: FormatResult): string {
  return source.slice(0, result.rangeStart) + result.replacement + source.slice(result.rangeEnd);
}

describe('headingLevelOfLine', () => {
  it('returns 0 for plain text', () => {
    expect(headingLevelOfLine('Hello world', 1)).toBe(0);
  });

  it('returns heading level 1-4', () => {
    expect(headingLevelOfLine('# Title', 1)).toBe(1);
    expect(headingLevelOfLine('## Section', 1)).toBe(2);
    expect(headingLevelOfLine('### Sub', 1)).toBe(3);
    expect(headingLevelOfLine('#### Deep', 1)).toBe(4);
  });

  it('caps at 4 for levels 5-6', () => {
    expect(headingLevelOfLine('##### L5', 1)).toBe(4);
    expect(headingLevelOfLine('###### L6', 1)).toBe(4);
  });

  it('returns 0 for # without trailing space', () => {
    expect(headingLevelOfLine('#NoSpace', 1)).toBe(0);
  });

  it('handles multi-line text with line numbers', () => {
    const text = 'line one\n## Heading\nline three';
    expect(headingLevelOfLine(text, 1)).toBe(0);
    expect(headingLevelOfLine(text, 2)).toBe(2);
    expect(headingLevelOfLine(text, 3)).toBe(0);
  });

  it('returns 0 for out-of-range line numbers', () => {
    expect(headingLevelOfLine('text', 0)).toBe(0);
    expect(headingLevelOfLine('text', 5)).toBe(0);
  });
});

describe('setLineHeading', () => {
  it('adds H1 prefix to plain text', () => {
    const result = setLineHeading('Hello', 3, 1);
    expect(applyResult('Hello', result)).toBe('# Hello');
  });

  it('adds H2 prefix to plain text', () => {
    const result = setLineHeading('Hello', 0, 2);
    expect(applyResult('Hello', result)).toBe('## Hello');
  });

  it('changes H1 to H3', () => {
    const result = setLineHeading('# Hello', 5, 3);
    expect(applyResult('# Hello', result)).toBe('### Hello');
  });

  it('removes heading prefix for level 0', () => {
    const result = setLineHeading('## Hello', 4, 0);
    expect(applyResult('## Hello', result)).toBe('Hello');
  });

  it('preserves heading when setting same level', () => {
    const result = setLineHeading('## Title', 5, 2);
    expect(applyResult('## Title', result)).toBe('## Title');
  });

  it('operates on the correct line in multi-line text', () => {
    const source = 'Line 1\nLine 2\nLine 3';
    const cursorOffset = 8;
    const result = setLineHeading(source, cursorOffset, 2);
    expect(applyResult(source, result)).toBe('Line 1\n## Line 2\nLine 3');
  });

  it('handles empty line', () => {
    const result = setLineHeading('', 0, 1);
    expect(applyResult('', result)).toBe('# ');
  });

  it('adjusts cursor position when adding prefix', () => {
    const result = setLineHeading('Hello', 3, 1);
    expect(result.cursorStart).toBe(3 + 2);
    expect(result.cursorEnd).toBe(3 + 2);
  });

  it('adjusts cursor position when removing prefix', () => {
    const result = setLineHeading('## Hello', 5, 0);
    expect(result.cursorStart).toBe(5 - 3);
    expect(result.cursorEnd).toBe(5 - 3);
  });

  it('moves cursor to after prefix when cursor is in prefix area', () => {
    const result = setLineHeading('## Hello', 1, 3);
    expect(result.cursorStart).toBe(4);
  });

  it('handles line not starting with heading marker without space', () => {
    const source = '#NoSpace';
    const result = setLineHeading(source, 4, 1);
    expect(applyResult(source, result)).toBe('# #NoSpace');
  });
});

describe('toggleBold', () => {
  it('wraps selected text with **', () => {
    const result = toggleBold('Hello world', 6, 11);
    expect(applyResult('Hello world', result)).toBe('Hello **world**');
    expect(result.cursorStart).toBe(2);
    expect(result.cursorEnd).toBe(7);
  });

  it('unwraps when selection includes ** markers', () => {
    const result = toggleBold('Hello **world** end', 6, 15);
    expect(applyResult('Hello **world** end', result)).toBe('Hello world end');
    expect(result.cursorStart).toBe(0);
    expect(result.cursorEnd).toBe(5);
  });

  it('unwraps when ** markers surround selection', () => {
    const result = toggleBold('Hello **world** end', 8, 13);
    expect(applyResult('Hello **world** end', result)).toBe('Hello world end');
    expect(result.cursorStart).toBe(0);
    expect(result.cursorEnd).toBe(5);
  });

  it('inserts placeholder when no text selected', () => {
    const result = toggleBold('Hello ', 6, 6);
    expect(applyResult('Hello ', result)).toBe('Hello **粗体文本**');
    expect(result.cursorStart).toBe(2);
    expect(result.cursorEnd).toBe(2 + '粗体文本'.length);
  });

  it('wraps at beginning of text', () => {
    const result = toggleBold('Hello', 0, 5);
    expect(applyResult('Hello', result)).toBe('**Hello**');
  });

  it('handles empty source', () => {
    const result = toggleBold('', 0, 0);
    expect(applyResult('', result)).toBe('**粗体文本**');
  });
});

describe('toggleItalic', () => {
  it('wraps selected text with *', () => {
    const result = toggleItalic('Hello world', 6, 11);
    expect(applyResult('Hello world', result)).toBe('Hello *world*');
    expect(result.cursorStart).toBe(1);
    expect(result.cursorEnd).toBe(6);
  });

  it('unwraps when selection includes * markers', () => {
    const result = toggleItalic('Hello *world* end', 6, 13);
    expect(applyResult('Hello *world* end', result)).toBe('Hello world end');
  });

  it('unwraps when * markers surround selection', () => {
    const result = toggleItalic('Hello *world* end', 7, 12);
    expect(applyResult('Hello *world* end', result)).toBe('Hello world end');
  });

  it('inserts placeholder when no text selected', () => {
    const result = toggleItalic('text ', 5, 5);
    expect(applyResult('text ', result)).toBe('text *斜体文本*');
  });

  it('handles empty source', () => {
    const result = toggleItalic('', 0, 0);
    expect(applyResult('', result)).toBe('*斜体文本*');
  });
});

describe('toggleQuote', () => {
  it('adds > prefix to single line', () => {
    const result = toggleQuote('Hello world', 0, 11);
    expect(applyResult('Hello world', result)).toBe('> Hello world');
  });

  it('removes > prefix from single line', () => {
    const result = toggleQuote('> Hello world', 0, 13);
    expect(applyResult('> Hello world', result)).toBe('Hello world');
  });

  it('adds > prefix to multiple lines', () => {
    const source = 'Line 1\nLine 2\nLine 3';
    const result = toggleQuote(source, 0, 20);
    expect(applyResult(source, result)).toBe('> Line 1\n> Line 2\n> Line 3');
  });

  it('removes > prefix from multiple lines', () => {
    const source = '> Line 1\n> Line 2\n> Line 3';
    const result = toggleQuote(source, 0, 26);
    expect(applyResult(source, result)).toBe('Line 1\nLine 2\nLine 3');
  });

  it('adds > prefix when some lines are already quoted', () => {
    const source = '> Line 1\nLine 2\n> Line 3';
    const result = toggleQuote(source, 0, 24);
    expect(applyResult(source, result)).toBe('> > Line 1\n> Line 2\n> > Line 3');
  });

  it('preserves empty lines', () => {
    const source = 'Line 1\n\nLine 3';
    const result = toggleQuote(source, 0, 14);
    expect(applyResult(source, result)).toBe('> Line 1\n\n> Line 3');
  });

  it('handles cursor in the middle of a line (no selection)', () => {
    const source = 'Hello world';
    const result = toggleQuote(source, 5, 5);
    expect(applyResult(source, result)).toBe('> Hello world');
  });

  it('removes bare > without trailing space', () => {
    const result = toggleQuote('>', 0, 1);
    expect(applyResult('>', result)).toBe('');
  });
});

describe('toggleCodeBlock', () => {
  it('wraps single-line selection in inline backticks', () => {
    const result = toggleCodeBlock('const x = 1;', 0, 12);
    expect(applyResult('const x = 1;', result)).toBe('`const x = 1;`');
  });

  it('unwraps inline backticks when selected', () => {
    const result = toggleCodeBlock('`const x = 1;`', 0, 14);
    expect(applyResult('`const x = 1;`', result)).toBe('const x = 1;');
  });

  it('unwraps code fences when selected', () => {
    const source = '```\nconst x = 1;\n```';
    const result = toggleCodeBlock(source, 0, source.length);
    expect(applyResult(source, result)).toBe('const x = 1;');
  });

  it('inserts placeholder when no text selected', () => {
    const result = toggleCodeBlock('', 0, 0);
    expect(applyResult('', result)).toBe('```\n代码\n```');
    expect(result.cursorStart).toBe(4);
    expect(result.cursorEnd).toBe(4 + '代码'.length);
  });

  it('wraps multi-line selection', () => {
    const source = 'Line 1\nLine 2';
    const result = toggleCodeBlock(source, 0, source.length);
    expect(applyResult(source, result)).toBe('```\nLine 1\nLine 2\n```');
  });

  it('does not unwrap partial code fences', () => {
    const source = '```\ncode';
    const result = toggleCodeBlock(source, 0, source.length);
    expect(applyResult(source, result)).toBe('```\n```\ncode\n```');
  });

  it('unwraps code fences with language specifier', () => {
    const source = '```js\nconst x = 1;\n```';
    const result = toggleCodeBlock(source, 0, source.length);
    expect(applyResult(source, result)).toBe('const x = 1;');
  });
});

describe('toggleOrderedList', () => {
  it('adds numbered prefix to single line', () => {
    const result = toggleOrderedList('Item one', 0, 8);
    expect(applyResult('Item one', result)).toBe('1. Item one');
  });

  it('removes numbered prefix from single line', () => {
    const result = toggleOrderedList('1. Item one', 0, 11);
    expect(applyResult('1. Item one', result)).toBe('Item one');
  });

  it('numbers multiple lines sequentially', () => {
    const source = 'Apple\nBanana\nCherry';
    const result = toggleOrderedList(source, 0, source.length);
    expect(applyResult(source, result)).toBe('1. Apple\n2. Banana\n3. Cherry');
  });

  it('removes numbers from multiple lines', () => {
    const source = '1. Apple\n2. Banana\n3. Cherry';
    const result = toggleOrderedList(source, 0, source.length);
    expect(applyResult(source, result)).toBe('Apple\nBanana\nCherry');
  });

  it('preserves empty lines', () => {
    const source = 'A\n\nB';
    const result = toggleOrderedList(source, 0, source.length);
    expect(applyResult(source, result)).toBe('1. A\n\n2. B');
  });

  it('handles cursor with no selection', () => {
    const result = toggleOrderedList('Item', 2, 2);
    expect(applyResult('Item', result)).toBe('1. Item');
  });

  it('handles multi-digit numbered list removal', () => {
    const result = toggleOrderedList('12. Item twelve', 0, 15);
    expect(applyResult('12. Item twelve', result)).toBe('Item twelve');
  });
});

describe('toggleUnorderedList', () => {
  it('adds - prefix to single line', () => {
    const result = toggleUnorderedList('Item one', 0, 8);
    expect(applyResult('Item one', result)).toBe('- Item one');
  });

  it('removes - prefix from single line', () => {
    const result = toggleUnorderedList('- Item one', 0, 10);
    expect(applyResult('- Item one', result)).toBe('Item one');
  });

  it('adds - prefix to multiple lines', () => {
    const source = 'Apple\nBanana\nCherry';
    const result = toggleUnorderedList(source, 0, source.length);
    expect(applyResult(source, result)).toBe('- Apple\n- Banana\n- Cherry');
  });

  it('removes - prefix from multiple lines', () => {
    const source = '- Apple\n- Banana\n- Cherry';
    const result = toggleUnorderedList(source, 0, source.length);
    expect(applyResult(source, result)).toBe('Apple\nBanana\nCherry');
  });

  it('preserves empty lines', () => {
    const source = 'A\n\nB';
    const result = toggleUnorderedList(source, 0, source.length);
    expect(applyResult(source, result)).toBe('- A\n\n- B');
  });

  it('handles cursor with no selection', () => {
    const result = toggleUnorderedList('Item', 2, 2);
    expect(applyResult('Item', result)).toBe('- Item');
  });

  it('adds prefix when mix of prefixed and unprefixed', () => {
    const source = '- Apple\nBanana';
    const result = toggleUnorderedList(source, 0, source.length);
    expect(applyResult(source, result)).toBe('- - Apple\n- Banana');
  });
});
