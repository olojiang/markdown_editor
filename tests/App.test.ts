import { mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App from '@/renderer/App.vue';

const openFile = {
  path: '/docs/readme.md',
  name: 'readme.md',
  content: '# Title\n\n## Alpha\n\nhello alpha\n\n## Beta\n\nhello beta\n\n```mermaid\ngraph TD\nA-->B\n```',
};
const recentFile = {
  path: '/docs/recent.md',
  name: 'recent.md',
  content: '# Recent',
};

function expectedShortcut(key: string): string {
  const modifier = navigator.platform.toLowerCase().includes('mac') ? 'Cmd' : 'Ctrl';
  return `${modifier}+${key}`;
}

function setScrollMetrics(element: Element, scrollHeight: number, clientHeight: number): void {
  Object.defineProperty(element, 'scrollHeight', { configurable: true, value: scrollHeight });
  Object.defineProperty(element, 'clientHeight', { configurable: true, value: clientHeight });
}

describe('App', () => {
  beforeEach(() => {
    window.markdownBridge = {
      openMarkdownFile: vi.fn().mockResolvedValue(openFile),
      readLastMarkdownFile: vi.fn().mockResolvedValue(openFile),
      readMarkdownFile: vi.fn().mockImplementation(async (path: string) => ({
        ...(path === recentFile.path ? recentFile : openFile),
        path,
        name: path.split('/').pop() ?? 'file.md',
      })),
      getPathForFile: vi.fn((file: File) => (file as File & { path?: string }).path ?? file.name),
      saveMarkdownFile: vi.fn().mockImplementation(async (path: string, content: string) => ({
        path,
        name: 'readme.md',
        content,
      })),
      getSession: vi.fn().mockResolvedValue({
        filePath: openFile.path,
        recentFiles: [recentFile.path],
        scrollTop: 12,
        tocWidth: 300,
        editorWidth: 640,
        previewHidden: false,
        editorVisible: false,
        theme: 'light',
      }),
      saveSession: vi.fn().mockImplementation(async (session) => {
        structuredClone(session);
      }),
    };
  });

  it('restores the last markdown file on launch', async () => {
    const wrapper = mount(App);
    await vi.dynamicImportSettled();

    expect(window.markdownBridge?.readLastMarkdownFile).toHaveBeenCalled();
    expect(wrapper.classes()).toContain('reader-mode');
    expect(wrapper.classes()).toContain('theme-light');
    expect(wrapper.find('[data-testid="editor"]').element).toHaveProperty('value', openFile.content);
    expect(wrapper.find('[data-testid="toc"]').text()).toContain('Title');
    expect(wrapper.find('[data-testid="recent-files"]').text()).toContain('readme.md');
  });

  it('switches and persists theme modes', async () => {
    const wrapper = mount(App);
    await vi.dynamicImportSettled();

    await wrapper.find('[data-testid="theme-dark"]').trigger('click');
    expect(wrapper.classes()).toContain('theme-dark');
    expect(window.markdownBridge?.saveSession).toHaveBeenCalledWith(
      expect.objectContaining({ theme: 'dark' }),
    );

    await wrapper.find('[data-testid="theme-eye"]').trigger('click');
    expect(wrapper.classes()).toContain('theme-eye');
    expect(window.markdownBridge?.saveSession).toHaveBeenCalledWith(
      expect.objectContaining({ theme: 'eye' }),
    );
  });

  it('switches between reader and editor modes', async () => {
    const wrapper = mount(App);
    await vi.dynamicImportSettled();

    await wrapper.find('[data-testid="toggle-editor"]').trigger('click');

    expect(wrapper.classes()).not.toContain('reader-mode');
    expect(window.markdownBridge?.saveSession).toHaveBeenCalledWith(
      expect.objectContaining({ editorVisible: true, previewHidden: false }),
    );
  });

  it('updates the preview when source changes', async () => {
    const wrapper = mount(App);
    await vi.dynamicImportSettled();

    await wrapper.find('[data-testid="editor"]').setValue('# Changed');

    expect(wrapper.find('[data-testid="preview"]').html()).toContain('Changed');
  });

  it('disables save until the source changes', async () => {
    const wrapper = mount(App);
    await vi.dynamicImportSettled();

    const saveButton = wrapper.find<HTMLButtonElement>('[data-testid="save-file"]');
    expect(saveButton.element.disabled).toBe(true);

    await wrapper.find('[data-testid="editor"]').setValue('# Changed');
    expect(saveButton.element.disabled).toBe(false);

    await saveButton.trigger('click');
    await vi.dynamicImportSettled();
    expect(saveButton.element.disabled).toBe(true);
  });

  it('syncs preview position when the editor scrolls', async () => {
    const wrapper = mount(App);
    await vi.dynamicImportSettled();
    await wrapper.find('[data-testid="toggle-editor"]').trigger('click');

    const editor = wrapper.find<HTMLTextAreaElement>('[data-testid="editor"]').element;
    const preview = wrapper.find<HTMLElement>('[data-testid="preview"]').element;
    setScrollMetrics(editor, 1200, 200);
    setScrollMetrics(preview, 2200, 200);

    editor.scrollTop = 500;
    await wrapper.find('[data-testid="editor"]').trigger('scroll');

    expect(preview.scrollTop).toBe(950);
  });

  it('syncs editor position when the preview scrolls', async () => {
    const wrapper = mount(App);
    await vi.dynamicImportSettled();
    await wrapper.find('[data-testid="toggle-editor"]').trigger('click');

    const editor = wrapper.find<HTMLTextAreaElement>('[data-testid="editor"]').element;
    const preview = wrapper.find<HTMLElement>('[data-testid="preview"]').element;
    setScrollMetrics(editor, 1200, 200);
    setScrollMetrics(preview, 2200, 200);

    preview.scrollTop = 950;
    await wrapper.find('[data-testid="preview"]').trigger('scroll');

    expect(editor.scrollTop).toBe(500);
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

  it('opens a recent file and moves it to the front of the LRU list', async () => {
    const wrapper = mount(App);
    await vi.dynamicImportSettled();

    await wrapper.find('[data-testid="recent-files"]').setValue(recentFile.path);
    await vi.dynamicImportSettled();

    expect(window.markdownBridge?.readMarkdownFile).toHaveBeenCalledWith(recentFile.path);
    expect(wrapper.find('[data-testid="editor"]').element).toHaveProperty('value', recentFile.content);
    expect(window.markdownBridge?.saveSession).toHaveBeenCalledWith(
      expect.objectContaining({ recentFiles: [recentFile.path, openFile.path] }),
    );
  });

  it('opens a dropped markdown file', async () => {
    const droppedPath = '/docs/dropped.md';
    const wrapper = mount(App);
    await vi.dynamicImportSettled();

    await wrapper.find('main').trigger('drop', {
      dataTransfer: {
        files: [{ name: 'dropped.md', path: droppedPath }],
      },
    });
    await vi.dynamicImportSettled();

    expect(window.markdownBridge?.readMarkdownFile).toHaveBeenCalledWith(droppedPath);
  });

  it('expands and collapses the whole table of contents', async () => {
    const wrapper = mount(App);
    await vi.dynamicImportSettled();

    await wrapper.find('[data-testid="collapse-toc"]').trigger('click');
    expect(wrapper.find('[data-testid="toc"]').text()).toContain('Title');
    expect(wrapper.find('[data-testid="toc"]').text()).not.toContain('Alpha');
    expect(wrapper.find('[data-testid="toc"]').text()).not.toContain('Beta');

    await wrapper.find('[data-testid="expand-toc"]').trigger('click');
    expect(wrapper.find('[data-testid="toc"]').text()).toContain('Alpha');
    expect(wrapper.find('[data-testid="toc"]').text()).toContain('Beta');
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
    const wrapper = mount(App);
    await vi.dynamicImportSettled();

    await wrapper.find('[data-testid="editor"]').setValue('# Changed');
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 's', metaKey: true }));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'o', metaKey: true }));
    await vi.dynamicImportSettled();

    expect(window.markdownBridge?.openMarkdownFile).toHaveBeenCalled();
    expect(window.markdownBridge?.saveMarkdownFile).toHaveBeenCalled();
  });

  it('supports Windows-style Ctrl shortcuts', async () => {
    const wrapper = mount(App);
    await vi.dynamicImportSettled();

    await wrapper.find('[data-testid="editor"]').setValue('# Changed');
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 's', ctrlKey: true }));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'p', ctrlKey: true }));
    await vi.dynamicImportSettled();

    expect(window.markdownBridge?.saveMarkdownFile).toHaveBeenCalled();
    expect(wrapper.classes()).toContain('preview-hidden');
  });

  it('shows shortcut hints on toolbar buttons', async () => {
    const wrapper = mount(App);
    await vi.dynamicImportSettled();

    expect(wrapper.get('[data-testid="open-file"]').attributes('title')).toBe(`打开 Markdown 文件 (${expectedShortcut('O')})`);
    expect(wrapper.get('[data-testid="save-file"]').attributes('title')).toBe(`保存 Markdown 文件 (${expectedShortcut('S')})`);
    expect(wrapper.get('[data-testid="toggle-preview"]').attributes('title')).toBe(`显示/隐藏预览 (${expectedShortcut('P')})`);
    expect(wrapper.get('[data-testid="toggle-editor"]').attributes('title')).toBe(`切换阅读/编辑模式 (${expectedShortcut('E')})`);
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
