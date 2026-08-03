import { describe, expect, it } from 'vitest';
import { resolveFormatShortcut, resolveFormatShortcutFromMonacoKey } from '@/renderer/lib/editor-shortcut';

function shortcutEvent(overrides: Partial<{
  altKey: boolean;
  code: string;
  ctrlKey: boolean;
  key: string;
  metaKey: boolean;
  shiftKey: boolean;
}>): Parameters<typeof resolveFormatShortcut>[0] {
  return {
    altKey: false,
    code: '',
    ctrlKey: false,
    key: '',
    metaKey: false,
    shiftKey: false,
    ...overrides,
  };
}

describe('resolveFormatShortcut', () => {
  it('resolves Alt heading shortcuts via event.code', () => {
    expect(resolveFormatShortcut(shortcutEvent({
      altKey: true,
      code: 'Digit1',
      key: '¡',
      metaKey: true,
    }))).toBe('heading-1');
    expect(resolveFormatShortcut(shortcutEvent({
      altKey: true,
      code: 'Digit0',
      key: 'º',
      metaKey: true,
    }))).toBe('heading-0');
  });

  it('resolves bold via the semantic Cmd+Alt+B shortcut', () => {
    expect(resolveFormatShortcut(shortcutEvent({
      altKey: true,
      code: 'KeyB',
      key: 'b',
      metaKey: true,
    }))).toBe('bold');
    expect(resolveFormatShortcut(shortcutEvent({
      altKey: true,
      code: 'KeyB',
      key: 'd',
      metaKey: true,
      shiftKey: true,
    }))).toBeNull();
  });

  it('resolves code-block toggle via Cmd+Alt+Shift+C', () => {
    expect(resolveFormatShortcut(shortcutEvent({
      altKey: true,
      code: 'KeyC',
      key: 'ç',
      metaKey: true,
      shiftKey: true,
    }))).toBe('code-block');
  });

  it('resolves quote, list, and ordered list shortcuts via semantic event.code values', () => {
    expect(resolveFormatShortcut(shortcutEvent({
      altKey: true,
      code: 'KeyQ',
      key: 'œ',
      metaKey: true,
    }))).toBe('quote');
    expect(resolveFormatShortcut(shortcutEvent({
      altKey: true,
      code: 'KeyU',
      key: 'u',
      metaKey: true,
    }))).toBe('unordered-list');
    expect(resolveFormatShortcut(shortcutEvent({
      altKey: true,
      code: 'KeyO',
      key: 'ø',
      metaKey: true,
    }))).toBe('ordered-list');
  });

  it('resolves italic with the unified Cmd+Alt+I shortcut', () => {
    expect(resolveFormatShortcut(shortcutEvent({
      altKey: true,
      code: 'KeyI',
      key: 'i',
      metaKey: true,
    }))).toBe('italic');
  });

  it('ignores format shortcuts without command modifier', () => {
    expect(resolveFormatShortcut(shortcutEvent({
      altKey: true,
      code: 'KeyB',
      key: 'd',
    }))).toBeNull();
  });

  it('resolves code-block from Monaco keyCode via Cmd+Alt+Shift+C', () => {
    const monacoKeyCode = {
      Digit0: 0,
      Digit1: 1,
      Digit2: 2,
      Digit3: 3,
      Digit4: 4,
      KeyC: 33,
      KeyB: 34,
      KeyI: 39,
      KeyU: 42,
      KeyO: 45,
      KeyQ: 48,
    };

    expect(resolveFormatShortcutFromMonacoKey({
      altKey: true,
      ctrlKey: false,
      keyCode: monacoKeyCode.KeyC,
      metaKey: true,
      shiftKey: true,
    }, monacoKeyCode)).toBe('code-block');
  });

  it('resolves bold from Monaco keyCode via Cmd+Alt+B', () => {
    const monacoKeyCode = {
      Digit0: 0,
      Digit1: 1,
      Digit2: 2,
      Digit3: 3,
      Digit4: 4,
      KeyB: 34,
      KeyC: 33,
      KeyI: 39,
      KeyO: 45,
      KeyQ: 48,
      KeyU: 42,
    };

    expect(resolveFormatShortcutFromMonacoKey({
      altKey: true,
      ctrlKey: false,
      keyCode: monacoKeyCode.KeyB,
      metaKey: true,
      shiftKey: false,
    }, monacoKeyCode)).toBe('bold');
  });

  it('ignores Alt shortcuts with Shift held except bold and code-block', () => {
    expect(resolveFormatShortcut(shortcutEvent({
      altKey: true,
      code: 'KeyQ',
      key: 'q',
      metaKey: true,
      shiftKey: true,
    }))).toBeNull();
  });
});
