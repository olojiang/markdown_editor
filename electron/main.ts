import { app, BrowserWindow, clipboard, dialog, ipcMain, Menu, protocol, shell, type MenuItemConstructorOptions } from 'electron';
import { execFileSync } from 'node:child_process';
import fsSync from 'node:fs';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  decodeTextBuffer,
  defaultTextEncoding,
  encodeTextBuffer,
  normalizeTextEncoding,
  type TextEncoding,
} from './text-encoding';

interface MarkdownSession {
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
    encoding?: TextEncoding;
  }[];
  activeTabId: string | null;
  bookmarks: MarkdownBookmark[];
  bookmarkViewMode: 'all' | 'current';
  recentFiles: string[];
  fileScrollPositions: FileScrollPosition[];
  scrollTop: number;
  tocWidth: number;
  editorWidth: number;
  previewHidden: boolean;
  editorVisible: boolean;
  theme: 'light' | 'dark' | 'eye';
}

interface MarkdownBookmark {
  id: string;
  tabId: string;
  filePath: string | null;
  fileName: string;
  lineNumber: number;
  column: number;
  excerpt: string;
  createdAt: number;
  updatedAt: number;
}

interface FileScrollPosition {
  filePath: string;
  scrollTop: number;
  updatedAt: number;
}

interface MarkdownFile {
  path: string;
  name: string;
  content: string;
  encoding: TextEncoding;
  size: number;
  modifiedAt: number;
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

interface HtmlPreviewPayload {
  filePath: string | null;
  content: string;
}

interface HtmlPreviewEntry {
  baseDir: string | null;
  content: string;
  createdAt: number;
}

interface ImageAsset {
  name: string;
  relativePath: string;
  absolutePath: string;
  size: number;
}

interface TempImageAsset {
  name: string;
  absolutePath: string;
  size: number;
  mimeType: string;
}

interface CloudImageUploadRequest {
  filePath: string;
  appId: string;
  subDir: string;
  linkName?: string;
}

interface CloudImageUploadResult {
  url: string;
  path: string;
  uploadedName: string;
  localPath: string;
}

type AppMenuCommand =
  | 'new-file'
  | 'open-file'
  | 'refresh-file'
  | 'save-file'
  | 'save-as'
  | 'save-all'
  | 'format-json'
  | 'compact-json'
  | 'export-html'
  | 'export-pdf'
  | 'close-tab'
  | 'duplicate-tab'
  | 'copy-tab-path'
  | 'copy-tab-content'
  | 'undo'
  | 'redo'
  | 'show-search'
  | 'find-next'
  | 'replace-current'
  | 'replace-all'
  | 'insert-table'
  | 'insert-link'
  | 'insert-code'
  | 'import-image'
  | 'image-upload-local'
  | 'image-upload-cloud'
  | 'refresh-assets'
  | 'insert-selected-asset'
  | 'delete-selected-asset'
  | 'toggle-editor'
  | 'toggle-toc-panel'
  | 'toggle-preview'
  | 'toggle-fullscreen-preview'
  | 'preview-zoom-in'
  | 'preview-zoom-out'
  | 'preview-zoom-reset'
  | 'theme-light'
  | 'theme-dark'
  | 'theme-eye'
  | 'expand-toc'
  | 'collapse-toc'
  | 'toggle-vim'
  | 'open-editor-config'
  | 'show-help';

const isDev = !app.isPackaged && process.env.MARKDOWN_EDITOR_FORCE_PROD !== '1';
const devServerUrl = 'http://127.0.0.1:26543';
const appTitle = 'Markdown 纪';
app.setName(appTitle);
if (process.env.MARKDOWN_EDITOR_USER_DATA_DIR) {
  app.setPath('userData', process.env.MARKDOWN_EDITOR_USER_DATA_DIR);
}
const imageAssetExtensions = new Set(['.avif', '.gif', '.jpeg', '.jpg', '.png', '.svg', '.webp']);
const supportedDocumentExtensions = ['md', 'markdown', 'mdown', 'html', 'htm', 'txt', 'text', 'json'];
const imageMimeTypes = new Map([
  ['.avif', 'image/avif'],
  ['.gif', 'image/gif'],
  ['.jpeg', 'image/jpeg'],
  ['.jpg', 'image/jpeg'],
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml'],
  ['.webp', 'image/webp'],
]);
const cloudUploadBaseUrl = 'https://test.sheepwall.com/fe-dash/api/oss/aliyun/resource';
const externalUrlProtocols = new Set(['http:', 'https:', 'mailto:', 'tel:']);
const htmlPreviewMimeTypes = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.gif', 'image/gif'],
  ['.htm', 'text/html; charset=utf-8'],
  ['.html', 'text/html; charset=utf-8'],
  ['.ico', 'image/x-icon'],
  ['.jpeg', 'image/jpeg'],
  ['.jpg', 'image/jpeg'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.mjs', 'text/javascript; charset=utf-8'],
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml; charset=utf-8'],
  ['.txt', 'text/plain; charset=utf-8'],
  ['.webp', 'image/webp'],
]);
let mainWindow: BrowserWindow | null = null;
let pendingExternalMarkdownPath: string | null = null;
let rendererReadyForExternalOpen = false;
let launchMarkdownPathConsumed = false;
let closeConfirmed = false;
let lastRecentFilesMainDiagnosticSignature = '';
const watchedMarkdownFiles = new Map<string, fsSync.FSWatcher>();
const markdownChangeTimers = new Map<string, NodeJS.Timeout>();
const markdownFileEncodings = new Map<string, TextEncoding>();
let htmlPreviewServer: http.Server | null = null;
let htmlPreviewServerPort: number | null = null;
let htmlPreviewCounter = 0;
const htmlPreviewEntries = new Map<string, HtmlPreviewEntry>();
const htmlPreviewMaxEntries = 40;
const htmlPreviewIdSearchParam = 'markdown-preview-id';
const legacySessionUserDataNames = ['markdown-editor'];

function mainLog(event: string, payload: Record<string, unknown> = {}): void {
  const record = {
    event,
    payload,
    timestamp: new Date().toISOString(),
  };
  console.info('[markdown-editor:main]', record);
  try {
    fsSync.mkdirSync(app.getPath('userData'), { recursive: true });
    fsSync.appendFileSync(
      path.join(app.getPath('userData'), 'markdown-editor-debug.log'),
      `${JSON.stringify(record)}\n`,
      'utf8',
    );
  } catch {
    // Debug logging must never block app behavior.
  }
}

function sendAppMenuCommand(command: AppMenuCommand): void {
  const window = BrowserWindow.getFocusedWindow() ?? mainWindow;
  window?.webContents.send('app:menu-command', command);
}

function commandMenuItem(
  label: string,
  command: AppMenuCommand,
  accelerator?: string,
): MenuItemConstructorOptions {
  return {
    label,
    accelerator,
    click: () => sendAppMenuCommand(command),
  };
}

function buildApplicationMenu(): void {
  const template: MenuItemConstructorOptions[] = [
    {
      label: '文件',
      submenu: [
        commandMenuItem('新建 Markdown', 'new-file', 'CmdOrCtrl+T'),
        commandMenuItem('打开文档...', 'open-file', 'CmdOrCtrl+O'),
        commandMenuItem('从磁盘刷新', 'refresh-file', 'CmdOrCtrl+R'),
        { type: 'separator' },
        commandMenuItem('保存', 'save-file', 'CmdOrCtrl+S'),
        commandMenuItem('另存为...', 'save-as', 'CmdOrCtrl+Shift+S'),
        commandMenuItem('全部保存', 'save-all', 'CmdOrCtrl+Alt+S'),
        { type: 'separator' },
        commandMenuItem('格式化 JSON', 'format-json'),
        commandMenuItem('JSON 压成一行', 'compact-json'),
        { type: 'separator' },
        commandMenuItem('导出 HTML...', 'export-html', 'CmdOrCtrl+Shift+H'),
        commandMenuItem('导出 PDF...', 'export-pdf', 'CmdOrCtrl+Shift+P'),
        { type: 'separator' },
        commandMenuItem('关闭当前标签页', 'close-tab', 'CmdOrCtrl+W'),
        process.platform === 'darwin' ? { role: 'close' } : { role: 'quit', label: '退出' },
      ],
    },
    {
      label: '编辑',
      submenu: [
        commandMenuItem('撤销', 'undo', 'CmdOrCtrl+Z'),
        commandMenuItem('重做', 'redo', process.platform === 'darwin' ? 'CmdOrCtrl+Shift+Z' : 'CmdOrCtrl+Y'),
        { type: 'separator' },
        { role: 'cut', label: '剪切' },
        { role: 'copy', label: '复制' },
        { role: 'paste', label: '粘贴' },
        { role: 'selectAll', label: '全选' },
        { type: 'separator' },
        commandMenuItem('查找...', 'show-search', 'CmdOrCtrl+F'),
        commandMenuItem('查找下一个', 'find-next', 'CmdOrCtrl+G'),
        commandMenuItem('替换当前匹配', 'replace-current'),
        commandMenuItem('全部替换', 'replace-all'),
      ],
    },
    {
      label: '标签页',
      submenu: [
        commandMenuItem('复制当前标签页', 'duplicate-tab', 'CmdOrCtrl+Shift+D'),
        commandMenuItem('复制文件路径', 'copy-tab-path', 'CmdOrCtrl+Shift+C'),
        commandMenuItem('复制文档内容', 'copy-tab-content'),
      ],
    },
    {
      label: '插入',
      submenu: [
        commandMenuItem('表格', 'insert-table', 'CmdOrCtrl+Alt+T'),
        commandMenuItem('链接', 'insert-link', 'CmdOrCtrl+K'),
        commandMenuItem('代码块', 'insert-code', 'CmdOrCtrl+Alt+C'),
        { type: 'separator' },
        commandMenuItem('导入本地图片...', 'import-image', 'Alt+Shift+I'),
        {
          label: '粘贴图片上传方式',
          submenu: [
            commandMenuItem('保存到本地资源目录', 'image-upload-local'),
            commandMenuItem('上传到云端', 'image-upload-cloud'),
          ],
        },
      ],
    },
    {
      label: '资源',
      submenu: [
        commandMenuItem('刷新图片资源', 'refresh-assets'),
        commandMenuItem('插入选中图片', 'insert-selected-asset'),
        commandMenuItem('删除选中图片资源', 'delete-selected-asset'),
      ],
    },
    {
      label: '视图',
      submenu: [
        commandMenuItem('阅读/编辑模式', 'toggle-editor', 'CmdOrCtrl+E'),
        commandMenuItem('展开/收起目录侧栏', 'toggle-toc-panel', 'CmdOrCtrl+Alt+B'),
        commandMenuItem('显示/隐藏预览', 'toggle-preview', 'CmdOrCtrl+P'),
        commandMenuItem('全屏预览', 'toggle-fullscreen-preview', 'F11'),
        { type: 'separator' },
        commandMenuItem('放大预览', 'preview-zoom-in', 'CmdOrCtrl+='),
        commandMenuItem('缩小预览', 'preview-zoom-out', 'CmdOrCtrl+-'),
        commandMenuItem('还原预览缩放', 'preview-zoom-reset', 'CmdOrCtrl+0'),
        { type: 'separator' },
        {
          label: '主题',
          submenu: [
            commandMenuItem('浅色', 'theme-light'),
            commandMenuItem('深色', 'theme-dark'),
            commandMenuItem('护眼', 'theme-eye'),
          ],
        },
        {
          label: '目录',
          submenu: [
            commandMenuItem('全部展开', 'expand-toc'),
            commandMenuItem('全部收起', 'collapse-toc'),
          ],
        },
      ],
    },
    {
      label: '工具',
      submenu: [
        commandMenuItem('开启/关闭 Vim 模式', 'toggle-vim'),
        commandMenuItem('Monaco / Vim 配置...', 'open-editor-config'),
        { type: 'separator' },
        { role: 'toggleDevTools', label: '开发者工具', accelerator: 'CmdOrCtrl+Alt+I' },
      ],
    },
    {
      label: '窗口',
      submenu: [
        { role: 'minimize', label: '最小化' },
        { role: 'zoom', label: '缩放' },
        ...(process.platform === 'darwin' ? [
          { type: 'separator' } as MenuItemConstructorOptions,
          { role: 'front', label: '前置全部窗口' } as MenuItemConstructorOptions,
        ] : []),
      ],
    },
    {
      label: '帮助',
      submenu: [
        commandMenuItem('功能与快捷键说明', 'show-help', 'CmdOrCtrl+/'),
        { type: 'separator' },
        { role: 'about', label: `关于 ${appTitle}` },
      ],
    },
  ];

  if (process.platform === 'darwin') {
    template.unshift({
      label: appTitle,
      submenu: [
        { role: 'about', label: `关于 ${appTitle}` },
        { type: 'separator' },
        { role: 'services', label: '服务' },
        { type: 'separator' },
        { role: 'hide', label: `隐藏 ${appTitle}` },
        { role: 'hideOthers', label: '隐藏其他' },
        { role: 'unhide', label: '全部显示' },
        { type: 'separator' },
        { role: 'quit', label: `退出 ${appTitle}` },
      ],
    });
  }

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function normalizeTheme(theme: unknown): MarkdownSession['theme'] {
  return theme === 'dark' || theme === 'eye' ? theme : 'light';
}

function createDefaultSession(): MarkdownSession {
  return {
    filePath: null,
    tabs: [],
    activeTabId: null,
    bookmarks: [],
    bookmarkViewMode: 'all',
    recentFiles: [],
    fileScrollPositions: [],
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

  const seen = new Set<string>();
  return recentFiles.flatMap((filePath): string[] => {
    if (typeof filePath !== 'string') {
      return [];
    }
    const normalized = normalizeRecentFilePath(filePath);
    const key = recentFileKey(normalized);
    if (!normalized || seen.has(key)) {
      return [];
    }
    seen.add(key);
    return [normalized];
  }).slice(0, 20);
}

function normalizeFileScrollPositions(positions: unknown): FileScrollPosition[] {
  if (!Array.isArray(positions)) {
    return [];
  }

  const seen = new Set<string>();
  return positions.flatMap((position): FileScrollPosition[] => {
    if (!position || typeof position !== 'object') {
      return [];
    }
    const candidate = position as Partial<FileScrollPosition>;
    if (typeof candidate.filePath !== 'string') {
      return [];
    }
    const filePath = normalizeRecentFilePath(candidate.filePath);
    const key = recentFileKey(filePath);
    if (!filePath || seen.has(key)) {
      return [];
    }
    seen.add(key);
    return [{
      filePath,
      scrollTop: typeof candidate.scrollTop === 'number' ? Math.max(0, candidate.scrollTop) : 0,
      updatedAt: typeof candidate.updatedAt === 'number' ? candidate.updatedAt : Date.now(),
    }];
  }).slice(0, 20);
}

function recentFileKey(filePath: string): string {
  return normalizeRecentFilePath(filePath).toLocaleLowerCase();
}

function normalizeBookmarkViewMode(viewMode: unknown): MarkdownSession['bookmarkViewMode'] {
  return viewMode === 'current' ? 'current' : 'all';
}

function bookmarkTargetKey(bookmark: Pick<MarkdownBookmark, 'column' | 'filePath' | 'lineNumber' | 'tabId'>): string {
  const target = bookmark.filePath ? normalizeRecentFilePath(bookmark.filePath) : bookmark.tabId;
  return `${target.toLocaleLowerCase()}:${bookmark.lineNumber}:${bookmark.column}`;
}

function normalizeBookmarks(bookmarks: unknown): MarkdownBookmark[] {
  if (!Array.isArray(bookmarks)) {
    return [];
  }

  const seen = new Set<string>();
  return bookmarks.flatMap((bookmark): MarkdownBookmark[] => {
    if (!bookmark || typeof bookmark !== 'object') {
      return [];
    }
    const candidate = bookmark as Partial<MarkdownBookmark>;
    if (candidate.filePath !== null && typeof candidate.filePath !== 'string') {
      return [];
    }
    if (typeof candidate.tabId !== 'string' || candidate.tabId.trim() === '') {
      return [];
    }
    const lineNumber = Number.isFinite(candidate.lineNumber) ? Math.max(1, Math.floor(candidate.lineNumber ?? 1)) : 1;
    const column = Number.isFinite(candidate.column) ? Math.max(1, Math.floor(candidate.column ?? 1)) : 1;
    const filePath = typeof candidate.filePath === 'string' ? normalizeRecentFilePath(candidate.filePath) : null;
    const fileName = typeof candidate.fileName === 'string' && candidate.fileName.trim()
      ? candidate.fileName.trim()
      : filePath ? path.basename(filePath) : '未命名.md';
    const normalized: MarkdownBookmark = {
      id: typeof candidate.id === 'string' && candidate.id.trim()
        ? candidate.id
        : `bookmark:${candidate.tabId}:${lineNumber}:${column}`,
      tabId: candidate.tabId,
      filePath,
      fileName,
      lineNumber,
      column,
      excerpt: typeof candidate.excerpt === 'string' ? candidate.excerpt : '',
      createdAt: typeof candidate.createdAt === 'number' ? candidate.createdAt : Date.now(),
      updatedAt: typeof candidate.updatedAt === 'number' ? candidate.updatedAt : Date.now(),
    };
    const key = bookmarkTargetKey(normalized);
    if (seen.has(key)) {
      return [];
    }
    seen.add(key);
    return [normalized];
  }).slice(0, 500);
}

function normalizeRecentFilePath(filePath: string): string {
  let normalized = filePath.trim();
  if (!normalized) {
    return '';
  }
  if (normalized.startsWith('file://')) {
    try {
      normalized = fileURLToPath(normalized);
    } catch {
      // Keep the original value when it is not a valid file URL.
    }
  }

  return path.resolve(normalized);
}

function recentFileDuplicateBasenameGroups(recentFiles: string[]): { name: string; paths: string[] }[] {
  const groups = new Map<string, { name: string; paths: string[] }>();
  recentFiles.forEach((filePath) => {
    const name = path.basename(filePath);
    const key = name.toLocaleLowerCase();
    const group = groups.get(key) ?? { name, paths: [] };
    group.paths.push(filePath);
    groups.set(key, group);
  });
  return Array.from(groups.values()).filter((group) => group.paths.length > 1);
}

function logRecentFilesDiagnostics(source: string, originalRecentFiles: unknown, normalizedRecentFiles: string[]): void {
  const originalStringRecentFiles = Array.isArray(originalRecentFiles)
    ? originalRecentFiles.filter((filePath): filePath is string => typeof filePath === 'string')
    : [];
  const duplicateBasenameGroups = recentFileDuplicateBasenameGroups(normalizedRecentFiles);
  const normalizedChanged = JSON.stringify(originalStringRecentFiles) !== JSON.stringify(normalizedRecentFiles);
  if (!normalizedChanged && duplicateBasenameGroups.length === 0) {
    lastRecentFilesMainDiagnosticSignature = '';
    return;
  }

  const signature = JSON.stringify({ originalStringRecentFiles, normalizedRecentFiles, duplicateBasenameGroups });
  if (signature === lastRecentFilesMainDiagnosticSignature) {
    return;
  }
  lastRecentFilesMainDiagnosticSignature = signature;
  mainLog('recent-files.diagnostics', {
    source,
    originalCount: Array.isArray(originalRecentFiles) ? originalRecentFiles.length : 0,
    originalStringCount: originalStringRecentFiles.length,
    normalizedCount: normalizedRecentFiles.length,
    normalizedChanged,
    duplicateBasenameGroups,
  });
}

function tabIdForPath(filePath: string): string {
  return `file:${filePath}`;
}

function normalizeScrollTop(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) : fallback;
}

function normalizeSessionTabs(tabs: unknown): MarkdownSession['tabs'] {
  if (!Array.isArray(tabs)) {
    return [];
  }

  const seen = new Set<string>();
  return tabs.flatMap((tab): MarkdownSession['tabs'] => {
    if (!tab || typeof tab !== 'object') {
      return [];
    }
    const candidate = tab as Partial<MarkdownSession['tabs'][number]>;
    if (candidate.filePath !== null && typeof candidate.filePath !== 'string') {
      return [];
    }
    const id = typeof candidate.id === 'string'
      ? candidate.id
      : candidate.filePath ? tabIdForPath(candidate.filePath) : `draft:${candidate.name ?? 'untitled'}`;
    if (seen.has(id)) {
      return [];
    }
    seen.add(id);
    const fallbackName = candidate.filePath ? path.basename(candidate.filePath) : '未命名.md';
    const scrollTop = normalizeScrollTop(candidate.scrollTop);
    return [{
      id,
      filePath: candidate.filePath ?? null,
      name: typeof candidate.name === 'string' ? candidate.name : fallbackName,
      scrollTop,
      editorScrollTop: normalizeScrollTop(candidate.editorScrollTop, scrollTop),
      previewScrollTop: normalizeScrollTop(candidate.previewScrollTop, scrollTop),
      tocScrollTop: normalizeScrollTop(candidate.tocScrollTop),
      content: typeof candidate.content === 'string' ? candidate.content : undefined,
      lastSavedContent: typeof candidate.lastSavedContent === 'string' ? candidate.lastSavedContent : undefined,
      encoding: normalizeTextEncoding(candidate.encoding),
    }];
  });
}

function sessionFilePath(): string {
  return path.join(app.getPath('userData'), 'markdown-session.json');
}

function normalizeParsedSession(parsed: Partial<MarkdownSession>): MarkdownSession {
  const filePath = typeof parsed.filePath === 'string' ? normalizeRecentFilePath(parsed.filePath) : null;
  const tabs = normalizeSessionTabs(parsed.tabs);
  const recentFiles = normalizeRecentFiles(parsed.recentFiles);
  const recoveredRecentFiles = recentFiles.length === 0 && filePath ? normalizeRecentFiles([filePath]) : recentFiles;
  logRecentFilesDiagnostics('read-session', parsed.recentFiles, recoveredRecentFiles);
  return {
    filePath,
    tabs,
    activeTabId: typeof parsed.activeTabId === 'string' && tabs.some((tab) => tab.id === parsed.activeTabId)
      ? parsed.activeTabId
      : tabs[0]?.id ?? null,
    bookmarks: normalizeBookmarks(parsed.bookmarks),
    bookmarkViewMode: normalizeBookmarkViewMode(parsed.bookmarkViewMode),
    recentFiles: recoveredRecentFiles,
    fileScrollPositions: normalizeFileScrollPositions(parsed.fileScrollPositions),
    scrollTop: typeof parsed.scrollTop === 'number' ? parsed.scrollTop : 0,
    tocWidth: typeof parsed.tocWidth === 'number' ? parsed.tocWidth : 260,
    editorWidth: typeof parsed.editorWidth === 'number' ? parsed.editorWidth : 560,
    previewHidden: parsed.previewHidden === true,
    editorVisible: parsed.editorVisible === true,
    theme: normalizeTheme(parsed.theme),
  };
}

function sessionHasRestorableData(session: MarkdownSession): boolean {
  return Boolean(session.filePath)
    || session.tabs.length > 0
    || session.recentFiles.length > 0
    || session.bookmarks.length > 0
    || session.fileScrollPositions.length > 0;
}

function sessionCanUseLegacyFallback(session: MarkdownSession): boolean {
  return !sessionHasRestorableData(session) && session.scrollTop === 0;
}

async function readLegacySessionFallback(currentSession: MarkdownSession): Promise<MarkdownSession> {
  if (!sessionCanUseLegacyFallback(currentSession)) {
    return currentSession;
  }

  const currentSessionPath = sessionFilePath();
  for (const userDataName of legacySessionUserDataNames) {
    const legacySessionPath = path.join(app.getPath('appData'), userDataName, 'markdown-session.json');
    if (legacySessionPath === currentSessionPath) {
      continue;
    }
    try {
      const raw = await fs.readFile(legacySessionPath, 'utf8');
      const legacySession = normalizeParsedSession(JSON.parse(raw) as Partial<MarkdownSession>);
      if (!sessionHasRestorableData(legacySession)) {
        continue;
      }
      mainLog('session.legacy-fallback.loaded', {
        legacySessionPath,
        restoredFilePath: legacySession.filePath,
        tabCount: legacySession.tabs.length,
        recentFileCount: legacySession.recentFiles.length,
      });
      return legacySession;
    } catch {
      // Missing or invalid legacy sessions are expected on fresh installs.
    }
  }

  return currentSession;
}

async function readSession(): Promise<MarkdownSession> {
  try {
    const raw = await fs.readFile(sessionFilePath(), 'utf8');
    const parsed = JSON.parse(raw) as Partial<MarkdownSession>;
    return readLegacySessionFallback(normalizeParsedSession(parsed));
  } catch {
    return readLegacySessionFallback(createDefaultSession());
  }
}

async function saveSession(session: MarkdownSession): Promise<void> {
  await fs.mkdir(path.dirname(sessionFilePath()), { recursive: true });
  const recentFiles = normalizeRecentFiles(session.recentFiles);
  const bookmarks = normalizeBookmarks(session.bookmarks);
  const fileScrollPositions = normalizeFileScrollPositions(session.fileScrollPositions);
  logRecentFilesDiagnostics('save-session', session.recentFiles, recentFiles);
  await fs.writeFile(sessionFilePath(), JSON.stringify({
    ...session,
    bookmarks,
    bookmarkViewMode: normalizeBookmarkViewMode(session.bookmarkViewMode),
    recentFiles,
    fileScrollPositions,
  }, null, 2), 'utf8');
}

function saveSessionSync(session: MarkdownSession): void {
  fsSync.mkdirSync(path.dirname(sessionFilePath()), { recursive: true });
  const recentFiles = normalizeRecentFiles(session.recentFiles);
  const bookmarks = normalizeBookmarks(session.bookmarks);
  const fileScrollPositions = normalizeFileScrollPositions(session.fileScrollPositions);
  logRecentFilesDiagnostics('save-session-sync', session.recentFiles, recentFiles);
  fsSync.writeFileSync(sessionFilePath(), JSON.stringify({
    ...session,
    bookmarks,
    bookmarkViewMode: normalizeBookmarkViewMode(session.bookmarkViewMode),
    recentFiles,
    fileScrollPositions,
  }, null, 2), 'utf8');
}

function isSupportedDocumentPath(filePath: string): boolean {
  return supportedDocumentExtensions.includes(path.extname(filePath).slice(1).toLowerCase());
}

function markdownPathFromLaunchValue(value: string): string | null {
  try {
    const filePath = value.startsWith('file://') ? fileURLToPath(value) : value;
    return isSupportedDocumentPath(filePath) ? path.resolve(filePath) : null;
  } catch {
    return null;
  }
}

function markdownBaseName(markdownPath: string): string {
  return path.basename(markdownPath, path.extname(markdownPath));
}

function markdownAssetDir(markdownPath: string): string {
  return path.join(path.dirname(markdownPath), 'assets', 'images');
}

function htmlPreviewMimeType(filePath: string): string {
  return htmlPreviewMimeTypes.get(path.extname(filePath).toLowerCase()) ?? 'application/octet-stream';
}

function pruneHtmlPreviewEntries(): void {
  while (htmlPreviewEntries.size > htmlPreviewMaxEntries) {
    const oldest = Array.from(htmlPreviewEntries.entries())
      .sort((first, second) => first[1].createdAt - second[1].createdAt)[0];
    if (!oldest) {
      return;
    }
    htmlPreviewEntries.delete(oldest[0]);
  }
}

function htmlPreviewEntryFromRequest(requestUrl: URL, referer?: string): HtmlPreviewEntry | null {
  const directId = requestUrl.searchParams.get(htmlPreviewIdSearchParam);
  const queryEntry = directId ? htmlPreviewEntries.get(directId) : null;
  if (queryEntry) {
    return queryEntry;
  }

  const match = requestUrl.pathname.match(/^\/preview\/([^/]+)(?:\/.*)?$/);
  const directEntry = match ? htmlPreviewEntries.get(match[1]) : null;
  if (directEntry) {
    return directEntry;
  }

  if (!referer) {
    return null;
  }

  try {
    const refererUrl = new URL(referer);
    const refererId = refererUrl.searchParams.get(htmlPreviewIdSearchParam);
    const refererQueryEntry = refererId ? htmlPreviewEntries.get(refererId) : null;
    if (refererQueryEntry) {
      return refererQueryEntry;
    }

    const refererMatch = refererUrl.pathname.match(/^\/preview\/([^/]+)(?:\/.*)?$/);
    return refererMatch ? htmlPreviewEntries.get(refererMatch[1]) ?? null : null;
  } catch {
    return null;
  }
}

function htmlPreviewRelativePath(requestUrl: URL): string | null | undefined {
  if (requestUrl.searchParams.has(htmlPreviewIdSearchParam) && requestUrl.pathname === '/') {
    return null;
  }

  const previewMatch = requestUrl.pathname.match(/^\/preview\/[^/]+\/?(.*)$/);
  const rawPath = previewMatch ? previewMatch[1] : requestUrl.pathname.replace(/^\/+/, '');
  let decodedPath = '';
  try {
    decodedPath = decodeURIComponent(rawPath);
  } catch {
    return undefined;
  }
  if (!decodedPath || decodedPath === 'index.html') {
    return null;
  }
  return decodedPath;
}

function htmlPreviewStaticPath(entry: HtmlPreviewEntry, relativePath: string): string | null {
  if (!entry.baseDir) {
    return null;
  }

  const resolved = path.resolve(entry.baseDir, relativePath);
  const baseDir = path.resolve(entry.baseDir);
  if (resolved !== baseDir && !resolved.startsWith(`${baseDir}${path.sep}`)) {
    return null;
  }
  return resolved;
}

function sendHtmlPreviewResponse(response: http.ServerResponse, statusCode: number, body: string | Buffer, contentType: string): void {
  response.writeHead(statusCode, {
    'Cache-Control': 'no-store',
    'Content-Type': contentType,
  });
  response.end(body);
}

function injectHtmlPreviewScrollStyles(content: string): string {
  const style = [
    '<style data-markdown-preview-scroll>',
    'html,body{min-height:100%;overflow:auto!important;scrollbar-gutter:stable;}',
    'html::-webkit-scrollbar,body::-webkit-scrollbar{display:block!important;width:12px!important;height:12px!important;}',
    'html::-webkit-scrollbar-thumb,body::-webkit-scrollbar-thumb{background:rgba(100,116,139,.55)!important;border:3px solid transparent!important;border-radius:999px!important;background-clip:content-box!important;}',
    'html::-webkit-scrollbar-track,body::-webkit-scrollbar-track{background:transparent!important;}',
    '</style>',
  ].join('');
  if (/<\/head>/i.test(content)) {
    return content.replace(/<\/head>/i, `${style}</head>`);
  }
  return `${style}${content}`;
}

function handleHtmlPreviewRequest(request: http.IncomingMessage, response: http.ServerResponse): void {
  if (!request.url) {
    sendHtmlPreviewResponse(response, 400, 'Bad Request', 'text/plain; charset=utf-8');
    return;
  }

  const requestUrl = new URL(request.url, `http://${request.headers.host ?? '127.0.0.1'}`);
  const entry = htmlPreviewEntryFromRequest(requestUrl, request.headers.referer);
  if (!entry) {
    sendHtmlPreviewResponse(response, 404, 'Preview not found', 'text/plain; charset=utf-8');
    return;
  }

  const relativePath = htmlPreviewRelativePath(requestUrl);
  if (relativePath === undefined) {
    sendHtmlPreviewResponse(response, 400, 'Bad Request', 'text/plain; charset=utf-8');
    return;
  }

  if (!relativePath) {
    sendHtmlPreviewResponse(response, 200, injectHtmlPreviewScrollStyles(entry.content), 'text/html; charset=utf-8');
    return;
  }

  const staticPath = htmlPreviewStaticPath(entry, relativePath);
  if (!staticPath) {
    sendHtmlPreviewResponse(response, 403, 'Forbidden', 'text/plain; charset=utf-8');
    return;
  }

  fsSync.readFile(staticPath, (error, data) => {
    if (error) {
      sendHtmlPreviewResponse(response, 404, 'Not found', 'text/plain; charset=utf-8');
      return;
    }
    sendHtmlPreviewResponse(response, 200, data, htmlPreviewMimeType(staticPath));
  });
}

async function ensureHtmlPreviewServer(): Promise<number> {
  if (htmlPreviewServerPort !== null) {
    return htmlPreviewServerPort;
  }

  htmlPreviewServer = http.createServer(handleHtmlPreviewRequest);
  await new Promise<void>((resolve, reject) => {
    htmlPreviewServer?.once('error', reject);
    htmlPreviewServer?.listen(0, '127.0.0.1', () => resolve());
  });
  const address = htmlPreviewServer.address();
  if (!address || typeof address === 'string') {
    throw new Error('Unable to start HTML preview server.');
  }
  htmlPreviewServerPort = address.port;
  return htmlPreviewServerPort;
}

async function htmlPreviewUrl(payload: HtmlPreviewPayload): Promise<string> {
  const port = await ensureHtmlPreviewServer();
  const id = `${Date.now()}-${htmlPreviewCounter++}`;
  htmlPreviewEntries.set(id, {
    baseDir: payload.filePath ? path.dirname(path.resolve(payload.filePath)) : null,
    content: payload.content,
    createdAt: Date.now(),
  });
  pruneHtmlPreviewEntries();
  return `http://127.0.0.1:${port}/?${htmlPreviewIdSearchParam}=${encodeURIComponent(id)}`;
}

function isAppNavigationUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (isDev) {
      return parsed.origin === new URL(devServerUrl).origin;
    }
    return parsed.protocol === 'file:' && fileURLToPath(parsed) === path.join(__dirname, '../dist/index.html');
  } catch {
    return false;
  }
}

function resolveExternalLinkUrl(linkUrl: string, baseMarkdownPath?: string | null): URL | null {
  const trimmed = linkUrl.trim();
  if (!trimmed || trimmed.startsWith('#')) {
    return null;
  }

  try {
    const parsed = new URL(trimmed);
    return externalUrlProtocols.has(parsed.protocol) || parsed.protocol === 'file:' ? parsed : null;
  } catch {
    if (!baseMarkdownPath) {
      return null;
    }
  }

  try {
    const baseDirUrl = pathToFileURL(`${path.dirname(baseMarkdownPath)}${path.sep}`);
    return new URL(trimmed, baseDirUrl);
  } catch {
    return null;
  }
}

async function openLinkOutsideApp(linkUrl: string, baseMarkdownPath?: string | null): Promise<boolean> {
  const parsed = resolveExternalLinkUrl(linkUrl, baseMarkdownPath);
  if (!parsed) {
    return false;
  }

  if (externalUrlProtocols.has(parsed.protocol)) {
    await shell.openExternal(parsed.toString());
    return true;
  }

  if (parsed.protocol === 'file:') {
    await shell.openPath(fileURLToPath(parsed));
    return true;
  }

  return false;
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
  if (/^\d{13}$/.test(base)) {
    return sanitized;
  }
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

function imageExtensionFromFileName(fileName: string, mimeType: string): string {
  const extension = path.extname(fileName).toLowerCase();
  return imageAssetExtensions.has(extension) ? extension : imageExtensionFromMime(mimeType);
}

function cloudTempDir(): string {
  return process.platform === 'win32' ? app.getPath('temp') : '/tmp';
}

async function uniqueTempImagePath(fileName: string, mimeType: string): Promise<string> {
  const extension = imageExtensionFromFileName(fileName, mimeType);
  let timestamp = Date.now();
  for (;;) {
    const candidate = path.join(cloudTempDir(), `${timestamp}${extension}`);
    try {
      await fs.access(candidate);
      timestamp += 1;
    } catch {
      return candidate;
    }
  }
}

function assetPathFromRelative(markdownPath: string, relativePath: string): string {
  const resolved = path.resolve(path.dirname(markdownPath), relativePath);
  const assetDir = path.resolve(markdownAssetDir(markdownPath));
  if (!resolved.startsWith(`${assetDir}${path.sep}`)) {
    throw new Error('Asset path is outside the document asset directory.');
  }
  return resolved;
}

async function readMarkdownFile(filePath: string, encoding?: unknown): Promise<MarkdownFile> {
  const resolvedPath = path.resolve(filePath);
  if (!isSupportedDocumentPath(resolvedPath)) {
    throw new Error('Only Markdown, HTML, text, and JSON files can be opened.');
  }

  const canonicalPath = await fs.realpath(resolvedPath).catch(() => resolvedPath);
  const [data, stat] = await Promise.all([
    fs.readFile(canonicalPath),
    fs.stat(canonicalPath),
  ]);
  const decoded = decodeTextBuffer(data, encoding);
  const file = {
    path: canonicalPath,
    name: path.basename(canonicalPath),
    content: decoded.content,
    encoding: decoded.encoding,
    size: stat.size,
    modifiedAt: stat.mtimeMs,
  };
  markdownFileEncodings.set(canonicalPath, decoded.encoding);
  watchMarkdownFile(canonicalPath);
  return file;
}

function sendMarkdownFileChanged(filePath: string): void {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }

  void Promise.all([fs.readFile(filePath), fs.stat(filePath)])
    .then(([data, stat]) => {
      const decoded = decodeTextBuffer(data, markdownFileEncodings.get(filePath) ?? defaultTextEncoding);
      mainWindow?.webContents.send('markdown:file-changed', {
        path: filePath,
        name: path.basename(filePath),
        content: decoded.content,
        encoding: decoded.encoding,
        size: stat.size,
        modifiedAt: stat.mtimeMs,
      } satisfies MarkdownFile);
    })
    .catch(() => {
      closeMarkdownWatcher(filePath);
    });
}

function scheduleMarkdownFileChanged(filePath: string): void {
  const previousTimer = markdownChangeTimers.get(filePath);
  if (previousTimer) {
    clearTimeout(previousTimer);
  }

  markdownChangeTimers.set(filePath, setTimeout(() => {
    markdownChangeTimers.delete(filePath);
    sendMarkdownFileChanged(filePath);
  }, 120));
}

function closeMarkdownWatcher(filePath: string): void {
  const timer = markdownChangeTimers.get(filePath);
  if (timer) {
    clearTimeout(timer);
    markdownChangeTimers.delete(filePath);
  }

  watchedMarkdownFiles.get(filePath)?.close();
  watchedMarkdownFiles.delete(filePath);
  markdownFileEncodings.delete(filePath);
}

function watchMarkdownFile(filePath: string): void {
  if (watchedMarkdownFiles.has(filePath)) {
    return;
  }

  try {
    const watcher = fsSync.watch(filePath, (eventType) => {
      if (eventType === 'change' || eventType === 'rename') {
        scheduleMarkdownFileChanged(filePath);
      }
    });
    watcher.on('error', () => closeMarkdownWatcher(filePath));
    watchedMarkdownFiles.set(filePath, watcher);
  } catch {
    // Some filesystems do not support fs.watch; opening still works without live refresh.
  }
}

function markdownPathFromArgv(argv: string[]): string | null {
  for (const arg of argv) {
    if (arg.startsWith('-')) {
      continue;
    }

    const filePath = markdownPathFromLaunchValue(arg);
    if (filePath) {
      return filePath;
    }
  }

  return null;
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
  if (!rendererReadyForExternalOpen) {
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
    dialog.showErrorBox(appTitle, `无法打开文档：${filePath}`);
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

async function saveMarkdownFileAs(content: string, defaultName: string, encoding?: unknown): Promise<MarkdownFile | null> {
  const result = await dialog.showSaveDialog({
    defaultPath: defaultName || '未命名.md',
    filters: [
      { name: 'Supported Documents', extensions: supportedDocumentExtensions },
      { name: 'Markdown', extensions: ['md', 'markdown', 'mdown'] },
      { name: 'HTML', extensions: ['html', 'htm'] },
      { name: 'Text', extensions: ['txt', 'text'] },
      { name: 'JSON', extensions: ['json'] },
    ],
  });

  if (result.canceled || !result.filePath) {
    return null;
  }

  const normalizedEncoding = normalizeTextEncoding(encoding);
  await fs.writeFile(result.filePath, encodeTextBuffer(content, normalizedEncoding));
  return readMarkdownFile(result.filePath, normalizedEncoding);
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

async function saveTempImageAsset(fileName: string, data: ArrayBuffer | Uint8Array, mimeType: string): Promise<TempImageAsset> {
  const targetPath = await uniqueTempImagePath(fileName, mimeType);
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  await fs.writeFile(targetPath, data instanceof ArrayBuffer ? Buffer.from(new Uint8Array(data)) : Buffer.from(data));
  const stat = await fs.stat(targetPath);
  return {
    name: path.basename(targetPath),
    absolutePath: targetPath,
    size: stat.size,
    mimeType: mimeType || imageMimeTypes.get(path.extname(targetPath).toLowerCase()) || 'image/png',
  };
}

function sanitizeCloudFileName(fileName: string): string {
  const extension = path.extname(fileName).toLowerCase();
  const base = path.basename(fileName, extension)
    .replace(/[^\p{L}\p{N}._-]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120) || 'image';
  return `${base}${extension}`;
}

function uploadFileName(payload: CloudImageUploadRequest): string {
  const originalName = path.basename(payload.filePath);
  const originalExtension = path.extname(originalName).toLowerCase();
  const requestedName = payload.linkName?.trim();
  if (!requestedName) {
    return originalName;
  }

  const requestedExtension = path.extname(requestedName).toLowerCase();
  return sanitizeCloudFileName(requestedExtension ? requestedName : `${requestedName}${originalExtension || '.png'}`);
}

function normalizeCloudAppId(appId: string): string {
  const normalized = appId.trim();
  if (!/^[\w.-]+$/.test(normalized)) {
    throw new Error('appId 只能包含字母、数字、点、下划线和连字符。');
  }
  return normalized;
}

function normalizeCloudSubDir(subDir: string): string {
  const normalized = subDir.trim().replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
  const parts = normalized.split('/').filter(Boolean);
  if (parts.some((part) => part === '.' || part === '..')) {
    throw new Error('subDir 不能包含 . 或 .. 路径片段。');
  }
  return parts.join('/');
}

function cloudResourcePath(appId: string, subDir: string, fileName: string): string {
  return ['apps', appId, subDir, fileName].filter(Boolean).join('/');
}

function readPfSessionTokenFromShell(): string | null {
  const shells = Array.from(new Set([process.env.SHELL, '/bin/zsh'].filter((shell): shell is string => Boolean(shell))));
  const startMarker = '__MARKDOWN_EDITOR_PF_SESSION_TOKEN_START__';
  const endMarker = '__MARKDOWN_EDITOR_PF_SESSION_TOKEN_END__';
  const printTokenScript = `printf '\\n${startMarker}%s${endMarker}\\n' "$PF_SESSION_TOKEN"`;

  for (const shell of shells) {
    try {
      const output = execFileSync(shell, ['-ic', printTokenScript], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
        timeout: 3000,
      });
      const token = output.match(new RegExp(`${startMarker}([\\s\\S]*?)${endMarker}`))?.[1]?.trim();
      if (token) {
        return token;
      }
    } catch {
      // GUI-launched Electron apps may not inherit shell env; this fallback is best-effort.
    }
  }

  return null;
}

function pfSessionToken(): string | null {
  return process.env.PF_SESSION_TOKEN?.trim() || readPfSessionTokenFromShell();
}

function bearerAuthorizationHeader(): string {
  const token = pfSessionToken();
  if (!token) {
    throw new Error('缺少 PF_SESSION_TOKEN 环境变量，且无法从 shell 配置读取，无法上传云端图片。');
  }
  return token.toLowerCase().startsWith('bearer ') ? token : `Bearer ${token}`;
}

function escapeMultipartHeader(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/[\r\n]/g, ' ');
}

function multipartUploadBody(fileName: string, mimeType: string, dir: string, fileData: Buffer): { body: Buffer; boundary: string } {
  const boundary = `----markdown-editor-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const chunks = [
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="dir"\r\n\r\n${dir}\r\n`),
    Buffer.from(
      `--${boundary}\r\n`
      + `Content-Disposition: form-data; name="files"; filename="${escapeMultipartHeader(fileName)}"\r\n`
      + `Content-Type: ${mimeType || 'application/octet-stream'}\r\n\r\n`,
    ),
    fileData,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ];
  return { body: Buffer.concat(chunks), boundary };
}

async function readJsonResponse(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`云端图片接口请求失败：${response.status} ${text.slice(0, 300)}`);
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function extractUrlFromJson(value: unknown): string | null {
  if (typeof value === 'string') {
    return /^https?:\/\//i.test(value) ? value : null;
  }
  if (!value || typeof value !== 'object') {
    return null;
  }

  const record = value as Record<string, unknown>;
  for (const key of ['url', 'cdnUrl', 'ossUrl', 'resourceUrl', 'fileUrl', 'downloadUrl']) {
    const found = extractUrlFromJson(record[key]);
    if (found) {
      return found;
    }
  }
  for (const item of Object.values(record)) {
    const found = extractUrlFromJson(item);
    if (found) {
      return found;
    }
  }
  return null;
}

async function uploadCloudImage(payload: CloudImageUploadRequest): Promise<CloudImageUploadResult> {
  const appId = normalizeCloudAppId(payload.appId);
  const subDir = normalizeCloudSubDir(payload.subDir);
  const filePath = path.resolve(payload.filePath);
  const fileName = uploadFileName({ ...payload, filePath });
  const extension = path.extname(fileName).toLowerCase();
  const mimeType = imageMimeTypes.get(extension) ?? 'application/octet-stream';
  const resourcePath = cloudResourcePath(appId, subDir, fileName);
  const { body, boundary } = multipartUploadBody(fileName, mimeType, `/${path.posix.dirname(resourcePath)}`, await fs.readFile(filePath));
  const authorization = bearerAuthorizationHeader();

  await readJsonResponse(await fetch(`${cloudUploadBaseUrl}/upload`, {
    method: 'POST',
    headers: {
      authorization,
      'content-type': `multipart/form-data; boundary=${boundary}`,
    },
    body: new Uint8Array(body),
  }));

  const detailUrl = new URL(`${cloudUploadBaseUrl}/detail`);
  detailUrl.searchParams.set('path', resourcePath);
  const detail = await readJsonResponse(await fetch(detailUrl, {
    headers: { authorization },
  }));
  const url = extractUrlFromJson(detail);
  if (!url) {
    throw new Error('上传成功，但资源详情接口没有返回可用图片链接。');
  }

  return {
    url,
    path: resourcePath,
    uploadedName: fileName,
    localPath: filePath,
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
    show: false,
    title: appTitle,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.js'),
    },
  });
  mainWindow = window;
  rendererReadyForExternalOpen = false;
  window.once('ready-to-show', () => {
    if (window.isDestroyed()) {
      return;
    }
    window.maximize();
    window.show();
  });
  window.on('closed', () => {
    mainLog('window.closed');
    if (mainWindow === window) {
      mainWindow = null;
    }
  });
  window.on('close', (event) => {
    mainLog('window.close-requested', {
      closeConfirmed,
      isDestroyed: window.isDestroyed(),
    });
    if (closeConfirmed) {
      return;
    }

    event.preventDefault();
    mainLog('window.close-forward-to-renderer');
    window.webContents.send('app:close-request');
  });
  window.webContents.on('before-input-event', (event, input) => {
    if (
      input.type === 'keyDown'
      && input.key.toLowerCase() === 'i'
      && (input.meta || input.control)
      && input.alt
      && !input.shift
    ) {
      mainLog('devtools.shortcut-toggle', {
        isDev,
        isDevToolsOpened: window.webContents.isDevToolsOpened(),
      });
      event.preventDefault();
      window.webContents.toggleDevTools();
      return;
    }
    if (
      input.type === 'keyDown'
      && input.key.toLowerCase() === 'e'
      && (input.meta || input.control)
      && !input.alt
    ) {
      event.preventDefault();
      window.webContents.send('markdown:toggle-editor-shortcut');
    }
  });
  window.webContents.setWindowOpenHandler(({ url }) => {
    void openLinkOutsideApp(url);
    return { action: 'deny' };
  });
  window.webContents.on('will-navigate', (event, url) => {
    if (isAppNavigationUrl(url)) {
      return;
    }

    event.preventDefault();
    void openLinkOutsideApp(url);
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
    filters: [
      { name: 'Supported Documents', extensions: supportedDocumentExtensions },
      { name: 'Markdown', extensions: ['md', 'markdown', 'mdown'] },
      { name: 'HTML', extensions: ['html', 'htm'] },
      { name: 'Text', extensions: ['txt', 'text'] },
      { name: 'JSON', extensions: ['json'] },
    ],
  });

  if (result.canceled || !result.filePaths[0]) {
    return null;
  }

  const file = await readMarkdownFile(result.filePaths[0]);
  await saveSession({ ...(await readSession()), filePath: file.path, scrollTop: 0 });
  return file;
});

ipcMain.handle('markdown:take-launch-file', async () => {
  const filePath = pendingExternalMarkdownPath
    ?? (launchMarkdownPathConsumed ? null : markdownPathFromArgv(process.argv));
  launchMarkdownPathConsumed = true;

  if (!filePath) {
    return null;
  }

  pendingExternalMarkdownPath = null;
  return createOpenRequest(filePath, true);
});

ipcMain.handle('markdown:ready-for-external-open', async () => {
  rendererReadyForExternalOpen = true;
  if (pendingExternalMarkdownPath) {
    await dispatchExternalMarkdownPath(pendingExternalMarkdownPath);
  }
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

ipcMain.handle('markdown:read-path', async (_event, filePath: string, encoding?: string) => {
  return readMarkdownFile(filePath, encoding);
});

ipcMain.handle('markdown:save', async (_event, filePath: string, content: string, encoding?: string) => {
  const normalizedEncoding = normalizeTextEncoding(encoding);
  await fs.writeFile(filePath, encodeTextBuffer(content, normalizedEncoding));
  return readMarkdownFile(filePath, normalizedEncoding);
});

ipcMain.handle('markdown:save-as', async (_event, content: string, defaultName: string, encoding?: string) => {
  return saveMarkdownFileAs(content, defaultName, encoding);
});

ipcMain.handle('markdown:reveal-in-folder', async (_event, filePath: string) => {
  shell.showItemInFolder(path.resolve(filePath));
});

ipcMain.handle('app:open-external-link', async (_event, linkUrl: string, baseMarkdownPath?: string | null) => {
  return openLinkOutsideApp(linkUrl, baseMarkdownPath);
});

ipcMain.handle('html-preview:url', async (_event, payload: HtmlPreviewPayload) => {
  return htmlPreviewUrl(payload);
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

ipcMain.handle('asset:save-temp-image', async (_event, fileName: string, data: ArrayBuffer, mimeType: string) => {
  return saveTempImageAsset(fileName, data, mimeType);
});

ipcMain.handle('asset:upload-cloud-image', async (_event, payload: CloudImageUploadRequest) => {
  return uploadCloudImage(payload);
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

ipcMain.on('session:save-sync', (event, session: MarkdownSession) => {
  saveSessionSync(session);
  event.returnValue = true;
});

ipcMain.handle('app:quit', () => {
  mainLog('app.quit-requested');
  app.quit();
});

function confirmApplicationClose(): void {
  mainLog('app.confirm-close', {
    hasMainWindow: Boolean(mainWindow),
    closeConfirmed,
  });
  closeConfirmed = true;
  setImmediate(() => {
    mainLog('app.confirm-close.execute', {
      hasMainWindow: Boolean(mainWindow),
      closeConfirmed,
    });
    mainWindow?.close();
  });
}

ipcMain.handle('app:confirm-close', () => {
  mainLog('ipc.app.confirm-close');
  confirmApplicationClose();
});

ipcMain.on('app:confirm-close-sync', (event) => {
  mainLog('ipc.app.confirm-close-sync');
  confirmApplicationClose();
  event.returnValue = true;
});

ipcMain.on('app:read-clipboard-sync', (event) => {
  try {
    event.returnValue = {
      formats: clipboard.availableFormats(),
      html: clipboard.readHTML(),
      text: clipboard.readText(),
    };
  } catch (error) {
    mainLog('ipc.app.read-clipboard-sync.failed', {
      message: error instanceof Error ? error.message : String(error),
    });
    event.returnValue = { formats: [], html: '', text: '' };
  }
});

ipcMain.handle('app:debug-log', (_event, eventName: string, payload: Record<string, unknown> = {}) => {
  mainLog(`renderer.${eventName}`, payload);
});

app.on('open-file', (event, filePath) => {
  event.preventDefault();
  const markdownPath = markdownPathFromLaunchValue(filePath);
  if (!markdownPath) {
    return;
  }
  void dispatchExternalMarkdownPath(markdownPath);
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
  buildApplicationMenu();
  registerMarkdownAssetProtocol();
  pendingExternalMarkdownPath = pendingExternalMarkdownPath ?? markdownPathFromArgv(process.argv);
  await createWindow();
});

app.on('window-all-closed', () => {
  app.quit();
});

app.on('before-quit', () => {
  Array.from(watchedMarkdownFiles.keys()).forEach(closeMarkdownWatcher);
  htmlPreviewServer?.close();
  htmlPreviewServer = null;
  htmlPreviewServerPort = null;
  htmlPreviewEntries.clear();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    void createWindow();
  }
});
