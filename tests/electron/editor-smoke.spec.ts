import { _electron as electron, expect, test } from '@playwright/test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

test('launches the Electron editor shell', async () => {
  const app = await electron.launch({
    args: ['.'],
    env: {
      ...process.env,
      MARKDOWN_EDITOR_FORCE_PROD: '1',
    },
  });

  try {
    const page = await app.firstWindow();

    await expect(page.getByTestId('open-file')).toBeVisible();
    await expect(page.getByTestId('preview')).toBeVisible();
    await expect(page.getByTestId('toggle-editor')).toBeVisible();

    if (!(await page.getByTestId('editor').isVisible())) {
      await page.getByTestId('toggle-editor').click();
    }
    await expect(page.getByTestId('editor')).toBeVisible();
  } finally {
    await app.close();
  }
});

test('opens a markdown file supplied as a launch argument', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'markdown-editor-launch-'));
  const markdownPath = path.join(tempDir, 'finder launch.md');
  await fs.writeFile(markdownPath, '# Finder Launch\n\nOpened from argv.', 'utf8');

  const app = await electron.launch({
    args: ['.', pathToFileURL(markdownPath).href],
    env: {
      ...process.env,
      MARKDOWN_EDITOR_FORCE_PROD: '1',
    },
  });

  try {
    const page = await app.firstWindow();

    await expect(page.getByTestId('preview')).toContainText('Finder Launch');
    await expect(page.getByTitle(markdownPath)).toBeVisible();
  } finally {
    await app.close();
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

  const app = await electron.launch({
    args: ['.', pathToFileURL(markdownPath).href],
    env: {
      ...process.env,
      MARKDOWN_EDITOR_FORCE_PROD: '1',
    },
  });

  try {
    const page = await app.firstWindow();
    const image = page.getByRole('img', { name: '默认功能入口' });

    await expect(image).toBeVisible();
    await expect
      .poll(() => image.evaluate((node: HTMLImageElement) => node.naturalWidth))
      .toBeGreaterThan(0);
  } finally {
    await app.close();
    await fs.rm(tempDir, { force: true, recursive: true });
  }
});
