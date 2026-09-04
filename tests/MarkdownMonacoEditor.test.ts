import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import MarkdownMonacoEditor from '@/renderer/components/MarkdownMonacoEditor.vue';

describe('MarkdownMonacoEditor scroll coordinates', () => {
  it('exposes a continuous source line position at the current editor scroll position', () => {
    const wrapper = mount(MarkdownMonacoEditor, {
      props: {
        bookmarkLineNumbers: [],
        configText: '{}',
        language: 'markdown',
        modelValue: 'one\ntwo\nthree',
        theme: 'light',
        vimEnabled: false,
      },
    });
    const editor = wrapper.find<HTMLTextAreaElement>('[data-testid="editor"]').element;
    const lineHeight = Number.parseFloat(window.getComputedStyle(editor).lineHeight) || 22.4;
    const surface = wrapper.vm as unknown as { getLinePositionAtScrollTop(scrollTop: number): number };

    expect(surface.getLinePositionAtScrollTop(lineHeight * 2)).toBeCloseTo(3);
    expect(surface.getLinePositionAtScrollTop(lineHeight * 2.5)).toBeCloseTo(3.5);
    wrapper.unmount();
  });

  it('restores a cursor without stealing focus when requested', () => {
    const wrapper = mount(MarkdownMonacoEditor, {
      props: {
        bookmarkLineNumbers: [],
        configText: '{}',
        language: 'markdown',
        modelValue: 'one\ntwo',
        theme: 'light',
        vimEnabled: false,
      },
    });
    const outsideInput = document.createElement('input');
    document.body.append(outsideInput);
    outsideInput.focus();

    (wrapper.vm as unknown as { setCursorPosition(position: { column: number; lineNumber: number }, options?: { focus?: boolean }): void })
      .setCursorPosition({ lineNumber: 2, column: 2 }, { focus: false });

    expect(document.activeElement).toBe(outsideInput);
    expect(wrapper.find<HTMLTextAreaElement>('[data-testid="editor"]').element.selectionStart).toBe(5);
    outsideInput.remove();
    wrapper.unmount();
  });
});
