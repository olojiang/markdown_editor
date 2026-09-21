import { _electron as electron, expect, test } from '@playwright/test';
import type { ElectronApplication, Page } from '@playwright/test';
import { createServer } from 'node:http';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

async function launchEditor(args: string[] = ['.']): Promise<{ app: ElectronApplication; userDataDir: string }> {
  const userDataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'markdown-editor-user-data-'));
  const executablePath = process.env.MARKDOWN_EDITOR_ELECTRON_EXECUTABLE;
  try {
    const app = await electron.launch({
      ...(executablePath ? { executablePath } : {}),
      args: executablePath ? args.filter((arg) => arg !== '.') : args,
      env: {
        ...process.env,
        MARKDOWN_EDITOR_FORCE_PROD: '1',
        MARKDOWN_EDITOR_USER_DATA_DIR: userDataDir,
      },
    });
    return { app, userDataDir };
  } catch (error) {
    await fs.rm(userDataDir, { force: true, recursive: true });
    throw error;
  }
}

async function closeEditor(launched: { app: ElectronApplication; userDataDir: string }): Promise<void> {
  await launched.app.close();
  await fs.rm(launched.userDataDir, { force: true, maxRetries: 5, recursive: true, retryDelay: 100 });
}

async function ensureEditorVisible(page: Page): Promise<void> {
  const editor = page.getByTestId('editor');
  if (!(await editor.isVisible())) {
    await page.getByTestId('toggle-editor').click();
  }
  await expect(editor).toBeVisible();
  await editor.click();
}

async function firstVisibleEditorLine(page: Page): Promise<number> {
  const text = await page.locator('.view-lines').textContent();
  const match = text?.match(/Scroll\s+item\s+(\d+)/);
  if (!match) {
    throw new Error(`No numbered source line is visible: ${text?.slice(0, 160) ?? 'missing view-lines'}`);
  }
  return Number(match[1]);
}

test('launches the Electron editor shell', async () => {
  const launched = await launchEditor();

  try {
    const page = await launched.app.firstWindow();

    await expect(page.getByTestId('open-file')).toBeVisible();
    await expect(page.getByTestId('preview')).toBeVisible();
    await expect(page.getByTestId('toggle-editor')).toBeVisible();

    await ensureEditorVisible(page);
  } finally {
    await closeEditor(launched);
  }
});

test('opens a markdown file supplied as a launch argument', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'markdown-editor-launch-'));
  const markdownPath = path.join(tempDir, 'finder launch.md');
  await fs.writeFile(markdownPath, '# Finder Launch\n\nOpened from argv.', 'utf8');

  const launched = await launchEditor(['.', pathToFileURL(markdownPath).href]);

  try {
    const page = await launched.app.firstWindow();

    await expect(page.getByTestId('preview')).toContainText('Finder Launch');
    await expect(page.getByTitle(markdownPath)).toBeVisible();
  } finally {
    await launched.app.evaluate(({ app }) => app.exit(0)).catch(() => undefined);
    await fs.rm(launched.userDataDir, { force: true, maxRetries: 5, recursive: true, retryDelay: 100 }).catch(() => undefined);
    await fs.rm(tempDir, { force: true, recursive: true });
  }
});

test('renames an open file from its context menu without overwriting another document', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'markdown-editor-rename-e2e-'));
  const sourcePath = path.join(tempDir, 'readme.md');
  const renamedPath = path.join(tempDir, 'guide.md');
  const existingPath = path.join(tempDir, 'existing.md');
  const sourceContent = '# Rename E2E\n\nThe file contents should survive a rename.';
  const existingContent = '# Existing';
  await fs.writeFile(sourcePath, sourceContent, 'utf8');
  await fs.writeFile(existingPath, existingContent, 'utf8');
  const launched = await launchEditor(['.', pathToFileURL(sourcePath).href]);

  try {
    const page = await launched.app.firstWindow();
    const tab = page.getByTestId('tab-readme.md');
    await expect(tab).toBeVisible();
    await tab.click({ button: 'right' });
    await expect(page.getByTestId('tab-context-menu')).toBeVisible();
    await expect(page.getByTestId('tab-rename').locator('svg')).toBeVisible();
    await page.screenshot({ path: '/tmp/markdown-editor-rename-context-menu.png' });

    await page.getByTestId('tab-rename').click();
    await expect(page.getByTestId('rename-file-dialog')).toBeVisible();
    await page.screenshot({ path: '/tmp/markdown-editor-rename-dialog.png' });
    await page.getByTestId('rename-file-input').fill('guide.md');
    await page.getByTestId('rename-file-input').press('Enter');

    await expect(page.getByTestId('tab-guide.md')).toBeVisible();
    await expect.poll(() => fs.readFile(renamedPath, 'utf8')).toBe(sourceContent);
    await expect(fs.access(sourcePath)).rejects.toMatchObject({ code: 'ENOENT' });

    await page.getByTestId('tab-guide.md').click({ button: 'right' });
    await page.getByTestId('tab-rename').click();
    await page.getByTestId('rename-file-input').fill('existing.md');
    await page.getByTestId('rename-file-input').press('Enter');

    await expect(page.getByTestId('rename-file-error')).toContainText('同名文件已存在');
    await expect.poll(() => fs.readFile(renamedPath, 'utf8')).toBe(sourceContent);
    await expect.poll(() => fs.readFile(existingPath, 'utf8')).toBe(existingContent);
  } finally {
    await closeEditor(launched);
    await fs.rm(tempDir, { force: true, recursive: true });
  }
});

test('keeps the preview pane aligned after collapsing the table of contents', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'markdown-editor-collapsed-toc-'));
  const markdownPath = path.join(tempDir, 'collapsed toc.md');
  await fs.writeFile(markdownPath, '# Collapsed Toc\n\nOnly the preview should fill this row.', 'utf8');

  const launched = await launchEditor(['.', pathToFileURL(markdownPath).href]);

  try {
    const page = await launched.app.firstWindow();
    await page.setViewportSize({ width: 1388, height: 768 });

    await page.getByTestId('toggle-toc-panel').click();

    const metrics = await page.evaluate(() => {
      const workspace = document.querySelector<HTMLElement>('.workspace');
      const preview = document.querySelector<HTMLElement>('[data-testid="preview"]');
      const tocResizer = document.querySelector<HTMLElement>('[data-testid="toc-resizer"]');
      if (!workspace || !preview || !tocResizer) {
        throw new Error('Missing workspace, preview, or toc resizer');
      }

      const workspaceRect = workspace.getBoundingClientRect();
      const previewRect = preview.getBoundingClientRect();
      const tocResizerStyle = getComputedStyle(tocResizer);
      return {
        previewLeft: previewRect.left - workspaceRect.left,
        previewWidth: previewRect.width,
        tocResizerDisplay: tocResizerStyle.display,
        tocResizerVisibility: tocResizerStyle.visibility,
        workspaceWidth: workspaceRect.width,
      };
    });

    expect(metrics.previewLeft).toBeLessThanOrEqual(50);
    expect(metrics.previewWidth).toBeGreaterThan(metrics.workspaceWidth - 60);
    expect(metrics.tocResizerDisplay).not.toBe('none');
    expect(metrics.tocResizerVisibility).toBe('hidden');
  } finally {
    await closeEditor(launched);
    await fs.rm(tempDir, { force: true, recursive: true });
  }
});

test('loads remote images in markdown preview', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'markdown-editor-remote-image-'));
  const markdownPath = path.join(tempDir, 'remote image.md');
  await fs.writeFile(
    markdownPath,
    '# Remote Image\n\n![默认功能入口](https://assets.pinefield.cn/apps/pinefield.assets/default-chat-entry.png?x-oss-process=image/format,webp)',
    'utf8',
  );

  const launched = await launchEditor(['.', pathToFileURL(markdownPath).href]);

  try {
    const page = await launched.app.firstWindow();
    const image = page.getByRole('img', { name: '默认功能入口' });

    await expect(image).toBeVisible();
    await expect
      .poll(() => image.evaluate((node: HTMLImageElement) => node.naturalWidth))
      .toBeGreaterThan(0);
  } finally {
    await closeEditor(launched);
    await fs.rm(tempDir, { force: true, recursive: true });
  }
});

test('converts rich clipboard HTML to Markdown in the Monaco editor', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'markdown-editor-rich-paste-'));
  const markdownPath = path.join(tempDir, 'rich paste.md');
  const imageData = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jvXcAAAAASUVORK5CYII=', 'base64');
  let imageRequestCount = 0;
  const imageServer = createServer((_request, response) => {
    imageRequestCount += 1;
    response.writeHead(200, { 'content-length': imageData.length, 'content-type': 'image/png' });
    response.end(imageData);
  });
  await new Promise<void>((resolve, reject) => {
    imageServer.once('error', reject);
    imageServer.listen(0, '127.0.0.1', resolve);
  });
  const address = imageServer.address();
  if (!address || typeof address === 'string') {
    throw new Error('Could not start clipboard image test server.');
  }
  let launched: Awaited<ReturnType<typeof launchEditor>> | null = null;
  await fs.writeFile(markdownPath, '# Start\n\n', 'utf8');

  try {
    launched = await launchEditor(['.', pathToFileURL(markdownPath).href]);
    const page = await launched.app.firstWindow();
    await expect(page.getByTestId('preview')).toContainText('Start');
    await expect(page.getByTitle(markdownPath)).toBeVisible();
    await ensureEditorVisible(page);
    await page.getByTestId('rich-paste-on').click();
    await ensureEditorVisible(page);

    await launched.app.evaluate(({ clipboard }, payload) => {
      clipboard.write(payload);
    }, {
      html: `<h2>Why Impeccable?</h2><p>Use <strong>7 files</strong> and <a href="https://example.com">source</a>.</p><ul><li><code>polish</code></li></ul><p><img src="http://127.0.0.1:${address.port}/coffee.png" alt="咖啡"></p>`,
      text: 'Why Impeccable?\nUse 7 files and source.\npolish',
    });

    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+V' : 'Control+V');

    await expect(page.locator('.view-lines')).toContainText('## Why Impeccable?');
    await expect(page.locator('.view-lines')).toContainText('Use **7 files** and [source](https://example.com).');
    await expect(page.locator('.view-lines')).toContainText('- `polish`');
    await expect(page.locator('.view-lines')).toContainText(/!\[咖啡\]\(assets\/images\/coffee-\d+\.png\)/);

    const assetNames = await fs.readdir(path.join(tempDir, 'assets', 'images'));
    expect(assetNames).toHaveLength(1);
    expect(assetNames[0]).toMatch(/^coffee-\d+\.png$/);
    expect(await fs.readFile(path.join(tempDir, 'assets', 'images', assetNames[0]!))).toEqual(imageData);
    expect(imageRequestCount).toBe(1);

    const debugLog = await fs.readFile(path.join(launched.userDataDir, 'markdown-editor-debug.log'), 'utf8');
    expect(debugLog).toContain('renderer.editor.paste.shortcut.detected');
    expect(debugLog).toContain('renderer.editor.paste.richText.converted');
  } finally {
    if (launched) {
      await launched.app.evaluate(({ app }) => app.exit(0)).catch(() => undefined);
      await fs.rm(launched.userDataDir, { force: true, maxRetries: 5, recursive: true, retryDelay: 100 }).catch(() => undefined);
    }
    await new Promise<void>((resolve) => imageServer.close(() => resolve()));
    await fs.rm(tempDir, { force: true, recursive: true });
  }
});

test('keeps long source lines inside the editor viewport', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'markdown-editor-long-line-'));
  const markdownPath = path.join(tempDir, 'long line.md');
  await fs.writeFile(
    markdownPath,
    [
      '# Long Line',
      '',
      'https://colab.research.google.com/github/googlesamples/mediapipe/blob/main/examples/pose_landmarker/python/%5BMediaPipe_Python_Tasks%5D_Pose_Landmarker.ipynb',
      '',
      '```mermaid',
      'flowchart TD',
      'A["为什么用？"] --> A1["快速把人体动作变成关键点数据"]',
      '```',
    ].join('\n'),
    'utf8',
  );

  const launched = await launchEditor(['.', pathToFileURL(markdownPath).href]);

  try {
    const page = await launched.app.firstWindow();
    await page.setViewportSize({ width: 1178, height: 768 });
    await expect(page.getByTestId('preview')).toContainText('Long Line');

    await ensureEditorVisible(page);

    const metrics = await page.evaluate(() => {
      const workspace = document.querySelector<HTMLElement>('.workspace');
      const editor = document.querySelector<HTMLTextAreaElement>('[data-testid="editor"]');
      if (!workspace || !editor) {
        throw new Error('Missing workspace or editor');
      }
      const workspaceRect = workspace.getBoundingClientRect();
      return {
        editorClientWidth: editor.clientWidth,
        editorScrollWidth: editor.scrollWidth,
        viewportWidth: document.documentElement.clientWidth,
        workspaceRight: workspaceRect.right,
      };
    });

    expect(metrics.editorScrollWidth).toBeLessThanOrEqual(metrics.editorClientWidth + 1);
    expect(metrics.workspaceRight).toBeLessThanOrEqual(metrics.viewportWidth + 1);
  } finally {
    await closeEditor(launched);
    await fs.rm(tempDir, { force: true, recursive: true });
  }
});

test('keeps the editor aligned when preview scrolls inside a line-preserving paragraph', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'markdown-editor-preview-scroll-'));
  const markdownPath = path.join(tempDir, 'preview scroll.md');
  const lines = Array.from({ length: 80 }, (_, index) => `/Volumes/disk/item-${index + 1} ${80 - index}g`);
  await fs.writeFile(markdownPath, ['# Disk', '', ...lines].join('\n'), 'utf8');

  const launched = await launchEditor(['.', pathToFileURL(markdownPath).href]);

  try {
    const page = await launched.app.firstWindow();
    await page.setViewportSize({ width: 1388, height: 768 });
    await expect(page.getByTestId('preview')).toContainText('item-1');
    await ensureEditorVisible(page);

    const target = await page.evaluate(() => {
      const preview = document.querySelector<HTMLElement>('[data-testid="preview"]');
      const anchor = preview?.querySelector<HTMLElement>('[data-source-line="38"]');
      if (!preview || !anchor) {
        throw new Error('Missing preview or source-line anchor');
      }

      const previewRect = preview.getBoundingClientRect();
      preview.scrollTop = anchor.getBoundingClientRect().top - previewRect.top + preview.scrollTop;
      preview.dispatchEvent(new Event('scroll', { bubbles: true }));
      return anchor.dataset.sourceLine;
    });

    expect(target).toBe('38');
    await expect.poll(() => page.evaluate(() => {
      const line = Array.from(document.querySelectorAll<HTMLElement>('.view-line'))
        .find((node) => node.textContent?.includes('item-36'));
      const editor = document.querySelector<HTMLElement>('.monaco-editor .overflow-guard');
      if (!line || !editor) {
        return null;
      }
      return line.getBoundingClientRect().top - editor.getBoundingClientRect().top;
    })).toBeLessThan(4);

    await page.evaluate(() => {
      const preview = document.querySelector<HTMLElement>('[data-testid="preview"]');
      if (!preview) {
        throw new Error('Missing preview');
      }
      preview.scrollTop = preview.scrollHeight - preview.clientHeight;
      preview.dispatchEvent(new Event('scroll', { bubbles: true }));
    });

    await expect.poll(() => page.evaluate(() => {
      const line = Array.from(document.querySelectorAll<HTMLElement>('.view-line'))
        .find((node) => node.textContent?.includes('item-80'));
      const editor = document.querySelector<HTMLElement>('.monaco-editor .overflow-guard');
      if (!line || !editor) {
        return null;
      }
      return line.getBoundingClientRect().bottom - editor.getBoundingClientRect().bottom;
    })).toBeLessThanOrEqual(1);
  } finally {
    await closeEditor(launched);
    await fs.rm(tempDir, { force: true, recursive: true });
  }
});

test('keeps editor scroll ownership while a pointer remains held', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'markdown-editor-editor-scroll-'));
  const markdownPath = path.join(tempDir, 'editor scroll.md');
  const lines = Array.from({ length: 180 }, (_, index) => `Scroll item ${index + 1}`);
  await fs.writeFile(markdownPath, ['# Editor Scroll', '', ...lines].join('\n'), 'utf8');

  const launched = await launchEditor(['.', pathToFileURL(markdownPath).href]);

  try {
    const page = await launched.app.firstWindow();
    await page.setViewportSize({ width: 1178, height: 768 });
    await expect(page.getByTestId('preview')).toBeVisible();
    await expect(page.getByTestId('preview')).toContainText('Scroll item 1');
    await ensureEditorVisible(page);

    const editorShell = page.locator('.source-editor-shell');
    const editorBounds = await editorShell.boundingBox();
    if (!editorBounds) {
      throw new Error('Missing editor viewport');
    }

    await page.mouse.move(editorBounds.x + editorBounds.width / 2, editorBounds.y + editorBounds.height / 2);
    await page.mouse.down();
    try {
      await page.waitForTimeout(180);
      await page.mouse.wheel(0, 720);
      await expect.poll(() => firstVisibleEditorLine(page)).toBeGreaterThan(1);

      const scrollPosition = await firstVisibleEditorLine(page);
      await page.waitForTimeout(180);
      await page.evaluate(() => {
        const preview = document.querySelector<HTMLElement>('[data-testid="preview"]');
        if (!preview) {
          throw new Error('Missing preview pane');
        }
        preview.scrollTop = 0;
        preview.dispatchEvent(new Event('scroll', { bubbles: true }));
      });
      await page.waitForTimeout(50);
      expect(await firstVisibleEditorLine(page)).toBe(scrollPosition);
    } finally {
      await page.mouse.up();
    }
  } finally {
    await closeEditor(launched);
    await fs.rm(tempDir, { force: true, recursive: true });
  }
});

test('keeps editor scrolling forward during a continuous wheel gesture', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'markdown-editor-continuous-scroll-'));
  const markdownPath = path.join(tempDir, 'continuous scroll.md');
  const lines = Array.from({ length: 240 }, (_, index) => `Scroll item ${index + 1}`);
  await fs.writeFile(markdownPath, ['# Continuous Scroll', '', ...lines].join('\n'), 'utf8');

  const launched = await launchEditor(['.', pathToFileURL(markdownPath).href]);

  try {
    const page = await launched.app.firstWindow();
    await page.setViewportSize({ width: 1178, height: 768 });
    await expect(page.getByTestId('preview')).toBeVisible();
    await expect(page.getByTestId('preview')).toContainText('Scroll item 1');
    await ensureEditorVisible(page);

    const editorBounds = await page.locator('.source-editor-shell').boundingBox();
    if (!editorBounds) {
      throw new Error('Missing editor viewport');
    }
    await page.mouse.move(editorBounds.x + editorBounds.width / 2, editorBounds.y + editorBounds.height / 2);

    const initialLine = await firstVisibleEditorLine(page);
    await page.evaluate(() => {
      const root = document.documentElement;
      root.dataset.editorScrollSamples = JSON.stringify([]);
      let lastLine = -1;
      const sample = (): void => {
        const text = document.querySelector('.view-lines')?.textContent ?? '';
        const match = text.match(/Scroll\s+item\s+(\d+)/);
        if (match) {
          const line = Number(match[1]);
          if (line !== lastLine) {
            const samples = JSON.parse(root.dataset.editorScrollSamples ?? '[]') as number[];
            samples.push(line);
            root.dataset.editorScrollSamples = JSON.stringify(samples);
            lastLine = line;
          }
        }
        requestAnimationFrame(sample);
      };
      requestAnimationFrame(sample);
    });

    for (let index = 0; index < 18; index += 1) {
      await page.mouse.wheel(0, 160);
      await page.waitForTimeout(35);
    }

    const visibleLines = await page.evaluate(() => JSON.parse(
      document.documentElement.dataset.editorScrollSamples ?? '[]',
    ) as number[]);
    expect(visibleLines.at(-1)).toBeGreaterThan(initialLine);
    const backwardSteps = visibleLines.filter((line, index) => index > 0 && line < visibleLines[index - 1]);
    expect(backwardSteps, `Visible lines during wheel gesture: ${visibleLines.join(' -> ')}`).toEqual([]);
  } finally {
    await closeEditor(launched);
    await fs.rm(tempDir, { force: true, recursive: true });
  }
});
