import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('markdownBridge', {
  openMarkdownFile: () => ipcRenderer.invoke('markdown:open'),
  readLastMarkdownFile: () => ipcRenderer.invoke('markdown:read-last'),
  saveMarkdownFile: (path: string, content: string) => ipcRenderer.invoke('markdown:save', path, content),
  getSession: () => ipcRenderer.invoke('session:get'),
  saveSession: (session: { filePath: string | null; scrollTop: number }) =>
    ipcRenderer.invoke('session:save', session),
});
