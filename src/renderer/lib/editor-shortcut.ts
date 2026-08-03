export type FormatShortcutAction =
  | 'heading-0'
  | 'heading-1'
  | 'heading-2'
  | 'heading-3'
  | 'heading-4'
  | 'bold'
  | 'italic'
  | 'quote'
  | 'code-block'
  | 'ordered-list'
  | 'unordered-list';

export interface FormatShortcutInput {
  altKey: boolean;
  code: string;
  ctrlKey: boolean;
  key: string;
  metaKey: boolean;
  shiftKey: boolean;
}

export interface MonacoKeyCodeTable {
  Digit0: number;
  Digit1: number;
  Digit2: number;
  Digit3: number;
  Digit4: number;
  KeyC: number;
  KeyB: number;
  KeyI: number;
  KeyO: number;
  KeyQ: number;
  KeyU: number;
}

export interface MonacoFormatShortcutInput {
  altKey: boolean;
  ctrlKey: boolean;
  keyCode: number;
  metaKey: boolean;
  shiftKey: boolean;
}

export function resolveFormatShortcutFromMonacoKey(
  event: MonacoFormatShortcutInput,
  keyCode: MonacoKeyCodeTable,
): FormatShortcutAction | null {
  const codeByKeyCode = new Map<number, string>([
    [keyCode.Digit0, 'Digit0'],
    [keyCode.Digit1, 'Digit1'],
    [keyCode.Digit2, 'Digit2'],
    [keyCode.Digit3, 'Digit3'],
    [keyCode.Digit4, 'Digit4'],
    [keyCode.KeyC, 'KeyC'],
    [keyCode.KeyB, 'KeyB'],
    [keyCode.KeyI, 'KeyI'],
    [keyCode.KeyO, 'KeyO'],
    [keyCode.KeyQ, 'KeyQ'],
    [keyCode.KeyU, 'KeyU'],
  ]);

  const code = codeByKeyCode.get(event.keyCode) ?? '';
  const key = event.keyCode === keyCode.KeyI ? 'i' : '';

  return resolveFormatShortcut({
    altKey: event.altKey,
    code,
    ctrlKey: event.ctrlKey,
    key,
    metaKey: event.metaKey,
    shiftKey: event.shiftKey,
  });
}

export function resolveFormatShortcut(event: FormatShortcutInput): FormatShortcutAction | null {
  const command = event.metaKey || event.ctrlKey;
  if (!command) {
    return null;
  }

  if (event.altKey) {
    if (event.shiftKey) {
      if (event.code === 'KeyC') {
        return 'code-block';
      }
      return null;
    }
    if (/^Digit[0-4]$/.test(event.code)) {
      return `heading-${event.code.charAt(5)}` as FormatShortcutAction;
    }
    if (event.code === 'KeyB') {
      return 'bold';
    }
    if (event.code === 'KeyI') {
      return 'italic';
    }
    if (event.code === 'KeyQ') {
      return 'quote';
    }
    if (event.code === 'KeyO') {
      return 'ordered-list';
    }
    if (event.code === 'KeyU') {
      return 'unordered-list';
    }
    return null;
  }

  return null;
}
