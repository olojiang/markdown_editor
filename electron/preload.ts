import { contextBridge, ipcRenderer, webUtils } from 'electron';

contextBridge.exposeInMainWorld('markdownBridge', {
  openMarkdownFile: () => ipcRenderer.invoke('markdown:open'),
  readLastMarkdownFile: () => ipcRenderer.invoke('markdown:read-last'),
  readMarkdownFile: (path: string) => ipcRenderer.invoke('markdown:read-path', path),
  getPathForFile: (file: File) => webUtils.getPathForFile(file),
  saveMarkdownFile: (path: string, content: string) => ipcRenderer.invoke('markdown:save', path, content),
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
