import iconv from 'iconv-lite';
import { describe, expect, it } from 'vitest';
import { decodeTextBuffer, detectTextEncoding, normalizeTextEncoding } from '../electron/text-encoding';

describe('text encoding helpers', () => {
  it('auto-detects common Chinese encodings when no encoding is requested', () => {
    const gbkBuffer = iconv.encode('中文调研', 'gbk');

    expect(detectTextEncoding(gbkBuffer)).toBe('gbk');
    expect(decodeTextBuffer(gbkBuffer)).toEqual({
      content: '中文调研',
      encoding: 'gbk',
    });
  });

  describe('normalizeTextEncoding', () => {
    it('returns utf8 for non-string values', () => {
      expect(normalizeTextEncoding(undefined)).toBe('utf8');
      expect(normalizeTextEncoding(null)).toBe('utf8');
      expect(normalizeTextEncoding(42)).toBe('utf8');
    });

    it('normalizes utf-8 variants', () => {
      expect(normalizeTextEncoding('utf-8')).toBe('utf8');
      expect(normalizeTextEncoding('UTF-8')).toBe('utf8');
      expect(normalizeTextEncoding('utf8')).toBe('utf8');
    });

    it('normalizes utf-16 variants', () => {
      expect(normalizeTextEncoding('utf-16le')).toBe('utf16-le');
      expect(normalizeTextEncoding('utf-16be')).toBe('utf16-be');
    });

    it('normalizes windows-1252 variants', () => {
      expect(normalizeTextEncoding('windows-1252')).toBe('windows1252');
      expect(normalizeTextEncoding('win1252')).toBe('windows1252');
      expect(normalizeTextEncoding('cp1252')).toBe('windows1252');
    });

    it('preserves shift_jis through underscore normalization', () => {
      expect(normalizeTextEncoding('shift_jis')).toBe('shift_jis');
      expect(normalizeTextEncoding('Shift_JIS')).toBe('shift_jis');
    });

    it('accepts known encodings', () => {
      expect(normalizeTextEncoding('gbk')).toBe('gbk');
      expect(normalizeTextEncoding('big5')).toBe('big5');
      expect(normalizeTextEncoding('gb18030')).toBe('gb18030');
      expect(normalizeTextEncoding('latin1')).toBe('latin1');
    });

    it('falls back to utf8 for unknown encodings', () => {
      expect(normalizeTextEncoding('unknown')).toBe('utf8');
    });
  });
});
