import fs from 'node:fs/promises';
import { constants, type Dirent } from 'node:fs';
import path from 'node:path';
import { supportedDocumentExtensions } from './file-operations';
import { decodeTextBuffer } from './text-encoding';

export const searchMaxFileSize = 2 * 1024 * 1024;

export interface WorkspaceDirectoryEntry {
  name: string;
  path: string;
  isDirectory: boolean;
  size: number | null;
  modifiedAt: number;
  contentMatch?: 'match' | 'skipped';
}

export async function listWorkspaceDirectory(rootPath: string, directoryPath: string, contentQuery?: string): Promise<WorkspaceDirectoryEntry[]> {
  const root = await fs.realpath(path.resolve(rootPath));
  const directory = await fs.realpath(path.resolve(directoryPath));
  if (!isPathInside(root, directory)) throw new Error('Directory is outside the selected workspace');

  const entries = await fs.readdir(directory, { withFileTypes: true });
  const visibleEntries = await Promise.all(entries.map((entry) => readWorkspaceEntry(directory, entry)));
  const documents = visibleEntries
    .filter((entry): entry is WorkspaceDirectoryEntry => entry !== null)
    .sort((left, right) => Number(right.isDirectory) - Number(left.isDirectory)
      || left.name.localeCompare(right.name, undefined, { numeric: true, sensitivity: 'base' }));
  const query = typeof contentQuery === 'string' ? contentQuery.trim().toLocaleLowerCase() : '';
  if (query) {
    for (const entry of documents) {
      if (!entry.isDirectory) entry.contentMatch = await matchWorkspaceContent(entry, query);
    }
  }
  return documents;
}

async function readWorkspaceEntry(
  directory: string,
  entry: Dirent,
): Promise<WorkspaceDirectoryEntry | null> {
  if (entry.isSymbolicLink() || entry.name.startsWith('.') || entry.name === 'node_modules') return null;
  const entryPath = path.join(directory, entry.name);
  try {
    const stat = await fs.lstat(entryPath);
    if (stat.isSymbolicLink()) return null;
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

async function matchWorkspaceContent(
  entry: WorkspaceDirectoryEntry,
  query: string,
): Promise<WorkspaceDirectoryEntry['contentMatch']> {
  if (entry.size !== null && entry.size > searchMaxFileSize) return 'skipped';
  try {
    const file = await fs.open(entry.path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    try {
      const stat = await file.stat();
      if (!stat.isFile() || stat.size > searchMaxFileSize) return 'skipped';
      const chunks: Buffer[] = [];
      for await (const chunk of file.createReadStream({ end: searchMaxFileSize, autoClose: false })) {
        chunks.push(chunk);
      }
      const buffer = Buffer.concat(chunks);
      if (buffer.length > searchMaxFileSize) return 'skipped';
      const { content } = decodeTextBuffer(buffer);
      return content.toLocaleLowerCase().includes(query) ? 'match' : undefined;
    } finally {
      await file.close();
    }
  } catch {
    return 'skipped';
  }
}

function isPathInside(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return relative === '' || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}
