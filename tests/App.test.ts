import { mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';
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
const secondFile = {
  path: '/docs/second.md',
  name: 'second.md',
  content: '# Second',
};
const imageAsset = {
  name: 'diagram.png',
  relativePath: 'assets/images/diagram.png',
  absolutePath: '/docs/assets/images/diagram.png',
  size: 128,
};

function expectedShortcut(key: string): string {
  const modifier = navigator.platform.toLowerCase().includes('mac') ? 'Cmd' : 'Ctrl';
  return `${modifier}+${key}`;
}

function setScrollMetrics(element: Element, scrollHeight: number, clientHeight: number): void {
  Object.defineProperty(element, 'scrollHeight', { configurable: true, value: scrollHeight });
  Object.defineProperty(element, 'clientHeight', { configurable: true, value: clientHeight });
}

function setElementTop(element: Element, top: number): void {
  const rect = {
    bottom: top,
    height: 0,
    left: 0,
    right: 0,
    top,
    width: 0,
    x: 0,
    y: top,
    toJSON: () => ({}),
  };
  Object.defineProperty(element, 'offsetTop', { configurable: true, value: top });
  element.getBoundingClientRect = vi.fn(() => rect);
  element.getClientRects = vi.fn(() => [rect] as unknown as DOMRectList);
}

function setPreviewSourceLineGeometry(preview: HTMLElement, containerTop: number, lineTops: Record<number, number>): void {
  setElementTop(preview, containerTop);
  preview.querySelectorAll<HTMLElement>('[data-source-line]').forEach((node) => {
    const line = Number(node.dataset.sourceLine);
    const relativeTop = lineTops[line];
    if (relativeTop === undefined) {
      return;
    }

    setElementTop(node, containerTop + relativeTop);
  });
}

function attachRenderedMermaidSvg(wrapper: ReturnType<typeof mount>): void {
  const container = wrapper.find<HTMLElement>('.mermaid-panzoom').element;
  if (container.querySelector('svg')) {
    return;
  }

  container.querySelector('.mermaid')?.remove();
  container.insertAdjacentHTML('beforeend', '<svg viewBox="0 0 100 80" width="100" height="80"><text>Flow</text></svg>');
}

function offsetForLineColumn(value: string, lineNumber: number, column: number): number {
  const lines = value.split('\n');
  const lineIndex = Math.min(Math.max(1, lineNumber), lines.length) - 1;
  const prefix = lines.slice(0, lineIndex).join('\n');
  return (lineIndex === 0 ? 0 : prefix.length + 1) + Math.min(Math.max(1, column), lines[lineIndex].length + 1) - 1;
}

async function openRecentFileFromMenu(wrapper: ReturnType<typeof mount>, label: string): Promise<void> {
  await wrapper.find('[data-testid="recent-files"]').trigger('click');
  await nextTick();
  const row = wrapper.findAll('.recent-file-row').find((item) => item.text().includes(label));
  expect(row).toBeTruthy();
  await row!.find('.recent-file-open').trigger('click');
  await vi.dynamicImportSettled();
}

describe('App', () => {
  beforeEach(() => {
    vi.useRealTimers();
    window.localStorage.clear();
    window.markdownBridge = {
      openMarkdownFile: vi.fn().mockResolvedValue(openFile),
      takeLaunchMarkdownFile: vi.fn().mockResolvedValue(null),
      notifyReadyForExternalOpen: vi.fn().mockResolvedValue(undefined),
      onExternalMarkdownFile: vi.fn().mockReturnValue(() => {}),
      onMarkdownFileChanged: vi.fn().mockReturnValue(() => {}),
      onToggleEditorShortcut: vi.fn().mockReturnValue(() => {}),
      onCloseRequest: vi.fn().mockReturnValue(() => {}),
      onAppMenuCommand: vi.fn().mockReturnValue(() => {}),
      readLastMarkdownFile: vi.fn().mockResolvedValue(openFile),
      readMarkdownFile: vi.fn().mockImplementation(async (path: string) => ({
        ...(path === recentFile.path ? recentFile : path === secondFile.path ? secondFile : openFile),
        path,
        name: path.split('/').pop() ?? 'file.md',
      })),
      getPathForFile: vi.fn((file: File) => (file as File & { path?: string }).path ?? file.name),
      saveMarkdownFile: vi.fn().mockImplementation(async (path: string, content: string) => ({
        path,
        name: 'readme.md',
        content,
      })),
      saveMarkdownFileAs: vi.fn().mockImplementation(async (content: string, defaultName: string) => ({
        path: `/docs/${defaultName}`,
        name: defaultName,
        content,
      })),
      revealInFolder: vi.fn().mockResolvedValue(undefined),
      openExternalLink: vi.fn().mockResolvedValue(true),
      htmlPreviewUrl: vi.fn().mockImplementation(async ({ filePath }: { filePath: string | null; content: string }) =>
        `http://127.0.0.1:41000/?markdown-preview-id=${encodeURIComponent(filePath ?? 'draft')}`),
      exportHtml: vi.fn().mockResolvedValue('/docs/readme.html'),
      exportPdf: vi.fn().mockResolvedValue('/docs/readme.pdf'),
      saveImageAsset: vi.fn().mockResolvedValue(imageAsset),
      saveTempImageAsset: vi.fn().mockResolvedValue({
        name: '1778054400000.webp',
        absolutePath: '/tmp/1778054400000.webp',
        size: 4,
        mimeType: 'image/webp',
      }),
      uploadCloudImage: vi.fn().mockResolvedValue({
        url: 'https://assets.pinefield.cn/apps/pinefield.assets/2026-05-06/banner.webp',
        path: 'apps/pinefield.assets/2026-05-06/banner.webp',
        uploadedName: 'banner.webp',
        localPath: '/tmp/1778054400000.webp',
      }),
      importImageAsset: vi.fn().mockResolvedValue(imageAsset),
      listImageAssets: vi.fn().mockResolvedValue([imageAsset]),
      deleteImageAsset: vi.fn().mockResolvedValue([]),
      assetUrl: vi.fn((_markdownPath: string, relativePath: string) => `markdown-asset://local/?path=${encodeURIComponent(`/docs/${relativePath}`)}`),
      getSession: vi.fn().mockResolvedValue({
        filePath: openFile.path,
        tabs: [],
        activeTabId: null,
        recentFiles: [recentFile.path],
        scrollTop: 12,
        tocWidth: 300,
        editorWidth: 640,
        previewHidden: false,
        editorVisible: false,
        editorPreferences: {
          vimEnabled: false,
          configText: '{\n  "tabSize": 2,\n  "wordWrap": "on",\n  "minimap": false\n}',
        },
        theme: 'light',
      }),
      saveSession: vi.fn().mockImplementation(async (session) => {
        structuredClone(session);
      }),
      saveSessionSync: vi.fn().mockImplementation((session) => {
        structuredClone(session);
        return true;
      }),
      quitApp: vi.fn().mockResolvedValue(undefined),
      confirmClose: vi.fn().mockResolvedValue(undefined),
      confirmCloseSync: vi.fn().mockReturnValue(true),
      debugLog: vi.fn().mockResolvedValue(undefined),
    };
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('restores the last markdown file on launch', async () => {
    const wrapper = mount(App);
    await vi.dynamicImportSettled();

    expect(window.markdownBridge?.readLastMarkdownFile).toHaveBeenCalled();
    expect(window.markdownBridge?.notifyReadyForExternalOpen).toHaveBeenCalled();
    expect(wrapper.classes()).toContain('reader-mode');
    expect(wrapper.classes()).toContain('theme-light');
    expect(wrapper.find('[data-testid="editor"]').element).toHaveProperty('value', openFile.content);
    expect(wrapper.find('[data-testid="toc"]').text()).toContain('Title');
    expect(wrapper.find('[data-testid="recent-files"]').text()).toContain('readme.md');
  });

  it('opens a Finder-launched markdown file in reader mode without editor layout state', async () => {
    vi.mocked(window.markdownBridge!.getSession).mockResolvedValue({
      filePath: openFile.path,
      tabs: [],
      activeTabId: null,
      recentFiles: [],
      scrollTop: 120,
      tocWidth: 300,
      editorWidth: 640,
      previewHidden: true,
      editorVisible: true,
      theme: 'light',
    });
    vi.mocked(window.markdownBridge!.takeLaunchMarkdownFile).mockResolvedValue({
      file: recentFile,
      external: true,
    });

    const wrapper = mount(App);
    await vi.dynamicImportSettled();

    expect(window.markdownBridge?.readLastMarkdownFile).not.toHaveBeenCalled();
    expect(window.markdownBridge?.notifyReadyForExternalOpen).toHaveBeenCalled();
    expect(wrapper.classes()).toContain('reader-mode');
    expect(wrapper.classes()).not.toContain('preview-hidden');
    expect(wrapper.find('[data-testid="editor"]').element).toHaveProperty('value', recentFile.content);
    expect(window.markdownBridge?.saveSession).toHaveBeenCalledWith(
      expect.objectContaining({
        filePath: recentFile.path,
        recentFiles: [recentFile.path],
        scrollTop: 0,
        editorVisible: false,
        previewHidden: false,
      }),
    );
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

  it('toggles Vim mode and persists the editor preference', async () => {
    const wrapper = mount(App);
    await vi.dynamicImportSettled();

    await wrapper.find('[data-testid="toggle-vim-mode"]').trigger('click');

    expect(wrapper.find('[data-testid="toggle-vim-mode"]').classes()).toContain('active');
    expect(wrapper.text()).toContain('Vim 模式已开启');
    expect(window.markdownBridge?.saveSession).toHaveBeenCalledWith(
      expect.objectContaining({
        editorPreferences: expect.objectContaining({ vimEnabled: true }),
      }),
    );
  });

  it('edits and validates custom Monaco and Vim configuration JSON', async () => {
    const wrapper = mount(App);
    await vi.dynamicImportSettled();

    await wrapper.find('[data-testid="open-editor-config"]').trigger('click');
    expect(wrapper.find('[data-testid="editor-config-modal"]').exists()).toBe(true);

    await wrapper.find('[data-testid="editor-config-text"]').setValue('{ bad json');
    await wrapper.find('[data-testid="editor-config-save"]').trigger('click');
    expect(wrapper.text()).toContain('编辑器配置不是合法 JSON');
    expect(window.markdownBridge?.saveSession).not.toHaveBeenCalledWith(
      expect.objectContaining({
        editorPreferences: expect.objectContaining({ configText: '{ bad json' }),
      }),
    );

    const configText = '{\n  "tabSize": 4,\n  "wordWrap": "off",\n  "minimap": true\n}';
    await wrapper.find('[data-testid="editor-config-text"]').setValue(configText);
    await wrapper.find('[data-testid="editor-config-save"]').trigger('click');

    expect(wrapper.find('[data-testid="editor-config-modal"]').exists()).toBe(false);
    expect(wrapper.text()).toContain('编辑器配置已保存');
    expect(window.markdownBridge?.saveSession).toHaveBeenCalledWith(
      expect.objectContaining({
        editorPreferences: expect.objectContaining({ configText }),
      }),
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

  it('exports the rendered document as HTML and PDF', async () => {
    const wrapper = mount(App);
    await vi.dynamicImportSettled();

    await wrapper.find('[data-testid="export-html"]').trigger('click');
    await wrapper.find('[data-testid="export-pdf"]').trigger('click');
    await vi.dynamicImportSettled();

    expect(window.markdownBridge?.exportHtml).toHaveBeenCalledWith(
      expect.objectContaining({
        markdownPath: openFile.path,
        title: openFile.name,
        bodyHtml: expect.stringContaining('Title'),
      }),
    );
    expect(window.markdownBridge?.exportPdf).toHaveBeenCalledWith(
      expect.objectContaining({ markdownPath: openFile.path }),
    );
    expect(wrapper.text()).toContain('已导出 /docs/readme.pdf');
  });

  it('inserts Markdown snippets from the formatting toolbar', async () => {
    const wrapper = mount(App);
    await vi.dynamicImportSettled();

    await wrapper.find('[data-testid="insert-table"]').trigger('click');
    expect(wrapper.find<HTMLTextAreaElement>('[data-testid="editor"]').element.value).toContain('| 列 1 | 列 2 |');

    await wrapper.find('[data-testid="insert-link"]').trigger('click');
    expect(wrapper.find<HTMLTextAreaElement>('[data-testid="editor"]').element.value).toContain('[链接文本](https://example.com)');

    const editor = wrapper.find<HTMLTextAreaElement>('[data-testid="editor"]').element;
    editor.setSelectionRange(editor.value.length, editor.value.length);
    await wrapper.find('[data-testid="insert-code"]').trigger('click');
    expect(wrapper.find<HTMLTextAreaElement>('[data-testid="editor"]').element.value).toContain('```\n代码\n```');
  });

  it('imports image assets and inserts relative image markdown', async () => {
    const wrapper = mount(App);
    await vi.dynamicImportSettled();

    await wrapper.find('[data-testid="import-image"]').trigger('click');
    await vi.dynamicImportSettled();

    expect(window.markdownBridge?.importImageAsset).toHaveBeenCalledWith(openFile.path);
    expect(wrapper.find<HTMLTextAreaElement>('[data-testid="editor"]').element.value).toContain('![diagram](assets/images/diagram.png)');
    expect(wrapper.find('[data-testid="asset-list"]').text()).toContain('diagram.png');
  });

  it('saves pasted images into assets/images as timestamped WebP files', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-06T08:00:00.000Z'));
    const close = vi.fn();
    const createImageBitmap = vi.fn().mockResolvedValue({ width: 8, height: 6, close });
    vi.stubGlobal('createImageBitmap', createImageBitmap);
    Object.defineProperty(window, 'createImageBitmap', { configurable: true, value: createImageBitmap });
    window.createImageBitmap = createImageBitmap as unknown as typeof window.createImageBitmap;
    const drawImage = vi.fn();
    Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
      configurable: true,
      value: vi.fn().mockReturnValue({ drawImage }),
    });
    Object.defineProperty(HTMLCanvasElement.prototype, 'toBlob', {
      configurable: true,
      value: vi.fn((callback: BlobCallback) => {
        const webpBlob = new Blob(['webp'], { type: 'image/webp' });
        Object.defineProperty(webpBlob, 'arrayBuffer', {
          configurable: true,
          value: vi.fn().mockResolvedValue(new ArrayBuffer(4)),
        });
        callback(webpBlob);
      }),
    });
    const pastedAsset = {
      name: '1778054400000.webp',
      relativePath: 'assets/images/1778054400000.webp',
      absolutePath: '/docs/assets/images/1778054400000.webp',
      size: 4,
    };
    vi.mocked(window.markdownBridge!.saveImageAsset).mockResolvedValue(pastedAsset);

    const wrapper = mount(App);
    await vi.dynamicImportSettled();
    const editor = wrapper.find<HTMLTextAreaElement>('[data-testid="editor"]').element;
    const file = {
      name: 'paste.png',
      type: 'image/png',
      arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(4)),
    };
    const event = new Event('paste', { bubbles: true, cancelable: true });
    const preventDefault = vi.spyOn(event, 'preventDefault');
    Object.defineProperty(event, 'clipboardData', {
      value: {
        files: [file],
      },
    });

    editor.dispatchEvent(event);
    await vi.dynamicImportSettled();

    expect(preventDefault).toHaveBeenCalled();
    expect(window.markdownBridge?.saveImageAsset).toHaveBeenCalledWith(
      openFile.path,
      '1778054400000.webp',
      expect.any(ArrayBuffer),
      'image/webp',
    );
    expect(drawImage).toHaveBeenCalled();
    expect(close).toHaveBeenCalled();
    expect(wrapper.find<HTMLTextAreaElement>('[data-testid="editor"]').element.value).toContain('![1778054400000](assets/images/1778054400000.webp)');
  });

  it('opens a cloud upload dialog for pasted images and inserts the uploaded URL', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-06T08:00:00.000Z'));
    Object.defineProperty(HTMLCanvasElement.prototype, 'toBlob', {
      configurable: true,
      value: undefined,
    });

    const wrapper = mount(App);
    await vi.dynamicImportSettled();
    await wrapper.find('[data-testid="image-upload-cloud"]').trigger('click');

    const editor = wrapper.find<HTMLTextAreaElement>('[data-testid="editor"]').element;
    const file = {
      name: 'paste.png',
      type: 'image/png',
      arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(4)),
    };
    const event = new Event('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'clipboardData', {
      value: {
        files: [file],
      },
    });

    editor.dispatchEvent(event);
    await vi.dynamicImportSettled();

    expect(window.markdownBridge?.saveTempImageAsset).toHaveBeenCalledWith(
      'paste.png',
      expect.any(ArrayBuffer),
      'image/png',
    );
    expect(wrapper.find('[data-testid="cloud-upload-modal"]').exists()).toBe(true);
    expect(wrapper.find<HTMLInputElement>('[data-testid="cloud-upload-app-id"]').element.value).toBe('pinefield.assets');
    expect(wrapper.find<HTMLInputElement>('[data-testid="cloud-upload-sub-dir"]').element.value).toBe('/2026-05-06');

    await wrapper.find('[data-testid="cloud-upload-link-name"]').setValue('banner');
    await wrapper.find('form.cloud-upload-dialog').trigger('submit');
    await vi.dynamicImportSettled();

    expect(window.markdownBridge?.uploadCloudImage).toHaveBeenCalledWith({
      filePath: '/tmp/1778054400000.webp',
      appId: 'pinefield.assets',
      subDir: '/2026-05-06',
      linkName: 'banner',
    });
    expect(wrapper.find<HTMLTextAreaElement>('[data-testid="editor"]').element.value).toContain(
      '![banner](https://assets.pinefield.cn/apps/pinefield.assets/2026-05-06/banner.webp)',
    );
  });

  it('inserts cloud upload markdown at the original paste cursor after the dialog steals focus', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-06T08:00:00.000Z'));
    Object.defineProperty(HTMLCanvasElement.prototype, 'toBlob', {
      configurable: true,
      value: undefined,
    });

    const wrapper = mount(App);
    await vi.dynamicImportSettled();
    await wrapper.find('[data-testid="image-upload-cloud"]').trigger('click');

    const editor = wrapper.find<HTMLTextAreaElement>('[data-testid="editor"]').element;
    const insertionPoint = '# Title\n'.length;
    editor.scrollTop = 42;
    editor.setSelectionRange(insertionPoint, insertionPoint);
    const event = new Event('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'clipboardData', {
      value: {
        files: [{
          name: 'paste.png',
          type: 'image/png',
          arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(4)),
        }],
      },
    });

    editor.dispatchEvent(event);
    await vi.dynamicImportSettled();

    editor.setSelectionRange(editor.value.length, editor.value.length);
    await wrapper.find('[data-testid="cloud-upload-link-name"]').setValue('banner');
    await wrapper.find('form.cloud-upload-dialog').trigger('submit');
    await vi.dynamicImportSettled();

    const inserted = '![banner](https://assets.pinefield.cn/apps/pinefield.assets/2026-05-06/banner.webp)';
    expect(editor.value.slice(insertionPoint, insertionPoint + inserted.length)).toBe(inserted);
    expect(editor.selectionStart).toBe(insertionPoint + inserted.length);
    expect(editor.scrollTop).toBe(42);
  });

  it('enables cloud image upload mode from the toolbar entry', async () => {
    const wrapper = mount(App);
    await vi.dynamicImportSettled();

    await wrapper.find('[data-testid="cloud-image-upload"]').trigger('click');

    expect(wrapper.find('[data-testid="image-upload-cloud"]').classes()).toContain('active');
    expect(window.localStorage.getItem('markdown-editor-cloud-upload-prefs')).toContain('"mode":"cloud"');
    expect(wrapper.text()).toContain('云端上传已启用');
  });

  it('restores the persisted image upload mode on launch', async () => {
    window.localStorage.setItem('markdown-editor-cloud-upload-prefs', JSON.stringify({
      appId: 'pinefield.assets',
      mode: 'cloud',
      subDir: '/2026-05-06',
    }));

    const wrapper = mount(App);
    await vi.dynamicImportSettled();

    expect(wrapper.find('[data-testid="image-upload-cloud"]').classes()).toContain('active');
    await wrapper.find('[data-testid="image-upload-local"]').trigger('click');
    expect(wrapper.find('[data-testid="image-upload-local"]').classes()).toContain('active');
    expect(window.localStorage.getItem('markdown-editor-cloud-upload-prefs')).toContain('"mode":"local"');
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

  it('syncs editor scrolling to preview source anchors relative to the preview pane', async () => {
    const wrapper = mount(App);
    await vi.dynamicImportSettled();
    await wrapper.find('[data-testid="toggle-editor"]').trigger('click');

    const editor = wrapper.find<HTMLTextAreaElement>('[data-testid="editor"]').element;
    const preview = wrapper.find<HTMLElement>('[data-testid="preview"]').element;
    setScrollMetrics(editor, 1200, 200);
    setScrollMetrics(preview, 2200, 200);
    preview.scrollTop = 0;
    setPreviewSourceLineGeometry(preview, 500, {
      1: 20,
      3: 80,
      5: 120,
      7: 160,
      9: 210,
      11: 260,
    });

    const lineHeight = Number.parseFloat(window.getComputedStyle(editor).lineHeight) || 22.4;
    editor.scrollTop = 6 * lineHeight;
    await wrapper.find('[data-testid="editor"]').trigger('scroll');

    expect(preview.scrollTop).toBe(110);
  });

  it('syncs preview and table-of-contents highlight from the editor cursor line', async () => {
    const wrapper = mount(App);
    await vi.dynamicImportSettled();
    await wrapper.find('[data-testid="toggle-editor"]').trigger('click');

    const editor = wrapper.find<HTMLTextAreaElement>('[data-testid="editor"]').element;
    const preview = wrapper.find<HTMLElement>('[data-testid="preview"]').element;
    setScrollMetrics(editor, 1200, 200);
    setScrollMetrics(preview, 2200, 200);
    preview.scrollTop = 0;
    setPreviewSourceLineGeometry(preview, 500, {
      1: 20,
      3: 80,
      5: 120,
      7: 160,
      9: 210,
      11: 260,
    });

    const betaBodyOffset = openFile.content.indexOf('hello beta');
    editor.focus();
    editor.setSelectionRange(betaBodyOffset, betaBodyOffset);
    await wrapper.find('[data-testid="editor"]').trigger('keyup');
    await vi.dynamicImportSettled();

    expect(preview.scrollTop).toBeGreaterThan(0);
    const betaLink = wrapper.findAll('.toc-link').find((link) => link.text() === 'Beta');
    expect(betaLink?.classes()).toContain('active');
  });

  it('debounces persisted scroll positions and keeps the latest value', async () => {
    vi.useFakeTimers();
    const wrapper = mount(App);
    await vi.dynamicImportSettled();
    await wrapper.find('[data-testid="toggle-editor"]').trigger('click');
    vi.mocked(window.markdownBridge!.saveSession).mockClear();

    const editor = wrapper.find<HTMLTextAreaElement>('[data-testid="editor"]').element;
    const preview = wrapper.find<HTMLElement>('[data-testid="preview"]').element;
    setScrollMetrics(editor, 1200, 200);
    setScrollMetrics(preview, 2200, 200);

    editor.scrollTop = 200;
    await wrapper.find('[data-testid="editor"]').trigger('scroll');
    editor.scrollTop = 400;
    await wrapper.find('[data-testid="editor"]').trigger('scroll');

    expect(window.markdownBridge?.saveSession).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(250);

    expect(window.markdownBridge?.saveSession).toHaveBeenCalledTimes(1);
    expect(window.markdownBridge?.saveSession).toHaveBeenCalledWith(
      expect.objectContaining({ scrollTop: preview.scrollTop }),
    );
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

    expect(wrapper.get('[data-testid="preview-panel"]').find('[data-testid="fullscreen-preview"]').exists()).toBe(true);

    await wrapper.find('[data-testid="fullscreen-preview"]').trigger('click');

    expect(wrapper.classes()).toContain('preview-fullscreen');
  });

  it('opens rendered Mermaid diagrams in fullscreen', async () => {
    const wrapper = mount(App);
    await vi.dynamicImportSettled();
    attachRenderedMermaidSvg(wrapper);

    await wrapper.find('[data-mermaid-action="fullscreen"]').trigger('click');

    expect(wrapper.find('[data-testid="mermaid-modal"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="mermaid-modal"]').html()).toContain('<svg');
  });

  it('zooms, resets, and drags fullscreen Mermaid diagrams', async () => {
    const wrapper = mount(App);
    await vi.dynamicImportSettled();
    attachRenderedMermaidSvg(wrapper);

    await wrapper.find('[data-mermaid-action="fullscreen"]').trigger('click');
    await wrapper.find('[data-testid="mermaid-modal-zoom-in"]').trigger('click');
    expect(wrapper.find('[data-testid="mermaid-modal-canvas"]').attributes('style')).toContain('scale(1.2)');

    await wrapper.find('[data-testid="mermaid-modal"]').trigger('wheel', { deltaY: 100 });
    expect(wrapper.find('[data-testid="mermaid-modal-canvas"]').attributes('style')).toContain('scale(1.1)');

    await wrapper.find('[data-testid="mermaid-modal"]').trigger('pointerdown', {
      pointerId: 1,
      clientX: 10,
      clientY: 10,
    });
    await wrapper.find('[data-testid="mermaid-modal"]').trigger('pointermove', {
      pointerId: 1,
      clientX: 30,
      clientY: 45,
    });
    expect(wrapper.find('[data-testid="mermaid-modal-canvas"]').attributes('style')).toContain('translate(20px, 35px)');
    await wrapper.find('[data-testid="mermaid-modal"]').trigger('pointerup', { pointerId: 1 });
    await wrapper.find('[data-testid="mermaid-modal"]').trigger('click');
    expect(wrapper.find('[data-testid="mermaid-modal"]').exists()).toBe(true);

    await wrapper.find('[data-testid="mermaid-modal-reset"]').trigger('click');
    expect(wrapper.find('[data-testid="mermaid-modal-canvas"]').attributes('style')).toContain('translate(0px, 0px) scale(1)');
  });

  it('exports rendered Mermaid diagrams as SVG', async () => {
    const createObjectUrl = vi.fn(() => 'blob:diagram');
    const revokeObjectUrl = vi.fn();
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectUrl });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revokeObjectUrl });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    const wrapper = mount(App);
    await vi.dynamicImportSettled();
    attachRenderedMermaidSvg(wrapper);

    await wrapper.find('[data-mermaid-action="download-svg"]').trigger('click');

    expect(createObjectUrl).toHaveBeenCalledWith(expect.any(Blob));
    expect(click).toHaveBeenCalled();
    expect(wrapper.text()).toContain('已导出 readme-mermaid-1.svg');
  });

  it('wraps preview images with bounded image actions', async () => {
    const wrapper = mount(App);
    await vi.dynamicImportSettled();

    await wrapper.find('[data-testid="editor"]').setValue('# Images\n\n![Diagram](readme.assets/diagram.png)');
    await vi.dynamicImportSettled();

    const frame = wrapper.find('.markdown-image-frame');
    const image = wrapper.find<HTMLImageElement>('.markdown-image');
    expect(frame.exists()).toBe(true);
    expect(image.exists()).toBe(true);
    expect(image.attributes('src')).toContain('markdown-asset://local/');
    expect(wrapper.find('[data-image-action="fullscreen"]').exists()).toBe(true);
    expect(wrapper.find('[data-image-action="download"]').exists()).toBe(true);

    await wrapper.find('[data-image-action="fullscreen"]').trigger('click');
    expect(wrapper.find('.image-modal-bar strong').text()).toBe('图片 1：Diagram · diagram.png');
  });

  it('copies preview code blocks from the hover action', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });

    const wrapper = mount(App);
    await vi.dynamicImportSettled();

    await wrapper.find('[data-testid="editor"]').setValue('```python\nprint("hello")\n```');
    await vi.dynamicImportSettled();

    expect(wrapper.find('.markdown-code-frame').exists()).toBe(true);
    expect(wrapper.find('[data-code-action="copy"]').exists()).toBe(true);

    await wrapper.find('[data-code-action="copy"]').trigger('click');

    expect(writeText).toHaveBeenCalledWith('print("hello")\n');
    expect(wrapper.find('[data-code-action="copy"]').classes()).toContain('is-copied');
    expect(wrapper.find('[data-code-action="copy"]').attributes('aria-label')).toBe('已复制');
    expect(wrapper.text()).toContain('已复制代码');
  });

  it('opens preview links outside the Electron window', async () => {
    const wrapper = mount(App);
    await vi.dynamicImportSettled();

    await wrapper.find('[data-testid="editor"]').setValue('[Apple](https://apple.com/account)');
    await vi.dynamicImportSettled();
    await wrapper.find('.preview a').trigger('click');
    await vi.dynamicImportSettled();

    expect(window.markdownBridge?.openExternalLink).toHaveBeenCalledWith('https://apple.com/account', openFile.path);
    expect(wrapper.text()).toContain('已在系统浏览器中打开链接');
  });

  it('keeps same-document preview anchors inside the preview', async () => {
    const wrapper = mount(App);
    await vi.dynamicImportSettled();

    await wrapper.find('[data-testid="editor"]').setValue('# Title\n\n[Jump](#title)');
    await vi.dynamicImportSettled();
    await wrapper.find('.preview a').trigger('click');

    expect(window.markdownBridge?.openExternalLink).not.toHaveBeenCalled();
  });

  it('opens, zooms, drags, and downloads preview images', async () => {
    const createObjectUrl = vi.fn(() => 'blob:image');
    const revokeObjectUrl = vi.fn();
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectUrl });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revokeObjectUrl });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      blob: vi.fn().mockResolvedValue(new Blob(['image'], { type: 'image/png' })),
    }));

    const wrapper = mount(App);
    await vi.dynamicImportSettled();

    await wrapper.find('[data-testid="editor"]').setValue('# Images\n\n![Diagram](https://example.com/diagram.png)');
    await vi.dynamicImportSettled();
    await wrapper.find('[data-image-action="fullscreen"]').trigger('click');

    expect(wrapper.find('[data-testid="image-modal"]').exists()).toBe(true);
    expect(wrapper.find('.image-modal-bar strong').text()).toBe('图片 1：Diagram · diagram.png');
    expect(wrapper.find<HTMLImageElement>('[data-testid="image-modal-canvas"]').attributes('src')).toBe('https://example.com/diagram.png');
    expect(wrapper.find<HTMLImageElement>('[data-testid="image-modal-canvas"]').attributes('draggable')).toBe('false');

    await wrapper.find('[data-testid="image-modal-zoom-in"]').trigger('click');
    expect(wrapper.find('[data-testid="image-modal-canvas"]').attributes('style')).toContain('scale(1.2)');

    await wrapper.find('[data-testid="image-modal"]').trigger('wheel', { deltaY: 100 });
    expect(wrapper.find('[data-testid="image-modal-canvas"]').attributes('style')).toContain('scale(1.1)');

    await wrapper.find('[data-testid="image-modal"]').trigger('pointerdown', {
      pointerId: 1,
      clientX: 10,
      clientY: 10,
    });
    expect(wrapper.find('[data-testid="image-modal"]').classes()).toContain('image-modal--dragging');
    await wrapper.find('[data-testid="image-modal"]').trigger('pointermove', {
      pointerId: 1,
      clientX: 30,
      clientY: 45,
    });
    expect(wrapper.find('[data-testid="image-modal-canvas"]').attributes('style')).toContain('translate(20px, 35px)');

    await wrapper.find('[data-testid="image-modal-download"]').trigger('click');
    await vi.dynamicImportSettled();

    expect(fetch).toHaveBeenCalledWith('https://example.com/diagram.png');
    expect(createObjectUrl).toHaveBeenCalledWith(expect.any(Blob));
    expect(click).toHaveBeenCalled();
  });

  it('filters the table of contents', async () => {
    const wrapper = mount(App);
    await vi.dynamicImportSettled();

    await wrapper.find('[data-testid="toc-search"]').setValue('beta');

    expect(wrapper.find('[data-testid="toc"]').text()).toContain('Beta');
    expect(wrapper.find('[data-testid="toc"]').text()).not.toContain('Alpha');
  });

  it('highlights the active heading after a table-of-contents jump', async () => {
    const wrapper = mount(App);
    await vi.dynamicImportSettled();

    const betaLink = wrapper.findAll('.toc-link').find((link) => link.text() === 'Beta');
    await betaLink?.trigger('click');

    expect(betaLink?.classes()).toContain('active');
  });

  it('jumps from the table of contents using preview-relative heading positions', async () => {
    const wrapper = mount(App);
    await vi.dynamicImportSettled();
    await wrapper.find('[data-testid="toggle-editor"]').trigger('click');

    const editor = wrapper.find<HTMLTextAreaElement>('[data-testid="editor"]').element;
    const preview = wrapper.find<HTMLElement>('[data-testid="preview"]').element;
    setScrollMetrics(editor, 1200, 200);
    setScrollMetrics(preview, 2200, 200);
    preview.scrollTop = 0;
    setPreviewSourceLineGeometry(preview, 500, {
      1: 20,
      3: 80,
      5: 120,
      7: 160,
      9: 210,
      11: 260,
    });

    const betaLink = wrapper.findAll('.toc-link').find((link) => link.text() === 'Beta');
    await betaLink?.trigger('click');

    expect(preview.scrollTop).toBe(144);
    const lineHeight = Number.parseFloat(window.getComputedStyle(editor).lineHeight) || 22.4;
    expect(editor.scrollTop).toBeCloseTo(6 * lineHeight);
  });

  it('opens a recent file and moves it to the front of the LRU list', async () => {
    const wrapper = mount(App);
    await vi.dynamicImportSettled();

    await openRecentFileFromMenu(wrapper, recentFile.name);

    expect(window.markdownBridge?.readMarkdownFile).toHaveBeenCalledWith(recentFile.path);
    expect(wrapper.find('[data-testid="editor"]').element).toHaveProperty('value', recentFile.content);
    expect(window.markdownBridge?.saveSession).toHaveBeenCalledWith(
      expect.objectContaining({ recentFiles: [recentFile.path, openFile.path] }),
    );
  });

  it('deduplicates recent file options and exposes full paths as hover titles', async () => {
    vi.mocked(window.markdownBridge!.getSession).mockResolvedValue({
      filePath: openFile.path,
      tabs: [],
      activeTabId: null,
      recentFiles: [
        '/docs/kv_curls.md',
        '/docs/other.md',
        'file:///docs/kv_curls.md',
        '/docs/remote image.md',
        '/DOCS/REMOTE IMAGE.md',
      ],
      scrollTop: 12,
      tocWidth: 300,
      editorWidth: 640,
      previewHidden: false,
      editorVisible: false,
      theme: 'light',
    });
    const wrapper = mount(App);
    await vi.dynamicImportSettled();

    await wrapper.find('[data-testid="recent-files"]').trigger('click');
    await nextTick();

    const options = wrapper.findAll('.recent-file-row')
      .map((row) => ({
        text: row.find('.recent-file-open').text(),
        title: row.attributes('title'),
      }));

    expect(options.filter((option) => option.text === 'kv_curls.md')).toHaveLength(1);
    expect(options.filter((option) => option.text === 'remote image.md')).toHaveLength(1);
    expect(options).toContainEqual(expect.objectContaining({
      text: 'kv_curls.md',
      title: '/docs/kv_curls.md',
    }));
  });

  it('disambiguates recent file options that share the same file name', async () => {
    vi.mocked(window.markdownBridge!.getSession).mockResolvedValue({
      filePath: openFile.path,
      tabs: [],
      activeTabId: null,
      recentFiles: [
        '/projects/alpha/remote image.md',
        '/projects/beta/remote image.md',
        '/projects/alpha/finder launch.md',
        '/projects/beta/finder launch.md',
      ],
      scrollTop: 12,
      tocWidth: 300,
      editorWidth: 640,
      previewHidden: false,
      editorVisible: false,
      theme: 'light',
    });
    const wrapper = mount(App);
    await vi.dynamicImportSettled();

    await wrapper.find('[data-testid="recent-files"]').trigger('click');
    await nextTick();

    const optionLabels = wrapper.findAll('.recent-file-open')
      .map((option) => option.text());

    expect(optionLabels).toContain('remote image.md (alpha)');
    expect(optionLabels).toContain('remote image.md (beta)');
    expect(optionLabels).toContain('finder launch.md (alpha)');
    expect(optionLabels).toContain('finder launch.md (beta)');
  });

  it('removes a recent file from the custom recent menu without opening it', async () => {
    const wrapper = mount(App);
    await vi.dynamicImportSettled();

    await wrapper.find('[data-testid="recent-files"]').trigger('click');
    await nextTick();
    const row = wrapper.findAll('.recent-file-row').find((item) => item.text().includes(recentFile.name));
    expect(row).toBeTruthy();

    await row!.find('.recent-file-delete').trigger('click');
    await nextTick();

    expect(window.markdownBridge?.readMarkdownFile).not.toHaveBeenCalledWith(recentFile.path);
    expect(window.markdownBridge?.saveSession).toHaveBeenCalledWith(
      expect.objectContaining({ recentFiles: [openFile.path] }),
    );
    expect(wrapper.findAll('.recent-file-row').some((item) => item.text().includes(recentFile.name))).toBe(false);
  });

  it('removes an unreadable recent file by normalized path', async () => {
    vi.mocked(window.markdownBridge!.getSession).mockResolvedValue({
      filePath: openFile.path,
      tabs: [],
      activeTabId: null,
      recentFiles: [
        'file:///docs/recent.md',
        secondFile.path,
      ],
      scrollTop: 12,
      tocWidth: 300,
      editorWidth: 640,
      previewHidden: false,
      editorVisible: false,
      theme: 'light',
    });
    vi.mocked(window.markdownBridge!.readMarkdownFile).mockImplementation(async (filePath: string) => {
      if (filePath === recentFile.path) {
        throw new Error('missing');
      }
      return {
        ...(filePath === secondFile.path ? secondFile : openFile),
        path: filePath,
        name: filePath.split('/').pop() ?? 'file.md',
      };
    });
    const wrapper = mount(App);
    await vi.dynamicImportSettled();

    await openRecentFileFromMenu(wrapper, recentFile.name);

    const savedSession = vi.mocked(window.markdownBridge!.saveSession).mock.calls.at(-1)?.[0];
    expect(savedSession?.recentFiles).toContain(secondFile.path);
    expect(savedSession?.recentFiles).not.toContain(recentFile.path);
  });

  it('opens different files in tabs and switches between them', async () => {
    const wrapper = mount(App);
    await vi.dynamicImportSettled();

    await openRecentFileFromMenu(wrapper, recentFile.name);

    expect(wrapper.find('[data-testid="tab-readme.md"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="tab-recent.md"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="editor"]').element).toHaveProperty('value', recentFile.content);

    await wrapper.find('[data-testid="tab-readme.md"]').trigger('click');

    expect(wrapper.find('[data-testid="editor"]').element).toHaveProperty('value', openFile.content);
    expect(window.markdownBridge?.saveSession).toHaveBeenCalledWith(
      expect.objectContaining({
        activeTabId: openFile.path.startsWith('/') ? `file:${openFile.path}` : expect.any(String),
        tabs: expect.arrayContaining([
          expect.objectContaining({ filePath: openFile.path }),
          expect.objectContaining({ filePath: recentFile.path }),
        ]),
      }),
    );
  });

  it('restores multiple tabs from the saved session', async () => {
    vi.mocked(window.markdownBridge!.getSession).mockResolvedValue({
      filePath: secondFile.path,
      tabs: [
        { id: `file:${openFile.path}`, filePath: openFile.path, name: openFile.name, scrollTop: 10 },
        { id: `file:${secondFile.path}`, filePath: secondFile.path, name: secondFile.name, scrollTop: 24 },
      ],
      activeTabId: `file:${secondFile.path}`,
      recentFiles: [secondFile.path, openFile.path],
      scrollTop: 24,
      tocWidth: 300,
      editorWidth: 640,
      previewHidden: false,
      editorVisible: false,
      theme: 'light',
    });

    const wrapper = mount(App);
    await vi.dynamicImportSettled();

    expect(window.markdownBridge?.readMarkdownFile).toHaveBeenCalledWith(openFile.path);
    expect(window.markdownBridge?.readMarkdownFile).toHaveBeenCalledWith(secondFile.path);
    expect(window.markdownBridge?.readLastMarkdownFile).not.toHaveBeenCalled();
    expect(wrapper.find('[data-testid="tab-readme.md"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="tab-second.md"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="editor"]').element).toHaveProperty('value', secondFile.content);

    await wrapper.find('[data-testid="tab-readme.md"]').trigger('click');
    expect(window.markdownBridge?.saveSession).toHaveBeenLastCalledWith(
      expect.objectContaining({
        activeTabId: `file:${openFile.path}`,
        tabs: expect.arrayContaining([
          expect.objectContaining({ filePath: openFile.path, scrollTop: 10 }),
          expect.objectContaining({ filePath: secondFile.path, scrollTop: 24 }),
        ]),
      }),
    );
  });

  it('restores saved tabs before opening a launch file', async () => {
    vi.mocked(window.markdownBridge!.getSession).mockResolvedValue({
      filePath: secondFile.path,
      tabs: [
        { id: `file:${openFile.path}`, filePath: openFile.path, name: openFile.name, scrollTop: 10 },
        { id: `file:${secondFile.path}`, filePath: secondFile.path, name: secondFile.name, scrollTop: 24 },
      ],
      activeTabId: `file:${secondFile.path}`,
      recentFiles: [secondFile.path, openFile.path],
      scrollTop: 24,
      tocWidth: 300,
      editorWidth: 640,
      previewHidden: false,
      editorVisible: false,
      theme: 'light',
    });
    vi.mocked(window.markdownBridge!.takeLaunchMarkdownFile).mockResolvedValue({
      file: recentFile,
      external: true,
    });

    const wrapper = mount(App);
    await vi.dynamicImportSettled();

    expect(wrapper.find('[data-testid="tab-readme.md"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="tab-second.md"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="tab-recent.md"]').exists()).toBe(true);
    expect(window.markdownBridge?.saveSession).toHaveBeenLastCalledWith(
      expect.objectContaining({
        activeTabId: `file:${recentFile.path}`,
        tabs: expect.arrayContaining([
          expect.objectContaining({ filePath: openFile.path }),
          expect.objectContaining({ filePath: secondFile.path }),
          expect.objectContaining({ filePath: recentFile.path }),
        ]),
      }),
    );
  });

  it('persists tab order when tabs are moved', async () => {
    const wrapper = mount(App);
    await vi.dynamicImportSettled();

    await openRecentFileFromMenu(wrapper, recentFile.name);

    const dragged = { value: '' };
    const dataTransfer = {
      effectAllowed: '',
      setData: vi.fn((_type: string, value: string) => {
        dragged.value = value;
      }),
      getData: vi.fn(() => dragged.value),
    };

    await wrapper.find('[data-testid="tab-readme.md"]').trigger('dragstart', { dataTransfer });
    await wrapper.find('[data-testid="tab-recent.md"]').trigger('drop', { dataTransfer });

    expect(window.markdownBridge?.saveSession).toHaveBeenLastCalledWith(
      expect.objectContaining({
        tabs: [
          expect.objectContaining({ filePath: recentFile.path }),
          expect.objectContaining({ filePath: openFile.path }),
        ],
      }),
    );
  });

  it('closes the app when the final clean tab closes', async () => {
    const wrapper = mount(App);
    await vi.dynamicImportSettled();

    await wrapper.find('[data-testid="close-tab-readme.md"]').trigger('click');
    await vi.dynamicImportSettled();

    expect(window.markdownBridge?.saveSession).toHaveBeenCalledWith(
      expect.objectContaining({ tabs: [], activeTabId: null, filePath: null }),
    );
    expect(window.markdownBridge?.confirmCloseSync).toHaveBeenCalled();
  });

  it('persists remaining tabs when a non-final tab closes', async () => {
    const wrapper = mount(App);
    await vi.dynamicImportSettled();

    await openRecentFileFromMenu(wrapper, recentFile.name);
    await wrapper.find('[data-testid="close-tab-recent.md"]').trigger('click');
    await vi.dynamicImportSettled();

    expect(window.markdownBridge?.saveSession).toHaveBeenLastCalledWith(
      expect.objectContaining({
        activeTabId: `file:${openFile.path}`,
        tabs: [
          expect.objectContaining({ filePath: openFile.path }),
        ],
      }),
    );
  });

  it('saves all tabs synchronously before the window unloads', async () => {
    const wrapper = mount(App);
    await vi.dynamicImportSettled();

    await openRecentFileFromMenu(wrapper, recentFile.name);
    window.dispatchEvent(new Event('beforeunload'));

    expect(window.markdownBridge?.saveSessionSync).toHaveBeenCalledWith(
      expect.objectContaining({
        activeTabId: `file:${recentFile.path}`,
        tabs: expect.arrayContaining([
          expect.objectContaining({ filePath: openFile.path }),
          expect.objectContaining({ filePath: recentFile.path }),
        ]),
      }),
    );
  });

  it('asks how to handle dirty tabs before the app closes', async () => {
    const closeCallbacks: Array<() => void> = [];
    vi.mocked(window.markdownBridge!.onCloseRequest).mockImplementation((callback) => {
      closeCallbacks.push(callback);
      return () => {};
    });
    const wrapper = mount(App);
    await vi.dynamicImportSettled();

    await wrapper.find('[data-testid="editor"]').setValue('# Changed');
    closeCallbacks[0]?.();
    await nextTick();

    expect(wrapper.find('[data-testid="close-confirm-modal"]').exists()).toBe(true);

    await wrapper.find('[data-testid="close-save-all"]').trigger('click');
    await vi.dynamicImportSettled();

    expect(window.markdownBridge?.saveMarkdownFile).toHaveBeenCalledWith(openFile.path, '# Changed');
    expect(window.markdownBridge?.confirmCloseSync).toHaveBeenCalled();
  });

  it('can discard dirty tabs before the app closes', async () => {
    const closeCallbacks: Array<() => void> = [];
    vi.mocked(window.markdownBridge!.onCloseRequest).mockImplementation((callback) => {
      closeCallbacks.push(callback);
      return () => {};
    });
    const wrapper = mount(App);
    await vi.dynamicImportSettled();

    await wrapper.find('[data-testid="editor"]').setValue('# Changed');
    closeCallbacks[0]?.();
    await nextTick();

    await wrapper.find('[data-testid="close-discard-all"]').trigger('click');
    await vi.dynamicImportSettled();

    expect(window.markdownBridge?.saveMarkdownFile).not.toHaveBeenCalled();
    expect(window.markdownBridge?.confirmCloseSync).toHaveBeenCalled();
  });

  it('closes from a stale close dialog after dirty tabs were saved elsewhere', async () => {
    const closeCallbacks: Array<() => void> = [];
    vi.mocked(window.markdownBridge!.onCloseRequest).mockImplementation((callback) => {
      closeCallbacks.push(callback);
      return () => {};
    });
    const wrapper = mount(App);
    await vi.dynamicImportSettled();

    await wrapper.find('[data-testid="editor"]').setValue('# Changed');
    closeCallbacks[0]?.();
    await nextTick();
    expect(wrapper.find('[data-testid="close-confirm-modal"]').exists()).toBe(true);

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 's', metaKey: true }));
    await vi.dynamicImportSettled();

    expect(wrapper.find('[data-testid="close-confirm-modal"]').text()).toContain('0 个文件');
    await wrapper.find('[data-testid="close-save-all"]').trigger('click');
    await vi.dynamicImportSettled();

    expect(window.markdownBridge?.confirmCloseSync).toHaveBeenCalled();
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

    expect(wrapper.find('[data-testid="expand-toc"]').attributes('aria-label')).toBe('展开全部标题');
    expect(wrapper.find('[data-testid="collapse-toc"]').attributes('aria-label')).toBe('收起全部标题');

    await wrapper.find('[data-testid="collapse-toc"]').trigger('click');
    expect(wrapper.find('[data-testid="toc"]').text()).toContain('Title');
    expect(wrapper.find('[data-testid="toc"]').text()).not.toContain('Alpha');
    expect(wrapper.find('[data-testid="toc"]').text()).not.toContain('Beta');

    await wrapper.find('[data-testid="expand-toc"]').trigger('click');
    expect(wrapper.find('[data-testid="toc"]').text()).toContain('Alpha');
    expect(wrapper.find('[data-testid="toc"]').text()).toContain('Beta');
  });

  it('expands and collapses the table of contents sidebar', async () => {
    const wrapper = mount(App);
    await vi.dynamicImportSettled();

    expect(wrapper.find('[data-testid="toggle-toc-panel"]').attributes('aria-label')).toBe('收起目录侧栏');

    await wrapper.find('[data-testid="toggle-toc-panel"]').trigger('click');
    await nextTick();

    expect(wrapper.classes()).toContain('toc-collapsed');
    expect(wrapper.find('[data-testid="toggle-toc-panel"]').attributes('aria-label')).toBe('展开目录侧栏');
    expect(wrapper.find('.workspace').attributes('style')).toContain('44px 0px');

    await wrapper.find('[data-testid="toggle-toc-panel"]').trigger('click');
    await nextTick();

    expect(wrapper.classes()).not.toContain('toc-collapsed');
    expect(wrapper.find('.workspace').attributes('style')).toContain('300px 6px');
  });

  it('replaces all source matches in the editor', async () => {
    const wrapper = mount(App);
    await vi.dynamicImportSettled();

    await wrapper.find('[data-testid="toggle-editor"]').trigger('click');
    await nextTick();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'f', ctrlKey: true }));
    await nextTick();

    await wrapper.find('[data-testid="editor-search"]').setValue('hello');
    await wrapper.find('[data-testid="editor-replace"]').setValue('hi');
    await wrapper.find('[data-testid="replace-all"]').trigger('click');

    expect(wrapper.find<HTMLTextAreaElement>('[data-testid="editor"]').element.value).toContain('hi alpha');
    expect(wrapper.find<HTMLTextAreaElement>('[data-testid="editor"]').element.value).toContain('hi beta');
  });

  it('shows and hides source search from keyboard shortcuts', async () => {
    const wrapper = mount(App, { attachTo: document.body });
    await vi.dynamicImportSettled();

    expect(wrapper.find('[data-testid="editor-search"]').exists()).toBe(false);

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'f', ctrlKey: true }));
    await nextTick();

    const searchInput = wrapper.find<HTMLInputElement>('[data-testid="editor-search"]');
    expect(searchInput.exists()).toBe(true);
    expect(document.activeElement).toBe(searchInput.element);

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await nextTick();

    expect(wrapper.find('[data-testid="editor-search"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('finds next and previous matches from the source search input', async () => {
    const wrapper = mount(App, { attachTo: document.body });
    await vi.dynamicImportSettled();

    await wrapper.find('[data-testid="toggle-editor"]').trigger('click');
    await nextTick();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'f', ctrlKey: true }));
    await nextTick();

    const searchInput = wrapper.find<HTMLInputElement>('[data-testid="editor-search"]');
    const editor = wrapper.find<HTMLTextAreaElement>('[data-testid="editor"]').element;
    await searchInput.setValue('hello');
    searchInput.element.focus();

    await searchInput.trigger('keydown', { key: 'Enter' });
    await nextTick();

    const firstMatch = openFile.content.indexOf('hello');
    const lastMatch = openFile.content.lastIndexOf('hello');
    expect(editor.selectionStart).toBe(firstMatch);
    expect(editor.selectionEnd).toBe(firstMatch + 'hello'.length);
    expect(document.activeElement).toBe(searchInput.element);

    await searchInput.trigger('keydown', { key: 'Enter', shiftKey: true });
    await nextTick();

    expect(editor.selectionStart).toBe(lastMatch);
    expect(editor.selectionEnd).toBe(lastMatch + 'hello'.length);
    expect(document.activeElement).toBe(searchInput.element);
    wrapper.unmount();
  });

  it('searches and highlights matches while only the preview is visible', async () => {
    const wrapper = mount(App, { attachTo: document.body });
    await vi.dynamicImportSettled();

    expect(wrapper.classes()).toContain('reader-mode');

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'f', ctrlKey: true }));
    await nextTick();

    const searchInput = wrapper.find<HTMLInputElement>('[data-testid="editor-search"]');
    await searchInput.setValue('hello');
    searchInput.element.focus();

    await searchInput.trigger('keydown', { key: 'Enter' });
    await nextTick();

    const firstMatch = wrapper.find<HTMLElement>('.preview-search-match');
    expect(firstMatch.exists()).toBe(true);
    expect(firstMatch.text()).toContain('hello alpha');
    expect(wrapper.find('[data-testid="editor-replace"]').exists()).toBe(false);
    expect(document.activeElement).toBe(searchInput.element);

    await searchInput.trigger('keydown', { key: 'Enter', shiftKey: true });
    await nextTick();

    const previousMatch = wrapper.find<HTMLElement>('.preview-search-match');
    expect(previousMatch.text()).toContain('hello beta');
    expect(document.activeElement).toBe(searchInput.element);
    wrapper.unmount();
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

  it('keeps the split editor layout inside the viewport', async () => {
    const wrapper = mount(App);
    await vi.dynamicImportSettled();

    await wrapper.find('[data-testid="toggle-editor"]').trigger('click');

    const workspaceStyle = wrapper.find('.workspace').attributes('style');
    expect(workspaceStyle).toContain('minmax(0, 640px)');
    expect(workspaceStyle).toContain('minmax(0, 1fr)');
    expect(wrapper.find('[data-testid="editor"]').attributes('wrap')).toBe('soft');
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

  it('keeps cursor history for cross-line moves and updates same-line columns', async () => {
    const wrapper = mount(App);
    await vi.dynamicImportSettled();
    await wrapper.find('[data-testid="toggle-editor"]').trigger('click');

    const editor = wrapper.find<HTMLTextAreaElement>('[data-testid="editor"]').element;
    const firstOffset = offsetForLineColumn(openFile.content, 1, 3);
    const alphaColumnOffset = offsetForLineColumn(openFile.content, 3, 4);
    const alphaUpdatedOffset = offsetForLineColumn(openFile.content, 3, 7);

    editor.setSelectionRange(firstOffset, firstOffset);
    await wrapper.find('[data-testid="editor"]').trigger('keyup');
    editor.setSelectionRange(alphaColumnOffset, alphaColumnOffset);
    await wrapper.find('[data-testid="editor"]').trigger('keyup');
    editor.setSelectionRange(alphaUpdatedOffset, alphaUpdatedOffset);
    await wrapper.find('[data-testid="editor"]').trigger('keyup');

    window.dispatchEvent(new KeyboardEvent('keydown', { key: '[', ctrlKey: true }));
    await vi.dynamicImportSettled();
    expect(editor.selectionStart).toBe(firstOffset);

    window.dispatchEvent(new KeyboardEvent('keydown', { key: ']', ctrlKey: true }));
    await vi.dynamicImportSettled();
    expect(editor.selectionStart).toBe(alphaUpdatedOffset);
  });

  it('jumps cursor history across open files', async () => {
    vi.mocked(window.markdownBridge!.openMarkdownFile).mockResolvedValueOnce(secondFile);
    const wrapper = mount(App);
    await vi.dynamicImportSettled();
    await wrapper.find('[data-testid="toggle-editor"]').trigger('click');

    let editor = wrapper.find<HTMLTextAreaElement>('[data-testid="editor"]').element;
    const firstFileOffset = offsetForLineColumn(openFile.content, 5, 3);
    editor.setSelectionRange(firstFileOffset, firstFileOffset);
    await wrapper.find('[data-testid="editor"]').trigger('keyup');

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'o', metaKey: true }));
    await vi.dynamicImportSettled();

    editor = wrapper.find<HTMLTextAreaElement>('[data-testid="editor"]').element;
    const secondFileOffset = offsetForLineColumn(secondFile.content, 1, 4);
    editor.setSelectionRange(secondFileOffset, secondFileOffset);
    await wrapper.find('[data-testid="editor"]').trigger('keyup');

    window.dispatchEvent(new KeyboardEvent('keydown', { key: '[', ctrlKey: true }));
    await vi.dynamicImportSettled();
    editor = wrapper.find<HTMLTextAreaElement>('[data-testid="editor"]').element;

    expect(editor.value).toBe(openFile.content);
    expect(editor.selectionStart).toBe(firstFileOffset);

    window.dispatchEvent(new KeyboardEvent('keydown', { key: ']', ctrlKey: true }));
    await vi.dynamicImportSettled();
    editor = wrapper.find<HTMLTextAreaElement>('[data-testid="editor"]').element;

    expect(editor.value).toBe(secondFile.content);
    expect(editor.selectionStart).toBe(secondFileOffset);
  });

  it('zooms the preview from keyboard shortcuts and resets to 100%', async () => {
    const wrapper = mount(App);
    await vi.dynamicImportSettled();

    expect(wrapper.find('[data-testid="preview-zoom-reset"]').exists()).toBe(false);

    window.dispatchEvent(new KeyboardEvent('keydown', { key: '+', metaKey: true }));
    await nextTick();

    expect(wrapper.get('[data-testid="preview"]').attributes('style')).toContain('--preview-zoom: 1.1');
    expect(wrapper.get('[data-testid="preview-zoom-reset"]').attributes('title')).toContain('当前 110%');

    await wrapper.get('[data-testid="preview-zoom-out"]').trigger('click');
    await nextTick();

    expect(wrapper.get('[data-testid="preview"]').attributes('style')).toContain('--preview-zoom: 1');
    expect(wrapper.find('[data-testid="preview-zoom-reset"]').exists()).toBe(false);

    window.dispatchEvent(new KeyboardEvent('keydown', { key: '-', metaKey: true }));
    await nextTick();

    expect(wrapper.get('[data-testid="preview"]').attributes('style')).toContain('--preview-zoom: 0.9');

    window.dispatchEvent(new KeyboardEvent('keydown', { key: '0', metaKey: true }));
    await nextTick();

    expect(wrapper.get('[data-testid="preview"]').attributes('style')).toContain('--preview-zoom: 1');
    expect(wrapper.find('[data-testid="preview-zoom-reset"]').exists()).toBe(false);
  });

  it('creates an untitled markdown tab with the new-file shortcut', async () => {
    const wrapper = mount(App);
    await vi.dynamicImportSettled();

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 't', metaKey: true }));
    await vi.dynamicImportSettled();

    expect(wrapper.find('[data-testid^="tab-未命名"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="editor"]').element).toHaveProperty('value', '');
    expect(window.markdownBridge?.saveSession).toHaveBeenCalledWith(
      expect.objectContaining({
        tabs: expect.arrayContaining([
          expect.objectContaining({ filePath: null, content: '' }),
        ]),
      }),
    );
  });

  it('marks dirty tabs when their content changes', async () => {
    const wrapper = mount(App);
    await vi.dynamicImportSettled();

    await wrapper.find('[data-testid="editor"]').setValue('# Changed');

    expect(wrapper.find('[data-testid="tab-readme.md"]').classes()).toContain('dirty');
    expect(wrapper.find('[data-testid="tab-readme.md"] .dirty-dot').exists()).toBe(true);
    expect(wrapper.find('.title-block strong').text()).toBe('readme.md *');
    expect(wrapper.find('.title-block span').text()).toContain('未保存');
  });

  it('does not auto-save file edits before the manual save shortcut', async () => {
    const wrapper = mount(App);
    await vi.dynamicImportSettled();

    await wrapper.find('[data-testid="editor"]').setValue('# Changed');
    await new Promise((resolve) => window.setTimeout(resolve, 450));

    expect(window.markdownBridge?.saveMarkdownFile).not.toHaveBeenCalled();
  });

  it('supports tab context menu duplicate, copy path, reveal, save as, and copy content actions', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
    const wrapper = mount(App);
    await vi.dynamicImportSettled();

    await wrapper.find('[data-testid="tab-readme.md"]').trigger('contextmenu', {
      clientX: 80,
      clientY: 40,
    });
    expect(wrapper.find('[data-testid="tab-context-menu"]').exists()).toBe(true);

    await wrapper.find('[data-testid="tab-copy-path"]').trigger('click');
    expect(writeText).toHaveBeenCalledWith(openFile.path);

    await wrapper.find('[data-testid="tab-readme.md"]').trigger('contextmenu', { clientX: 80, clientY: 40 });
    await wrapper.find('[data-testid="tab-copy-content"]').trigger('click');
    expect(writeText).toHaveBeenCalledWith(openFile.content);

    await wrapper.find('[data-testid="tab-readme.md"]').trigger('contextmenu', { clientX: 80, clientY: 40 });
    await wrapper.find('[data-testid="tab-reveal-in-folder"]').trigger('click');
    expect(window.markdownBridge?.revealInFolder).toHaveBeenCalledWith(openFile.path);

    await wrapper.find('[data-testid="tab-readme.md"]').trigger('contextmenu', { clientX: 80, clientY: 40 });
    await wrapper.find('[data-testid="tab-duplicate"]').trigger('click');
    expect(wrapper.find('[data-testid="tab-readme 副本.md"]').exists()).toBe(true);

    await wrapper.find('[data-testid="tab-readme 副本.md"]').trigger('contextmenu', { clientX: 80, clientY: 40 });
    await wrapper.find('[data-testid="tab-save-as"]').trigger('click');
    await vi.dynamicImportSettled();
    expect(window.markdownBridge?.saveMarkdownFileAs).toHaveBeenCalledWith(openFile.content, 'readme 副本.md');
  });

  it('auto-refreshes externally changed clean files without overwriting dirty edits', async () => {
    const changedCallbacks: Array<(file: MarkdownFile) => void> = [];
    vi.mocked(window.markdownBridge!.onMarkdownFileChanged).mockImplementation((callback) => {
      changedCallbacks.push(callback);
      return () => {};
    });
    const wrapper = mount(App);
    await vi.dynamicImportSettled();

    changedCallbacks[0]?.({ ...openFile, content: '# External' });
    await vi.dynamicImportSettled();

    expect(wrapper.find<HTMLTextAreaElement>('[data-testid="editor"]').element.value).toBe('# External');
    expect(wrapper.text()).toContain('已自动刷新');

    await wrapper.find('[data-testid="editor"]').setValue('# Local unsaved');
    changedCallbacks[0]?.({ ...openFile, content: '# External again' });
    await vi.dynamicImportSettled();

    expect(wrapper.find<HTMLTextAreaElement>('[data-testid="editor"]').element.value).toBe('# Local unsaved');
    expect(wrapper.text()).toContain('未自动刷新');
  });

  it('manually refreshes the current clean file from disk', async () => {
    const wrapper = mount(App);
    await vi.dynamicImportSettled();
    vi.mocked(window.markdownBridge!.readMarkdownFile).mockResolvedValueOnce({
      ...openFile,
      content: '# Disk version',
    });

    await wrapper.find('[data-testid="refresh-file"]').trigger('click');
    await vi.dynamicImportSettled();

    expect(window.markdownBridge?.readMarkdownFile).toHaveBeenCalledWith(openFile.path);
    expect(wrapper.find<HTMLTextAreaElement>('[data-testid="editor"]').element.value).toBe('# Disk version');
    expect(wrapper.text()).toContain('已刷新');
  });

  it('uses the command refresh shortcut for clean files', async () => {
    const wrapper = mount(App);
    await vi.dynamicImportSettled();
    vi.mocked(window.markdownBridge!.readMarkdownFile).mockResolvedValueOnce({
      ...openFile,
      content: '# Shortcut refresh',
    });

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'r', metaKey: true }));
    await vi.dynamicImportSettled();

    expect(window.markdownBridge?.readMarkdownFile).toHaveBeenCalledWith(openFile.path);
    expect(wrapper.find<HTMLTextAreaElement>('[data-testid="editor"]').element.value).toBe('# Shortcut refresh');
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

    expect(wrapper.get('[data-testid="open-file"]').attributes('title')).toBe(`打开文档 (${expectedShortcut('O')})`);
    expect(wrapper.get('[data-testid="save-file"]').attributes('title')).toBe(`保存 Markdown 文件 (${expectedShortcut('S')})`);
    expect(wrapper.get('[data-testid="toggle-preview"]').attributes('title')).toBe(`显示/隐藏预览 (${expectedShortcut('P')})`);
    expect(wrapper.get('[data-testid="toggle-editor"]').attributes('title')).toBe(`切换阅读/编辑模式 (${expectedShortcut('E')})`);
    expect(wrapper.get('[data-testid="bookmark-manager-button"]').attributes('title')).toBe(`显示书签列表 (${expectedShortcut('B')})，共 0 个书签`);
    expect(wrapper.get('[data-testid="add-bookmark"]').attributes('title')).toBe(`添加当前位置到书签 (${expectedShortcut('Shift+B')})`);
    expect(wrapper.get('[data-testid="help-popover"]').text()).toContain('v0.1.4');
    expect(wrapper.get('[data-testid="help-popover"]').text()).toContain('文件');
    expect(wrapper.get('[data-testid="help-popover"]').text()).toContain('插入与资源');
    expect(wrapper.get('[data-testid="help-popover"]').text()).toContain(`打开文档${expectedShortcut('O')}`);
    expect(wrapper.get('[data-testid="help-popover"]').text()).toContain('Mermaid 预览');
  });

  it('opens JSON files and exposes format/compact actions', async () => {
    vi.mocked(window.markdownBridge!.openMarkdownFile).mockResolvedValueOnce({
      path: '/docs/data.json',
      name: 'data.json',
      content: '{"b":1,"a":{"c":2}}',
    });
    const wrapper = mount(App);
    await vi.dynamicImportSettled();

    await wrapper.get('[data-testid="open-file"]').trigger('click');
    await vi.dynamicImportSettled();

    expect(wrapper.find('[data-testid="insert-table"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="format-json"]').exists()).toBe(true);

    await wrapper.get('[data-testid="format-json"]').trigger('click');
    await nextTick();
    expect((wrapper.get('[data-testid="editor"]').element as HTMLTextAreaElement).value).toBe('{\n  "b": 1,\n  "a": {\n    "c": 2\n  }\n}');

    await wrapper.get('[data-testid="compact-json"]').trigger('click');
    await nextTick();
    expect((wrapper.get('[data-testid="editor"]').element as HTMLTextAreaElement).value).toBe('{"b":1,"a":{"c":2}}');
  });

  it('uses the selected encoding when reopening and saving documents', async () => {
    vi.mocked(window.markdownBridge!.readMarkdownFile).mockImplementation(async (filePath: string, encoding?: string) => ({
      ...openFile,
      path: filePath,
      name: filePath.split('/').pop() ?? 'file.md',
      encoding,
    }));
    vi.mocked(window.markdownBridge!.saveMarkdownFile).mockImplementation(async (filePath: string, content: string, encoding?: string) => ({
      path: filePath,
      name: filePath.split('/').pop() ?? 'file.md',
      content,
      encoding,
    }));
    const wrapper = mount(App);
    await vi.dynamicImportSettled();

    await wrapper.get('[data-testid="encoding-select"]').setValue('gbk');
    await wrapper.get('[data-testid="reopen-with-encoding"]').trigger('click');
    await vi.dynamicImportSettled();
    expect(window.markdownBridge?.readMarkdownFile).toHaveBeenCalledWith('/docs/readme.md', 'gbk');

    await wrapper.get('[data-testid="editor"]').setValue('# Changed');
    await wrapper.get('[data-testid="save-file"]').trigger('click');
    await vi.dynamicImportSettled();
    expect(window.markdownBridge?.saveMarkdownFile).toHaveBeenCalledWith('/docs/readme.md', '# Changed', 'gbk');
  });

  it('renders a highlighted JSON preview but keeps text documents editor-only', async () => {
    vi.mocked(window.markdownBridge!.openMarkdownFile).mockResolvedValueOnce({
      path: '/docs/data.json',
      name: 'data.json',
      content: '{"ok":true}',
    });
    const wrapper = mount(App);
    await vi.dynamicImportSettled();

    await wrapper.get('[data-testid="open-file"]').trigger('click');
    await vi.dynamicImportSettled();

    expect(wrapper.classes()).not.toContain('no-preview-pane');
    expect(wrapper.classes()).not.toContain('reader-mode');
    expect(wrapper.find('[data-testid="preview-panel"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="preview"]').html()).toContain('code-token-literal');
    expect(wrapper.find('[data-testid="toggle-preview"]').exists()).toBe(true);
    expect(window.markdownBridge?.saveSession).toHaveBeenLastCalledWith(
      expect.objectContaining({ editorVisible: true }),
    );

    vi.mocked(window.markdownBridge!.openMarkdownFile).mockResolvedValueOnce({
      path: '/docs/readme.txt',
      name: 'readme.txt',
      content: 'plain text',
    });
    await wrapper.get('[data-testid="open-file"]').trigger('click');
    await vi.dynamicImportSettled();

    expect(wrapper.classes()).toContain('no-preview-pane');
    expect(wrapper.classes()).not.toContain('reader-mode');
    expect(wrapper.find('[data-testid="preview-panel"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="toggle-preview"]').exists()).toBe(false);

    await wrapper.get('[data-testid="toggle-editor"]').trigger('click');
    await nextTick();

    expect(wrapper.classes()).not.toContain('reader-mode');
    expect(wrapper.text()).toContain('Text 文件始终使用编辑器模式');
  });

  it('previews HTML files in a reloading iframe served by the local preview server', async () => {
    vi.mocked(window.markdownBridge!.openMarkdownFile).mockResolvedValueOnce({
      path: '/docs/page.html',
      name: 'page.html',
      content: '<h1>Hello</h1>',
    });
    const wrapper = mount(App);
    await vi.dynamicImportSettled();

    await wrapper.get('[data-testid="open-file"]').trigger('click');
    await vi.dynamicImportSettled();
    await new Promise((resolve) => window.setTimeout(resolve, 220));

    expect(wrapper.classes()).not.toContain('reader-mode');
    const frame = wrapper.get<HTMLIFrameElement>('[data-testid="html-preview-frame"]');
    expect(frame.attributes('src')).toContain('http://127.0.0.1:41000/?markdown-preview-id=');
    expect(window.markdownBridge?.htmlPreviewUrl).toHaveBeenLastCalledWith({
      filePath: '/docs/page.html',
      content: '<h1>Hello</h1>',
    });
    expect(wrapper.find('[data-testid="preview"]').exists()).toBe(false);

    await wrapper.get('[data-testid="editor"]').setValue('<h1>Changed</h1>');
    await new Promise((resolve) => window.setTimeout(resolve, 220));

    expect(window.markdownBridge?.htmlPreviewUrl).toHaveBeenLastCalledWith({
      filePath: '/docs/page.html',
      content: '<h1>Changed</h1>',
    });

    await wrapper.get('[data-testid="toggle-editor"]').trigger('click');
    await nextTick();

    expect(wrapper.classes()).not.toContain('reader-mode');
    expect(wrapper.text()).toContain('HTML 文件始终使用编辑器模式');
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

  it('adds, searches, filters, and deletes bookmarks from the manager', async () => {
    const wrapper = mount(App);
    await vi.dynamicImportSettled();
    const editor = wrapper.find<HTMLTextAreaElement>('[data-testid="editor"]').element;
    const betaOffset = offsetForLineColumn(openFile.content, 9, 4);
    editor.setSelectionRange(betaOffset, betaOffset);

    await wrapper.find('[data-testid="add-bookmark"]').trigger('click');
    await nextTick();
    expect(wrapper.find('[data-testid="bookmark-manager-button"] .action-badge').text()).toBe('1');
    expect(wrapper.find('[data-testid="add-bookmark"]').classes()).toContain('active');
    expect(wrapper.find('[data-testid="add-bookmark"]').attributes('title')).toContain('当前行已有 1 个书签');
    await wrapper.find('[data-testid="bookmark-manager-button"]').trigger('click');
    await nextTick();

    expect(wrapper.find('[data-testid="bookmark-modal"]').exists()).toBe(true);
    expect(wrapper.find('.bookmark-dialog-bar').text()).toContain('书签 · 所有文件 1');
    expect(wrapper.find('.bookmark-row').text()).toContain('readme.md');
    expect(wrapper.find('.bookmark-row').text()).toContain('hello beta');
    expect(wrapper.find('.bookmark-position').text()).toContain('行 9');
    expect(wrapper.find('.bookmark-position').text()).toContain('列 4');

    await wrapper.find('[data-testid="bookmark-search"]').setValue('beta');
    expect(wrapper.findAll('.bookmark-row')).toHaveLength(1);

    await wrapper.find('[data-testid="bookmark-view-current"]').trigger('click');
    await nextTick();
    const savedSession = vi.mocked(window.markdownBridge!.saveSession).mock.calls.at(-1)?.[0];
    expect(savedSession?.bookmarkViewMode).toBe('current');

    await wrapper.find('.bookmark-delete').trigger('click');
    await nextTick();
    expect(wrapper.find('[data-testid="bookmark-empty"]').exists()).toBe(true);
    expect(vi.mocked(window.markdownBridge!.saveSession).mock.calls.at(-1)?.[0].bookmarks).toEqual([]);
  });

  it('toggles current-line bookmarks with the shortcut and toolbar button', async () => {
    const wrapper = mount(App);
    await vi.dynamicImportSettled();
    const editor = wrapper.find<HTMLTextAreaElement>('[data-testid="editor"]').element;
    const betaStart = offsetForLineColumn(openFile.content, 9, 4);
    editor.setSelectionRange(betaStart, betaStart);

    await wrapper.find('[data-testid="add-bookmark"]').trigger('click');
    await nextTick();
    expect(vi.mocked(window.markdownBridge!.saveSession).mock.calls.at(-1)?.[0].bookmarks).toEqual([
      expect.objectContaining({ lineNumber: 9, column: 4 }),
    ]);

    const sameLineOtherColumn = offsetForLineColumn(openFile.content, 9, 8);
    editor.setSelectionRange(sameLineOtherColumn, sameLineOtherColumn);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'b', metaKey: true, shiftKey: true }));
    await nextTick();

    expect(vi.mocked(window.markdownBridge!.saveSession).mock.calls.at(-1)?.[0].bookmarks).toEqual([]);
    expect(wrapper.find('[data-testid="add-bookmark"]').classes()).not.toContain('active');

    await wrapper.find('[data-testid="add-bookmark"]').trigger('click');
    await nextTick();

    expect(vi.mocked(window.markdownBridge!.saveSession).mock.calls.at(-1)?.[0].bookmarks).toEqual([
      expect.objectContaining({ lineNumber: 9, column: 8 }),
    ]);
  });

  it('opens a saved bookmark with keyboard selection and jumps to its file position', async () => {
    vi.mocked(window.markdownBridge!.getSession).mockResolvedValue({
      filePath: openFile.path,
      tabs: [],
      activeTabId: null,
      bookmarks: [
        {
          id: 'bookmark-second',
          tabId: `file:${secondFile.path}`,
          filePath: secondFile.path,
          fileName: secondFile.name,
          lineNumber: 1,
          column: 3,
          excerpt: '# Second',
          createdAt: 1,
          updatedAt: 1,
        },
      ],
      bookmarkViewMode: 'all',
      recentFiles: [recentFile.path],
      scrollTop: 12,
      tocWidth: 300,
      editorWidth: 640,
      previewHidden: false,
      editorVisible: false,
      theme: 'light',
    });
    const wrapper = mount(App);
    await vi.dynamicImportSettled();

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'b', metaKey: true }));
    await nextTick();
    expect(wrapper.find('[data-testid="bookmark-modal"]').exists()).toBe(true);

    await wrapper.find('[data-testid="bookmark-modal"]').trigger('keydown', { key: 'Enter' });
    await vi.dynamicImportSettled();

    expect(window.markdownBridge?.readMarkdownFile).toHaveBeenCalledWith(secondFile.path);
    expect(wrapper.find<HTMLTextAreaElement>('[data-testid="editor"]').element.value).toBe(secondFile.content);
    expect(wrapper.find('[data-testid="bookmark-modal"]').exists()).toBe(false);
  });

  it('toggles editor mode from the Electron command shortcut event', async () => {
    const shortcutCallbacks: Array<() => void> = [];
    vi.mocked(window.markdownBridge!.onToggleEditorShortcut).mockImplementation((callback) => {
      shortcutCallbacks.push(callback);
      return () => {};
    });
    const wrapper = mount(App);
    await vi.dynamicImportSettled();

    shortcutCallbacks[0]?.();
    await vi.dynamicImportSettled();

    expect(wrapper.classes()).not.toContain('reader-mode');
    expect(window.markdownBridge?.saveSession).toHaveBeenCalledWith(
      expect.objectContaining({ editorVisible: true, previewHidden: false }),
    );
  });

  it('routes native app menu commands to grouped editor actions', async () => {
    const menuCallbacks: Array<(command: AppMenuCommand) => void> = [];
    vi.mocked(window.markdownBridge!.onAppMenuCommand!).mockImplementation((callback) => {
      menuCallbacks.push(callback);
      return () => {};
    });
    const wrapper = mount(App);
    await vi.dynamicImportSettled();

    menuCallbacks[0]?.('insert-table');
    await nextTick();
    expect(wrapper.find<HTMLTextAreaElement>('[data-testid="editor"]').element.value).toContain('| 列 1 | 列 2 |');

    menuCallbacks[0]?.('export-pdf');
    await vi.dynamicImportSettled();
    expect(window.markdownBridge?.exportPdf).toHaveBeenCalled();

    menuCallbacks[0]?.('theme-dark');
    await nextTick();
    expect(wrapper.classes()).toContain('theme-dark');

    menuCallbacks[0]?.('show-help');
    await nextTick();
    expect(wrapper.find('.help-menu').classes()).toContain('is-open');
  });
});
