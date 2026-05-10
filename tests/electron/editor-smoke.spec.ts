import { _electron as electron, expect, test } from '@playwright/test';
import type { ElectronApplication } from '@playwright/test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

async function launchEditor(args: string[] = ['.']): Promise<{ app: ElectronApplication; userDataDir: string }> {
  const userDataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'markdown-editor-user-data-'));
  try {
    const app = await electron.launch({
      args,
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
  await fs.rm(launched.userDataDir, { force: true, recursive: true });
}

test('launches the Electron editor shell', async () => {
  const launched = await launchEditor();

  try {
    const page = await launched.app.firstWindow();

    await expect(page.getByTestId('open-file')).toBeVisible();
    await expect(page.getByTestId('preview')).toBeVisible();
    await expect(page.getByTestId('toggle-editor')).toBeVisible();

    if (!(await page.getByTestId('editor').isVisible())) {
      await page.getByTestId('toggle-editor').click();
    }
    await expect(page.getByTestId('editor')).toBeVisible();
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

    await page.getByTestId('toggle-editor').click();
    await expect(page.getByTestId('editor')).toBeVisible();

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
