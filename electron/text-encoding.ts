import iconv from 'iconv-lite';

export type TextEncoding =
  | 'utf8'
  | 'utf16-le'
  | 'utf16-be'
  | 'gb18030'
  | 'gbk'
  | 'big5'
  | 'shift_jis'
  | 'windows1252'
  | 'latin1';

export const defaultTextEncoding: TextEncoding = 'utf8';

export const supportedTextEncodings: TextEncoding[] = [
  'utf8',
  'utf16-le',
  'utf16-be',
  'gb18030',
  'gbk',
  'big5',
  'shift_jis',
  'windows1252',
  'latin1',
];

export function normalizeTextEncoding(encoding: unknown): TextEncoding {
  if (typeof encoding !== 'string') {
    return defaultTextEncoding;
  }

  const normalized = encoding.trim().toLowerCase().replace(/_/g, '-');
  if (normalized === 'utf-8' || normalized === 'utf8') {
    return 'utf8';
  }
  if (normalized === 'utf-16le' || normalized === 'utf16le' || normalized === 'utf16-le') {
    return 'utf16-le';
  }
  if (normalized === 'utf-16be' || normalized === 'utf16be' || normalized === 'utf16-be') {
    return 'utf16-be';
  }
  if (normalized === 'windows-1252' || normalized === 'win1252' || normalized === 'cp1252') {
    return 'windows1252';
  }
  if (supportedTextEncodings.includes(normalized as TextEncoding)) {
    return normalized as TextEncoding;
  }
  return defaultTextEncoding;
}

export function detectTextEncoding(buffer: Buffer): TextEncoding {
  if (buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
    return 'utf8';
  }
  if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe) {
    return 'utf16-le';
  }
  if (buffer.length >= 2 && buffer[0] === 0xfe && buffer[1] === 0xff) {
    return 'utf16-be';
  }
  return defaultTextEncoding;
}

export function decodeTextBuffer(buffer: Buffer, requestedEncoding?: unknown): { content: string; encoding: TextEncoding } {
  const encoding = requestedEncoding === undefined
    ? detectTextEncoding(buffer)
    : normalizeTextEncoding(requestedEncoding);
  return {
    content: iconv.decode(buffer, encoding),
    encoding,
  };
}

export function encodeTextBuffer(content: string, encoding?: unknown): Buffer {
  return iconv.encode(content, normalizeTextEncoding(encoding));
}
