import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { renameDocumentFile } from '../electron/file-operations';

describe('renameDocumentFile', () => {
  let tempDir: string;

  afterEach(async () => {
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true });
      tempDir = '';
    }
  });

  it('renames a supported document in place and preserves its contents', async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), 'markdown-editor-rename-'));
    const sourcePath = path.join(tempDir, 'readme.md');
    const targetPath = path.join(tempDir, 'guide.md');
    await writeFile(sourcePath, '# Keep content', 'utf8');

    await expect(renameDocumentFile(sourcePath, 'guide.md')).resolves.toBe(targetPath);

    await expect(readFile(targetPath, 'utf8')).resolves.toBe('# Keep content');
    await expect(readFile(sourcePath)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('refuses to overwrite an existing file', async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), 'markdown-editor-rename-'));
    const sourcePath = path.join(tempDir, 'readme.md');
    const targetPath = path.join(tempDir, 'guide.md');
    await writeFile(sourcePath, 'source', 'utf8');
    await writeFile(targetPath, 'destination', 'utf8');

    await expect(renameDocumentFile(sourcePath, 'guide.md')).rejects.toThrow('同名文件已存在');

    await expect(readFile(sourcePath, 'utf8')).resolves.toBe('source');
    await expect(readFile(targetPath, 'utf8')).resolves.toBe('destination');
  });

  it.each(['', '  ', '.', '..', '../escape.md', 'sub/file.md', 'sub\\file.md', 'guide.exe'])(
    'rejects an invalid document name: %s',
    async (newName) => {
      tempDir = await mkdtemp(path.join(os.tmpdir(), 'markdown-editor-rename-'));
      const sourcePath = path.join(tempDir, 'readme.md');
      await writeFile(sourcePath, 'source', 'utf8');

      await expect(renameDocumentFile(sourcePath, newName)).rejects.toThrow();
      await expect(readFile(sourcePath, 'utf8')).resolves.toBe('source');
    },
  );
});
