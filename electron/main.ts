import { app, BrowserWindow, dialog, ipcMain, protocol } from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';

interface MarkdownSession {
  filePath: string | null;
  recentFiles: string[];
  scrollTop: number;
  tocWidth: number;
  editorWidth: number;
  previewHidden: boolean;
  editorVisible: boolean;
  theme: 'light' | 'dark' | 'eye';
}

interface MarkdownFile {
  path: string;
  name: string;
  content: string;
}

interface MarkdownOpenRequest {
  file: MarkdownFile;
  external: boolean;
}

interface ExportDocumentPayload {
  markdownPath: string;
  title: string;
  bodyHtml: string;
  theme: MarkdownSession['theme'];
}

interface ImageAsset {
  name: string;
  relativePath: string;
  absolutePath: string;
  size: number;
}

const isDev = !app.isPackaged && process.env.MARKDOWN_EDITOR_FORCE_PROD !== '1';
const devServerUrl = 'http://127.0.0.1:26543';
const appTitle = 'Markdown 纪';
const imageAssetExtensions = new Set(['.avif', '.gif', '.jpeg', '.jpg', '.png', '.svg', '.webp']);
const imageMimeTypes = new Map([
  ['.avif', 'image/avif'],
  ['.gif', 'image/gif'],
  ['.jpeg', 'image/jpeg'],
  ['.jpg', 'image/jpeg'],
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml'],
  ['.webp', 'image/webp'],
]);
let mainWindow: BrowserWindow | null = null;
let pendingExternalMarkdownPath: string | null = null;

function normalizeTheme(theme: unknown): MarkdownSession['theme'] {
  return theme === 'dark' || theme === 'eye' ? theme : 'light';
}

function createDefaultSession(): MarkdownSession {
  return {
    filePath: null,
    recentFiles: [],
    scrollTop: 0,
    tocWidth: 260,
    editorWidth: 560,
    previewHidden: false,
    editorVisible: false,
    theme: 'light',
  };
}

function normalizeRecentFiles(recentFiles: unknown): string[] {
  if (!Array.isArray(recentFiles)) {
    return [];
  }

  return Array.from(new Set(recentFiles.filter((filePath): filePath is string => typeof filePath === 'string')))
    .slice(0, 20);
}

function sessionFilePath(): string {
  return path.join(app.getPath('userData'), 'markdown-session.json');
}

async function readSession(): Promise<MarkdownSession> {
  try {
    const raw = await fs.readFile(sessionFilePath(), 'utf8');
    const parsed = JSON.parse(raw) as Partial<MarkdownSession>;
    return {
      filePath: typeof parsed.filePath === 'string' ? parsed.filePath : null,
      recentFiles: normalizeRecentFiles(parsed.recentFiles),
      scrollTop: typeof parsed.scrollTop === 'number' ? parsed.scrollTop : 0,
      tocWidth: typeof parsed.tocWidth === 'number' ? parsed.tocWidth : 260,
      editorWidth: typeof parsed.editorWidth === 'number' ? parsed.editorWidth : 560,
      previewHidden: parsed.previewHidden === true,
      editorVisible: parsed.editorVisible === true,
      theme: normalizeTheme(parsed.theme),
    };
  } catch {
    return createDefaultSession();
  }
}

async function saveSession(session: MarkdownSession): Promise<void> {
  await fs.mkdir(path.dirname(sessionFilePath()), { recursive: true });
  await fs.writeFile(sessionFilePath(), JSON.stringify(session, null, 2), 'utf8');
}

function isMarkdownFilePath(filePath: string): boolean {
  return ['.md', '.markdown', '.mdown'].includes(path.extname(filePath).toLowerCase());
}

function markdownBaseName(markdownPath: string): string {
  return path.basename(markdownPath, path.extname(markdownPath));
}

function markdownAssetDir(markdownPath: string): string {
  return path.join(path.dirname(markdownPath), `${markdownBaseName(markdownPath)}.assets`);
}

function relativeMarkdownPath(markdownPath: string, filePath: string): string {
  return path.relative(path.dirname(markdownPath), filePath).split(path.sep).join('/');
}

function escapeHtmlText(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function sanitizeAssetName(fileName: string): string {
  const extension = path.extname(fileName).toLowerCase();
  const base = path.basename(fileName, extension)
    .replace(/[^\p{L}\p{N}._-]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'image';
  return `${base}${extension || '.png'}`;
}

function uniqueAssetName(fileName: string): string {
  const sanitized = sanitizeAssetName(fileName);
  const extension = path.extname(sanitized);
  const base = path.basename(sanitized, extension);
  return `${base}-${Date.now()}${extension}`;
}

function imageExtensionFromMime(mimeType: string): string {
  if (mimeType === 'image/jpeg') {
    return '.jpg';
  }
  if (mimeType === 'image/svg+xml') {
    return '.svg';
  }
  const subtype = mimeType.startsWith('image/') ? mimeType.slice('image/'.length) : 'png';
  return imageAssetExtensions.has(`.${subtype}`) ? `.${subtype}` : '.png';
}

function assetPathFromRelative(markdownPath: string, relativePath: string): string {
  const resolved = path.resolve(path.dirname(markdownPath), relativePath);
  const assetDir = path.resolve(markdownAssetDir(markdownPath));
  if (!resolved.startsWith(`${assetDir}${path.sep}`)) {
    throw new Error('Asset path is outside the document asset directory.');
  }
  return resolved;
}

async function readMarkdownFile(filePath: string): Promise<MarkdownFile> {
  if (!isMarkdownFilePath(filePath)) {
    throw new Error('Only Markdown files can be opened.');
  }

  const content = await fs.readFile(filePath, 'utf8');
  return {
    path: filePath,
    name: path.basename(filePath),
    content,
  };
}

function markdownPathFromArgv(argv: string[]): string | null {
  const filePath = argv.find((arg) => !arg.startsWith('-') && isMarkdownFilePath(arg));
  return filePath ? path.resolve(filePath) : null;
}

async function createOpenRequest(filePath: string, external: boolean): Promise<MarkdownOpenRequest> {
  return {
    file: await readMarkdownFile(filePath),
    external,
  };
}

async function dispatchExternalMarkdownPath(filePath: string): Promise<void> {
  pendingExternalMarkdownPath = filePath;
  if (!app.isReady()) {
    return;
  }
  if (!mainWindow || mainWindow.isDestroyed()) {
    await createWindow();
    return;
  }

  if (mainWindow.webContents.isLoading()) {
    return;
  }

  try {
    mainWindow.webContents.send('markdown:external-open', await createOpenRequest(filePath, true));
    pendingExternalMarkdownPath = null;
    if (mainWindow.isMinimized()) {
      mainWindow.restore();
    }
    mainWindow.focus();
  } catch {
    dialog.showErrorBox(appTitle, `无法打开 Markdown 文件：${filePath}`);
  }
}

function exportHtmlDocument(payload: ExportDocumentPayload): string {
  const themeClass = `theme-${payload.theme}`;
  return [
    '<!doctype html>',
    `<html lang="zh-CN" class="${themeClass}">`,
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${escapeHtmlText(payload.title)}</title>`,
    '<style>',
    ':root{font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#172026;background:#fff;}',
    'body{margin:0;background:#fff;color:#172026;}',
    'main{max-width:860px;margin:0 auto;padding:40px 28px 72px;}',
    'h1,h2,h3,h4{line-height:1.25;color:inherit;}',
    'p,li,blockquote,table{line-height:1.65;}',
    'a{color:#0b7a75;}',
    'blockquote{border-left:3px solid #c2cbd2;margin-left:0;padding-left:14px;color:#66717a;}',
    'pre{background:#f4f7f9;border:1px solid #d5dce1;border-radius:6px;overflow:auto;padding:12px;}',
    'code{font-family:"SFMono-Regular",Consolas,"Liberation Mono",monospace;}',
    'table{border-collapse:collapse;width:100%;}td,th{border:1px solid #d5dce1;padding:6px 8px;}',
    'img,svg{max-width:100%;height:auto;}',
    '.mermaid-actions{display:none;}',
    '.theme-dark body{background:#111827;color:#e5edf6;}.theme-dark pre{background:#111827;border-color:#334155;}',
    '</style>',
    '</head>',
    '<body>',
    `<main>${payload.bodyHtml}</main>`,
    '</body>',
    '</html>',
  ].join('');
}

async function exportHtmlFile(payload: ExportDocumentPayload): Promise<string | null> {
  const result = await dialog.showSaveDialog({
    defaultPath: path.join(path.dirname(payload.markdownPath), `${markdownBaseName(payload.markdownPath)}.html`),
    filters: [{ name: 'HTML', extensions: ['html'] }],
  });
  if (result.canceled || !result.filePath) {
    return null;
  }

  await fs.writeFile(result.filePath, exportHtmlDocument(payload), 'utf8');
  return result.filePath;
}

async function exportPdfFile(payload: ExportDocumentPayload): Promise<string | null> {
  const result = await dialog.showSaveDialog({
    defaultPath: path.join(path.dirname(payload.markdownPath), `${markdownBaseName(payload.markdownPath)}.pdf`),
    filters: [{ name: 'PDF', extensions: ['pdf'] }],
  });
  if (result.canceled || !result.filePath) {
    return null;
  }

  const printWindow = new BrowserWindow({
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  try {
    await printWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(exportHtmlDocument(payload))}`);
    const pdf = await printWindow.webContents.printToPDF({
      pageSize: 'A4',
      printBackground: true,
    });
    await fs.writeFile(result.filePath, pdf);
    return result.filePath;
  } finally {
    printWindow.destroy();
  }
}

async function saveImageAsset(
  markdownPath: string,
  fileName: string,
  data: ArrayBuffer | Uint8Array,
  mimeType: string,
): Promise<ImageAsset> {
  const assetDir = markdownAssetDir(markdownPath);
  const preferredName = fileName || `pasted-image${imageExtensionFromMime(mimeType)}`;
  const targetPath = path.join(assetDir, uniqueAssetName(preferredName));
  await fs.mkdir(assetDir, { recursive: true });
  await fs.writeFile(targetPath, data instanceof ArrayBuffer ? Buffer.from(new Uint8Array(data)) : Buffer.from(data));
  const stat = await fs.stat(targetPath);
  return {
    name: path.basename(targetPath),
    relativePath: relativeMarkdownPath(markdownPath, targetPath),
    absolutePath: targetPath,
    size: stat.size,
  };
}

function registerMarkdownAssetProtocol(): void {
  protocol.handle('markdown-asset', async (request) => {
    const url = new URL(request.url);
    const filePath = url.searchParams.get('path');
    const extension = path.extname(filePath ?? '').toLowerCase();
    if (!filePath || !path.isAbsolute(filePath) || !imageAssetExtensions.has(extension)) {
      return new Response('Not found', { status: 404 });
    }

    try {
      return new Response(await fs.readFile(filePath), {
        headers: {
          'content-type': imageMimeTypes.get(extension) ?? 'application/octet-stream',
        },
      });
    } catch {
      return new Response('Not found', { status: 404 });
    }
  });
}

async function listImageAssets(markdownPath: string): Promise<ImageAsset[]> {
  const assetDir = markdownAssetDir(markdownPath);
  try {
    const entries = await fs.readdir(assetDir, { withFileTypes: true });
    const assets = await Promise.all(entries
      .filter((entry) => entry.isFile() && imageAssetExtensions.has(path.extname(entry.name).toLowerCase()))
      .map(async (entry) => {
        const absolutePath = path.join(assetDir, entry.name);
        const stat = await fs.stat(absolutePath);
        return {
          name: entry.name,
          relativePath: relativeMarkdownPath(markdownPath, absolutePath),
          absolutePath,
          size: stat.size,
        };
      }));
    return assets.sort((first, second) => first.name.localeCompare(second.name));
  } catch {
    return [];
  }
}

async function createWindow(): Promise<void> {
  const window = new BrowserWindow({
    width: 1320,
    height: 860,
    minWidth: 900,
    minHeight: 600,
    title: appTitle,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.js'),
    },
  });
  mainWindow = window;
  window.on('closed', () => {
    if (mainWindow === window) {
      mainWindow = null;
    }
  });
  if (isDev) {
    await window.loadURL(devServerUrl);
  } else {
    await window.loadFile(path.join(__dirname, '../dist/index.html'));
  }
}

ipcMain.handle('markdown:open', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [{ name: 'Markdown', extensions: ['md', 'markdown', 'mdown'] }],
  });

  if (result.canceled || !result.filePaths[0]) {
    return null;
  }

  const file = await readMarkdownFile(result.filePaths[0]);
  await saveSession({ ...(await readSession()), filePath: file.path, scrollTop: 0 });
  return file;
});

ipcMain.handle('markdown:take-launch-file', async () => {
  if (!pendingExternalMarkdownPath) {
    return null;
  }

  const filePath = pendingExternalMarkdownPath;
  pendingExternalMarkdownPath = null;
  return createOpenRequest(filePath, true);
});

ipcMain.handle('markdown:read-last', async () => {
  const session = await readSession();
  if (!session.filePath) {
    return null;
  }

  try {
    return await readMarkdownFile(session.filePath);
  } catch {
    await saveSession({ ...(await readSession()), filePath: null, scrollTop: 0 });
    return null;
  }
});

ipcMain.handle('markdown:read-path', async (_event, filePath: string) => {
  return readMarkdownFile(filePath);
});

ipcMain.handle('markdown:save', async (_event, filePath: string, content: string) => {
  await fs.writeFile(filePath, content, 'utf8');
  return readMarkdownFile(filePath);
});

ipcMain.handle('markdown:export-html', async (_event, payload: ExportDocumentPayload) => {
  return exportHtmlFile(payload);
});

ipcMain.handle('markdown:export-pdf', async (_event, payload: ExportDocumentPayload) => {
  return exportPdfFile(payload);
});

ipcMain.handle('asset:save-image', async (_event, markdownPath: string, fileName: string, data: ArrayBuffer, mimeType: string) => {
  return saveImageAsset(markdownPath, fileName, data, mimeType);
});

ipcMain.handle('asset:import-image', async (_event, markdownPath: string) => {
  const result = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [{ name: 'Images', extensions: Array.from(imageAssetExtensions).map((extension) => extension.slice(1)) }],
  });
  if (result.canceled || !result.filePaths[0]) {
    return null;
  }

  const sourcePath = result.filePaths[0];
  return saveImageAsset(markdownPath, path.basename(sourcePath), await fs.readFile(sourcePath), `image/${path.extname(sourcePath).slice(1)}`);
});

ipcMain.handle('asset:list', async (_event, markdownPath: string) => {
  return listImageAssets(markdownPath);
});

ipcMain.handle('asset:delete', async (_event, markdownPath: string, relativePath: string) => {
  await fs.unlink(assetPathFromRelative(markdownPath, relativePath));
  return listImageAssets(markdownPath);
});

ipcMain.handle('session:get', readSession);
ipcMain.handle('session:save', async (_event, session: MarkdownSession) => {
  await saveSession(session);
});

app.on('open-file', (event, filePath) => {
  event.preventDefault();
  if (!isMarkdownFilePath(filePath)) {
    return;
  }
  void dispatchExternalMarkdownPath(filePath);
});

const singleInstanceLock = app.requestSingleInstanceLock();
if (!singleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', (_event, argv) => {
    const filePath = markdownPathFromArgv(argv);
    if (filePath) {
      void dispatchExternalMarkdownPath(filePath);
      return;
    }
    if (mainWindow) {
      if (mainWindow.isMinimized()) {
        mainWindow.restore();
      }
      mainWindow.focus();
    }
  });
}

app.whenReady().then(async () => {
  registerMarkdownAssetProtocol();
  pendingExternalMarkdownPath = pendingExternalMarkdownPath ?? markdownPathFromArgv(process.argv);
  await createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    void createWindow();
  }
});
