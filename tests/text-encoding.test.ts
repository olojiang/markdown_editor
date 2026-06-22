import iconv from 'iconv-lite';
import { describe, expect, it } from 'vitest';
import { decodeTextBuffer, detectTextEncoding } from '../electron/text-encoding';

describe('text encoding helpers', () => {
  it('auto-detects common Chinese encodings when no encoding is requested', () => {
    const gbkBuffer = iconv.encode('中文调研', 'gbk');

    expect(detectTextEncoding(gbkBuffer)).toBe('gbk');
    expect(decodeTextBuffer(gbkBuffer)).toEqual({
      content: '中文调研',
      encoding: 'gbk',
    });
  });
});
