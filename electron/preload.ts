import { contextBridge, ipcRenderer, webUtils } from 'electron';

function normalizeSeparators(filePath: string): string {
  return filePath.replace(/\\/g, '/');
}

function dirname(filePath: string): string {
  const normalized = normalizeSeparators(filePath);
  const slashIndex = normalized.lastIndexOf('/');
  if (slashIndex < 0) {
    return '.';
  }
  if (slashIndex === 0) {
    return '/';
  }
  if (slashIndex === 2 && /^[A-Za-z]:$/.test(normalized.slice(0, 2))) {
    return `${normalized.slice(0, 2)}/`;
  }
  return normalized.slice(0, slashIndex);
}

function resolvePath(baseDir: string, relativePath: string): string {
  const normalizedBase = normalizeSeparators(baseDir);
  const normalizedRelative = normalizeSeparators(relativePath);
  if (/^(?:[A-Za-z]:\/|\/)/.test(normalizedRelative)) {
    return normalizedRelative;
  }

  const rootMatch = normalizedBase.match(/^(?:[A-Za-z]:)?\//);
  const root = rootMatch?.[0] ?? '';
  const baseParts = normalizedBase.slice(root.length).split('/').filter(Boolean);
  const relativeParts = normalizedRelative.split('/').filter(Boolean);

  for (const part of relativeParts) {
    if (part === '.') {
      continue;
    }
    if (part === '..') {
      baseParts.pop();
      continue;
    }
    baseParts.push(part);
  }

  return `${root}${baseParts.join('/')}`;
}

contextBridge.exposeInMainWorld('markdownBridge', {
  openMarkdownFile: () => ipcRenderer.invoke('markdown:open'),
  takeLaunchMarkdownFile: () => ipcRenderer.invoke('markdown:take-launch-file'),
  onExternalMarkdownFile: (callback: (request: {
    file: { path: string; name: string; content: string };
    external: boolean;
  }) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, request: {
      file: { path: string; name: string; content: string };
      external: boolean;
    }) => callback(request);
    ipcRenderer.on('markdown:external-open', listener);
    return () => ipcRenderer.removeListener('markdown:external-open', listener);
  },
  readLastMarkdownFile: () => ipcRenderer.invoke('markdown:read-last'),
  readMarkdownFile: (filePath: string) => ipcRenderer.invoke('markdown:read-path', filePath),
  getPathForFile: (file: File) => webUtils.getPathForFile(file),
  saveMarkdownFile: (filePath: string, content: string) => ipcRenderer.invoke('markdown:save', filePath, content),
  exportHtml: (payload: {
    markdownPath: string;
    title: string;
    bodyHtml: string;
    theme: 'light' | 'dark' | 'eye';
  }) => ipcRenderer.invoke('markdown:export-html', payload),
  exportPdf: (payload: {
    markdownPath: string;
    title: string;
    bodyHtml: string;
    theme: 'light' | 'dark' | 'eye';
  }) => ipcRenderer.invoke('markdown:export-pdf', payload),
  saveImageAsset: (markdownPath: string, fileName: string, data: ArrayBuffer, mimeType: string) =>
    ipcRenderer.invoke('asset:save-image', markdownPath, fileName, data, mimeType),
  importImageAsset: (markdownPath: string) => ipcRenderer.invoke('asset:import-image', markdownPath),
  listImageAssets: (markdownPath: string) => ipcRenderer.invoke('asset:list', markdownPath),
  deleteImageAsset: (markdownPath: string, relativePath: string) =>
    ipcRenderer.invoke('asset:delete', markdownPath, relativePath),
  assetUrl: (markdownPath: string, relativePath: string) => {
    const absolutePath = resolvePath(dirname(markdownPath), relativePath);
    return `markdown-asset://local/?path=${encodeURIComponent(absolutePath)}`;
  },
  getSession: () => ipcRenderer.invoke('session:get'),
  saveSession: (session: {
    filePath: string | null;
    recentFiles: string[];
    scrollTop: number;
    tocWidth: number;
    editorWidth: number;
    previewHidden: boolean;
    editorVisible: boolean;
    theme: 'light' | 'dark' | 'eye';
  }) =>
    ipcRenderer.invoke('session:save', session),
});
