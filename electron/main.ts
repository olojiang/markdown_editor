import { app, BrowserWindow, dialog, ipcMain } from 'electron';
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

const isDev = !app.isPackaged && process.env.MARKDOWN_EDITOR_FORCE_PROD !== '1';
const devServerUrl = 'http://127.0.0.1:26543';

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

async function createWindow(): Promise<void> {
  const window = new BrowserWindow({
    width: 1320,
    height: 860,
    minWidth: 900,
    minHeight: 600,
    title: 'Markdown Editor',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.js'),
    },
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

ipcMain.handle('session:get', readSession);
ipcMain.handle('session:save', async (_event, session: MarkdownSession) => {
  await saveSession(session);
});

app.whenReady().then(createWindow);

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
