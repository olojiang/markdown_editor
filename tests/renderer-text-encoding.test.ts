import { describe, expect, it } from 'vitest';
import {
  defaultTextEncoding,
  encodingIpcArgument,
  normalizeTextEncoding,
  textEncodingLabel,
  textEncodingOptions,
  type TextEncoding,
} from '@/renderer/lib/text-encoding';

describe('renderer text-encoding', () => {
  describe('defaultTextEncoding', () => {
    it('is utf8', () => {
      expect(defaultTextEncoding).toBe('utf8');
    });
  });

  describe('textEncodingOptions', () => {
    it('covers all supported encodings', () => {
      const values = textEncodingOptions.map((o) => o.value);
      expect(values).toContain('utf8');
      expect(values).toContain('gbk');
      expect(values).toContain('big5');
      expect(values).toContain('shift_jis');
      expect(values).toContain('windows1252');
      expect(values).toContain('latin1');
    });

    it('each option has label and value', () => {
      textEncodingOptions.forEach((o) => {
        expect(typeof o.label).toBe('string');
        expect(o.label.length).toBeGreaterThan(0);
        expect(typeof o.value).toBe('string');
      });
    });
  });

  describe('normalizeTextEncoding', () => {
    it('returns utf8 for undefined', () => {
      expect(normalizeTextEncoding(undefined)).toBe('utf8');
    });

    it('returns utf8 for null', () => {
      expect(normalizeTextEncoding(null)).toBe('utf8');
    });

    it('returns utf8 for non-string', () => {
      expect(normalizeTextEncoding(42)).toBe('utf8');
    });

    it('normalizes utf-8 variants', () => {
      expect(normalizeTextEncoding('utf-8')).toBe('utf8');
      expect(normalizeTextEncoding('UTF-8')).toBe('utf8');
      expect(normalizeTextEncoding('utf8')).toBe('utf8');
    });

    it('normalizes utf-16le variants', () => {
      expect(normalizeTextEncoding('utf-16le')).toBe('utf16-le');
      expect(normalizeTextEncoding('utf16le')).toBe('utf16-le');
      expect(normalizeTextEncoding('utf16-le')).toBe('utf16-le');
    });

    it('normalizes utf-16be variants', () => {
      expect(normalizeTextEncoding('utf-16be')).toBe('utf16-be');
      expect(normalizeTextEncoding('utf16be')).toBe('utf16-be');
      expect(normalizeTextEncoding('utf16-be')).toBe('utf16-be');
    });

    it('normalizes windows-1252 variants', () => {
      expect(normalizeTextEncoding('windows-1252')).toBe('windows1252');
      expect(normalizeTextEncoding('win1252')).toBe('windows1252');
      expect(normalizeTextEncoding('cp1252')).toBe('windows1252');
    });

    it('accepts known encodings as-is', () => {
      expect(normalizeTextEncoding('gbk')).toBe('gbk');
      expect(normalizeTextEncoding('big5')).toBe('big5');
      expect(normalizeTextEncoding('shift_jis')).toBe('shift_jis');
      expect(normalizeTextEncoding('latin1')).toBe('latin1');
    });

    it('falls back to utf8 for unknown encoding', () => {
      expect(normalizeTextEncoding('unknown')).toBe('utf8');
      expect(normalizeTextEncoding('iso-8859-15')).toBe('utf8');
    });

    it('trims whitespace', () => {
      expect(normalizeTextEncoding('  utf8  ')).toBe('utf8');
    });
  });

  describe('textEncodingLabel', () => {
    it('returns UTF-8 for utf8', () => {
      expect(textEncodingLabel('utf8')).toBe('UTF-8');
    });

    it('returns GBK for gbk', () => {
      expect(textEncodingLabel('gbk')).toBe('GBK');
    });

    it('returns UTF-8 for unknown encoding', () => {
      expect(textEncodingLabel('unknown')).toBe('UTF-8');
    });

    it('returns UTF-8 for undefined', () => {
      expect(textEncodingLabel(undefined)).toBe('UTF-8');
    });
  });

  describe('encodingIpcArgument', () => {
    it('returns undefined for default encoding', () => {
      expect(encodingIpcArgument('utf8')).toBeUndefined();
      expect(encodingIpcArgument('utf-8')).toBeUndefined();
      expect(encodingIpcArgument(undefined)).toBeUndefined();
    });

    it('returns normalized encoding for non-default', () => {
      expect(encodingIpcArgument('gbk')).toBe('gbk');
      expect(encodingIpcArgument('big5')).toBe('big5');
      expect(encodingIpcArgument('shift_jis')).toBe('shift_jis');
    });
  });
});
