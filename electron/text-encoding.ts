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

  const evenNulls = countNullBytes(buffer, 0);
  const oddNulls = countNullBytes(buffer, 1);
  const halfLength = Math.max(1, Math.floor(buffer.length / 2));
  if (oddNulls / halfLength > 0.35 && evenNulls / halfLength < 0.1) {
    return 'utf16-le';
  }
  if (evenNulls / halfLength > 0.35 && oddNulls / halfLength < 0.1) {
    return 'utf16-be';
  }

  if (isValidUtf8(buffer)) {
    return defaultTextEncoding;
  }

  const candidates: TextEncoding[] = ['gbk', 'gb18030', 'big5', 'shift_jis', 'windows1252', 'latin1'];
  const best = candidates
    .map((encoding) => ({ encoding, score: scoreDecodedText(iconv.decode(buffer, encoding)) }))
    .sort((a, b) => b.score - a.score)[0];
  if (best && best.score > 0) {
    return best.encoding;
  }
  return defaultTextEncoding;
}

function countNullBytes(buffer: Buffer, parity: 0 | 1): number {
  let count = 0;
  for (let index = parity; index < buffer.length; index += 2) {
    if (buffer[index] === 0) {
      count += 1;
    }
  }
  return count;
}

function isValidUtf8(buffer: Buffer): boolean {
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(buffer);
    return true;
  } catch {
    return false;
  }
}

function scoreDecodedText(value: string): number {
  let score = 0;
  for (const char of value) {
    const codePoint = char.codePointAt(0) ?? 0;
    if (/[\u4e00-\u9fff]/u.test(char)) {
      score += 4;
    } else if (/[\u3000-\u303f\uff00-\uffef]/u.test(char)) {
      score += 2;
    } else if (/[\p{L}\p{N}\s.,;:!?()[\]{}'"`~@#$%^&*_+=/\\|-]/u.test(char)) {
      score += 1;
    } else if (char === '\ufffd' || (codePoint < 32 && !'\n\r\t'.includes(char))) {
      score -= 8;
    } else {
      score -= 1;
    }
  }
  return score;
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
