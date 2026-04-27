import { _electron as electron, expect, test } from '@playwright/test';

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

    await expect(page.getByRole('button', { name: '打开' })).toBeVisible();
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
