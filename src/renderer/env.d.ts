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

interface MarkdownSession {
  filePath: string | null;
  scrollTop: number;
  tocWidth: number;
  editorWidth: number;
  previewHidden: boolean;
  editorVisible: boolean;
}

interface MarkdownBridge {
  openMarkdownFile(): Promise<MarkdownFile | null>;
  readLastMarkdownFile(): Promise<MarkdownFile | null>;
  saveMarkdownFile(path: string, content: string): Promise<MarkdownFile>;
  getSession(): Promise<MarkdownSession>;
  saveSession(session: MarkdownSession): Promise<void>;
}

interface Window {
  markdownBridge?: MarkdownBridge;
}
