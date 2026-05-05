declare module '*.vue' {
  import type { DefineComponent } from 'vue';

  const component: DefineComponent<Record<string, unknown>, Record<string, unknown>, unknown>;
  export default component;
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

interface MarkdownBridge {
  openMarkdownFile(): Promise<MarkdownFile | null>;
  takeLaunchMarkdownFile(): Promise<MarkdownOpenRequest | null>;
  onExternalMarkdownFile(callback: (request: MarkdownOpenRequest) => void): () => void;
  readLastMarkdownFile(): Promise<MarkdownFile | null>;
  readMarkdownFile(path: string): Promise<MarkdownFile>;
  getPathForFile(file: File): string;
  saveMarkdownFile(path: string, content: string): Promise<MarkdownFile>;
  exportHtml(payload: ExportDocumentPayload): Promise<string | null>;
  exportPdf(payload: ExportDocumentPayload): Promise<string | null>;
  saveImageAsset(markdownPath: string, fileName: string, data: ArrayBuffer, mimeType: string): Promise<ImageAsset>;
  importImageAsset(markdownPath: string): Promise<ImageAsset | null>;
  listImageAssets(markdownPath: string): Promise<ImageAsset[]>;
  deleteImageAsset(markdownPath: string, relativePath: string): Promise<ImageAsset[]>;
  assetUrl(markdownPath: string, relativePath: string): string;
  getSession(): Promise<MarkdownSession>;
  saveSession(session: MarkdownSession): Promise<void>;
}

interface Window {
  markdownBridge?: MarkdownBridge;
}
