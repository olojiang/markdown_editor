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

export const textEncodingOptions: { label: string; value: TextEncoding }[] = [
  { label: 'UTF-8', value: 'utf8' },
  { label: 'UTF-16 LE', value: 'utf16-le' },
  { label: 'UTF-16 BE', value: 'utf16-be' },
  { label: 'GB18030', value: 'gb18030' },
  { label: 'GBK', value: 'gbk' },
  { label: 'Big5', value: 'big5' },
  { label: 'Shift_JIS', value: 'shift_jis' },
  { label: 'Windows-1252', value: 'windows1252' },
  { label: 'Latin-1', value: 'latin1' },
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
  const matched = textEncodingOptions.find(
    (option) => option.value.replace(/_/g, '-') === normalized,
  );
  return matched ? matched.value : defaultTextEncoding;
}

export function textEncodingLabel(encoding: unknown): string {
  const normalized = normalizeTextEncoding(encoding);
  return textEncodingOptions.find((option) => option.value === normalized)?.label ?? 'UTF-8';
}

export function encodingIpcArgument(encoding: unknown): string | undefined {
  const normalized = normalizeTextEncoding(encoding);
  return normalized === defaultTextEncoding ? undefined : normalized;
}
