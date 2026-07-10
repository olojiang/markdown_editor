import { describe, expect, it } from 'vitest';
import { formatFileModifiedTime, formatFileSize } from '@/renderer/lib/format';

describe('formatFileSize', () => {
  it('formats zero bytes', () => {
    expect(formatFileSize(0)).toBe('0 B');
  });

  it('formats bytes below 1 KB', () => {
    expect(formatFileSize(512)).toBe('512 B');
    expect(formatFileSize(1)).toBe('1 B');
    expect(formatFileSize(1023)).toBe('1023 B');
  });

  it('formats kilobytes', () => {
    expect(formatFileSize(1024)).toBe('1 KB');
    expect(formatFileSize(2048)).toBe('2 KB');
    expect(formatFileSize(1536)).toBe('1.5 KB');
  });

  it('formats megabytes', () => {
    expect(formatFileSize(1048576)).toBe('1 MB');
    expect(formatFileSize(15728640)).toBe('15 MB');
  });

  it('formats gigabytes', () => {
    expect(formatFileSize(1073741824)).toBe('1 GB');
  });

  it('strips trailing .0 from rounded values', () => {
    expect(formatFileSize(10240)).toBe('10 KB');
  });

  it('returns 0 B for negative values', () => {
    expect(formatFileSize(-1)).toBe('0 B');
  });

  it('returns 0 B for NaN', () => {
    expect(formatFileSize(NaN)).toBe('0 B');
  });

  it('returns 0 B for Infinity', () => {
    expect(formatFileSize(Infinity)).toBe('0 B');
  });
});

describe('formatFileModifiedTime', () => {
  it('formats a valid timestamp', () => {
    const date = new Date(2026, 5, 30, 14, 5);
    expect(formatFileModifiedTime(date.getTime())).toBe('2026-06-30 14:05');
  });

  it('returns fallback for undefined', () => {
    expect(formatFileModifiedTime(undefined)).toBe('未保存');
  });

  it('returns fallback for null', () => {
    expect(formatFileModifiedTime(null)).toBe('未保存');
  });

  it('returns fallback for non-number', () => {
    expect(formatFileModifiedTime('not a number')).toBe('未保存');
  });

  it('returns fallback for NaN', () => {
    expect(formatFileModifiedTime(NaN)).toBe('未保存');
  });

  it('returns fallback for Infinity', () => {
    expect(formatFileModifiedTime(Infinity)).toBe('未保存');
  });

  it('pads single-digit month/day/hour/minute', () => {
    const date = new Date(2026, 0, 5, 3, 9);
    expect(formatFileModifiedTime(date.getTime())).toBe('2026-01-05 03:09');
  });
});
