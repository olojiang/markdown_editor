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
    await expect(page.getByTestId('editor')).toBeVisible();
    await expect(page.getByTestId('preview')).toBeVisible();
  } finally {
    await app.close();
  }
});
