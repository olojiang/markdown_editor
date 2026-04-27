import { mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App from '@/renderer/App.vue';

const openFile = {
  path: '/docs/readme.md',
  name: 'readme.md',
  content: '# Title\n\n## Alpha\n\nhello alpha\n\n## Beta\n\nhello beta\n\n```mermaid\ngraph TD\nA-->B\n```',
};

describe('App', () => {
  beforeEach(() => {
    window.markdownBridge = {
      openMarkdownFile: vi.fn().mockResolvedValue(openFile),
      readLastMarkdownFile: vi.fn().mockResolvedValue(openFile),
      saveMarkdownFile: vi.fn().mockImplementation(async (path: string, content: string) => ({
        path,
        name: 'readme.md',
        content,
      })),
      getSession: vi.fn().mockResolvedValue({
        filePath: openFile.path,
        scrollTop: 12,
        tocWidth: 300,
        editorWidth: 640,
        previewHidden: false,
      }),
      saveSession: vi.fn().mockResolvedValue(undefined),
    };
  });

  it('restores the last markdown file on launch', async () => {
    const wrapper = mount(App);
    await vi.dynamicImportSettled();

    expect(window.markdownBridge?.readLastMarkdownFile).toHaveBeenCalled();
    expect(wrapper.find('[data-testid="editor"]').element).toHaveProperty('value', openFile.content);
    expect(wrapper.find('[data-testid="toc"]').text()).toContain('Title');
  });

  it('updates the preview when source changes', async () => {
    const wrapper = mount(App);
    await vi.dynamicImportSettled();

    await wrapper.find('[data-testid="editor"]').setValue('# Changed');

    expect(wrapper.find('[data-testid="preview"]').html()).toContain('Changed');
  });

  it('toggles fullscreen preview mode', async () => {
    const wrapper = mount(App);
    await vi.dynamicImportSettled();

    await wrapper.find('[data-testid="fullscreen-preview"]').trigger('click');

    expect(wrapper.classes()).toContain('preview-fullscreen');
  });

  it('filters the table of contents', async () => {
    const wrapper = mount(App);
    await vi.dynamicImportSettled();

    await wrapper.find('[data-testid="toc-search"]').setValue('beta');

    expect(wrapper.find('[data-testid="toc"]').text()).toContain('Beta');
    expect(wrapper.find('[data-testid="toc"]').text()).not.toContain('Alpha');
  });

  it('replaces all source matches in the editor', async () => {
    const wrapper = mount(App);
    await vi.dynamicImportSettled();

    await wrapper.find('[data-testid="editor-search"]').setValue('hello');
    await wrapper.find('[data-testid="editor-replace"]').setValue('hi');
    await wrapper.find('[data-testid="replace-all"]').trigger('click');

    expect(wrapper.find<HTMLTextAreaElement>('[data-testid="editor"]').element.value).toContain('hi alpha');
    expect(wrapper.find<HTMLTextAreaElement>('[data-testid="editor"]').element.value).toContain('hi beta');
  });

  it('hides preview and persists the layout preference', async () => {
    const wrapper = mount(App);
    await vi.dynamicImportSettled();

    await wrapper.find('[data-testid="toggle-preview"]').trigger('click');

    expect(wrapper.classes()).toContain('preview-hidden');
    expect(window.markdownBridge?.saveSession).toHaveBeenCalledWith(
      expect.objectContaining({ previewHidden: true }),
    );
  });

  it('uses keyboard shortcuts for opening and saving files', async () => {
    mount(App);
    await vi.dynamicImportSettled();

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'o', metaKey: true }));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 's', metaKey: true }));
    await vi.dynamicImportSettled();

    expect(window.markdownBridge?.openMarkdownFile).toHaveBeenCalled();
    expect(window.markdownBridge?.saveMarkdownFile).toHaveBeenCalled();
  });

  it('shows shortcut hints on toolbar buttons', async () => {
    const wrapper = mount(App);
    await vi.dynamicImportSettled();

    expect(wrapper.get('[data-testid="open-file"]').attributes('title')).toBe('打开 Markdown 文件 (Cmd/Ctrl+O)');
    expect(wrapper.get('[data-testid="save-file"]').attributes('title')).toBe('保存 Markdown 文件 (Cmd/Ctrl+S)');
    expect(wrapper.get('[data-testid="toggle-preview"]').attributes('title')).toBe('显示/隐藏预览 (Cmd/Ctrl+P)');
  });

  it('uses keyboard shortcut for toggling preview', async () => {
    const wrapper = mount(App);
    await vi.dynamicImportSettled();

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'p', metaKey: true }));
    await vi.dynamicImportSettled();

    expect(wrapper.classes()).toContain('preview-hidden');
    expect(window.markdownBridge?.saveSession).toHaveBeenCalledWith(
      expect.objectContaining({ previewHidden: true }),
    );
  });
});
