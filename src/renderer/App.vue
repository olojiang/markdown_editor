<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue';
import TocTree from '@/renderer/components/TocTree.vue';
import {
  buildHeadingTree,
  filterHeadingTree,
  renderMarkdown,
  type HeadingNode,
} from '@/renderer/lib/markdown';
import {
  addRecentFile,
  createDefaultSession,
  mergeSession,
  normalizeSession,
  type MarkdownSession,
  type ThemeMode,
} from '@/renderer/lib/session';

interface MarkdownFile {
  path: string;
  name: string;
  content: string;
}

interface ScrollAnchor {
  line: number;
  top: number;
}

interface ActiveMermaidDiagram {
  container: HTMLElement;
  html: string;
  title: string;
}

type MermaidExportFormat = 'svg' | 'png' | 'webp';

const icons = {
  archive: 'M21 8v13H3V8 M1 3h22v5H1z M10 12h4',
  bookOpen: 'M2 4.5A3 3 0 0 1 5 3h5v18H5a3 3 0 0 0-3 3V4.5z M22 4.5A3 3 0 0 0 19 3h-5v18h5a3 3 0 0 1 3 3V4.5z',
  chevronDown: 'm6 9 6 6 6-6',
  chevronRight: 'm9 18 6-6-6-6',
  code: 'm16 18 6-6-6-6 M8 6l-6 6 6 6',
  columns: 'M3 5h18 M3 12h18 M3 19h18 M8 5v14 M16 5v14',
  download: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4 M7 10l5 5 5-5 M12 15V3',
  edit: 'M12 20h9 M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z',
  expand: 'M8 3H5a2 2 0 0 0-2 2v3 M16 3h3a2 2 0 0 1 2 2v3 M8 21H5a2 2 0 0 1-2-2v-3 M16 21h3a2 2 0 0 0 2-2v-3',
  externalLink: 'M15 3h6v6 M10 14 21 3 M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6',
  fileText: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6 M8 13h8 M8 17h8 M8 9h2',
  image: 'M21 19V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2z M8.5 11.5 11 14l2-2.5L17 16 M8 9h.01',
  link: 'M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71 M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71',
  moon: 'M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8z',
  open: 'M3 7h5l2 2h11v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z M3 7V5a2 2 0 0 1 2-2h4l2 2h4',
  refresh: 'M21 12a9 9 0 0 1-15 6.7L3 16 M3 21v-5h5 M3 12a9 9 0 0 1 15-6.7L21 8 M21 3v5h-5',
  replace: 'M3 7h11 M10 3l4 4-4 4 M21 17H10 M14 13l-4 4 4 4',
  save: 'M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z M17 21v-8H7v8 M7 3v5h8',
  search: 'M21 21l-4.35-4.35 M10.5 18a7.5 7.5 0 1 1 0-15 7.5 7.5 0 0 1 0 15z',
  sun: 'M12 1v2 M12 21v2 M4.22 4.22l1.42 1.42 M18.36 18.36l1.42 1.42 M1 12h2 M21 12h2 M4.22 19.78l1.42-1.42 M18.36 5.64l1.42-1.42 M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10z',
  trash: 'M3 6h18 M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2 M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6 M10 11v6 M14 11v6',
  upload: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4 M17 8l-5-5-5 5 M12 3v12',
  eye: 'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  eyeOff: 'M3 3l18 18 M10.6 10.6A3 3 0 0 0 13.4 13.4 M9.9 4.2A10.7 10.7 0 0 1 12 4.9c6.5 0 10 7.1 10 7.1a18.4 18.4 0 0 1-3.2 4.2 M6.6 6.6C3.7 8.5 2 12 2 12s3.5 7.1 10 7.1a10.9 10.9 0 0 0 4.2-.8',
} as const;

const bridge = window.markdownBridge;
const currentFile = ref<MarkdownFile | null>(null);
const source = ref('');
const lastSavedContent = ref('');
const session = ref<MarkdownSession>(createDefaultSession());
const isPreviewFullscreen = ref(false);
const activeMermaidDiagram = shallowRef<ActiveMermaidDiagram | null>(null);
const preview = ref<HTMLElement | null>(null);
const editor = ref<HTMLTextAreaElement | null>(null);
const status = ref('请选择或打开一个 Markdown 文件');
const tocSearch = ref('');
const collapsedHeadingIds = ref(new Set<string>());
const activeHeadingId = ref('');
const editorSearch = ref('');
const editorReplace = ref('');
const imageAssets = ref<ImageAsset[]>([]);
const selectedAssetPath = ref('');
const activeResize = ref<'toc' | 'editor' | null>(null);
let saveTimer: number | undefined;
let sessionSaveTimer: number | undefined;
let scrollSyncSource: 'editor' | 'preview' | null = null;
let scrollSyncFrame: number | undefined;
const previewScrollOffset = -50;
const sessionSaveDelay = 200;

const previewHtml = computed(() => rewriteLocalImageSources(`${renderMarkdown(source.value)}<!-- theme:${session.value.theme} -->`));
const headingTree = computed(() => applyCollapsedState(buildHeadingTree(source.value)));
const visibleHeadingTree = computed(() => filterHeadingTree(headingTree.value, tocSearch.value));
const title = computed(() => currentFile.value?.name ?? 'Markdown Editor');
const isEditorVisible = computed(() => session.value.editorVisible || !currentFile.value);
const hasUnsavedChanges = computed(() => currentFile.value !== null && source.value !== lastSavedContent.value);
const shortcutModifier = computed(() => (navigator.platform.toLowerCase().includes('mac') ? 'Cmd' : 'Ctrl'));
const openShortcutHint = computed(() => `打开 Markdown 文件 (${shortcutModifier.value}+O)`);
const saveShortcutHint = computed(() => `保存 Markdown 文件 (${shortcutModifier.value}+S)`);
const previewShortcutHint = computed(() => `显示/隐藏预览 (${shortcutModifier.value}+P)`);
const editorShortcutHint = computed(() => `切换阅读/编辑模式 (${shortcutModifier.value}+E)`);
const gridStyle = computed(() => {
  if (isPreviewFullscreen.value) {
    return {
      gridTemplateColumns: `${session.value.tocWidth}px 6px minmax(0, 1fr) 6px 0`,
    };
  }

  if (!isEditorVisible.value) {
    return {
      gridTemplateColumns: `${session.value.tocWidth}px 6px 0 0 minmax(0, 1fr)`,
    };
  }

  if (session.value.previewHidden) {
    return {
      gridTemplateColumns: `${session.value.tocWidth}px 6px minmax(0, 1fr) 6px 0`,
    };
  }

  return {
    gridTemplateColumns: `${session.value.tocWidth}px 6px ${session.value.editorWidth}px 6px minmax(320px, 1fr)`,
  };
});

function applyCollapsedState(nodes: HeadingNode[]): HeadingNode[] {
  return nodes.map((node) => ({
    ...node,
    collapsed: collapsedHeadingIds.value.has(node.id),
    children: applyCollapsedState(node.children),
  }));
}

function toggleNode(target: HeadingNode): void {
  const collapsed = new Set(collapsedHeadingIds.value);
  if (collapsed.has(target.id)) {
    collapsed.delete(target.id);
  } else {
    collapsed.add(target.id);
  }
  collapsedHeadingIds.value = collapsed;
}

function collectCollapsibleHeadingIds(nodes: HeadingNode[], ids: Set<string>): void {
  nodes.forEach((node) => {
    if (node.children.length > 0) {
      ids.add(node.id);
    }
    collectCollapsibleHeadingIds(node.children, ids);
  });
}

function expandAllHeadings(): void {
  collapsedHeadingIds.value = new Set();
}

function collapseAllHeadings(): void {
  const ids = new Set<string>();
  collectCollapsibleHeadingIds(headingTree.value, ids);
  collapsedHeadingIds.value = ids;
}

function rewriteLocalImageSources(html: string): string {
  if (!currentFile.value || !bridge?.assetUrl || typeof document === 'undefined') {
    return html;
  }

  const template = document.createElement('template');
  template.innerHTML = html;
  template.content.querySelectorAll<HTMLImageElement>('img[src]').forEach((image) => {
    const sourcePath = image.getAttribute('src') ?? '';
    if (/^(?:[a-z]+:|#|\/)/i.test(sourcePath)) {
      return;
    }
    image.dataset.originalSrc = sourcePath;
    image.src = bridge.assetUrl(currentFile.value!.path, sourcePath);
  });
  return template.innerHTML;
}

function escapeCssIdentifier(value: string): string {
  return typeof CSS !== 'undefined' && typeof CSS.escape === 'function'
    ? CSS.escape(value)
    : value.replace(/["\\]/g, '\\$&');
}

function persistableSession(): MarkdownSession {
  return { ...session.value };
}

function saveSessionNow(): void {
  if (sessionSaveTimer !== undefined) {
    window.clearTimeout(sessionSaveTimer);
    sessionSaveTimer = undefined;
  }
  void bridge?.saveSession(persistableSession());
}

function scheduleSessionSave(): void {
  if (sessionSaveTimer !== undefined) {
    window.clearTimeout(sessionSaveTimer);
  }

  sessionSaveTimer = window.setTimeout(() => {
    sessionSaveTimer = undefined;
    void bridge?.saveSession(persistableSession());
  }, sessionSaveDelay);
}

function recentFileName(filePath: string): string {
  return filePath.split(/[\\/]/).pop() || filePath;
}

function persistOpenedFile(file: MarkdownFile, scrollTop: number): void {
  session.value = mergeSession(session.value, {
    filePath: file.path,
    recentFiles: addRecentFile(session.value.recentFiles, file.path),
    scrollTop,
  });
  saveSessionNow();
}

function rememberScroll(scrollTop: number): void {
  session.value = mergeSession(session.value, { scrollTop });
  scheduleSessionSave();
}

function flattenHeadingIds(nodes: HeadingNode[]): Set<string> {
  const ids = new Set<string>();
  nodes.forEach((node) => {
    ids.add(node.id);
    flattenHeadingIds(node.children).forEach((id) => ids.add(id));
  });
  return ids;
}

function scrollRatio(element: HTMLElement): number {
  const maxScroll = element.scrollHeight - element.clientHeight;
  return maxScroll <= 0 ? 0 : element.scrollTop / maxScroll;
}

function scrollRatioWithOffset(element: HTMLElement, offset: number): number {
  const maxScroll = element.scrollHeight - element.clientHeight;
  return maxScroll <= 0 ? 0 : Math.max(0, element.scrollTop - offset) / maxScroll;
}

function applyScrollRatio(element: HTMLElement, ratio: number): void {
  const maxScroll = element.scrollHeight - element.clientHeight;
  element.scrollTop = maxScroll <= 0 ? 0 : maxScroll * ratio;
}

function maxScrollTop(element: HTMLElement): number {
  return Math.max(0, element.scrollHeight - element.clientHeight);
}

function sourceLineCount(): number {
  return Math.max(1, source.value.split('\n').length);
}

function editorLineHeight(): number {
  const lineHeight = Number.parseFloat(window.getComputedStyle(editor.value as Element).lineHeight);
  return Number.isFinite(lineHeight) && lineHeight > 0 ? lineHeight : 22.4;
}

function interpolateLineFromAnchors(scrollTop: number, anchors: ScrollAnchor[]): number {
  const nextIndex = anchors.findIndex((anchor) => anchor.top > scrollTop);
  const before = anchors[Math.max(0, nextIndex === -1 ? anchors.length - 2 : nextIndex - 1)];
  const after = anchors[nextIndex === -1 ? anchors.length - 1 : nextIndex];
  const topSpan = after.top - before.top;
  const ratio = topSpan <= 0 ? 0 : (scrollTop - before.top) / topSpan;

  return before.line + (after.line - before.line) * ratio;
}

function interpolateTopFromAnchors(line: number, anchors: ScrollAnchor[]): number {
  const nextIndex = anchors.findIndex((anchor) => anchor.line > line);
  const before = anchors[Math.max(0, nextIndex === -1 ? anchors.length - 2 : nextIndex - 1)];
  const after = anchors[nextIndex === -1 ? anchors.length - 1 : nextIndex];
  const lineSpan = after.line - before.line;
  const ratio = lineSpan <= 0 ? 0 : (line - before.line) / lineSpan;

  return before.top + (after.top - before.top) * ratio;
}

function editorAnchors(): ScrollAnchor[] {
  const element = editor.value;
  if (!element || !document.body) {
    return [];
  }

  const style = window.getComputedStyle(element);
  const mirror = document.createElement('div');
  Object.assign(mirror.style, {
    border: style.border,
    boxSizing: style.boxSizing,
    font: style.font,
    letterSpacing: style.letterSpacing,
    lineHeight: style.lineHeight,
    overflowWrap: style.overflowWrap,
    padding: style.padding,
    pointerEvents: 'none',
    position: 'absolute',
    tabSize: style.tabSize,
    top: '0',
    visibility: 'hidden',
    whiteSpace: 'pre-wrap',
    width: `${element.clientWidth}px`,
    wordBreak: style.wordBreak,
  });

  const lines = source.value.split('\n');
  lines.forEach((line, index) => {
    const marker = document.createElement('span');
    marker.dataset.sourceLine = String(index + 1);
    marker.style.display = 'inline-block';
    marker.style.height = '0';
    marker.style.overflow = 'hidden';
    marker.style.verticalAlign = 'top';
    marker.style.width = '0';
    mirror.append(marker, document.createTextNode(line || '\u200b'));
    if (index < lines.length - 1) {
      mirror.append(document.createTextNode('\n'));
    }
  });

  document.body.append(mirror);
  const markers = Array.from(mirror.querySelectorAll<HTMLElement>('[data-source-line]'));
  const firstTop = markers[0]?.offsetTop ?? 0;
  const anchors = markers
    .map((marker) => ({
      line: Number(marker.dataset.sourceLine),
      top: Math.max(0, marker.offsetTop - firstTop),
    }))
    .filter((anchor) => Number.isFinite(anchor.line));
  mirror.remove();

  const orderedAnchors: ScrollAnchor[] = [];
  anchors.forEach((anchor) => {
    const previous = orderedAnchors[orderedAnchors.length - 1];
    if (!previous || anchor.top > previous.top && anchor.line > previous.line) {
      orderedAnchors.push(anchor);
    }
  });

  const maxEditorScroll = maxScrollTop(element);
  const lastAnchor = orderedAnchors[orderedAnchors.length - 1];
  if (lastAnchor && maxEditorScroll > lastAnchor.top && sourceLineCount() > lastAnchor.line) {
    orderedAnchors.push({ line: sourceLineCount(), top: maxEditorScroll });
  }

  return orderedAnchors.length > 2 ? orderedAnchors : [];
}

function lineFromEditorScroll(): number {
  const element = editor.value;
  if (!element) {
    return 1;
  }

  const anchors = editorAnchors();
  if (anchors.length > 0) {
    return interpolateLineFromAnchors(element.scrollTop, anchors);
  }

  return Math.min(sourceLineCount(), Math.max(1, element.scrollTop / editorLineHeight() + 1));
}

function syncEditorToLine(line: number): void {
  const element = editor.value;
  if (!element) {
    return;
  }

  const anchors = editorAnchors();
  const targetTop = anchors.length > 0 ? interpolateTopFromAnchors(line, anchors) : (line - 1) * editorLineHeight();
  element.scrollTop = Math.min(maxScrollTop(element), Math.max(0, targetTop));
}

function previewAnchors(): ScrollAnchor[] {
  const container = preview.value;
  if (!container) {
    return [];
  }

  const renderedAnchors = Array.from(container.querySelectorAll<HTMLElement>('[data-source-line]'))
    .map((node) => ({
      line: Number(node.dataset.sourceLine),
      top: node.offsetTop,
    }))
    .filter((anchor) => Number.isFinite(anchor.line))
    .sort((first, second) => first.top - second.top);

  const anchors = [{ line: 1, top: 0 }];
  renderedAnchors.forEach((anchor) => {
    const previous = anchors[anchors.length - 1];
    if (anchor.top > previous.top && anchor.line > previous.line) {
      anchors.push(anchor);
    }
  });

  const maxPreviewScroll = maxScrollTop(container);
  const lastAnchor = anchors[anchors.length - 1];
  if (maxPreviewScroll > lastAnchor.top && sourceLineCount() > lastAnchor.line) {
    anchors.push({ line: sourceLineCount(), top: maxPreviewScroll });
  }

  return anchors.length > 2 ? anchors : [];
}

function interpolateLineFromPreviewScroll(): number | null {
  const container = preview.value;
  if (!container) {
    return null;
  }

  const scrollTop = Math.max(0, container.scrollTop - previewScrollOffset);
  const anchors = previewAnchors();
  if (anchors.length === 0) {
    return null;
  }

  return interpolateLineFromAnchors(scrollTop, anchors);
}

function interpolatePreviewScrollFromLine(line: number): number | null {
  const anchors = previewAnchors();
  if (anchors.length === 0) {
    return null;
  }

  return interpolateTopFromAnchors(line, anchors);
}

function syncScroll(from: 'editor' | 'preview', lock = true): void {
  if (lock && scrollSyncSource && scrollSyncSource !== from) {
    return;
  }

  const sourceElement = from === 'editor' ? editor.value : preview.value;
  const targetElement = from === 'editor' ? preview.value : editor.value;
  if (!sourceElement || !targetElement || session.value.previewHidden || !isEditorVisible.value) {
    return;
  }

  if (from === 'preview') {
    const line = interpolateLineFromPreviewScroll();
    if (line === null) {
      applyScrollRatio(targetElement, scrollRatioWithOffset(sourceElement, previewScrollOffset));
    } else {
      syncEditorToLine(line);
    }
  } else {
    const targetTop = interpolatePreviewScrollFromLine(lineFromEditorScroll());
    if (targetTop === null) {
      applyScrollRatio(targetElement, scrollRatio(sourceElement));
      targetElement.scrollTop = Math.min(maxScrollTop(targetElement), targetElement.scrollTop + previewScrollOffset);
    } else {
      targetElement.scrollTop = Math.min(maxScrollTop(targetElement), Math.max(0, targetTop + previewScrollOffset));
    }
  }

  if (lock) {
    scrollSyncSource = from;
    if (scrollSyncFrame !== undefined) {
      window.cancelAnimationFrame(scrollSyncFrame);
    }
    scrollSyncFrame = window.requestAnimationFrame(() => {
      scrollSyncSource = null;
      scrollSyncFrame = undefined;
    });
  }
}

function onEditorScroll(event: Event): void {
  syncScroll('editor');
  updateActiveHeadingFromPreview();
  rememberScroll(preview.value?.scrollTop ?? (event.target as HTMLElement).scrollTop);
}

function onPreviewScroll(event: Event): void {
  updateActiveHeadingFromPreview();
  rememberScroll((event.target as HTMLElement).scrollTop);
  syncScroll('preview');
}

function updateActiveHeadingFromPreview(): void {
  const container = preview.value;
  if (!container) {
    activeHeadingId.value = '';
    return;
  }

  const headings = Array.from(container.querySelectorAll<HTMLElement>('h1[id], h2[id], h3[id], h4[id], h5[id], h6[id]'));
  const containerTop = container.getBoundingClientRect().top;
  const activationOffset = Math.min(240, Math.max(32, container.clientHeight * 0.35));
  const current = headings
    .filter((heading) => heading.getBoundingClientRect().top - containerTop <= activationOffset)
    .at(-1) ?? headings[0];
  activeHeadingId.value = current?.id ?? '';
}

function persistSession(patch: Partial<MarkdownSession>, options: { deferred?: boolean } = {}): void {
  session.value = mergeSession(session.value, patch);
  if (options.deferred) {
    scheduleSessionSave();
  } else {
    saveSessionNow();
  }
}

function jumpToHeading(id: string): void {
  const container = preview.value;
  const heading = container?.querySelector<HTMLElement>(`#${escapeCssIdentifier(id)}`);
  if (!container || !heading) {
    return;
  }

  container.scrollTop = heading.offsetTop - 16;
  activeHeadingId.value = id;
  rememberScroll(container.scrollTop);
}

function setFile(file: MarkdownFile, scrollTop = 0): void {
  currentFile.value = file;
  source.value = file.content;
  lastSavedContent.value = file.content;
  persistOpenedFile(file, scrollTop);
  status.value = file.path;
  void refreshImageAssets(file.path);
  void nextTick(() => {
    if (preview.value) {
      preview.value.scrollTop = scrollTop;
    }
    syncScroll('preview', false);
    updateActiveHeadingFromPreview();
  });
}

async function openFile(): Promise<void> {
  const file = await bridge?.openMarkdownFile();
  if (file) {
    setFile(file, 0);
  }
}

async function openFilePath(filePath: string): Promise<void> {
  if (!bridge) {
    return;
  }

  try {
    setFile(await bridge.readMarkdownFile(filePath), 0);
  } catch {
    status.value = `无法打开 ${filePath}`;
    persistSession({
      recentFiles: session.value.recentFiles.filter((recent) => recent !== filePath),
    });
  }
}

function isMarkdownPath(filePath: string): boolean {
  return /\.(md|markdown|mdown)$/i.test(filePath);
}

async function openRecentFile(event: Event): Promise<void> {
  const filePath = (event.target as HTMLSelectElement).value;
  if (filePath) {
    await openFilePath(filePath);
  }
}

async function onDropFile(event: DragEvent): Promise<void> {
  const files = Array.from(event.dataTransfer?.files ?? []);
  const markdownFile = files.find((file) => {
    const filePath = bridge?.getPathForFile(file) || (file as File & { path?: string }).path || file.name;
    return isMarkdownPath(filePath);
  });
  const filePath = markdownFile
    ? bridge?.getPathForFile(markdownFile) || (markdownFile as File & { path?: string }).path
    : undefined;

  if (!filePath) {
    status.value = '请拖入 Markdown 文件';
    return;
  }

  await openFilePath(filePath);
}

async function saveCurrentFile(): Promise<void> {
  if (!currentFile.value || !bridge || !hasUnsavedChanges.value) {
    return;
  }

  currentFile.value = await bridge.saveMarkdownFile(currentFile.value.path, source.value);
  lastSavedContent.value = currentFile.value.content;
  status.value = `已保存 ${currentFile.value.path}`;
}

function currentExportPayload(options: { relativeImages: boolean }): ExportDocumentPayload | null {
  if (!currentFile.value || !preview.value) {
    status.value = '请先打开 Markdown 文件';
    return null;
  }

  const clone = preview.value.cloneNode(true) as HTMLElement;
  if (options.relativeImages) {
    clone.querySelectorAll<HTMLImageElement>('img[data-original-src]').forEach((image) => {
      image.src = image.dataset.originalSrc ?? image.getAttribute('src') ?? '';
      image.removeAttribute('data-original-src');
    });
  }

  return {
    markdownPath: currentFile.value.path,
    title: currentFile.value.name,
    bodyHtml: clone.innerHTML,
    theme: session.value.theme,
  };
}

async function exportDocument(format: 'html' | 'pdf'): Promise<void> {
  if (!bridge) {
    return;
  }

  await renderMermaid();
  const payload = currentExportPayload({ relativeImages: format === 'html' });
  if (!payload) {
    return;
  }

  const exportedPath = format === 'html'
    ? await bridge.exportHtml(payload)
    : await bridge.exportPdf(payload);
  status.value = exportedPath ? `已导出 ${exportedPath}` : '已取消导出';
}

function replaceSelection(replacement: string, selectionStartOffset = replacement.length, selectionEndOffset = selectionStartOffset): void {
  const element = editor.value;
  if (!element) {
    source.value += replacement;
    return;
  }

  const start = element.selectionStart;
  const end = element.selectionEnd;
  source.value = `${source.value.slice(0, start)}${replacement}${source.value.slice(end)}`;
  void nextTick(() => {
    element.focus();
    element.setSelectionRange(start + selectionStartOffset, start + selectionEndOffset);
  });
}

function selectedEditorText(): string {
  const element = editor.value;
  return element ? source.value.slice(element.selectionStart, element.selectionEnd) : '';
}

function insertTable(): void {
  replaceSelection('| 列 1 | 列 2 |\n| --- | --- |\n| 内容 | 内容 |\n');
}

function insertLink(): void {
  const text = selectedEditorText() || '链接文本';
  const snippet = `[${text}](https://example.com)`;
  replaceSelection(snippet, text.length + 3, snippet.length - 1);
}

function insertCodeBlock(): void {
  const text = selectedEditorText() || '代码';
  const snippet = `\`\`\`\n${text}\n\`\`\`\n`;
  replaceSelection(snippet, 4, 4 + text.length);
}

function insertImageMarkdown(asset: ImageAsset, altText = asset.name.replace(/\.[^.]+$/, '')): void {
  replaceSelection(`![${altText}](${asset.relativePath})`);
  status.value = `已插入图片 ${asset.name}`;
}

async function refreshImageAssets(markdownPath = currentFile.value?.path): Promise<void> {
  if (!markdownPath || !bridge?.listImageAssets) {
    imageAssets.value = [];
    selectedAssetPath.value = '';
    return;
  }

  imageAssets.value = await bridge.listImageAssets(markdownPath);
  if (!imageAssets.value.some((asset) => asset.relativePath === selectedAssetPath.value)) {
    selectedAssetPath.value = imageAssets.value[0]?.relativePath ?? '';
  }
}

async function importImageAsset(): Promise<void> {
  if (!currentFile.value || !bridge?.importImageAsset) {
    status.value = '请先打开 Markdown 文件';
    return;
  }

  const asset = await bridge.importImageAsset(currentFile.value.path);
  if (!asset) {
    return;
  }
  await refreshImageAssets();
  selectedAssetPath.value = asset.relativePath;
  insertImageMarkdown(asset);
}

function insertSelectedAsset(): void {
  const asset = imageAssets.value.find((item) => item.relativePath === selectedAssetPath.value);
  if (asset) {
    insertImageMarkdown(asset);
  }
}

async function deleteSelectedAsset(): Promise<void> {
  if (!currentFile.value || !selectedAssetPath.value || !bridge?.deleteImageAsset) {
    return;
  }

  imageAssets.value = await bridge.deleteImageAsset(currentFile.value.path, selectedAssetPath.value);
  selectedAssetPath.value = imageAssets.value[0]?.relativePath ?? '';
  status.value = '已删除资源文件';
}

async function onEditorPaste(event: ClipboardEvent): Promise<void> {
  if (!currentFile.value || !bridge?.saveImageAsset) {
    return;
  }

  const imageFile = Array.from(event.clipboardData?.files ?? []).find((file) => file.type.startsWith('image/'));
  if (!imageFile) {
    return;
  }

  event.preventDefault();
  const asset = await bridge.saveImageAsset(
    currentFile.value.path,
    imageFile.name || 'pasted-image.png',
    await imageFile.arrayBuffer(),
    imageFile.type || 'image/png',
  );
  await refreshImageAssets();
  selectedAssetPath.value = asset.relativePath;
  insertImageMarkdown(asset);
}

function scheduleSave(): void {
  if (saveTimer) {
    window.clearTimeout(saveTimer);
  }

  saveTimer = window.setTimeout(() => {
    void saveCurrentFile();
  }, 350);
}

function findNext(): void {
  const term = editorSearch.value;
  const element = editor.value;
  if (!term || !element) {
    return;
  }

  const start = element.selectionEnd === element.selectionStart ? element.selectionEnd : element.selectionEnd;
  let index = source.value.indexOf(term, start);
  if (index === -1 && start > 0) {
    index = source.value.indexOf(term, 0);
  }
  if (index === -1) {
    status.value = '没有找到匹配内容';
    return;
  }

  element.focus();
  element.setSelectionRange(index, index + term.length);
}

function replaceCurrent(): void {
  const term = editorSearch.value;
  const element = editor.value;
  if (!term || !element) {
    return;
  }

  const selected = source.value.slice(element.selectionStart, element.selectionEnd);
  if (selected !== term) {
    findNext();
    return;
  }

  const before = source.value.slice(0, element.selectionStart);
  const after = source.value.slice(element.selectionEnd);
  const cursor = before.length + editorReplace.value.length;
  source.value = `${before}${editorReplace.value}${after}`;
  void nextTick(() => {
    element.focus();
    element.setSelectionRange(cursor, cursor);
  });
}

function replaceAll(): void {
  const term = editorSearch.value;
  if (!term) {
    return;
  }

  const count = source.value.split(term).length - 1;
  source.value = source.value.split(term).join(editorReplace.value);
  status.value = `已替换 ${count} 处`;
}

function setTheme(theme: ThemeMode): void {
  persistSession({ theme });
}

function toggleEditor(): void {
  const willShowEditor = !isEditorVisible.value;
  persistSession({
    editorVisible: willShowEditor,
    previewHidden: false,
  });
  if (willShowEditor) {
    void nextTick(() => syncScroll('preview', false));
  }
}

function togglePreview(): void {
  const willShowPreview = session.value.previewHidden;
  persistSession({
    previewHidden: !session.value.previewHidden,
    editorVisible: true,
  });
  if (willShowPreview) {
    void nextTick(() => syncScroll('editor', false));
  }
}

function startResize(target: 'toc' | 'editor', event: PointerEvent): void {
  activeResize.value = target;
  (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
}

function onResizeMove(event: PointerEvent): void {
  if (!activeResize.value) {
    return;
  }

  if (activeResize.value === 'toc') {
    persistSession({ tocWidth: Math.max(180, Math.min(520, event.clientX)) }, { deferred: true });
    return;
  }

  persistSession({
    editorWidth: Math.max(320, Math.min(1200, event.clientX - session.value.tocWidth - 6)),
  }, { deferred: true });
}

function stopResize(): void {
  activeResize.value = null;
}

function onKeyDown(event: KeyboardEvent): void {
  if (event.key === 'Escape' && activeMermaidDiagram.value) {
    activeMermaidDiagram.value = null;
    event.preventDefault();
    return;
  }

  const command = event.metaKey || event.ctrlKey;
  if (!command) {
    return;
  }

  const key = event.key.toLowerCase();
  if (key === 'o') {
    event.preventDefault();
    void openFile();
  }
  if (key === 's') {
    event.preventDefault();
    void saveCurrentFile();
  }
  if (key === 'p') {
    event.preventDefault();
    togglePreview();
  }
  if (key === 'e') {
    event.preventDefault();
    toggleEditor();
  }
}

function applyMermaidTransforms(): void {
  preview.value?.querySelectorAll<HTMLElement>('.mermaid-panzoom').forEach((node) => {
    const scale = Number(node.dataset.scale ?? '1');
    const x = Number(node.dataset.x ?? '0');
    const y = Number(node.dataset.y ?? '0');
    const target = node.querySelector<HTMLElement>('svg, .mermaid');
    if (target) {
      target.style.transform = `translate(${x}px, ${y}px) scale(${scale})`;
      target.style.transformOrigin = '0 0';
    }
  });
}

function mermaidThemeConfig(): Record<string, unknown> {
  const dark = session.value.theme === 'dark';
  const eye = session.value.theme === 'eye';

  return {
    startOnLoad: false,
    securityLevel: 'strict',
    theme: 'base',
    flowchart: {
      htmlLabels: false,
    },
    themeVariables: {
      background: dark ? '#111827' : eye ? '#fffff7' : '#ffffff',
      primaryColor: dark ? '#1f2937' : eye ? '#f5f8eb' : '#f8fafb',
      primaryTextColor: dark ? '#e5edf6' : eye ? '#243024' : '#172026',
      primaryBorderColor: dark ? '#5eead4' : eye ? '#557a35' : '#0b7a75',
      lineColor: dark ? '#9fb0c3' : eye ? '#667159' : '#66717a',
      secondaryColor: dark ? '#202c3c' : eye ? '#edf2df' : '#f4f7f9',
      tertiaryColor: dark ? '#131c29' : eye ? '#f1f5e8' : '#eef1f4',
      noteBkgColor: dark ? '#202c3c' : eye ? '#edf2df' : '#f4f7f9',
      noteTextColor: dark ? '#e5edf6' : eye ? '#243024' : '#172026',
      fontFamily: 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    },
  };
}

async function renderMermaid(): Promise<void> {
  await nextTick();
  const diagrams = preview.value?.querySelectorAll('.mermaid');
  if (!diagrams?.length) {
    return;
  }

  try {
    const mermaid = await import('mermaid');
    mermaid.default.initialize(mermaidThemeConfig());
    await mermaid.default.run({ nodes: Array.from(diagrams) as HTMLElement[] });
    applyMermaidTransforms();
  } catch {
    status.value = 'Mermaid 图渲染失败，请检查语法';
  }
}

function mermaidSvg(container: HTMLElement): SVGSVGElement | null {
  return container.querySelector<SVGSVGElement>('svg');
}

function mermaidDiagramIndex(container: HTMLElement): number {
  const containers = Array.from(preview.value?.querySelectorAll<HTMLElement>('.mermaid-panzoom') ?? []);
  return Math.max(0, containers.indexOf(container));
}

function mermaidDownloadBaseName(container: HTMLElement): string {
  const fileName = currentFile.value?.name.replace(/\.[^.]+$/, '') || 'markdown-diagram';
  const safeName = fileName.replace(/[^\w.-]+/g, '-').replace(/^-|-$/g, '') || 'markdown-diagram';
  return `${safeName}-mermaid-${mermaidDiagramIndex(container) + 1}`;
}

function svgDimension(svg: SVGSVGElement, attribute: 'width' | 'height', fallback: number): number {
  const attributeValue = Number.parseFloat(svg.getAttribute(attribute) ?? '');
  if (Number.isFinite(attributeValue) && attributeValue > 0) {
    return attributeValue;
  }

  const rectValue = attribute === 'width' ? svg.getBoundingClientRect().width : svg.getBoundingClientRect().height;
  if (Number.isFinite(rectValue) && rectValue > 0) {
    return rectValue;
  }

  const viewBox = svg.getAttribute('viewBox')?.trim().split(/\s+/).map(Number) ?? [];
  const viewBoxValue = attribute === 'width' ? viewBox[2] : viewBox[3];
  return Number.isFinite(viewBoxValue) && viewBoxValue > 0 ? viewBoxValue : fallback;
}

function preparedMermaidSvg(container: HTMLElement): { text: string; width: number; height: number } | null {
  const sourceSvg = mermaidSvg(container);
  if (!sourceSvg) {
    return null;
  }

  const clone = sourceSvg.cloneNode(true) as SVGSVGElement;
  const width = Math.ceil(svgDimension(sourceSvg, 'width', 960));
  const height = Math.ceil(svgDimension(sourceSvg, 'height', 640));
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.setAttribute('width', String(width));
  clone.setAttribute('height', String(height));
  clone.style.transform = '';
  clone.style.transformOrigin = '';
  clone.style.background = session.value.theme === 'dark' ? '#111827' : session.value.theme === 'eye' ? '#fffff7' : '#ffffff';

  return {
    text: new XMLSerializer().serializeToString(clone),
    width,
    height,
  };
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function openMermaidFullscreen(container: HTMLElement): void {
  const prepared = preparedMermaidSvg(container);
  if (!prepared) {
    status.value = 'Mermaid 图尚未渲染完成';
    return;
  }

  activeMermaidDiagram.value = {
    container,
    html: prepared.text,
    title: `Mermaid 图 ${mermaidDiagramIndex(container) + 1}`,
  };
}

async function exportMermaid(container: HTMLElement, format: MermaidExportFormat): Promise<void> {
  const prepared = preparedMermaidSvg(container);
  if (!prepared) {
    status.value = 'Mermaid 图尚未渲染完成';
    return;
  }

  const baseName = mermaidDownloadBaseName(container);
  if (format === 'svg') {
    downloadBlob(new Blob([prepared.text], { type: 'image/svg+xml;charset=utf-8' }), `${baseName}.svg`);
    status.value = `已导出 ${baseName}.svg`;
    return;
  }

  try {
    const image = new Image();
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(prepared.text)}`;
    await image.decode();

    const canvas = document.createElement('canvas');
    canvas.width = prepared.width * 2;
    canvas.height = prepared.height * 2;
    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('Canvas is unavailable.');
    }

    context.fillStyle = session.value.theme === 'dark' ? '#111827' : session.value.theme === 'eye' ? '#fffff7' : '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);

    const mimeType = format === 'png' ? 'image/png' : 'image/webp';
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((result) => {
        if (result) {
          resolve(result);
        } else {
          reject(new Error('Unable to encode image.'));
        }
      }, mimeType, 0.95);
    });
    downloadBlob(blob, `${baseName}.${format}`);
    status.value = `已导出 ${baseName}.${format}`;
  } catch {
    status.value = `导出 ${format.toUpperCase()} 失败`;
  }
}

function onPreviewClick(event: MouseEvent): void {
  const actionButton = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-mermaid-action]');
  if (!actionButton) {
    return;
  }

  const container = actionButton.closest<HTMLElement>('.mermaid-panzoom');
  if (!container) {
    return;
  }

  event.preventDefault();
  event.stopPropagation();

  const action = actionButton.dataset.mermaidAction;
  if (action === 'fullscreen') {
    openMermaidFullscreen(container);
    return;
  }

  if (action === 'download-svg' || action === 'download-png' || action === 'download-webp') {
    void exportMermaid(container, action.replace('download-', '') as MermaidExportFormat);
  }
}

function onPreviewWheel(event: WheelEvent): void {
  const target = (event.target as HTMLElement).closest<HTMLElement>('.mermaid-panzoom');
  if (!target || !event.metaKey && !event.ctrlKey) {
    return;
  }

  event.preventDefault();
  const currentScale = Number(target.dataset.scale ?? '1');
  const nextScale = Math.min(4, Math.max(0.4, currentScale + (event.deltaY > 0 ? -0.1 : 0.1)));
  target.dataset.scale = nextScale.toFixed(2);
  applyMermaidTransforms();
}

function onPreviewPointerDown(event: PointerEvent): void {
  if ((event.target as HTMLElement).closest('.mermaid-actions')) {
    return;
  }

  const target = (event.target as HTMLElement).closest<HTMLElement>('.mermaid-panzoom');
  if (!target) {
    return;
  }

  target.setPointerCapture(event.pointerId);
  target.dataset.dragStartX = String(event.clientX);
  target.dataset.dragStartY = String(event.clientY);
}

function onPreviewPointerMove(event: PointerEvent): void {
  const target = (event.target as HTMLElement).closest<HTMLElement>('.mermaid-panzoom');
  if (!target || !target.hasPointerCapture(event.pointerId)) {
    return;
  }

  const startX = Number(target.dataset.dragStartX ?? event.clientX);
  const startY = Number(target.dataset.dragStartY ?? event.clientY);
  const x = Number(target.dataset.x ?? '0') + event.clientX - startX;
  const y = Number(target.dataset.y ?? '0') + event.clientY - startY;
  target.dataset.x = String(x);
  target.dataset.y = String(y);
  target.dataset.dragStartX = String(event.clientX);
  target.dataset.dragStartY = String(event.clientY);
  applyMermaidTransforms();
}

watch(source, () => {
  scheduleSave();
  void renderMermaid();
});

watch(() => session.value.theme, () => {
  void renderMermaid();
});

watch(activeHeadingId, async (id) => {
  if (!id) {
    return;
  }

  await nextTick();
  document.querySelector<HTMLElement>(`[data-toc-id="${escapeCssIdentifier(id)}"]`)?.scrollIntoView({ block: 'nearest' });
});

watch(headingTree, (nodes) => {
  if (activeHeadingId.value && !flattenHeadingIds(nodes).has(activeHeadingId.value)) {
    activeHeadingId.value = '';
  }
});

onMounted(async () => {
  session.value = normalizeSession((await bridge?.getSession()) ?? createDefaultSession());
  const file = await bridge?.readLastMarkdownFile();
  if (file) {
    setFile(file, session.value.scrollTop);
  }
  await renderMermaid();
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('pointermove', onResizeMove);
  window.addEventListener('pointerup', stopResize);
});

onBeforeUnmount(() => {
  if (scrollSyncFrame !== undefined) {
    window.cancelAnimationFrame(scrollSyncFrame);
  }
  if (sessionSaveTimer !== undefined) {
    saveSessionNow();
  }
  window.removeEventListener('keydown', onKeyDown);
  window.removeEventListener('pointermove', onResizeMove);
  window.removeEventListener('pointerup', stopResize);
});
</script>

<template>
  <main
    :class="[
      'app-shell',
      `theme-${session.theme}`,
      {
        'preview-fullscreen': isPreviewFullscreen,
        'preview-hidden': session.previewHidden,
        'reader-mode': !isEditorVisible,
      },
    ]"
    @dragover.prevent
    @drop.prevent="onDropFile"
  >
    <header class="topbar">
      <div class="title-block">
        <strong>{{ title }}</strong>
        <span>{{ status }}</span>
      </div>
      <div class="actions">
        <div class="theme-switcher" aria-label="主题">
          <button
            data-testid="theme-light"
            class="icon-button"
            type="button"
            :class="{ active: session.theme === 'light' }"
            aria-label="浅色主题"
            title="浅色主题"
            @click="setTheme('light')"
          >
            <svg aria-hidden="true" viewBox="0 0 24 24"><path :d="icons.sun" /></svg>
          </button>
          <button
            data-testid="theme-dark"
            class="icon-button"
            type="button"
            :class="{ active: session.theme === 'dark' }"
            aria-label="深色主题"
            title="深色主题"
            @click="setTheme('dark')"
          >
            <svg aria-hidden="true" viewBox="0 0 24 24"><path :d="icons.moon" /></svg>
          </button>
          <button
            data-testid="theme-eye"
            class="icon-button"
            type="button"
            :class="{ active: session.theme === 'eye' }"
            aria-label="护眼模式"
            title="护眼模式"
            @click="setTheme('eye')"
          >
            <svg aria-hidden="true" viewBox="0 0 24 24"><path :d="icons.eye" /></svg>
          </button>
        </div>
        <button
          data-testid="open-file"
          class="icon-button"
          type="button"
          aria-label="打开"
          :title="openShortcutHint"
          @click="openFile"
        >
          <svg aria-hidden="true" viewBox="0 0 24 24"><path :d="icons.open" /></svg>
        </button>
        <select
          data-testid="recent-files"
          :disabled="session.recentFiles.length === 0"
          :title="`最近打开文件（最多 20 个）`"
          :value="currentFile?.path ?? ''"
          @change="openRecentFile"
        >
          <option value="">最近文件</option>
          <option v-for="filePath in session.recentFiles" :key="filePath" :value="filePath">
            {{ recentFileName(filePath) }}
          </option>
        </select>
        <button
          data-testid="save-file"
          class="icon-button"
          type="button"
          :disabled="!hasUnsavedChanges"
          aria-label="保存"
          :title="saveShortcutHint"
          @click="saveCurrentFile"
        >
          <svg aria-hidden="true" viewBox="0 0 24 24"><path :d="icons.save" /></svg>
        </button>
        <button
          data-testid="export-html"
          class="icon-button"
          type="button"
          :disabled="!currentFile"
          aria-label="导出 HTML"
          title="导出整篇文档为 HTML"
          @click="exportDocument('html')"
        >
          <svg aria-hidden="true" viewBox="0 0 24 24"><path :d="icons.download" /></svg>
        </button>
        <button
          data-testid="export-pdf"
          class="icon-button"
          type="button"
          :disabled="!currentFile"
          aria-label="导出 PDF"
          title="导出整篇文档为 PDF"
          @click="exportDocument('pdf')"
        >
          <svg aria-hidden="true" viewBox="0 0 24 24"><path :d="icons.fileText" /></svg>
        </button>
        <button
          data-testid="toggle-preview"
          class="icon-button"
          type="button"
          :aria-label="session.previewHidden ? '展开预览' : '隐藏预览'"
          :title="previewShortcutHint"
          @click="togglePreview"
        >
          <svg aria-hidden="true" viewBox="0 0 24 24"><path :d="session.previewHidden ? icons.eye : icons.eyeOff" /></svg>
        </button>
        <button
          data-testid="toggle-editor"
          class="icon-button"
          type="button"
          :aria-label="isEditorVisible ? '阅读' : '编辑'"
          :title="editorShortcutHint"
          @click="toggleEditor"
        >
          <svg aria-hidden="true" viewBox="0 0 24 24"><path :d="isEditorVisible ? icons.bookOpen : icons.edit" /></svg>
        </button>
        <button
          data-testid="fullscreen-preview"
          class="icon-button"
          type="button"
          :aria-label="isPreviewFullscreen ? '退出预览' : '全屏预览'"
          :title="isPreviewFullscreen ? '退出预览' : '全屏预览'"
          @click="isPreviewFullscreen = !isPreviewFullscreen"
        >
          <svg aria-hidden="true" viewBox="0 0 24 24"><path :d="icons.expand" /></svg>
        </button>
      </div>
    </header>

    <section class="workspace" :style="gridStyle">
      <aside class="toc-panel" data-testid="toc">
        <div class="panel-toolbar">
          <div class="toc-toolbar-row">
            <h2>目录</h2>
            <div class="toc-actions">
              <button data-testid="expand-toc" class="icon-button" type="button" aria-label="全部展开" title="全部展开" @click="expandAllHeadings">
                <svg aria-hidden="true" viewBox="0 0 24 24"><path :d="icons.chevronDown" /></svg>
              </button>
              <button data-testid="collapse-toc" class="icon-button" type="button" aria-label="全部收起" title="全部收起" @click="collapseAllHeadings">
                <svg aria-hidden="true" viewBox="0 0 24 24"><path :d="icons.chevronRight" /></svg>
              </button>
            </div>
          </div>
          <input v-model="tocSearch" data-testid="toc-search" type="search" placeholder="搜索目录" />
        </div>
        <TocTree
          v-if="visibleHeadingTree.length"
          :nodes="visibleHeadingTree"
          :active-id="activeHeadingId"
          @toggle="toggleNode"
          @jump="jumpToHeading"
        />
        <p v-else class="empty">暂无标题</p>
      </aside>

      <div
        class="resize-handle"
        data-testid="toc-resizer"
        role="separator"
        @pointerdown="startResize('toc', $event)"
      />

      <section class="editor-panel">
        <div class="format-toolbar" aria-label="Markdown 快捷工具栏">
          <div class="format-actions">
            <button data-testid="insert-table" class="icon-button" type="button" aria-label="插入表格" title="插入表格" @click="insertTable">
              <svg aria-hidden="true" viewBox="0 0 24 24"><path :d="icons.columns" /></svg>
            </button>
            <button data-testid="insert-link" class="icon-button" type="button" aria-label="插入链接" title="插入链接" @click="insertLink">
              <svg aria-hidden="true" viewBox="0 0 24 24"><path :d="icons.link" /></svg>
            </button>
            <button data-testid="insert-code" class="icon-button" type="button" aria-label="插入代码块" title="插入代码块" @click="insertCodeBlock">
              <svg aria-hidden="true" viewBox="0 0 24 24"><path :d="icons.code" /></svg>
            </button>
            <button data-testid="import-image" class="icon-button" type="button" :disabled="!currentFile" aria-label="导入图片" title="选择图片并复制到资源目录" @click="importImageAsset">
              <svg aria-hidden="true" viewBox="0 0 24 24"><path :d="icons.image" /></svg>
            </button>
          </div>
          <div class="asset-tools">
            <select
              v-model="selectedAssetPath"
              data-testid="asset-list"
              :disabled="imageAssets.length === 0"
              title="当前文档图片资源"
            >
              <option value="">图片资源</option>
              <option v-for="asset in imageAssets" :key="asset.relativePath" :value="asset.relativePath">
                {{ asset.name }}
              </option>
            </select>
            <button data-testid="refresh-assets" class="icon-button" type="button" :disabled="!currentFile" aria-label="刷新图片资源" title="刷新图片资源" @click="refreshImageAssets()">
              <svg aria-hidden="true" viewBox="0 0 24 24"><path :d="icons.refresh" /></svg>
            </button>
            <button data-testid="insert-asset" class="icon-button" type="button" :disabled="!selectedAssetPath" aria-label="插入选中图片" title="插入选中图片" @click="insertSelectedAsset">
              <svg aria-hidden="true" viewBox="0 0 24 24"><path :d="icons.upload" /></svg>
            </button>
            <button data-testid="delete-asset" class="icon-button" type="button" :disabled="!selectedAssetPath" aria-label="删除选中图片资源" title="删除选中图片资源" @click="deleteSelectedAsset">
              <svg aria-hidden="true" viewBox="0 0 24 24"><path :d="icons.trash" /></svg>
            </button>
          </div>
        </div>
        <div class="editor-tools">
          <input v-model="editorSearch" data-testid="editor-search" type="search" placeholder="搜索源码" />
          <input v-model="editorReplace" data-testid="editor-replace" type="text" placeholder="替换为" />
          <button class="icon-button" type="button" aria-label="查找" title="查找" @click="findNext">
            <svg aria-hidden="true" viewBox="0 0 24 24"><path :d="icons.search" /></svg>
          </button>
          <button class="icon-button" type="button" aria-label="替换" title="替换" @click="replaceCurrent">
            <svg aria-hidden="true" viewBox="0 0 24 24"><path :d="icons.replace" /></svg>
          </button>
          <button data-testid="replace-all" class="icon-button" type="button" aria-label="全部替换" title="全部替换" @click="replaceAll">
            <svg aria-hidden="true" viewBox="0 0 24 24"><path :d="icons.refresh" /></svg>
          </button>
        </div>
        <textarea
          ref="editor"
          v-model="source"
          class="source-editor"
          data-testid="editor"
          spellcheck="false"
          placeholder="# 开始写 Markdown"
          @scroll="onEditorScroll"
          @paste="onEditorPaste"
        />
      </section>

      <div
        class="resize-handle"
        data-testid="editor-resizer"
        role="separator"
        @pointerdown="startResize('editor', $event)"
      />

      <article
        ref="preview"
        class="preview"
        data-testid="preview"
        @scroll="onPreviewScroll"
        @wheel="onPreviewWheel"
        @click="onPreviewClick"
        @pointerdown="onPreviewPointerDown"
        @pointermove="onPreviewPointerMove"
        v-html="previewHtml"
      />
    </section>

    <div
      v-if="activeMermaidDiagram"
      class="mermaid-modal"
      data-testid="mermaid-modal"
      role="dialog"
      aria-modal="true"
      :aria-label="activeMermaidDiagram.title"
      @click.self="activeMermaidDiagram = null"
    >
      <div class="mermaid-modal-bar">
        <strong>{{ activeMermaidDiagram.title }}</strong>
        <div class="mermaid-modal-actions">
          <button class="icon-button" type="button" aria-label="导出 SVG" title="导出 SVG" @click="exportMermaid(activeMermaidDiagram.container, 'svg')">
            <svg aria-hidden="true" viewBox="0 0 24 24"><path :d="icons.download" /></svg>
          </button>
          <button class="icon-button" type="button" aria-label="导出 PNG" title="导出 PNG" @click="exportMermaid(activeMermaidDiagram.container, 'png')">
            <svg aria-hidden="true" viewBox="0 0 24 24"><path :d="icons.image" /></svg>
          </button>
          <button class="icon-button" type="button" aria-label="导出 WebP" title="导出 WebP" @click="exportMermaid(activeMermaidDiagram.container, 'webp')">
            <svg aria-hidden="true" viewBox="0 0 24 24"><path :d="icons.image" /></svg>
          </button>
          <button class="icon-button" type="button" aria-label="关闭" title="关闭" @click="activeMermaidDiagram = null">
            <svg aria-hidden="true" viewBox="0 0 24 24"><path :d="icons.eyeOff" /></svg>
          </button>
        </div>
      </div>
      <div class="mermaid-modal-body" v-html="activeMermaidDiagram.html" />
    </div>
  </main>
</template>
