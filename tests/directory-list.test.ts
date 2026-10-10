import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { listWorkspaceDirectory } from '../electron/directory-operations';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => fs.rm(directory, { recursive: true, force: true })));
});

describe('workspace directory listing', () => {
  it('returns document metadata and skips hidden, unsupported, and linked entries', async () => {
    const root = await createWorkspace();
    const nested = path.join(root, 'Docs');
    const outside = path.join(path.dirname(root), 'outside.md');
    await fs.mkdir(nested);
    await fs.writeFile(path.join(root, 'large.md'), 'large content');
    await fs.writeFile(path.join(root, 'small.md'), 'x');
    await fs.writeFile(path.join(root, '.hidden.md'), 'hidden');
    await fs.writeFile(path.join(root, 'image.png'), 'image');
    await fs.writeFile(outside, 'external');
    await fs.symlink(outside, path.join(root, 'linked.md'));

    const entries = await listWorkspaceDirectory(root, root);
    expect(entries.map(({ name }) => name)).toEqual(['Docs', 'large.md', 'small.md']);
    expect(entries.find(({ name }) => name === 'large.md')).toMatchObject({ size: 13, isDirectory: false });
    expect(entries.find(({ name }) => name === 'Docs')).toMatchObject({ size: null, isDirectory: true });
    expect(entries.every(({ modifiedAt }) => Number.isFinite(modifiedAt))).toBe(true);
  });

  it('rejects directory paths outside the selected workspace', async () => {
    const root = await createWorkspace();
    await expect(listWorkspaceDirectory(root, os.tmpdir())).rejects.toThrow('outside the selected workspace');
  });
});

async function createWorkspace(): Promise<string> {
  const parent = await fs.mkdtemp(path.join(os.tmpdir(), 'markdown-workspace-list-'));
  temporaryDirectories.push(parent);
  const root = path.join(parent, 'workspace');
  await fs.mkdir(root);
  return root;
}
