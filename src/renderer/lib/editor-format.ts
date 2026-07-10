import { rendererLog } from '@/renderer/lib/logger';

export interface FormatResult {
  rangeStart: number;
  rangeEnd: number;
  replacement: string;
  cursorStart: number;
  cursorEnd: number;
}

export type HeadingLevel = 0 | 1 | 2 | 3 | 4;

const headingPattern = /^(#{1,6})\s/;
const orderedListPattern = /^\d+\.\s/;

function lineRangeAt(text: string, offset: number): { lineStart: number; lineEnd: number } {
  const safeOffset = Math.min(Math.max(0, offset), text.length);
  const lineStart = text.lastIndexOf('\n', safeOffset - 1) + 1;
  const lineEndIdx = text.indexOf('\n', safeOffset);
  return { lineStart, lineEnd: lineEndIdx === -1 ? text.length : lineEndIdx };
}

function expandToFullLines(
  source: string,
  start: number,
  end: number,
): { rangeStart: number; rangeEnd: number } {
  const rangeStart = source.lastIndexOf('\n', start - 1) + 1;
  const effectiveEnd = end > start && end > 0 && source[end - 1] === '\n' ? end - 1 : end;
  const endIdx = source.indexOf('\n', effectiveEnd);
  return { rangeStart, rangeEnd: endIdx === -1 ? source.length : endIdx };
}

export function headingLevelOfLine(text: string, lineNumber: number): number {
  const lines = text.split('\n');
  const line = lines[lineNumber - 1] ?? '';
  const match = headingPattern.exec(line);
  return match ? Math.min(match[1].length, 4) : 0;
}

export function setLineHeading(
  source: string,
  cursorOffset: number,
  level: HeadingLevel,
): FormatResult {
  const { lineStart, lineEnd } = lineRangeAt(source, cursorOffset);
  const line = source.slice(lineStart, lineEnd);

  const match = headingPattern.exec(line);
  const oldPrefixLen = match ? match[0].length : 0;
  const content = line.slice(oldPrefixLen);

  const newPrefix = level > 0 ? '#'.repeat(level) + ' ' : '';
  const replacement = newPrefix + content;

  const cursorInLine = Math.min(cursorOffset - lineStart, line.length);
  const contentOffset = Math.max(0, cursorInLine - oldPrefixLen);
  const newCursorInLine = newPrefix.length + contentOffset;

  rendererLog.info('editor.format.heading', { level, oldPrefixLen, newPrefixLen: newPrefix.length });

  return {
    rangeStart: lineStart,
    rangeEnd: lineEnd,
    replacement,
    cursorStart: newCursorInLine,
    cursorEnd: newCursorInLine,
  };
}

function toggleInlineMarker(
  source: string,
  start: number,
  end: number,
  marker: string,
  placeholder: string,
): FormatResult {
  const ml = marker.length;
  const selected = source.slice(start, end);

  if (selected.length >= ml * 2 && selected.startsWith(marker) && selected.endsWith(marker)) {
    const inner = selected.slice(ml, -ml);
    return { rangeStart: start, rangeEnd: end, replacement: inner, cursorStart: 0, cursorEnd: inner.length };
  }

  if (
    start >= ml && end + ml <= source.length
    && source.slice(start - ml, start) === marker
    && source.slice(end, end + ml) === marker
  ) {
    return { rangeStart: start - ml, rangeEnd: end + ml, replacement: selected, cursorStart: 0, cursorEnd: selected.length };
  }

  if (start === end) {
    const wrapped = marker + placeholder + marker;
    return { rangeStart: start, rangeEnd: end, replacement: wrapped, cursorStart: ml, cursorEnd: ml + placeholder.length };
  }

  const wrapped = marker + selected + marker;
  return { rangeStart: start, rangeEnd: end, replacement: wrapped, cursorStart: ml, cursorEnd: ml + selected.length };
}

export function toggleBold(source: string, start: number, end: number): FormatResult {
  rendererLog.info('editor.format.bold', { start, end });
  return toggleInlineMarker(source, start, end, '**', '粗体文本');
}

export function toggleItalic(source: string, start: number, end: number): FormatResult {
  rendererLog.info('editor.format.italic', { start, end });
  return toggleInlineMarker(source, start, end, '*', '斜体文本');
}

function toggleLinePrefix(
  source: string,
  start: number,
  end: number,
  isPrefix: (line: string) => boolean,
  addPrefix: (line: string, index: number) => string,
  removePrefix: (line: string) => string,
): FormatResult {
  const { rangeStart, rangeEnd } = expandToFullLines(source, start, end);
  const block = source.slice(rangeStart, rangeEnd);
  const lines = block.split('\n');

  const nonEmptyLines = lines.filter((l) => l.trim() !== '');
  const allPrefixed = nonEmptyLines.length > 0 && nonEmptyLines.every(isPrefix);

  const newLines = allPrefixed
    ? lines.map((line) => (line.trim() === '' ? line : removePrefix(line)))
    : lines.map((line, i) => (line.trim() === '' ? line : addPrefix(line, i)));

  const replacement = newLines.join('\n');
  return { rangeStart, rangeEnd, replacement, cursorStart: 0, cursorEnd: replacement.length };
}

export function toggleQuote(source: string, start: number, end: number): FormatResult {
  rendererLog.info('editor.format.quote', { start, end });
  return toggleLinePrefix(
    source, start, end,
    (line) => line.startsWith('> ') || line === '>',
    (line) => `> ${line}`,
    (line) => (line.startsWith('> ') ? line.slice(2) : line === '>' ? '' : line),
  );
}

export function toggleCodeBlock(source: string, start: number, end: number): FormatResult {
  const selected = source.slice(start, end);
  const isMultiLine = selected.includes('\n');

  if (!isMultiLine && start !== end) {
    rendererLog.info('editor.format.codeBlock', { start, end, mode: 'inline' });
    return toggleInlineMarker(source, start, end, '`', '代码');
  }

  rendererLog.info('editor.format.codeBlock', { start, end, mode: 'fenced' });
  if (isMultiLine) {
    const lines = selected.split('\n');
    if (
      lines.length >= 2
      && lines[0].trimEnd().startsWith('```')
      && lines[lines.length - 1].trimEnd() === '```'
    ) {
      const inner = lines.slice(1, -1).join('\n');
      return { rangeStart: start, rangeEnd: end, replacement: inner, cursorStart: 0, cursorEnd: inner.length };
    }
  }

  if (start === end) {
    const placeholder = '代码';
    const wrapped = `\`\`\`\n${placeholder}\n\`\`\``;
    return { rangeStart: start, rangeEnd: end, replacement: wrapped, cursorStart: 4, cursorEnd: 4 + placeholder.length };
  }

  const wrapped = `\`\`\`\n${selected}\n\`\`\``;
  return { rangeStart: start, rangeEnd: end, replacement: wrapped, cursorStart: 4, cursorEnd: 4 + selected.length };
}

export function toggleOrderedList(source: string, start: number, end: number): FormatResult {
  rendererLog.info('editor.format.orderedList', { start, end });
  let seq = 0;
  return toggleLinePrefix(
    source, start, end,
    (line) => orderedListPattern.test(line),
    (line) => `${++seq}. ${line}`,
    (line) => line.replace(orderedListPattern, ''),
  );
}

export function toggleUnorderedList(source: string, start: number, end: number): FormatResult {
  rendererLog.info('editor.format.unorderedList', { start, end });
  return toggleLinePrefix(
    source, start, end,
    (line) => line.startsWith('- '),
    (line) => `- ${line}`,
    (line) => (line.startsWith('- ') ? line.slice(2) : line),
  );
}
