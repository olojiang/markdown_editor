declare module '*.vue' {
  import type { DefineComponent } from 'vue';

  const component: DefineComponent<Record<string, unknown>, Record<string, unknown>, unknown>;
  export default component;
}

declare const __APP_VERSION__: string;

interface MarkdownFile {
  path: string | null;
  name: string;
  content: string;
  encoding?: string;
}

interface MarkdownOpenRequest {
  file: MarkdownFile;
  external: boolean;
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

interface MarkdownSession {
  filePath: string | null;
  tabs: {
    id: string;
    filePath: string | null;
    name: string;
      scrollTop: number;
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
  scrollTop: number;
  tocWidth: number;
  editorWidth: number;
  previewHidden: boolean;
  editorVisible: boolean;
  editorPreferences?: {
    vimEnabled: boolean;
    configText: string;
  };
  theme: 'light' | 'dark' | 'eye';
}

interface ExportDocumentPayload {
  markdownPath: string;
  title: string;
  bodyHtml: string;
  theme: 'light' | 'dark' | 'eye';
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

interface CloudImageUploadPayload {
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

interface MarkdownBridge {
  openMarkdownFile(): Promise<MarkdownFile | null>;
  takeLaunchMarkdownFile(): Promise<MarkdownOpenRequest | null>;
  notifyReadyForExternalOpen(): Promise<void>;
  onExternalMarkdownFile(callback: (request: MarkdownOpenRequest) => void): () => void;
  onMarkdownFileChanged(callback: (file: MarkdownFile) => void): () => void;
  onToggleEditorShortcut(callback: () => void): () => void;
  onCloseRequest(callback: () => void): () => void;
  onAppMenuCommand?(callback: (command: AppMenuCommand) => void): () => void;
  readLastMarkdownFile(): Promise<MarkdownFile | null>;
  readMarkdownFile(path: string, encoding?: string): Promise<MarkdownFile>;
  getPathForFile(file: File): string;
  saveMarkdownFile(path: string, content: string, encoding?: string): Promise<MarkdownFile>;
  saveMarkdownFileAs(content: string, defaultName: string, encoding?: string): Promise<MarkdownFile | null>;
  revealInFolder(path: string): Promise<void>;
  openExternalLink(url: string, baseMarkdownPath?: string | null): Promise<boolean>;
  htmlPreviewUrl(payload: { filePath: string | null; content: string }): Promise<string>;
  exportHtml(payload: ExportDocumentPayload): Promise<string | null>;
  exportPdf(payload: ExportDocumentPayload): Promise<string | null>;
  saveImageAsset(markdownPath: string, fileName: string, data: ArrayBuffer, mimeType: string): Promise<ImageAsset>;
  saveTempImageAsset(fileName: string, data: ArrayBuffer, mimeType: string): Promise<TempImageAsset>;
  uploadCloudImage(payload: CloudImageUploadPayload): Promise<CloudImageUploadResult>;
  importImageAsset(markdownPath: string): Promise<ImageAsset | null>;
  listImageAssets(markdownPath: string): Promise<ImageAsset[]>;
  deleteImageAsset(markdownPath: string, relativePath: string): Promise<ImageAsset[]>;
  assetUrl(markdownPath: string, relativePath: string): string;
  getSession(): Promise<Partial<MarkdownSession> | null | undefined>;
  saveSession(session: MarkdownSession): Promise<void>;
  saveSessionSync(session: MarkdownSession): boolean;
  quitApp(): Promise<void>;
  confirmClose(): Promise<void>;
  confirmCloseSync?(): boolean;
  debugLog?(event: string, payload?: Record<string, unknown>): Promise<void>;
}

interface Window {
  markdownBridge?: MarkdownBridge;
}
