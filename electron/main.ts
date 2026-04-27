import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

interface MarkdownSession {
  filePath: string | null;
  scrollTop: number;
}

interface MarkdownFile {
  path: string;
  name: string;
  content: string;
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isDev = !app.isPackaged;

function sessionFilePath(): string {
  return path.join(app.getPath('userData'), 'markdown-session.json');
}

async function readSession(): Promise<MarkdownSession> {
  try {
    const raw = await fs.readFile(sessionFilePath(), 'utf8');
    const parsed = JSON.parse(raw) as Partial<MarkdownSession>;
    return {
      filePath: typeof parsed.filePath === 'string' ? parsed.filePath : null,
      scrollTop: typeof parsed.scrollTop === 'number' ? parsed.scrollTop : 0,
    };
  } catch {
    return { filePath: null, scrollTop: 0 };
  }
}

async function saveSession(session: MarkdownSession): Promise<void> {
  await fs.mkdir(path.dirname(sessionFilePath()), { recursive: true });
  await fs.writeFile(sessionFilePath(), JSON.stringify(session, null, 2), 'utf8');
}

async function readMarkdownFile(filePath: string): Promise<MarkdownFile> {
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
    await window.loadURL('http://127.0.0.1:5173');
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
  await saveSession({ filePath: file.path, scrollTop: 0 });
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
    await saveSession({ filePath: null, scrollTop: 0 });
    return null;
  }
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
