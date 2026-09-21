import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

export const supportedDocumentExtensions = ['md', 'markdown', 'mdown', 'html', 'htm', 'txt', 'text', 'json'];

export function isSupportedDocumentPath(filePath: string): boolean {
  return supportedDocumentExtensions.includes(path.extname(filePath).slice(1).toLowerCase());
}

async function sameFile(firstPath: string, secondPath: string): Promise<boolean> {
  try {
    const [first, second] = await Promise.all([fs.stat(firstPath), fs.stat(secondPath)]);
    return first.dev === second.dev && first.ino === second.ino;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return false;
    }
    throw error;
  }
}

async function renameCaseOnly(sourcePath: string, targetPath: string): Promise<void> {
  const tempPath = path.join(path.dirname(sourcePath), `.markdown-rename-${randomUUID()}.tmp`);
  await fs.rename(sourcePath, tempPath);
  try {
    await fs.rename(tempPath, targetPath);
  } catch (error) {
    await fs.rename(tempPath, sourcePath).catch(() => undefined);
    throw error;
  }
}

export async function renameDocumentFile(filePath: string, newName: string): Promise<string> {
  const sourcePath = path.resolve(filePath);
  const normalizedName = newName.trim();
  if (
    !normalizedName
    || normalizedName === '.'
    || normalizedName === '..'
    || /[\\/\0]/.test(normalizedName)
  ) {
    throw new Error('请输入有效的文件名');
  }

  const targetPath = path.join(path.dirname(sourcePath), normalizedName);
  if (!isSupportedDocumentPath(targetPath)) {
    throw new Error('文件扩展名不受支持');
  }
  if (targetPath === sourcePath) {
    return sourcePath;
  }

  try {
    await fs.access(targetPath);
    if (!await sameFile(sourcePath, targetPath)) {
      throw new Error('同名文件已存在');
    }
    await renameCaseOnly(sourcePath, targetPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error;
    }
    await fs.rename(sourcePath, targetPath);
  }

  return targetPath;
}
