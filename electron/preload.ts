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
  notifyReadyForExternalOpen: () => ipcRenderer.invoke('markdown:ready-for-external-open'),
  onExternalMarkdownFile: (callback: (request: {
    file: { path: string; name: string; content: string; encoding: string };
    external: boolean;
  }) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, request: {
      file: { path: string; name: string; content: string; encoding: string };
      external: boolean;
    }) => callback(request);
    ipcRenderer.on('markdown:external-open', listener);
    return () => ipcRenderer.removeListener('markdown:external-open', listener);
  },
  onMarkdownFileChanged: (callback: (file: { path: string; name: string; content: string; encoding: string }) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, file: { path: string; name: string; content: string; encoding: string }) => callback(file);
    ipcRenderer.on('markdown:file-changed', listener);
    return () => ipcRenderer.removeListener('markdown:file-changed', listener);
  },
  onToggleEditorShortcut: (callback: () => void) => {
    const listener = () => callback();
    ipcRenderer.on('markdown:toggle-editor-shortcut', listener);
    return () => ipcRenderer.removeListener('markdown:toggle-editor-shortcut', listener);
  },
  onCloseRequest: (callback: () => void) => {
    const listener = () => callback();
    ipcRenderer.on('app:close-request', listener);
    return () => ipcRenderer.removeListener('app:close-request', listener);
  },
  onAppMenuCommand: (callback: (command: string) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, command: string) => callback(command);
    ipcRenderer.on('app:menu-command', listener);
    return () => ipcRenderer.removeListener('app:menu-command', listener);
  },
  readLastMarkdownFile: () => ipcRenderer.invoke('markdown:read-last'),
  readMarkdownFile: (filePath: string, encoding?: string) => ipcRenderer.invoke('markdown:read-path', filePath, encoding),
  getPathForFile: (file: File) => webUtils.getPathForFile(file),
  saveMarkdownFile: (filePath: string, content: string, encoding?: string) =>
    ipcRenderer.invoke('markdown:save', filePath, content, encoding),
  saveMarkdownFileAs: (content: string, defaultName: string, encoding?: string) =>
    ipcRenderer.invoke('markdown:save-as', content, defaultName, encoding),
  revealInFolder: (filePath: string) => ipcRenderer.invoke('markdown:reveal-in-folder', filePath),
  openExternalLink: (url: string, baseMarkdownPath?: string | null) =>
    ipcRenderer.invoke('app:open-external-link', url, baseMarkdownPath),
  htmlPreviewUrl: (payload: { filePath: string | null; content: string }) =>
    ipcRenderer.invoke('html-preview:url', payload),
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
  saveTempImageAsset: (fileName: string, data: ArrayBuffer, mimeType: string) =>
    ipcRenderer.invoke('asset:save-temp-image', fileName, data, mimeType),
  uploadCloudImage: (payload: {
    filePath: string;
    appId: string;
    subDir: string;
    linkName?: string;
  }) => ipcRenderer.invoke('asset:upload-cloud-image', payload),
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
    tabs: {
      id: string;
      filePath: string | null;
      name: string;
      scrollTop: number;
      editorScrollTop: number;
      previewScrollTop: number;
      tocScrollTop: number;
      content?: string;
      lastSavedContent?: string;
      encoding?: string;
    }[];
    activeTabId: string | null;
    bookmarks: {
      id: string;
      tabId: string;
      filePath: string | null;
      fileName: string;
      lineNumber: number;
      column: number;
      excerpt: string;
      createdAt: number;
      updatedAt: number;
    }[];
    bookmarkViewMode: 'all' | 'current';
    recentFiles: string[];
    fileScrollPositions: {
      filePath: string;
      scrollTop: number;
      updatedAt: number;
    }[];
    scrollTop: number;
    tocWidth: number;
    editorWidth: number;
    previewHidden: boolean;
    editorVisible: boolean;
    theme: 'light' | 'dark' | 'eye';
  }) =>
    ipcRenderer.invoke('session:save', session),
  saveSessionSync: (session: {
    filePath: string | null;
    tabs: {
      id: string;
      filePath: string | null;
      name: string;
      scrollTop: number;
      editorScrollTop: number;
      previewScrollTop: number;
      tocScrollTop: number;
      content?: string;
      lastSavedContent?: string;
      encoding?: string;
    }[];
    activeTabId: string | null;
    bookmarks: {
      id: string;
      tabId: string;
      filePath: string | null;
      fileName: string;
      lineNumber: number;
      column: number;
      excerpt: string;
      createdAt: number;
      updatedAt: number;
    }[];
    bookmarkViewMode: 'all' | 'current';
    recentFiles: string[];
    fileScrollPositions: {
      filePath: string;
      scrollTop: number;
      updatedAt: number;
    }[];
    scrollTop: number;
    tocWidth: number;
    editorWidth: number;
    previewHidden: boolean;
    editorVisible: boolean;
    theme: 'light' | 'dark' | 'eye';
  }) => ipcRenderer.sendSync('session:save-sync', session),
  quitApp: () => ipcRenderer.invoke('app:quit'),
  confirmClose: () => ipcRenderer.invoke('app:confirm-close'),
  confirmCloseSync: () => ipcRenderer.sendSync('app:confirm-close-sync'),
  debugLog: (event: string, payload: Record<string, unknown> = {}) =>
    ipcRenderer.invoke('app:debug-log', event, payload),
});
