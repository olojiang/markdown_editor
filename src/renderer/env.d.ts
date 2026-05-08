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
}

interface MarkdownOpenRequest {
  file: MarkdownFile;
  external: boolean;
}

interface MarkdownSession {
  filePath: string | null;
  tabs: {
    id: string;
    filePath: string | null;
    name: string;
    scrollTop: number;
    content?: string;
    lastSavedContent?: string;
  }[];
  activeTabId: string | null;
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
  readLastMarkdownFile(): Promise<MarkdownFile | null>;
  readMarkdownFile(path: string): Promise<MarkdownFile>;
  getPathForFile(file: File): string;
  saveMarkdownFile(path: string, content: string): Promise<MarkdownFile>;
  saveMarkdownFileAs(content: string, defaultName: string): Promise<MarkdownFile | null>;
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
}

interface Window {
  markdownBridge?: MarkdownBridge;
}
