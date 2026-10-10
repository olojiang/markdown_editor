import fs from 'node:fs/promises';
import type { Dirent } from 'node:fs';
import path from 'node:path';
import { supportedDocumentExtensions } from './file-operations';

export interface WorkspaceDirectoryEntry {
  name: string;
  path: string;
  isDirectory: boolean;
  size: number | null;
  modifiedAt: number;
}

export async function listWorkspaceDirectory(rootPath: string, directoryPath: string): Promise<WorkspaceDirectoryEntry[]> {
  const root = await fs.realpath(path.resolve(rootPath));
  const directory = await fs.realpath(path.resolve(directoryPath));
  if (!isPathInside(root, directory)) throw new Error('Directory is outside the selected workspace');

  const entries = await fs.readdir(directory, { withFileTypes: true });
  const visibleEntries = await Promise.all(entries.map((entry) => readWorkspaceEntry(root, directory, entry)));
  return visibleEntries
    .filter((entry): entry is WorkspaceDirectoryEntry => entry !== null)
    .sort((left, right) => Number(right.isDirectory) - Number(left.isDirectory)
      || left.name.localeCompare(right.name, undefined, { numeric: true, sensitivity: 'base' }));
}

async function readWorkspaceEntry(
  root: string,
  directory: string,
  entry: Dirent,
): Promise<WorkspaceDirectoryEntry | null> {
  if (entry.isSymbolicLink() || entry.name.startsWith('.') || entry.name === 'node_modules') return null;
  const entryPath = path.join(directory, entry.name);
  try {
    const stat = await fs.stat(entryPath);
    const isDirectory = stat.isDirectory();
    if (!isDirectory && (!stat.isFile() || !supportedDocumentExtensions.includes(path.extname(entry.name).slice(1).toLowerCase()))) {
      return null;
    }
    return {
      name: entry.name,
      path: entryPath,
      isDirectory,
      size: isDirectory ? null : stat.size,
      modifiedAt: stat.mtimeMs,
    };
  } catch {
    return null;
  }
}

function isPathInside(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return relative === '' || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}
