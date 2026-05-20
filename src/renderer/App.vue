<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue';
import MarkdownMonacoEditor from '@/renderer/components/MarkdownMonacoEditor.vue';
import TocTree from '@/renderer/components/TocTree.vue';
import {
  buildDocumentHeadingTree,
  documentKindFromFileName,
  documentLabel,
  formatJsonDocument,
  monacoLanguageForDocument,
  renderDocumentPreview,
  supportedDocumentExtensions,
  type DocumentKind,
} from '@/renderer/lib/document';
import { parseEditorConfig } from '@/renderer/lib/editorConfig';
import { rendererLog } from '@/renderer/lib/logger';
import {
  filterHeadingTree,
  type HeadingNode,
} from '@/renderer/lib/markdown';
import {
  addRecentFile,
  createDefaultSession,
  mergeSession,
  normalizeBookmarks,
  normalizeRecentFiles,
  normalizeSession,
  removeRecentFile,
  tabIdForPath,
  type BookmarkViewMode,
  type MarkdownBookmark,
  type MarkdownSession,
  type ThemeMode,
} from '@/renderer/lib/session';

interface MarkdownFile {
  path: string | null;
  name: string;
  content: string;
  encoding?: string;
}

interface ScrollAnchor {
  line: number;
  top: number;
}

interface OpenTab {
  id: string;
  file: MarkdownFile;
  source: string;
  lastSavedContent: string;
  scrollTop: number;
}

interface TabContextMenu {
  tabId: string;
  x: number;
  y: number;
}

interface HelpItem {
  label: string;
  shortcut: string;
  detail: string;
}

interface HelpGroup {
  title: string;
  items: HelpItem[];
}

interface RecentFileOption {
  path: string;
  label: string;
}

interface CloudUploadDialog {
  file: TempImageAsset;
  appId: string;
  subDir: string;
  linkName: string;
  error: string;
  isUploading: boolean;
  insertionRange: EditorInsertionRange;
}

interface EditorInsertionRange {
  start: number;
  end: number;
  scrollTop: number;
}

interface CursorPosition {
  column: number;
  lineNumber: number;
}

interface CursorHistoryEntry extends CursorPosition {
  fileName: string;
  filePath: string | null;
  tabId: string;
}

interface BookmarkListItem extends MarkdownBookmark {
  searchableText: string;
}

interface SearchMatchRange {
  end: number;
  start: number;
  term: string;
}

interface EditorSurface {
  focus(): void;
  getCursorPosition(): CursorPosition;
  getElement(): HTMLElement | null;
  getMaxScrollTop(): number;
  getScrollTop(): number;
  getSelectionRange(): { start: number; end: number };
  redo(): void;
  setCursorPosition(position: CursorPosition): void;
  setScrollTop(value: number): void;
  setSelectionRange(start: number, end: number): void;
  undo(): void;
}

type VimCommand = 'write' | 'write-quit' | 'quit' | 'force-quit';

interface ActiveMermaidDiagram {
  container: HTMLElement;
  html: string;
  title: string;
  scale: number;
  x: number;
  y: number;
  dragPointerId: number | null;
  dragStartX: number;
  dragStartY: number;
}

interface ActiveImagePreview {
  src: string;
  title: string;
  filename: string;
  scale: number;
  x: number;
  y: number;
  dragPointerId: number | null;
  dragStartX: number;
  dragStartY: number;
}

type MermaidExportFormat = 'svg' | 'png' | 'webp';
type ImageUploadMode = 'local' | 'cloud';
type TextEncoding =
  | 'utf8'
  | 'utf16-le'
  | 'utf16-be'
  | 'gb18030'
  | 'gbk'
  | 'big5'
  | 'shift_jis'
  | 'windows1252'
  | 'latin1';

const defaultTextEncoding: TextEncoding = 'utf8';
const textEncodingOptions: { label: string; value: TextEncoding }[] = [
  { label: 'UTF-8', value: 'utf8' },
  { label: 'UTF-16 LE', value: 'utf16-le' },
  { label: 'UTF-16 BE', value: 'utf16-be' },
  { label: 'GB18030', value: 'gb18030' },
  { label: 'GBK', value: 'gbk' },
  { label: 'Big5', value: 'big5' },
  { label: 'Shift_JIS', value: 'shift_jis' },
  { label: 'Windows-1252', value: 'windows1252' },
  { label: 'Latin-1', value: 'latin1' },
];

const icons = {
  archive: 'M21 8v13H3V8 M1 3h22v5H1z M10 12h4',
  bookmark: 'M19 21l-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z',
  bookOpen: 'M2 4.5A3 3 0 0 1 5 3h5v18H5a3 3 0 0 0-3 3V4.5z M22 4.5A3 3 0 0 0 19 3h-5v18h5a3 3 0 0 1 3 3V4.5z',
  chevronDown: 'm6 9 6 6 6-6',
  chevronRight: 'm9 18 6-6-6-6',
  code: 'm16 18 6-6-6-6 M8 6l-6 6 6 6',
  columns: 'M3 5h18 M3 12h18 M3 19h18 M8 5v14 M16 5v14',
  cloudUpload: 'M16 16l-4-4-4 4 M12 12v9 M20 17.6A5 5 0 0 0 18 8h-1.3A7 7 0 1 0 5.1 15.8',
  download: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4 M7 10l5 5 5-5 M12 15V3',
  edit: 'M12 20h9 M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z',
  expand: 'M8 3H5a2 2 0 0 0-2 2v3 M16 3h3a2 2 0 0 1 2 2v3 M8 21H5a2 2 0 0 1-2-2v-3 M16 21h3a2 2 0 0 0 2-2v-3',
  externalLink: 'M15 3h6v6 M10 14 21 3 M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6',
  fileText: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6 M8 13h8 M8 17h8 M8 9h2',
  image: 'M21 19V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2z M8.5 11.5 11 14l2-2.5L17 16 M8 9h.01',
  info: 'M12 17v-5 M12 8h.01 M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z',
  keyboard: 'M4 6h16a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2z M6 10h.01 M10 10h.01 M14 10h.01 M18 10h.01 M7 14h10',
  link: 'M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71 M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71',
  moon: 'M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8z',
  minus: 'M5 12h14',
  open: 'M3 7h5l2 2h11v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z M3 7V5a2 2 0 0 1 2-2h4l2 2h4',
  plus: 'M12 5v14 M5 12h14',
  refresh: 'M21 12a9 9 0 0 1-15 6.7L3 16 M3 21v-5h5 M3 12a9 9 0 0 1 15-6.7L21 8 M21 3v5h-5',
  replace: 'M3 7h11 M10 3l4 4-4 4 M21 17H10 M14 13l-4 4 4 4',
  save: 'M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z M17 21v-8H7v8 M7 3v5h8',
  search: 'M21 21l-4.35-4.35 M10.5 18a7.5 7.5 0 1 1 0-15 7.5 7.5 0 0 1 0 15z',
  settings: 'M12 15.5A3.5 3.5 0 1 0 12 8a3.5 3.5 0 0 0 0 7.5z M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06A1.65 1.65 0 0 0 15 19.4a1.65 1.65 0 0 0-1 .6 1.65 1.65 0 0 0-.33 1.82V22a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 8.6 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-.6-1 1.65 1.65 0 0 0-1.82-.33H2a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 8.6a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-.6 1.65 1.65 0 0 0 .33-1.82V2a2 2 0 1 1 4 0v.09A1.65 1.65 0 0 0 15.4 4.6a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9c.14.37.37.7.6 1 .45.58 1.14.73 1.82.5H22a2 2 0 1 1 0 4h-.09A1.65 1.65 0 0 0 19.4 15z',
  sidebarHide: 'M4 5h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z M9 5v14 M15 8l-4 4 4 4',
  sidebarShow: 'M4 5h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z M9 5v14 M12 8l4 4-4 4',
  sun: 'M12 1v2 M12 21v2 M4.22 4.22l1.42 1.42 M18.36 18.36l1.42 1.42 M1 12h2 M21 12h2 M4.22 19.78l1.42-1.42 M18.36 5.64l1.42-1.42 M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10z',
  tocCollapseAll: 'M4 6h7 M4 12h10 M4 18h13 M17 9h5',
  tocExpandAll: 'M4 6h7 M4 12h10 M4 18h13 M19.5 6v6 M16.5 9h6',
  trash: 'M3 6h18 M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2 M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6 M10 11v6 M14 11v6',
  upload: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4 M17 8l-5-5-5 5 M12 3v12',
  x: 'M18 6 6 18 M6 6l12 12',
  eye: 'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  eyeOff: 'M3 3l18 18 M10.6 10.6A3 3 0 0 0 13.4 13.4 M9.9 4.2A10.7 10.7 0 0 1 12 4.9c6.5 0 10 7.1 10 7.1a18.4 18.4 0 0 1-3.2 4.2 M6.6 6.6C3.7 8.5 2 12 2 12s3.5 7.1 10 7.1a10.9 10.9 0 0 0 4.2-.8',
} as const;

const bridge = window.markdownBridge;
const openTabs = ref<OpenTab[]>([]);
const activeTabId = ref<string | null>(null);
const currentFile = ref<MarkdownFile | null>(null);
const source = ref('');
const lastSavedContent = ref('');
const session = ref<MarkdownSession>(createDefaultSession());
const isPreviewFullscreen = ref(false);
const previewZoom = ref(1);
const activeMermaidDiagram = shallowRef<ActiveMermaidDiagram | null>(null);
const activeImagePreview = shallowRef<ActiveImagePreview | null>(null);
const preview = ref<HTMLElement | null>(null);
const editor = ref<EditorSurface | null>(null);
const status = ref('请选择或打开一个支持的文档');
const activeEditorLine = ref(1);
const tocSearch = ref('');
const collapsedHeadingIds = ref(new Set<string>());
const activeHeadingId = ref('');
const editorSearchVisible = ref(false);
const editorSearch = ref('');
const editorReplace = ref('');
const editorSearchInput = ref<HTMLInputElement | null>(null);
const previewSearchRange = ref<SearchMatchRange | null>(null);
const bookmarkManagerOpen = ref(false);
const bookmarkSearch = ref('');
const bookmarkList = ref<HTMLElement | null>(null);
const bookmarkSearchInput = ref<HTMLInputElement | null>(null);
const selectedBookmarkId = ref<string | null>(null);
const imageAssets = ref<ImageAsset[]>([]);
const selectedAssetPath = ref('');
const imageUploadMode = ref<ImageUploadMode>(loadImageUploadMode());
const cloudUploadDialog = ref<CloudUploadDialog | null>(null);
const tabContextMenu = ref<TabContextMenu | null>(null);
const editorConfigDialogOpen = ref(false);
const editorConfigDraft = ref('');
const editorConfigError = ref('');
const closeConfirmationVisible = ref(false);
const closeConfirmationBusy = ref(false);
const helpPopoverPinned = ref(false);
const htmlPreviewSrc = ref('');
const recentFilesOpen = ref(false);
const isTocPanelCollapsed = ref(false);
const draggedTabId = ref<string | null>(null);
const activeResize = ref<'toc' | 'editor' | null>(null);
const cursorHistory = ref<CursorHistoryEntry[]>([]);
let sessionSaveTimer: number | undefined;
let untitledCounter = 1;
let cursorHistoryIndex = -1;
let isNavigatingCursorHistory = false;
let scrollSyncSource: 'editor' | 'preview' | null = null;
let scrollSyncFrame: number | undefined;
let removeExternalOpenListener: (() => void) | undefined;
let removeMarkdownFileChangedListener: (() => void) | undefined;
let removeToggleEditorShortcutListener: (() => void) | undefined;
let removeCloseRequestListener: (() => void) | undefined;
let removeAppMenuCommandListener: (() => void) | undefined;
let mermaidModalDragged = false;
let imageModalDragged = false;
let isRestoringStartup = false;
let isFlushingOpenQueue = false;
let lastRecentFilesDiagnosticSignature = '';
let htmlPreviewTimer: number | undefined;
const queuedOpenRequests: MarkdownOpenRequest[] = [];
const previewScrollOffset = -50;
const sessionSaveDelay = 200;
const previewZoomStep = 0.1;
const previewZoomMin = 0.7;
const previewZoomMax = 1.6;
const cursorHistoryMax = 200;
const cloudUploadPrefsKey = 'markdown-editor-cloud-upload-prefs';
const codeCopyResetTimers = new WeakMap<HTMLButtonElement, number>();
const codeCopyIconSvg = '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M8 8h10v12H8z M6 16H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>';
const codeCopySuccessSvg = '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M20 6 9 17l-5-5" /></svg>';

const currentDocumentKind = computed<DocumentKind>(() => documentKindFromFileName(currentFile.value?.path ?? currentFile.value?.name));
const currentDocumentLabel = computed(() => documentLabel(currentDocumentKind.value));
const currentEditorLanguage = computed(() => monacoLanguageForDocument(currentDocumentKind.value));
const isMarkdownDocument = computed(() => currentDocumentKind.value === 'markdown');
const isHtmlDocument = computed(() => currentDocumentKind.value === 'html');
const isJsonDocument = computed(() => currentDocumentKind.value === 'json');
const currentEncoding = computed(() => normalizeTextEncoding(currentFile.value?.encoding));
const currentEncodingLabel = computed(() => textEncodingLabel(currentEncoding.value));
const hasPreviewPane = computed(() => isMarkdownDocument.value || isHtmlDocument.value || isJsonDocument.value);
const previewHtml = computed(() => rewriteLocalImageSources(`${renderDocumentPreview(source.value, currentDocumentKind.value)}<!-- theme:${session.value.theme} -->`));
const headingTree = computed(() => applyCollapsedState(buildDocumentHeadingTree(source.value, currentDocumentKind.value)));
const visibleHeadingTree = computed(() => filterHeadingTree(headingTree.value, tocSearch.value));
const title = computed(() => currentFile.value?.name ?? 'Markdown 纪');
const activeTab = computed(() => openTabs.value.find((tab) => tab.id === activeTabId.value) ?? null);
const appVersion = __APP_VERSION__;
const activeMermaidStyle = computed(() => {
  const diagram = activeMermaidDiagram.value;
  if (!diagram) {
    return {};
  }
  return {
    transform: `translate(${diagram.x}px, ${diagram.y}px) scale(${diagram.scale})`,
  };
});
const activeImageStyle = computed(() => {
  const image = activeImagePreview.value;
  if (!image) {
    return {};
  }
  return {
    transform: `translate(${image.x}px, ${image.y}px) scale(${image.scale})`,
  };
});
const isEditorForcedVisible = computed(() => currentFile.value !== null && currentDocumentKind.value !== 'markdown');
const isEditorVisible = computed(() => isEditorForcedVisible.value || session.value.editorVisible || !currentFile.value);
const isPreviewSearchMode = computed(() => (
  editorSearchVisible.value
  && hasPreviewPane.value
  && !session.value.previewHidden
  && (!isEditorVisible.value || isPreviewFullscreen.value)
));
const hasUnsavedChanges = computed(() => currentFile.value !== null && source.value !== lastSavedContent.value);
const unsavedTabCount = computed(() => openTabs.value.filter((tab) => tab.source !== tab.lastSavedContent).length);
const displayTitle = computed(() => (hasUnsavedChanges.value ? `${title.value} *` : title.value));
const statusText = computed(() => (hasUnsavedChanges.value ? `${status.value} · 未保存` : status.value));
const recentFilePaths = computed(() => normalizeRecentFiles(session.value.recentFiles));
const recentFileOptions = computed(() => buildRecentFileOptions(recentFilePaths.value));
const shortcutModifier = computed(() => (navigator.platform.toLowerCase().includes('mac') ? 'Cmd' : 'Ctrl'));
const openShortcutHint = computed(() => `打开文档 (${shortcutModifier.value}+O)`);
const saveShortcutHint = computed(() => `保存 ${currentDocumentLabel.value} 文件 (${shortcutModifier.value}+S)`);
const refreshShortcutHint = computed(() => `从磁盘重新读取当前 ${currentDocumentLabel.value} 文件 (${shortcutModifier.value}+R)`);
const previewShortcutHint = computed(() => `显示/隐藏预览 (${shortcutModifier.value}+P)`);
const editorShortcutHint = computed(() => `切换阅读/编辑模式 (${shortcutModifier.value}+E)`);
const addBookmarkShortcutHint = computed(() => {
  const action = currentLineHasBookmark.value ? '取消当前行书签' : '添加当前位置到书签';
  const suffix = currentLineHasBookmark.value ? `，当前行已有 ${currentLineBookmarkCount.value} 个书签` : '';
  return `${action} (${shortcutModifier.value}+Shift+B)${suffix}`;
});
const bookmarkManagerShortcutHint = computed(() => `显示书签列表 (${shortcutModifier.value}+B)，共 ${bookmarkTotalCount.value} 个书签`);
const previewZoomPercent = computed(() => Math.round(previewZoom.value * 100));
const previewZoomStyle = computed(() => ({
  '--preview-zoom': previewZoom.value,
}));
const isPreviewZoomResettable = computed(() => Math.abs(previewZoom.value - 1) > 0.001);
const tocColumnWidth = computed(() => (isTocPanelCollapsed.value ? 44 : session.value.tocWidth));
const normalizedBookmarks = computed(() => normalizeBookmarks(session.value.bookmarks));
const bookmarkTotalCount = computed(() => normalizedBookmarks.value.length);
const currentFileBookmarks = computed(() => {
  const currentKey = currentBookmarkFileKey();
  if (!currentKey) {
    return [];
  }
  return normalizedBookmarks.value.filter((bookmark) => bookmarkFileKey(bookmark) === currentKey);
});
const currentFileBookmarkCount = computed(() => currentFileBookmarks.value.length);
const currentFileBookmarkLines = computed(() => currentFileBookmarks.value.map((bookmark) => bookmark.lineNumber));
const currentLineBookmarkCount = computed(() => (
  currentFileBookmarks.value.filter((bookmark) => bookmark.lineNumber === activeEditorLine.value).length
));
const currentLineHasBookmark = computed(() => currentLineBookmarkCount.value > 0);
const bookmarkManagerTitle = computed(() => {
  const scopeCount = session.value.bookmarkViewMode === 'current' ? currentFileBookmarkCount.value : bookmarkTotalCount.value;
  const scopeLabel = session.value.bookmarkViewMode === 'current' ? '当前文件' : '所有文件';
  return `书签 · ${scopeLabel} ${scopeCount}`;
});
const visibleBookmarks = computed<BookmarkListItem[]>(() => {
  const query = bookmarkSearch.value.trim().toLocaleLowerCase();
  const currentKey = currentBookmarkFileKey();
  const bookmarks = normalizedBookmarks.value
    .filter((bookmark) => session.value.bookmarkViewMode === 'all' || bookmarkFileKey(bookmark) === currentKey)
    .map((bookmark) => ({
      ...bookmark,
      searchableText: [
        bookmark.fileName,
        bookmark.filePath ?? '',
        `${bookmark.lineNumber}:${bookmark.column}`,
        bookmark.excerpt,
      ].join(' ').toLocaleLowerCase(),
    }));

  if (!query) {
    return bookmarks;
  }
  return bookmarks.filter((bookmark) => bookmark.searchableText.includes(query));
});
const selectedBookmark = computed(() => visibleBookmarks.value.find((bookmark) => bookmark.id === selectedBookmarkId.value) ?? null);
watch(recentFilePaths, (filePaths) => {
  logRecentFileDiagnostics(filePaths);
}, { immediate: true });
watch(visibleBookmarks, (bookmarks) => {
  if (bookmarks.some((bookmark) => bookmark.id === selectedBookmarkId.value)) {
    revealSelectedBookmark();
    return;
  }
  selectedBookmarkId.value = bookmarks[0]?.id ?? null;
  revealSelectedBookmark();
});
watch(editorSearch, () => {
  previewSearchRange.value = null;
  clearPreviewSearchHighlight();
});
const helpGroups = computed<HelpGroup[]>(() => [
  {
    title: '文件',
    items: [
      { label: '新建 Markdown', shortcut: `${shortcutModifier.value}+T`, detail: '创建一个未保存的空白 Markdown 标签页' },
      { label: '打开文档', shortcut: `${shortcutModifier.value}+O`, detail: '选择 Markdown、HTML、TXT/Text 或 JSON 文件' },
      { label: '保存 / 另存为', shortcut: `${shortcutModifier.value}+S`, detail: '保存当前文件；菜单栏里也提供另存为和全部保存' },
      { label: '刷新当前文件', shortcut: `${shortcutModifier.value}+R`, detail: '从磁盘重新读取；有未保存修改时不会覆盖' },
      { label: '最近文件', shortcut: '', detail: '快速打开最近访问过的支持文档' },
      { label: '导出 HTML/PDF', shortcut: '', detail: '把当前渲染结果导出为独立文件' },
    ],
  },
  {
    title: '编辑',
    items: [
      { label: '搜索 / 替换', shortcut: `${shortcutModifier.value}+F`, detail: '打开源码搜索栏，支持查找、替换和全部替换' },
      { label: '切换书签', shortcut: `${shortcutModifier.value}+Shift+B`, detail: '当前行无书签时添加，有书签时取消' },
      { label: '书签列表', shortcut: `${shortcutModifier.value}+B`, detail: '搜索、按文件筛选、键盘选择、跳转或删除书签' },
      { label: '光标历史', shortcut: 'Ctrl+[ / Ctrl+]', detail: '在跨行或跨文件的光标位置之间后退和前进' },
      { label: '阅读/编辑', shortcut: `${shortcutModifier.value}+E`, detail: '阅读模式只显示预览，需要时切回源码编辑' },
      { label: 'Vim 与编辑器配置', shortcut: '', detail: '开启 Vim 模式，或配置 Monaco / Vim JSON 选项' },
      { label: 'JSON 格式化', shortcut: '', detail: 'JSON 文件可格式化为 2 空格缩进，或压缩为单行' },
    ],
  },
  {
    title: '插入与资源',
    items: [
      { label: '表格 / 链接 / 代码块', shortcut: `${shortcutModifier.value}+K`, detail: '从插入菜单或编辑器工具栏插入常用 Markdown 片段' },
      { label: '图片资源', shortcut: '', detail: '导入或粘贴图片到当前文档的 assets/images 目录' },
      { label: '云端图片', shortcut: '', detail: '切换粘贴图片上传方式，上传后插入远程图片链接' },
      { label: '图片预览', shortcut: '', detail: '在预览中查看、放大、拖拽和下载 Markdown 图片' },
    ],
  },
  {
    title: '视图',
    items: [
      { label: '显示/隐藏预览', shortcut: `${shortcutModifier.value}+P`, detail: '编辑时切换右侧预览区域' },
      { label: '预览缩放', shortcut: `${shortcutModifier.value}+/ ${shortcutModifier.value}+-`, detail: '放大或缩小 Markdown 预览' },
      { label: '还原预览缩放', shortcut: `${shortcutModifier.value}+0`, detail: '把预览缩放还原为 100%' },
      { label: '目录', shortcut: '', detail: '搜索、折叠标题，并跳转到对应位置' },
      { label: 'Mermaid 预览', shortcut: `${shortcutModifier.value}+滚轮`, detail: '在预览或放大视图中缩放，拖拽移动图表' },
      { label: '关闭弹窗', shortcut: 'Esc', detail: '关闭 Mermaid 或图片放大视图' },
    ],
  },
]);
const gridStyle = computed(() => {
  if (!hasPreviewPane.value) {
    return {
      gridTemplateColumns: `${tocColumnWidth.value}px ${isTocPanelCollapsed.value ? 0 : 6}px minmax(0, 1fr) 0 0`,
    };
  }

  if (isPreviewFullscreen.value) {
    return {
      gridTemplateColumns: `${tocColumnWidth.value}px ${isTocPanelCollapsed.value ? 0 : 6}px minmax(0, 1fr) 6px 0`,
    };
  }

  if (!isEditorVisible.value) {
    return {
      gridTemplateColumns: `${tocColumnWidth.value}px ${isTocPanelCollapsed.value ? 0 : 6}px 0 0 minmax(0, 1fr)`,
    };
  }

  if (session.value.previewHidden) {
    return {
      gridTemplateColumns: `${tocColumnWidth.value}px ${isTocPanelCollapsed.value ? 0 : 6}px minmax(0, 1fr) 6px 0`,
    };
  }

  return {
    gridTemplateColumns: `${tocColumnWidth.value}px ${isTocPanelCollapsed.value ? 0 : 6}px minmax(0, ${session.value.editorWidth}px) 6px minmax(0, 1fr)`,
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
  const markdownPath = currentFilePath();
  if (typeof document === 'undefined') {
    return html;
  }

  const template = document.createElement('template');
  template.innerHTML = html;
  template.content.querySelectorAll<HTMLImageElement>('img[src]').forEach((image) => {
    const sourcePath = image.getAttribute('src') ?? '';
    const shouldRewriteLocal = markdownPath && bridge?.assetUrl && !/^(?:[a-z]+:|#|\/)/i.test(sourcePath);
    if (shouldRewriteLocal) {
      image.dataset.originalSrc = sourcePath;
      image.src = bridge.assetUrl(markdownPath, sourcePath);
    }
    enhanceMarkdownImage(image);
  });
  return template.innerHTML;
}

function enhanceMarkdownImage(image: HTMLImageElement): void {
  if (image.closest('.mermaid-panzoom, .markdown-image-frame')) {
    return;
  }

  image.loading = image.loading || 'lazy';
  image.dataset.imageSrc = image.getAttribute('src') ?? '';
  image.dataset.imageTitle = image.getAttribute('alt') || '文档图片';
  image.classList.add('markdown-image');

  const frame = document.createElement('span');
  frame.className = 'markdown-image-frame';
  frame.dataset.imageSrc = image.dataset.imageSrc;
  frame.dataset.imageTitle = image.dataset.imageTitle;

  const actions = document.createElement('span');
  actions.className = 'markdown-image-actions';
  actions.setAttribute('aria-label', '图片操作');
  actions.innerHTML = [
    '<button class="icon-button" type="button" data-image-action="fullscreen" aria-label="查看图片" title="查看图片">⛶</button>',
    '<button class="icon-button" type="button" data-image-action="download" aria-label="下载图片" title="下载图片">↓</button>',
  ].join('');

  image.replaceWith(frame);
  frame.append(actions, image);
}

function escapeCssIdentifier(value: string): string {
  return typeof CSS !== 'undefined' && typeof CSS.escape === 'function'
    ? CSS.escape(value)
    : value.replace(/["\\]/g, '\\$&');
}

function nextDraftId(): string {
  return `draft:${Date.now()}:${untitledCounter++}`;
}

function currentFilePath(): string | null {
  return currentFile.value?.path ?? null;
}

function normalizeTextEncoding(encoding: unknown): TextEncoding {
  if (typeof encoding !== 'string') {
    return defaultTextEncoding;
  }
  const normalized = encoding.trim().toLowerCase().replace(/_/g, '-');
  if (normalized === 'utf-8' || normalized === 'utf8') {
    return 'utf8';
  }
  if (normalized === 'utf-16le' || normalized === 'utf16le' || normalized === 'utf16-le') {
    return 'utf16-le';
  }
  if (normalized === 'utf-16be' || normalized === 'utf16be' || normalized === 'utf16-be') {
    return 'utf16-be';
  }
  if (normalized === 'windows-1252' || normalized === 'win1252' || normalized === 'cp1252') {
    return 'windows1252';
  }
  return textEncodingOptions.some((option) => option.value === normalized) ? normalized as TextEncoding : defaultTextEncoding;
}

function textEncodingLabel(encoding: unknown): string {
  const normalized = normalizeTextEncoding(encoding);
  return textEncodingOptions.find((option) => option.value === normalized)?.label ?? 'UTF-8';
}

function encodingIpcArgument(encoding: unknown): string | undefined {
  const normalized = normalizeTextEncoding(encoding);
  return normalized === defaultTextEncoding ? undefined : normalized;
}

function readMarkdownFileWithEncoding(filePath: string, encoding?: unknown): Promise<MarkdownFile> {
  const normalized = encodingIpcArgument(encoding);
  return normalized === undefined
    ? bridge!.readMarkdownFile(filePath)
    : bridge!.readMarkdownFile(filePath, normalized);
}

function saveMarkdownFileWithEncoding(filePath: string, content: string, encoding?: unknown): Promise<MarkdownFile> {
  const normalized = encodingIpcArgument(encoding);
  return normalized === undefined
    ? bridge!.saveMarkdownFile(filePath, content)
    : bridge!.saveMarkdownFile(filePath, content, normalized);
}

function saveMarkdownFileAsWithEncoding(content: string, defaultName: string, encoding?: unknown): Promise<MarkdownFile | null> {
  const normalized = encodingIpcArgument(encoding);
  return normalized === undefined
    ? bridge!.saveMarkdownFileAs(content, defaultName)
    : bridge!.saveMarkdownFileAs(content, defaultName, normalized);
}

function setFileEncoding(file: MarkdownFile, encoding: unknown): MarkdownFile {
  return {
    ...file,
    encoding: normalizeTextEncoding(encoding),
  };
}

function tabPath(tab: OpenTab): string | null {
  return tab.file.path;
}

function bookmarkFileKey(bookmark: Pick<MarkdownBookmark, 'filePath' | 'tabId'>): string {
  return (bookmark.filePath ?? bookmark.tabId).replace(/\\/g, '/').trim().toLocaleLowerCase();
}

function currentBookmarkFileKey(): string {
  return bookmarkFileKey({
    filePath: currentFile.value?.path ?? null,
    tabId: activeTabId.value ?? '',
  });
}

function bookmarkTargetKey(bookmark: Pick<MarkdownBookmark, 'column' | 'filePath' | 'lineNumber' | 'tabId'>): string {
  return `${bookmarkFileKey(bookmark)}:${bookmark.lineNumber}:${bookmark.column}`;
}

function bookmarkExcerpt(lineNumber: number): string {
  return source.value.split('\n')[lineNumber - 1]?.trim().slice(0, 160) ?? '';
}

function formatBookmarkPath(bookmark: MarkdownBookmark): string {
  return bookmark.filePath ?? '未保存标签页';
}

function setBookmarkViewMode(viewMode: BookmarkViewMode): void {
  persistSession({ bookmarkViewMode: viewMode });
  selectFirstVisibleBookmark();
}

function selectFirstVisibleBookmark(): void {
  selectedBookmarkId.value = visibleBookmarks.value[0]?.id ?? null;
}

function toggleBookmarkAtCursor(): void {
  const tab = activeTab.value;
  const position = editor.value?.getCursorPosition();
  if (!tab || !position) {
    status.value = '没有可切换书签的编辑位置';
    return;
  }

  const currentKey = bookmarkFileKey({
    filePath: tab.file.path,
    tabId: tab.id,
  });
  const bookmarksOnLine = normalizedBookmarks.value.filter((bookmark) => (
    bookmarkFileKey(bookmark) === currentKey && bookmark.lineNumber === position.lineNumber
  ));
  if (bookmarksOnLine.length > 0) {
    const removedIds = new Set(bookmarksOnLine.map((bookmark) => bookmark.id));
    const nextBookmarks = normalizedBookmarks.value.filter((bookmark) => !removedIds.has(bookmark.id));
    const nextCurrentFileBookmarkCount = nextBookmarks.filter((bookmark) => bookmarkFileKey(bookmark) === currentKey).length;
    persistSession({ bookmarks: nextBookmarks });
    activeEditorLine.value = position.lineNumber;
    if (selectedBookmarkId.value && removedIds.has(selectedBookmarkId.value)) {
      selectedBookmarkId.value = visibleBookmarks.value[0]?.id ?? null;
    }
    status.value = `已取消当前行 ${bookmarksOnLine.length} 个书签 · 当前文件 ${nextCurrentFileBookmarkCount} 个`;
    return;
  }

  const now = Date.now();
  const candidate: MarkdownBookmark = {
    id: `bookmark:${now}:${Math.random().toString(36).slice(2, 8)}`,
    tabId: tab.id,
    filePath: tab.file.path,
    fileName: tab.file.name,
    lineNumber: position.lineNumber,
    column: position.column,
    excerpt: bookmarkExcerpt(position.lineNumber),
    createdAt: now,
    updatedAt: now,
  };
  const targetKey = bookmarkTargetKey(candidate);
  const nextBookmarks = normalizedBookmarks.value.filter((bookmark) => bookmarkTargetKey(bookmark) !== targetKey);
  nextBookmarks.unshift(candidate);
  const nextCurrentFileBookmarkCount = nextBookmarks.filter((bookmark) => bookmarkFileKey(bookmark) === bookmarkFileKey(candidate)).length;
  persistSession({ bookmarks: nextBookmarks });
  activeEditorLine.value = candidate.lineNumber;
  selectedBookmarkId.value = candidate.id;
  status.value = `已添加书签 ${candidate.fileName}:${candidate.lineNumber}:${candidate.column} · 当前文件 ${nextCurrentFileBookmarkCount} 个`;
}

function openBookmarkManager(): void {
  bookmarkManagerOpen.value = true;
  if (!selectedBookmark.value) {
    selectFirstVisibleBookmark();
  }
  void nextTick(() => bookmarkSearchInput.value?.focus());
}

function closeBookmarkManager(): void {
  bookmarkManagerOpen.value = false;
  bookmarkSearch.value = '';
  void nextTick(() => editor.value?.focus());
}

function moveBookmarkSelection(delta: number): void {
  const bookmarks = visibleBookmarks.value;
  if (bookmarks.length === 0) {
    selectedBookmarkId.value = null;
    return;
  }
  const currentIndex = Math.max(0, bookmarks.findIndex((bookmark) => bookmark.id === selectedBookmarkId.value));
  const nextIndex = Math.min(bookmarks.length - 1, Math.max(0, currentIndex + delta));
  selectedBookmarkId.value = bookmarks[nextIndex].id;
  revealSelectedBookmark();
}

function revealSelectedBookmark(): void {
  const bookmarkId = selectedBookmarkId.value;
  if (!bookmarkId) {
    return;
  }
  void nextTick(() => {
    const row = bookmarkList.value?.querySelector<HTMLElement>(`[data-bookmark-id="${escapeCssIdentifier(bookmarkId)}"]`);
    row?.scrollIntoView({ block: 'nearest' });
  });
}

function deleteBookmark(bookmarkId: string, event?: Event): void {
  event?.stopPropagation();
  const removed = normalizedBookmarks.value.find((bookmark) => bookmark.id === bookmarkId);
  if (!removed) {
    return;
  }

  persistSession({ bookmarks: normalizedBookmarks.value.filter((bookmark) => bookmark.id !== bookmarkId) });
  if (selectedBookmarkId.value === bookmarkId) {
    selectedBookmarkId.value = visibleBookmarks.value[0]?.id ?? null;
  }
  status.value = `已删除书签 ${removed.fileName}:${removed.lineNumber}:${removed.column}`;
}

async function activateBookmark(bookmark: MarkdownBookmark | null = selectedBookmark.value): Promise<void> {
  if (!bookmark) {
    status.value = '没有可跳转的书签';
    return;
  }

  const openedTab = openTabs.value.find((tab) => tab.id === bookmark.tabId)
    ?? openTabs.value.find((tab) => bookmark.filePath !== null && tab.file.path === bookmark.filePath);
  if (openedTab) {
    activateTab(openedTab.id);
  } else if (bookmark.filePath) {
    await openFilePath(bookmark.filePath);
  } else {
    status.value = `无法跳转到未打开的书签 ${bookmark.fileName}`;
    return;
  }

  await nextTick();
  if (!isEditorVisible.value) {
    persistSession({ editorVisible: true, previewHidden: false });
    await nextTick();
  }
  editor.value?.setCursorPosition(bookmark);
  syncPreviewToLine(bookmark.lineNumber);
  updateActiveHeadingFromSourceLine(bookmark.lineNumber);
  status.value = `已跳转到书签 ${bookmark.fileName}:${bookmark.lineNumber}:${bookmark.column}`;
  bookmarkManagerOpen.value = false;
}

function onBookmarkManagerKeyDown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    closeBookmarkManager();
    event.preventDefault();
    return;
  }
  if (event.key === 'ArrowDown') {
    moveBookmarkSelection(event.ctrlKey ? 7 : 1);
    event.preventDefault();
    return;
  }
  if (event.key === 'ArrowUp') {
    moveBookmarkSelection(event.ctrlKey ? -7 : -1);
    event.preventDefault();
    return;
  }
  if (event.key === 'Enter') {
    event.preventDefault();
    void activateBookmark();
    return;
  }
  const target = event.target;
  const isEditingSearch = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement;
  if ((event.key === 'Delete' || event.key === 'Backspace') && !isEditingSearch && selectedBookmarkId.value) {
    deleteBookmark(selectedBookmarkId.value, event);
    event.preventDefault();
  }
}

function currentCursorHistoryEntry(): CursorHistoryEntry | null {
  const tab = activeTab.value;
  const position = editor.value?.getCursorPosition();
  if (!tab || !position) {
    return null;
  }

  return {
    tabId: tab.id,
    filePath: tab.file.path,
    fileName: tab.file.name,
    lineNumber: position.lineNumber,
    column: position.column,
  };
}

function isSameCursorLine(first: CursorHistoryEntry, second: CursorHistoryEntry): boolean {
  return first.tabId === second.tabId
    && first.filePath === second.filePath
    && first.lineNumber === second.lineNumber;
}

function pushCursorHistoryEntry(entry: CursorHistoryEntry): void {
  if (cursorHistory.value.length >= cursorHistoryMax) {
    cursorHistory.value.shift();
    cursorHistoryIndex = Math.max(-1, cursorHistoryIndex - 1);
  }
  cursorHistory.value.push(entry);
  cursorHistoryIndex = cursorHistory.value.length - 1;
}

function rememberCursorPosition(): void {
  if (isNavigatingCursorHistory) {
    return;
  }

  const entry = currentCursorHistoryEntry();
  if (!entry) {
    return;
  }

  const current = cursorHistory.value[cursorHistoryIndex];
  if (!current) {
    pushCursorHistoryEntry(entry);
    return;
  }

  if (isSameCursorLine(current, entry)) {
    Object.assign(current, entry);
    return;
  }

  if (cursorHistoryIndex < cursorHistory.value.length - 1) {
    cursorHistory.value.splice(cursorHistoryIndex + 1);
  }

  pushCursorHistoryEntry(entry);
}

function activeTabMatchesCursorHistory(entry: CursorHistoryEntry): boolean {
  return activeTabId.value === entry.tabId || Boolean(entry.filePath && currentFile.value?.path === entry.filePath);
}

async function activateCursorHistoryTarget(entry: CursorHistoryEntry): Promise<boolean> {
  const openedTab = openTabs.value.find((tab) => tab.id === entry.tabId)
    ?? openTabs.value.find((tab) => entry.filePath !== null && tab.file.path === entry.filePath);
  if (openedTab) {
    if (!activeTabMatchesCursorHistory(entry)) {
      activateTab(openedTab.id);
      await nextTick();
    }
    return true;
  }

  if (!entry.filePath || !bridge) {
    return false;
  }

  await openFilePath(entry.filePath);
  await nextTick();
  return currentFile.value?.path === entry.filePath;
}

async function jumpToCursorHistory(direction: -1 | 1): Promise<void> {
  rememberCursorPosition();
  const targetIndex = cursorHistoryIndex + direction;
  const target = cursorHistory.value[targetIndex];
  if (!target) {
    status.value = direction < 0 ? '没有更早的光标历史' : '没有更新的光标历史';
    return;
  }

  isNavigatingCursorHistory = true;
  try {
    if (!await activateCursorHistoryTarget(target)) {
      status.value = `无法跳转到 ${target.fileName}`;
      return;
    }

    cursorHistoryIndex = targetIndex;
    await nextTick();
    editor.value?.setCursorPosition(target);
    syncPreviewToLine(target.lineNumber);
    updateActiveHeadingFromSourceLine(target.lineNumber);
    status.value = `已跳转到 ${target.fileName}:${target.lineNumber}:${target.column}`;
  } finally {
    await nextTick();
    isNavigatingCursorHistory = false;
  }
}

function activeScrollTop(): number {
  return preview.value?.scrollTop ?? activeTab.value?.scrollTop ?? session.value.scrollTop;
}

function syncActiveTabState(): void {
  const tab = activeTab.value;
  if (!tab || !currentFile.value) {
    return;
  }

  tab.file = currentFile.value;
  tab.source = source.value;
  tab.lastSavedContent = lastSavedContent.value;
  tab.scrollTop = activeScrollTop();
}

function serializedOpenTabs(): MarkdownSession['tabs'] {
  return openTabs.value.map((tab) => ({
    id: tab.id,
    filePath: tab.file.path,
    name: tab.file.name,
    scrollTop: tab.scrollTop,
    content: tab.file.path ? undefined : tab.source,
    lastSavedContent: tab.file.path ? undefined : tab.lastSavedContent,
    encoding: normalizeTextEncoding(tab.file.encoding),
  }));
}

function tabSessionPatch(patch: Partial<MarkdownSession> = {}): Partial<MarkdownSession> {
  return {
    filePath: currentFilePath(),
    tabs: serializedOpenTabs(),
    activeTabId: activeTabId.value,
    scrollTop: activeScrollTop(),
    ...patch,
  };
}

function documentKindForFile(file: MarkdownFile): DocumentKind {
  return documentKindFromFileName(file.path ?? file.name);
}

function forcedEditorPatchForFile(file: MarkdownFile): Partial<MarkdownSession> {
  return documentKindForFile(file) === 'markdown' ? {} : { editorVisible: true };
}

function persistableSession(): MarkdownSession {
  syncActiveTabState();
  return {
    ...session.value,
    ...tabSessionPatch(),
  };
}

function cloneableSession(snapshot?: MarkdownSession): MarkdownSession {
  const normalized = normalizeSession(snapshot ?? persistableSession());
  return {
    filePath: normalized.filePath,
    tabs: normalized.tabs.map((tab) => ({
      id: tab.id,
      filePath: tab.filePath,
      name: tab.name,
      scrollTop: tab.scrollTop,
      content: tab.content,
      lastSavedContent: tab.lastSavedContent,
      encoding: tab.encoding,
    })),
    activeTabId: normalized.activeTabId,
    bookmarks: normalized.bookmarks.map((bookmark) => ({ ...bookmark })),
    bookmarkViewMode: normalized.bookmarkViewMode,
    recentFiles: [...normalized.recentFiles],
    scrollTop: normalized.scrollTop,
    tocWidth: normalized.tocWidth,
    editorWidth: normalized.editorWidth,
    previewHidden: normalized.previewHidden,
    editorVisible: normalized.editorVisible,
    editorPreferences: {
      vimEnabled: normalized.editorPreferences.vimEnabled,
      configText: normalized.editorPreferences.configText,
    },
    theme: normalized.theme,
  };
}

function persistTabSession(
  patch: Partial<MarkdownSession> = {},
  options: { deferred?: boolean; syncActive?: boolean } = {},
): void {
  if (options.syncActive !== false) {
    syncActiveTabState();
  }
  const nextSession = mergeSession(session.value, tabSessionPatch(patch));
  session.value = nextSession;
  if (options.deferred) {
    scheduleSessionSave();
  } else {
    saveSessionNow(nextSession);
  }
}

function saveSessionNow(snapshot?: MarkdownSession): void {
  if (sessionSaveTimer !== undefined) {
    window.clearTimeout(sessionSaveTimer);
    sessionSaveTimer = undefined;
  }
  void bridge?.saveSession(cloneableSession(snapshot));
}

function scheduleSessionSave(): void {
  if (sessionSaveTimer !== undefined) {
    window.clearTimeout(sessionSaveTimer);
  }

  sessionSaveTimer = window.setTimeout(() => {
    sessionSaveTimer = undefined;
    void bridge?.saveSession(cloneableSession());
  }, sessionSaveDelay);
}

function saveSessionBeforeUnload(): void {
  if (sessionSaveTimer !== undefined) {
    window.clearTimeout(sessionSaveTimer);
    sessionSaveTimer = undefined;
  }

  try {
    bridge?.saveSessionSync?.(cloneableSession());
  } catch (error) {
    debugLog('session.save-sync.failed', {
      message: error instanceof Error ? error.message : String(error),
    });
    saveSessionNow();
  }
}

async function updateHtmlPreview(): Promise<void> {
  if (!isHtmlDocument.value || !bridge?.htmlPreviewUrl) {
    htmlPreviewSrc.value = '';
    return;
  }

  try {
    htmlPreviewSrc.value = await bridge.htmlPreviewUrl({
      filePath: currentFile.value?.path ?? null,
      content: source.value,
    });
  } catch (error) {
    htmlPreviewSrc.value = '';
    status.value = 'HTML 预览服务不可用';
    debugLog('html-preview.url.failed', {
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

function scheduleHtmlPreviewReload(): void {
  if (htmlPreviewTimer !== undefined) {
    window.clearTimeout(htmlPreviewTimer);
    htmlPreviewTimer = undefined;
  }

  if (!isHtmlDocument.value) {
    htmlPreviewSrc.value = '';
    return;
  }

  htmlPreviewTimer = window.setTimeout(() => {
    htmlPreviewTimer = undefined;
    void updateHtmlPreview();
  }, 180);
}

function debugLog(event: string, payload: Record<string, unknown> = {}): void {
  rendererLog.info(event, payload);
  void bridge?.debugLog?.(event, payload);
}

function logRecentFileDiagnostics(filePaths: string[]): void {
  const duplicateBasenameGroups = recentFileDuplicateBasenameGroups(filePaths);
  if (duplicateBasenameGroups.length === 0) {
    lastRecentFilesDiagnosticSignature = '';
    return;
  }

  const signature = JSON.stringify(duplicateBasenameGroups);
  if (signature === lastRecentFilesDiagnosticSignature) {
    return;
  }
  lastRecentFilesDiagnosticSignature = signature;
  debugLog('recent-files.duplicate-basename.detected', {
    total: filePaths.length,
    duplicateGroups: duplicateBasenameGroups,
  });
}

function unsavedTabs(): OpenTab[] {
  syncActiveTabState();
  return openTabs.value.filter((tab) => tab.source !== tab.lastSavedContent);
}

async function saveAllUnsavedTabs(): Promise<boolean> {
  if (!bridge) {
    return false;
  }

  for (const tab of unsavedTabs()) {
    if (!tab.file.path) {
      await saveTabAs(tab.id);
      if (!tab.file.path || tab.source !== tab.lastSavedContent) {
        return false;
      }
      continue;
    }

    const saved = await saveMarkdownFileWithEncoding(tab.file.path, tab.source, tab.file.encoding);
    tab.file = saved;
    tab.source = saved.content;
    tab.lastSavedContent = saved.content;
    if (tab.id === activeTabId.value) {
      currentFile.value = saved;
      source.value = saved.content;
      lastSavedContent.value = saved.content;
      status.value = `已保存 ${saved.path}（${textEncodingLabel(saved.encoding)}）`;
    }
  }

  saveSessionNow();
  return true;
}

function discardUnsavedChangesBeforeClose(): void {
  syncActiveTabState();
  openTabs.value = openTabs.value.flatMap((tab) => {
    if (tab.source === tab.lastSavedContent) {
      return [tab];
    }
    if (!tab.file.path) {
      return [];
    }

    return [{
      ...tab,
      file: {
        ...tab.file,
        content: tab.lastSavedContent,
      },
      source: tab.lastSavedContent,
    }];
  });

  const active = openTabs.value.find((tab) => tab.id === activeTabId.value) ?? openTabs.value[0] ?? null;
  activeTabId.value = active?.id ?? null;
  currentFile.value = active?.file ?? null;
  source.value = active?.source ?? '';
  lastSavedContent.value = active?.lastSavedContent ?? '';
  status.value = active?.file.path ?? (active ? '未保存的新文档' : '请选择或打开一个支持的文档');
  saveSessionNow();
}

async function closeApplication(): Promise<void> {
  debugLog('app.close-application.start', {
    hasConfirmClose: Boolean(bridge?.confirmClose),
    hasConfirmCloseSync: Boolean(bridge?.confirmCloseSync),
    unsavedCount: unsavedTabs().length,
  });
  saveSessionBeforeUnload();
  if (bridge?.confirmCloseSync) {
    bridge.confirmCloseSync();
    debugLog('app.close-application.confirm-close-sync-sent');
    return;
  }
  if (bridge?.confirmClose) {
    await bridge.confirmClose();
    debugLog('app.close-application.confirm-close-sent');
    return;
  }
  await bridge?.quitApp?.();
  debugLog('app.close-application.quit-sent');
}

async function requestApplicationClose(): Promise<void> {
  const unsavedCount = unsavedTabs().length;
  debugLog('app.close-request.received', { unsavedCount });
  if (unsavedCount === 0) {
    closeConfirmationVisible.value = false;
    await closeApplication();
    return;
  }

  closeConfirmationVisible.value = true;
}

async function saveAllAndClose(): Promise<void> {
  closeConfirmationBusy.value = true;
  try {
    if (unsavedTabs().length === 0) {
      closeConfirmationVisible.value = false;
      await closeApplication();
      return;
    }
    const saved = await saveAllUnsavedTabs();
    if (saved) {
      closeConfirmationVisible.value = false;
      await closeApplication();
      return;
    }
    status.value = '仍有未保存文件，已取消关闭';
  } catch {
    status.value = '保存失败，已取消关闭';
  } finally {
    closeConfirmationBusy.value = false;
  }
}

async function discardAllAndClose(): Promise<void> {
  closeConfirmationBusy.value = true;
  try {
    if (unsavedTabs().length > 0) {
      discardUnsavedChangesBeforeClose();
    }
    closeConfirmationVisible.value = false;
    await closeApplication();
  } finally {
    closeConfirmationBusy.value = false;
  }
}

function cancelCloseConfirmation(): void {
  closeConfirmationVisible.value = false;
}

function recentFileName(filePath: string): string {
  return filePath.split(/[\\/]/).pop() || filePath;
}

function recentFileDirectory(filePath: string): string {
  const normalized = filePath.replace(/\\/g, '/');
  const slashIndex = normalized.lastIndexOf('/');
  if (slashIndex < 0) {
    return '';
  }
  if (slashIndex === 0) {
    return '/';
  }
  return normalized.slice(0, slashIndex);
}

function recentFileParentName(filePath: string): string {
  const directory = recentFileDirectory(filePath);
  if (!directory) {
    return '.';
  }
  if (directory === '/') {
    return '/';
  }
  return directory.split('/').filter(Boolean).at(-1) ?? directory;
}

function buildRecentFileOptions(filePaths: string[]): RecentFileOption[] {
  const paths = normalizeRecentFiles(filePaths);
  const nameCounts = new Map<string, number>();
  paths.forEach((filePath) => {
    const key = recentFileName(filePath).toLocaleLowerCase();
    nameCounts.set(key, (nameCounts.get(key) ?? 0) + 1);
  });

  const candidateLabels = paths.map((filePath) => {
    const name = recentFileName(filePath);
    if ((nameCounts.get(name.toLocaleLowerCase()) ?? 0) <= 1) {
      return name;
    }
    return `${name} (${recentFileParentName(filePath)})`;
  });
  const labelCounts = new Map<string, number>();
  candidateLabels.forEach((label) => {
    const key = label.toLocaleLowerCase();
    labelCounts.set(key, (labelCounts.get(key) ?? 0) + 1);
  });

  return paths.map((filePath, index) => {
    const candidateLabel = candidateLabels[index];
    const label = (labelCounts.get(candidateLabel.toLocaleLowerCase()) ?? 0) > 1
      ? `${recentFileName(filePath)} (${recentFileDirectory(filePath) || filePath})`
      : candidateLabel;
    return { path: filePath, label };
  });
}

function recentFileTriggerLabel(): string {
  const currentPath = currentFile.value?.path;
  if (!currentPath) {
    return '最近文件';
  }
  return recentFileOptions.value.find((file) => file.path === currentPath)?.label ?? '最近文件';
}

function recentFileDuplicateBasenameGroups(filePaths: string[]): { name: string; paths: string[] }[] {
  const groups = new Map<string, { name: string; paths: string[] }>();
  normalizeRecentFiles(filePaths).forEach((filePath) => {
    const name = recentFileName(filePath);
    const key = name.toLocaleLowerCase();
    const group = groups.get(key) ?? { name, paths: [] };
    group.paths.push(filePath);
    groups.set(key, group);
  });
  return Array.from(groups.values()).filter((group) => group.paths.length > 1);
}

function persistOpenedFile(file: MarkdownFile, scrollTop: number, tabId = file.path ? tabIdForPath(file.path) : ''): void {
  if (!file.path) {
    return;
  }
  persistTabSession({
    filePath: file.path,
    tabs: serializedOpenTabs().map((tab) => ({
      ...tab,
      scrollTop: tab.id === tabId ? scrollTop : tab.scrollTop,
    })),
    activeTabId: tabId,
    recentFiles: addRecentFile(session.value.recentFiles, file.path),
    scrollTop,
  }, { syncActive: false });
}

function rememberScroll(scrollTop: number): void {
  if (activeTab.value) {
    activeTab.value.scrollTop = scrollTop;
  }
  persistTabSession({ scrollTop }, { deferred: true });
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

function editorElement(): HTMLElement | null {
  return editor.value?.getElement() ?? null;
}

function eventTargetIsEditor(target: EventTarget | null): boolean {
  const element = editorElement();
  return target instanceof Node && Boolean(element?.contains(target));
}

function editorSelectionRange(): { start: number; end: number } | null {
  return editor.value?.getSelectionRange() ?? null;
}

function editorScrollTop(): number {
  return editor.value?.getScrollTop() ?? 0;
}

function setEditorScrollTop(scrollTop: number): void {
  editor.value?.setScrollTop(scrollTop);
}

function editorLineHeight(): number {
  const element = editorElement();
  const lineHeight = element ? Number.parseFloat(window.getComputedStyle(element).lineHeight) : 0;
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
  const element = editorElement();
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
  if (!editor.value) {
    return 1;
  }

  const anchors = editorAnchors();
  if (anchors.length > 0) {
    return interpolateLineFromAnchors(editorScrollTop(), anchors);
  }

  return Math.min(sourceLineCount(), Math.max(1, editorScrollTop() / editorLineHeight() + 1));
}

function lineFromEditorSelection(): number {
  const selection = editorSelectionRange();
  if (!selection) {
    return 1;
  }

  const selectionStart = Math.min(Math.max(0, selection.start), source.value.length);
  return source.value.slice(0, selectionStart).split('\n').length;
}

function syncEditorToLine(line: number): void {
  if (!editor.value) {
    return;
  }

  const anchors = editorAnchors();
  const targetTop = anchors.length > 0 ? interpolateTopFromAnchors(line, anchors) : (line - 1) * editorLineHeight();
  setEditorScrollTop(Math.min(editor.value.getMaxScrollTop(), Math.max(0, targetTop)));
}

function previewNodeScrollTop(node: HTMLElement, container: HTMLElement): number {
  const hasLayoutBox = node.getClientRects().length > 0 && container.getClientRects().length > 0;
  const nodeTop = node.getBoundingClientRect().top;
  const containerTop = container.getBoundingClientRect().top;

  if (hasLayoutBox && Number.isFinite(nodeTop) && Number.isFinite(containerTop)) {
    return Math.max(0, nodeTop - containerTop + container.scrollTop);
  }

  return Math.max(0, node.offsetTop);
}

function previewAnchors(): ScrollAnchor[] {
  const container = preview.value;
  if (!container) {
    return [];
  }

  const renderedAnchors = Array.from(container.querySelectorAll<HTMLElement>('[data-source-line]'))
    .map((node) => ({
      line: Number(node.dataset.sourceLine),
      top: previewNodeScrollTop(node, container),
    }))
    .filter((anchor) => Number.isFinite(anchor.line))
    .sort((first, second) => first.line - second.line || first.top - second.top);

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

function syncPreviewToLine(line: number, lock = true): void {
  if (lock && scrollSyncSource && scrollSyncSource !== 'editor') {
    return;
  }

  const sourceElement = editorElement();
  const targetElement = preview.value;
  if (!sourceElement || !targetElement || session.value.previewHidden || !isEditorVisible.value) {
    return;
  }

  const targetTop = interpolatePreviewScrollFromLine(line);
  if (targetTop === null) {
    applyScrollRatio(targetElement, scrollRatio(sourceElement));
    targetElement.scrollTop = Math.min(maxScrollTop(targetElement), targetElement.scrollTop + previewScrollOffset);
  } else {
    targetElement.scrollTop = Math.min(maxScrollTop(targetElement), Math.max(0, targetTop + previewScrollOffset));
  }

  if (lock) {
    scrollSyncSource = 'editor';
    if (scrollSyncFrame !== undefined) {
      window.cancelAnimationFrame(scrollSyncFrame);
    }
    scrollSyncFrame = window.requestAnimationFrame(() => {
      scrollSyncSource = null;
      scrollSyncFrame = undefined;
    });
  }
}

function syncScroll(from: 'editor' | 'preview', lock = true): void {
  if (lock && scrollSyncSource && scrollSyncSource !== from) {
    return;
  }

  const sourceElement = from === 'editor' ? editorElement() : preview.value;
  const targetElement = from === 'editor' ? preview.value : editorElement();
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
    syncPreviewToLine(lineFromEditorScroll(), false);
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

function onEditorFocusLineChange(): void {
  void nextTick(() => {
    const line = lineFromEditorSelection();
    activeEditorLine.value = line;
    rememberCursorPosition();
    syncPreviewToLine(line);
    updateActiveHeadingFromSourceLine(line);
    rememberScroll(preview.value?.scrollTop ?? editorScrollTop());
  });
}

function onPreviewScroll(event: Event): void {
  updateActiveHeadingFromPreview();
  rememberScroll((event.target as HTMLElement).scrollTop);
  syncScroll('preview');
}

function updateActiveHeadingFromSourceLine(line: number): void {
  const container = preview.value;
  if (!container) {
    activeHeadingId.value = '';
    return;
  }

  const headings = Array.from(container.querySelectorAll<HTMLElement>('h1[id], h2[id], h3[id], h4[id], h5[id], h6[id]'))
    .map((heading) => ({
      heading,
      line: Number(heading.dataset.sourceLine),
    }))
    .filter((item) => Number.isFinite(item.line))
    .sort((first, second) => first.line - second.line);
  const current = headings.filter((item) => item.line <= line).at(-1) ?? headings[0];
  activeHeadingId.value = current?.heading.id ?? '';
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

  container.scrollTop = Math.max(0, previewNodeScrollTop(heading, container) - 16);
  const sourceLine = Number(heading.dataset.sourceLine);
  if (Number.isFinite(sourceLine)) {
    syncEditorToLine(sourceLine);
  }
  activeHeadingId.value = id;
  rememberScroll(container.scrollTop);
}

function activateTab(tabId: string): void {
  syncActiveTabState();
  const tab = openTabs.value.find((item) => item.id === tabId);
  if (!tab) {
    return;
  }

  activeTabId.value = tab.id;
  currentFile.value = tab.file;
  source.value = tab.source;
  lastSavedContent.value = tab.lastSavedContent;
  status.value = tab.file.path ?? '未保存的新文档';
  selectedAssetPath.value = '';
  persistTabSession({
    filePath: tab.file.path,
    activeTabId: tab.id,
    scrollTop: tab.scrollTop,
    ...forcedEditorPatchForFile(tab.file),
  }, { syncActive: false });
  void refreshImageAssets(tab.file.path ?? undefined);
  void nextTick(() => {
    if (preview.value) {
      preview.value.scrollTop = tab.scrollTop;
    }
    syncScroll('preview', false);
    updateActiveHeadingFromPreview();
    void renderMermaid();
  });
}

function setFile(file: MarkdownFile, scrollTop = 0, options: { external?: boolean; persist?: boolean } = {}): void {
  const normalizedFile = setFileEncoding(file, file.encoding);
  const nextScrollTop = options.external ? 0 : scrollTop;
  if (options.external) {
    session.value = mergeSession(session.value, {
      editorVisible: false,
      previewHidden: false,
      scrollTop: 0,
    });
  }
  session.value = mergeSession(session.value, forcedEditorPatchForFile(normalizedFile));
  syncActiveTabState();
  const tabId = normalizedFile.path ? tabIdForPath(normalizedFile.path) : nextDraftId();
  const existing = openTabs.value.find((tab) => tab.id === tabId);
  if (existing) {
    existing.file = normalizedFile;
    existing.source = normalizedFile.content;
    existing.lastSavedContent = normalizedFile.content;
    existing.scrollTop = nextScrollTop;
  } else {
    openTabs.value.push({
      id: tabId,
      file: normalizedFile,
      source: normalizedFile.content,
      lastSavedContent: normalizedFile.content,
      scrollTop: nextScrollTop,
    });
  }
  activeTabId.value = tabId;
  currentFile.value = normalizedFile;
  source.value = normalizedFile.content;
  lastSavedContent.value = normalizedFile.content;
  if (options.persist !== false) {
    persistOpenedFile(normalizedFile, nextScrollTop, tabId);
  }
  status.value = normalizedFile.path ?? '未保存的新文档';
  void refreshImageAssets(normalizedFile.path ?? undefined);
  void nextTick(() => {
    if (preview.value) {
      preview.value.scrollTop = nextScrollTop;
    }
    syncScroll('preview', false);
    updateActiveHeadingFromPreview();
  });
}

async function closeTab(tabId: string, event?: MouseEvent): Promise<void> {
  event?.stopPropagation();
  syncActiveTabState();
  const index = openTabs.value.findIndex((tab) => tab.id === tabId);
  if (index === -1) {
    return;
  }

  if (openTabs.value.length === 1 && unsavedTabs().some((tab) => tab.id === tabId)) {
    closeConfirmationVisible.value = true;
    return;
  }

  openTabs.value.splice(index, 1);
  if (openTabs.value.length === 0) {
    activeTabId.value = null;
    currentFile.value = null;
    source.value = '';
    lastSavedContent.value = '';
    status.value = '请选择或打开一个支持的文档';
    persistTabSession({ filePath: null, activeTabId: null, scrollTop: 0 });
    await closeApplication();
    return;
  }

  const nextTab = openTabs.value[Math.min(index, openTabs.value.length - 1)];
  activateTab(nextTab.id);
}

function startTabDrag(tabId: string, event: DragEvent): void {
  draggedTabId.value = tabId;
  event.dataTransfer?.setData('text/plain', tabId);
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move';
  }
}

function dropTabOn(tabId: string, event: DragEvent): void {
  const sourceTabId = draggedTabId.value ?? event.dataTransfer?.getData('text/plain');
  draggedTabId.value = null;
  if (!sourceTabId || sourceTabId === tabId) {
    return;
  }

  syncActiveTabState();
  const sourceIndex = openTabs.value.findIndex((tab) => tab.id === sourceTabId);
  const targetIndex = openTabs.value.findIndex((tab) => tab.id === tabId);
  if (sourceIndex < 0 || targetIndex < 0) {
    return;
  }

  const [movedTab] = openTabs.value.splice(sourceIndex, 1);
  openTabs.value.splice(targetIndex, 0, movedTab);
  persistTabSession();
}

function finishTabDrag(): void {
  draggedTabId.value = null;
}

function openTabContextMenu(tabId: string, event: MouseEvent): void {
  event.preventDefault();
  activateTab(tabId);
  tabContextMenu.value = {
    tabId,
    x: event.clientX,
    y: event.clientY,
  };
}

function closeTabContextMenu(): void {
  tabContextMenu.value = null;
}

function closeFloatingMenus(event?: MouseEvent): void {
  closeTabContextMenu();
  if (event?.target instanceof HTMLElement && event.target.closest('.recent-files-menu')) {
    return;
  }
  recentFilesOpen.value = false;
  if (event?.target instanceof HTMLElement && event.target.closest('.help-menu')) {
    return;
  }
  helpPopoverPinned.value = false;
}

function toggleHelpPopover(): void {
  helpPopoverPinned.value = !helpPopoverPinned.value;
}

function duplicateTab(tabId: string): void {
  const tab = openTabs.value.find((item) => item.id === tabId);
  if (!tab) {
    return;
  }

  createNewMarkdownTab(tab.source, `${tab.file.name.replace(/\.md$/i, '')} 副本.md`);
  status.value = `已复制标签页 ${tab.file.name}`;
  closeTabContextMenu();
}

async function copyTextToClipboard(text: string, successMessage: string): Promise<void> {
  await navigator.clipboard?.writeText(text);
  status.value = successMessage;
}

async function copyTabPath(tabId: string): Promise<void> {
  const tab = openTabs.value.find((item) => item.id === tabId);
  const path = tab ? tabPath(tab) : null;
  if (!path) {
    status.value = '当前标签页还没有文件路径';
    closeTabContextMenu();
    return;
  }

  await copyTextToClipboard(path, '已复制文件路径');
  closeTabContextMenu();
}

async function copyTabContent(tabId: string): Promise<void> {
  const tab = openTabs.value.find((item) => item.id === tabId);
  if (!tab) {
    return;
  }

  syncActiveTabState();
  await copyTextToClipboard(tab.source, '已复制文档内容');
  closeTabContextMenu();
}

async function revealTabInFolder(tabId: string): Promise<void> {
  const tab = openTabs.value.find((item) => item.id === tabId);
  const path = tab ? tabPath(tab) : null;
  if (!tab || !path || !bridge?.revealInFolder) {
    status.value = '当前标签页还没有文件路径';
    closeTabContextMenu();
    return;
  }

  await bridge.revealInFolder(path);
  status.value = `已在文件夹中定位 ${tab.file.name}`;
  closeTabContextMenu();
}

function markCodeCopyButtonCopied(button: HTMLButtonElement): void {
  const previousTimer = codeCopyResetTimers.get(button);
  if (previousTimer !== undefined) {
    window.clearTimeout(previousTimer);
  }

  button.classList.add('is-copied');
  button.setAttribute('aria-label', '已复制');
  button.setAttribute('title', '已复制');
  button.innerHTML = codeCopySuccessSvg;

  const resetTimer = window.setTimeout(() => {
    button.classList.remove('is-copied');
    button.setAttribute('aria-label', '复制代码');
    button.setAttribute('title', '复制代码');
    button.innerHTML = codeCopyIconSvg;
    codeCopyResetTimers.delete(button);
  }, 1200);
  codeCopyResetTimers.set(button, resetTimer);
}

async function copyCodeBlock(container: HTMLElement, button: HTMLButtonElement): Promise<void> {
  const code = container.querySelector('code')?.textContent;
  if (!code) {
    status.value = '没有可复制的代码';
    return;
  }

  try {
    await copyTextToClipboard(code, '已复制代码');
    markCodeCopyButtonCopied(button);
  } catch {
    status.value = '复制代码失败';
  }
}

async function saveContextTabAs(tabId: string): Promise<void> {
  await saveTabAs(tabId);
  closeTabContextMenu();
}

function openMarkdownRequest(request: MarkdownOpenRequest): void {
  setFile(request.file, 0, { external: request.external });
}

function queueMarkdownOpenRequest(request: MarkdownOpenRequest): void {
  queuedOpenRequests.push(request);
  void flushQueuedOpenRequests();
}

async function flushQueuedOpenRequests(): Promise<void> {
  if (isRestoringStartup || isFlushingOpenQueue) {
    return;
  }

  isFlushingOpenQueue = true;
  try {
    while (queuedOpenRequests.length > 0) {
      const request = queuedOpenRequests.shift();
      if (request) {
        openMarkdownRequest(request);
        await nextTick();
      }
    }
  } finally {
    isFlushingOpenQueue = false;
  }
}

function createNewMarkdownTab(content = '', name?: string): void {
  syncActiveTabState();
  const tabName = name ?? `未命名-${untitledCounter}.md`;
  const tab: OpenTab = {
    id: nextDraftId(),
    file: {
      path: null,
      name: tabName,
      content,
      encoding: defaultTextEncoding,
    },
    source: content,
    lastSavedContent: '',
    scrollTop: 0,
  };
  openTabs.value.push(tab);
  activeTabId.value = tab.id;
  currentFile.value = tab.file;
  source.value = tab.source;
  lastSavedContent.value = tab.lastSavedContent;
  selectedAssetPath.value = '';
  imageAssets.value = [];
  status.value = '未保存的新 Markdown 文件';
  persistTabSession(undefined, { syncActive: false });
  void nextTick(() => {
    editor.value?.focus();
    updateActiveHeadingFromPreview();
    void renderMermaid();
  });
}

async function openFile(): Promise<void> {
  const file = await bridge?.openMarkdownFile();
  if (file) {
    setFile(file, 0);
  }
}

async function openFilePath(filePath: string, encoding?: TextEncoding): Promise<void> {
  if (!bridge) {
    return;
  }

  try {
    setFile(await readMarkdownFileWithEncoding(filePath, encoding), 0);
  } catch {
    status.value = `无法打开 ${filePath}`;
    persistSession({
      recentFiles: removeRecentFile(session.value.recentFiles, filePath),
    });
  }
}

function applyFreshFileContent(file: MarkdownFile, message: string): void {
  if (!file.path) {
    return;
  }
  const freshFile = setFileEncoding(file, file.encoding);
  const tab = openTabs.value.find((item) => item.file.path === file.path);
  if (!tab) {
    return;
  }

  const scrollTop = tab.scrollTop;
  tab.file = freshFile;
  tab.lastSavedContent = freshFile.content;
  tab.source = freshFile.content;

  if (tab.id !== activeTabId.value) {
    persistTabSession(undefined, { syncActive: false, deferred: true });
    return;
  }

  currentFile.value = freshFile;
  lastSavedContent.value = freshFile.content;
  source.value = freshFile.content;
  status.value = message;
  persistTabSession({
    filePath: file.path,
    tabs: serializedOpenTabs(),
    scrollTop,
  }, { syncActive: false, deferred: true });
  void refreshImageAssets(file.path ?? undefined);
  void nextTick(() => {
    if (preview.value) {
      preview.value.scrollTop = scrollTop;
    }
    syncScroll('preview', false);
    updateActiveHeadingFromPreview();
    void renderMermaid();
  });
}

function onMarkdownFileChanged(file: MarkdownFile): void {
  if (!file.path) {
    return;
  }
  const tab = openTabs.value.find((item) => item.file.path === file.path);
  if (!tab) {
    return;
  }
  if (tab.source === file.content && tab.lastSavedContent === file.content) {
    return;
  }
  if (tab.source !== tab.lastSavedContent) {
    if (tab.id === activeTabId.value) {
      status.value = '磁盘文件已更新；当前有未保存修改，未自动刷新';
    }
    return;
  }

  applyFreshFileContent(file, `已自动刷新 ${file.path}`);
}

async function refreshCurrentFile(): Promise<void> {
  const filePath = currentFile.value?.path;
  if (!filePath || !bridge) {
    return;
  }
  if (hasUnsavedChanges.value) {
    status.value = '当前有未保存修改，未从磁盘刷新';
    return;
  }

  try {
    applyFreshFileContent(await readMarkdownFileWithEncoding(filePath, currentEncoding.value), `已刷新 ${filePath}`);
  } catch {
    status.value = `无法刷新 ${filePath}`;
  }
}

function setCurrentFileEncoding(encoding: unknown): void {
  const normalized = normalizeTextEncoding(encoding);
  const tab = activeTab.value;
  if (!tab || !currentFile.value) {
    return;
  }

  const nextFile = setFileEncoding(currentFile.value, normalized);
  currentFile.value = nextFile;
  tab.file = nextFile;
  persistTabSession({ tabs: serializedOpenTabs() }, { syncActive: false, deferred: true });
  status.value = `当前编码 ${textEncodingLabel(normalized)}；保存时将使用该编码`;
}

function onEncodingChange(event: Event): void {
  const value = (event.target as HTMLSelectElement).value;
  setCurrentFileEncoding(value);
}

async function reopenCurrentFileWithEncoding(): Promise<void> {
  const filePath = currentFile.value?.path;
  if (!filePath || !bridge) {
    status.value = `新文件保存时将使用 ${currentEncodingLabel.value}`;
    return;
  }
  if (hasUnsavedChanges.value) {
    status.value = '当前有未保存修改，未重新读取磁盘';
    return;
  }

  try {
    applyFreshFileContent(
      await readMarkdownFileWithEncoding(filePath, currentEncoding.value),
      `已用 ${currentEncodingLabel.value} 重新打开 ${filePath}`,
    );
  } catch {
    status.value = `无法用 ${currentEncodingLabel.value} 重新打开 ${filePath}`;
  }
}

function isSupportedDocumentPath(filePath: string): boolean {
  const extension = filePath.split('.').pop()?.toLowerCase() ?? '';
  return supportedDocumentExtensions.includes(extension as (typeof supportedDocumentExtensions)[number]);
}

function toggleRecentFiles(): void {
  if (recentFileOptions.value.length === 0) {
    return;
  }
  recentFilesOpen.value = !recentFilesOpen.value;
}

async function openRecentFilePath(filePath: string): Promise<void> {
  recentFilesOpen.value = false;
  await openFilePath(filePath);
}

function deleteRecentFile(filePath: string): void {
  persistSession({
    recentFiles: removeRecentFile(session.value.recentFiles, filePath),
  });
  if (recentFileOptions.value.length <= 1) {
    recentFilesOpen.value = false;
  }
  status.value = `已从最近文件移除 ${recentFileName(filePath)}`;
}

async function onDropFile(event: DragEvent): Promise<void> {
  const files = Array.from(event.dataTransfer?.files ?? []);
  const documentFile = files.find((file) => {
    const filePath = bridge?.getPathForFile(file) || (file as File & { path?: string }).path || file.name;
    return isSupportedDocumentPath(filePath);
  });
  const filePath = documentFile
    ? bridge?.getPathForFile(documentFile) || (documentFile as File & { path?: string }).path
    : undefined;

  if (!filePath) {
    status.value = '请拖入 Markdown、HTML、Text 或 JSON 文件';
    return;
  }

  await openFilePath(filePath);
}

async function saveCurrentFile(): Promise<void> {
  await saveCurrentFileAndReport();
}

async function saveCurrentFileAndReport(): Promise<boolean> {
  if (!currentFile.value || !bridge) {
    return false;
  }
  if (!currentFile.value.path) {
    await saveTabAs(activeTabId.value);
    return source.value === lastSavedContent.value && Boolean(currentFile.value?.path);
  }
  if (!hasUnsavedChanges.value) {
    return true;
  }

  currentFile.value = await saveMarkdownFileWithEncoding(currentFile.value.path, source.value, currentEncoding.value);
  lastSavedContent.value = currentFile.value.content;
  if (activeTab.value) {
    activeTab.value.file = currentFile.value;
    activeTab.value.source = source.value;
    activeTab.value.lastSavedContent = lastSavedContent.value;
  }
  status.value = `已保存 ${currentFile.value.path}（${currentEncodingLabel.value}）`;
  scheduleSessionSave();
  return true;
}

async function saveTabAs(tabId: string | null): Promise<void> {
  const tab = openTabs.value.find((item) => item.id === tabId);
  if (!tab || !bridge?.saveMarkdownFileAs) {
    return;
  }

  syncActiveTabState();
  const saved = await saveMarkdownFileAsWithEncoding(tab.source, tab.file.name, tab.file.encoding);
  if (!saved?.path) {
    status.value = '已取消另存为';
    return;
  }

  const nextId = tabIdForPath(saved.path);
  const duplicateIndex = openTabs.value.findIndex((item) => item.id === nextId && item !== tab);
  if (duplicateIndex >= 0) {
    openTabs.value.splice(duplicateIndex, 1);
  }
  tab.id = nextId;
  tab.file = saved;
  tab.source = saved.content;
  tab.lastSavedContent = saved.content;
  activeTabId.value = nextId;
  currentFile.value = saved;
  source.value = saved.content;
  lastSavedContent.value = saved.content;
  status.value = `已另存为 ${saved.path}（${textEncodingLabel(saved.encoding)}）`;
  session.value = mergeSession(session.value, {
    filePath: saved.path,
    activeTabId: nextId,
    recentFiles: addRecentFile(session.value.recentFiles, saved.path),
  });
  await refreshImageAssets(saved.path);
  saveSessionNow();
}

function currentExportPayload(options: { relativeImages: boolean }): ExportDocumentPayload | null {
  const markdownPath = currentFilePath();
  if (!currentFile.value || !markdownPath || !preview.value) {
    status.value = '请先保存当前文档';
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
    markdownPath,
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

function editorInsertionRange(): EditorInsertionRange | null {
  const selection = editorSelectionRange();
  if (!selection) {
    return null;
  }

  return {
    start: selection.start,
    end: selection.end,
    scrollTop: editorScrollTop(),
  };
}

function replaceEditorRange(
  replacement: string,
  range: EditorInsertionRange | null,
  selectionStartOffset = replacement.length,
  selectionEndOffset = selectionStartOffset,
): void {
  const element = editor.value;
  if (!element || !range) {
    source.value += replacement;
    return;
  }

  const start = Math.min(Math.max(0, range.start), source.value.length);
  const end = Math.min(Math.max(start, range.end), source.value.length);
  source.value = `${source.value.slice(0, start)}${replacement}${source.value.slice(end)}`;
  void nextTick(() => {
    editor.value?.focus();
    editor.value?.setSelectionRange(start + selectionStartOffset, start + selectionEndOffset);
    editor.value?.setScrollTop(range.scrollTop);
  });
}

function replaceSelection(replacement: string, selectionStartOffset = replacement.length, selectionEndOffset = selectionStartOffset): void {
  replaceEditorRange(replacement, editorInsertionRange(), selectionStartOffset, selectionEndOffset);
}

function selectedEditorText(): string {
  const selection = editorSelectionRange();
  return selection ? source.value.slice(selection.start, selection.end) : '';
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

function escapeMarkdownImageAlt(value: string): string {
  return value.replace(/]/g, '\\]');
}

function insertRemoteImageMarkdown(url: string, name: string, range: EditorInsertionRange | null = editorInsertionRange()): void {
  const altText = escapeMarkdownImageAlt(name.replace(/\.[^.]+$/, '') || 'image');
  replaceEditorRange(`![${altText}](${url})`, range);
}

function timestampedWebpName(): string {
  return `${Date.now()}.webp`;
}

function todaySubDir(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `/${year}-${month}-${day}`;
}

function loadCloudUploadPrefs(): { appId: string; subDir: string; mode: ImageUploadMode } {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(cloudUploadPrefsKey) ?? '{}') as Partial<{
      appId: string;
      mode: ImageUploadMode;
      subDir: string;
    }>;
    return {
      appId: typeof parsed.appId === 'string' && parsed.appId.trim() ? parsed.appId : 'pinefield.assets',
      mode: parsed.mode === 'cloud' ? 'cloud' : 'local',
      subDir: typeof parsed.subDir === 'string' && parsed.subDir.trim() ? parsed.subDir : todaySubDir(),
    };
  } catch {
    return {
      appId: 'pinefield.assets',
      mode: 'local',
      subDir: todaySubDir(),
    };
  }
}

function loadImageUploadMode(): ImageUploadMode {
  return loadCloudUploadPrefs().mode;
}

function saveCloudUploadPrefs(appId: string, subDir: string): void {
  window.localStorage.setItem(cloudUploadPrefsKey, JSON.stringify({
    ...loadCloudUploadPrefs(),
    appId,
    subDir,
  }));
}

function setImageUploadMode(mode: ImageUploadMode): void {
  imageUploadMode.value = mode;
  const prefs = loadCloudUploadPrefs();
  window.localStorage.setItem(cloudUploadPrefsKey, JSON.stringify({
    ...prefs,
    mode,
  }));
}

function openCloudUploadDialog(file: TempImageAsset, insertionRange: EditorInsertionRange): void {
  const prefs = loadCloudUploadPrefs();
  cloudUploadDialog.value = {
    file,
    appId: prefs.appId,
    subDir: prefs.subDir,
    linkName: '',
    error: '',
    isUploading: false,
    insertionRange,
  };
  status.value = `已暂存图片 ${file.absolutePath}`;
}

async function convertImageFileToWebp(imageFile: File): Promise<{ data: ArrayBuffer; fileName: string; mimeType: string }> {
  const createBitmap = window.createImageBitmap ?? globalThis.createImageBitmap;
  if (!createBitmap || typeof HTMLCanvasElement.prototype.toBlob !== 'function') {
    return {
      data: await imageFile.arrayBuffer(),
      fileName: imageFile.name || 'pasted-image.png',
      mimeType: imageFile.type || 'image/png',
    };
  }

  let bitmap: ImageBitmap | null = null;
  try {
    bitmap = await createBitmap(imageFile);
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('Canvas 2D context is unavailable.');
    }
    context.drawImage(bitmap, 0, 0);
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((result) => {
        if (result) {
          resolve(result);
          return;
        }
        reject(new Error('WebP encoding failed.'));
      }, 'image/webp', 0.88);
    });

    return {
      data: await blob.arrayBuffer(),
      fileName: timestampedWebpName(),
      mimeType: 'image/webp',
    };
  } catch {
    return {
      data: await imageFile.arrayBuffer(),
      fileName: imageFile.name || 'pasted-image.png',
      mimeType: imageFile.type || 'image/png',
    };
  } finally {
    bitmap?.close();
  }
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
  const markdownPath = currentFilePath();
  if (!markdownPath || !bridge?.importImageAsset) {
    status.value = '请先保存 Markdown 文件';
    return;
  }

  const asset = await bridge.importImageAsset(markdownPath);
  if (!asset) {
    return;
  }
  await refreshImageAssets();
  selectedAssetPath.value = asset.relativePath;
  insertImageMarkdown(asset);
}

function showCloudUploadPlaceholder(): void {
  setImageUploadMode('cloud');
  status.value = '云端上传已启用，粘贴图片后会先保存到 /tmp 并打开上传参数窗口';
}

function closeCloudUploadDialog(): void {
  if (cloudUploadDialog.value?.isUploading) {
    return;
  }
  cloudUploadDialog.value = null;
  void nextTick(() => editor.value?.focus());
}

async function confirmCloudImageUpload(): Promise<void> {
  const dialog = cloudUploadDialog.value;
  if (!dialog || dialog.isUploading) {
    return;
  }
  if (!dialog.appId.trim()) {
    dialog.error = '请输入 appId';
    return;
  }

  dialog.isUploading = true;
  dialog.error = '';
  status.value = '正在上传云端图片...';
  try {
    saveCloudUploadPrefs(dialog.appId.trim(), dialog.subDir.trim());
    const result = await bridge?.uploadCloudImage({
      filePath: dialog.file.absolutePath,
      appId: dialog.appId.trim(),
      subDir: dialog.subDir.trim(),
      linkName: dialog.linkName.trim() || undefined,
    });
    if (!result) {
      throw new Error('当前环境不支持云端图片上传');
    }
    insertRemoteImageMarkdown(result.url, dialog.linkName.trim() || result.uploadedName, dialog.insertionRange);
    status.value = `已上传图片 ${result.uploadedName}`;
    cloudUploadDialog.value = null;
  } catch (error) {
    dialog.error = error instanceof Error ? error.message : '云端图片上传失败';
    status.value = dialog.error;
  } finally {
    dialog.isUploading = false;
  }
}

function insertSelectedAsset(): void {
  const asset = imageAssets.value.find((item) => item.relativePath === selectedAssetPath.value);
  if (asset) {
    insertImageMarkdown(asset);
  }
}

async function deleteSelectedAsset(): Promise<void> {
  const markdownPath = currentFilePath();
  if (!markdownPath || !selectedAssetPath.value || !bridge?.deleteImageAsset) {
    return;
  }

  imageAssets.value = await bridge.deleteImageAsset(markdownPath, selectedAssetPath.value);
  selectedAssetPath.value = imageAssets.value[0]?.relativePath ?? '';
  status.value = '已删除资源文件';
}

async function onEditorPaste(event: ClipboardEvent): Promise<void> {
  const imageFile = Array.from(event.clipboardData?.files ?? []).find((file) => file.type.startsWith('image/'));
  if (!imageFile) {
    return;
  }

  event.preventDefault();
  rendererLog.info('editor.paste.image.detected', {
    fileName: imageFile.name,
    mode: imageUploadMode.value,
    type: imageFile.type,
  });
  if (imageUploadMode.value === 'cloud') {
    if (!bridge?.saveTempImageAsset || !bridge.uploadCloudImage) {
      status.value = '当前环境不支持云端图片上传';
      return;
    }
    const insertionRange = editorInsertionRange() ?? {
      start: source.value.length,
      end: source.value.length,
      scrollTop: 0,
    };
    const converted = await convertImageFileToWebp(imageFile);
    rendererLog.info('editor.paste.image.converted', {
      fileName: converted.fileName,
      mode: 'cloud',
      mimeType: converted.mimeType,
    });
    const tempAsset = await bridge.saveTempImageAsset(converted.fileName, converted.data, converted.mimeType);
    openCloudUploadDialog(tempAsset, insertionRange);
    return;
  }

  const markdownPath = currentFilePath();
  if (!markdownPath || !bridge?.saveImageAsset) {
    status.value = '请先保存 Markdown 文件，才能保存粘贴的图片';
    return;
  }

  const converted = await convertImageFileToWebp(imageFile);
  rendererLog.info('editor.paste.image.converted', {
    fileName: converted.fileName,
    mode: 'local',
    mimeType: converted.mimeType,
  });
  const asset = await bridge.saveImageAsset(
    markdownPath,
    converted.fileName,
    converted.data,
    converted.mimeType,
  );
  await refreshImageAssets();
  selectedAssetPath.value = asset.relativePath;
  insertImageMarkdown(asset);
}

function scheduleSave(): void {
  scheduleSessionSave();
}

function refocusEditorSearchInput(): void {
  void nextTick(() => {
    editorSearchInput.value?.focus();
  });
}

function sourceLineFromOffset(offset: number): number {
  const safeOffset = Math.min(Math.max(0, offset), source.value.length);
  return source.value.slice(0, safeOffset).split('\n').length;
}

function clearPreviewSearchHighlight(): void {
  preview.value?.querySelectorAll<HTMLElement>('.preview-search-match').forEach((node) => {
    node.classList.remove('preview-search-match');
  });
}

function previewNodeForSourceLine(line: number): HTMLElement | null {
  const container = preview.value;
  if (!container) {
    return null;
  }

  const nodes = Array.from(container.querySelectorAll<HTMLElement>('[data-source-line]'))
    .map((node) => ({ line: Number(node.dataset.sourceLine), node }))
    .filter((item) => Number.isFinite(item.line))
    .sort((first, second) => first.line - second.line);

  return nodes.find((item) => item.line === line)?.node
    ?? nodes.filter((item) => item.line <= line).at(-1)?.node
    ?? nodes[0]?.node
    ?? null;
}

function revealPreviewSearchMatch(match: SearchMatchRange): void {
  void nextTick(() => {
    const container = preview.value;
    if (!container) {
      return;
    }

    clearPreviewSearchHighlight();
    const line = sourceLineFromOffset(match.start);
    const node = previewNodeForSourceLine(line);
    if (node) {
      node.classList.add('preview-search-match');
    }

    const targetTop = interpolatePreviewScrollFromLine(line)
      ?? (node ? previewNodeScrollTop(node, container) : null);
    if (targetTop !== null) {
      container.scrollTop = Math.min(maxScrollTop(container), Math.max(0, targetTop - 16));
    }
  });
}

function nextSourceMatch(term: string, start: number): SearchMatchRange | null {
  let index = source.value.indexOf(term, start);
  if (index === -1 && start > 0) {
    index = source.value.indexOf(term, 0);
  }
  return index === -1 ? null : { end: index + term.length, start: index, term };
}

function previousSourceMatch(term: string, start: number): SearchMatchRange | null {
  let index = source.value.lastIndexOf(term, start - 1);
  if (index === -1 && start < source.value.length) {
    index = source.value.lastIndexOf(term);
  }
  return index === -1 ? null : { end: index + term.length, start: index, term };
}

function findPreviewMatch(direction: 'next' | 'previous'): void {
  const term = editorSearch.value;
  if (!term) {
    return;
  }

  const previous = previewSearchRange.value?.term === term ? previewSearchRange.value : null;
  const match = direction === 'next'
    ? nextSourceMatch(term, previous?.end ?? 0)
    : previousSourceMatch(term, previous?.start ?? source.value.length);
  if (!match) {
    status.value = '没有找到匹配内容';
    return;
  }

  previewSearchRange.value = match;
  status.value = `预览匹配：第 ${sourceLineFromOffset(match.start)} 行`;
  revealPreviewSearchMatch(match);
}

function findNext(focusEditor = true): void {
  if (isPreviewSearchMode.value) {
    findPreviewMatch('next');
    return;
  }

  const term = editorSearch.value;
  const selection = editorSelectionRange();
  if (!term || !selection || !editor.value) {
    return;
  }

  const match = nextSourceMatch(term, selection.end);
  if (!match) {
    status.value = '没有找到匹配内容';
    return;
  }

  if (focusEditor) {
    editor.value.focus();
  }
  editor.value.setSelectionRange(match.start, match.end);
}

function findPrevious(focusEditor = true): void {
  if (isPreviewSearchMode.value) {
    findPreviewMatch('previous');
    return;
  }

  const term = editorSearch.value;
  const selection = editorSelectionRange();
  if (!term || !selection || !editor.value) {
    return;
  }

  const match = previousSourceMatch(term, selection.start);
  if (!match) {
    status.value = '没有找到匹配内容';
    return;
  }

  if (focusEditor) {
    editor.value.focus();
  }
  editor.value.setSelectionRange(match.start, match.end);
}

function onEditorSearchKeyDown(event: KeyboardEvent): void {
  if (event.key !== 'Enter') {
    return;
  }

  event.preventDefault();
  if (event.shiftKey) {
    findPrevious(false);
  } else {
    findNext(false);
  }
  refocusEditorSearchInput();
}

function replaceCurrent(): void {
  const term = editorSearch.value;
  const selection = editorSelectionRange();
  if (!term || !selection || !editor.value) {
    return;
  }

  const selected = source.value.slice(selection.start, selection.end);
  if (selected !== term) {
    findNext();
    return;
  }

  const before = source.value.slice(0, selection.start);
  const after = source.value.slice(selection.end);
  const cursor = before.length + editorReplace.value.length;
  source.value = `${before}${editorReplace.value}${after}`;
  void nextTick(() => {
    editor.value?.focus();
    editor.value?.setSelectionRange(cursor, cursor);
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

function transformJsonSource(compact: boolean): void {
  if (!isJsonDocument.value) {
    status.value = '当前文件不是 JSON';
    return;
  }

  try {
    source.value = formatJsonDocument(source.value, compact);
    status.value = compact ? '已将 JSON 转换为单行' : '已格式化 JSON（2 空格缩进）';
    void nextTick(() => editor.value?.focus());
  } catch (error) {
    status.value = 'JSON 格式不合法，无法处理';
    rendererLog.warn('json.format.failed', {
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

function showEditorSearch(): void {
  editorSearchVisible.value = true;
  if (!isEditorVisible.value && session.value.previewHidden) {
    persistSession({
      editorVisible: true,
      previewHidden: false,
    });
  }
  void nextTick(() => {
    editorSearchInput.value?.focus();
    editorSearchInput.value?.select();
  });
}

function hideEditorSearch(): void {
  const wasPreviewSearchMode = isPreviewSearchMode.value;
  editorSearchVisible.value = false;
  previewSearchRange.value = null;
  clearPreviewSearchHighlight();
  if (!wasPreviewSearchMode) {
    void nextTick(() => editor.value?.focus());
  }
}

function setTheme(theme: ThemeMode): void {
  persistSession({ theme });
  rendererLog.info('app.theme.changed', { theme });
}

function persistEditorPreferences(patch: Partial<MarkdownSession['editorPreferences']>): void {
  const editorPreferences = {
    ...session.value.editorPreferences,
    ...patch,
  };
  persistSession({ editorPreferences });
  rendererLog.info('editor.preferences.persisted', {
    configLength: editorPreferences.configText.length,
    vimEnabled: editorPreferences.vimEnabled,
  });
}

function toggleVimMode(): void {
  const vimEnabled = !session.value.editorPreferences.vimEnabled;
  persistEditorPreferences({ vimEnabled });
  status.value = vimEnabled ? 'Vim 模式已开启' : 'Vim 模式已关闭';
}

function openEditorConfigDialog(): void {
  editorConfigDraft.value = session.value.editorPreferences.configText;
  editorConfigError.value = '';
  editorConfigDialogOpen.value = true;
}

function closeEditorConfigDialog(): void {
  editorConfigDialogOpen.value = false;
  editorConfigError.value = '';
  void nextTick(() => editor.value?.focus());
}

function saveEditorConfig(): void {
  try {
    parseEditorConfig(editorConfigDraft.value);
  } catch (error) {
    editorConfigError.value = '编辑器配置不是合法 JSON';
    status.value = editorConfigError.value;
    rendererLog.warn('editor.config.invalid', {
      message: error instanceof Error ? error.message : String(error),
    });
    return;
  }

  persistEditorPreferences({ configText: editorConfigDraft.value });
  editorConfigDialogOpen.value = false;
  editorConfigError.value = '';
  status.value = '编辑器配置已保存';
}

function onVimStatus(message: string): void {
  status.value = message;
}

function undoEditor(): void {
  editor.value?.undo();
}

function redoEditor(): void {
  editor.value?.redo();
}

async function closeActiveCleanTab(): Promise<void> {
  if (!activeTabId.value) {
    return;
  }
  if (hasUnsavedChanges.value) {
    status.value = '当前有未保存修改，使用 :q! 强制关闭';
    return;
  }
  await closeTab(activeTabId.value);
}

async function forceCloseActiveTab(): Promise<void> {
  const tab = activeTab.value;
  if (!tab || !activeTabId.value) {
    return;
  }

  tab.source = tab.lastSavedContent;
  tab.file = {
    ...tab.file,
    content: tab.lastSavedContent,
  };
  if (tab.id === activeTabId.value) {
    currentFile.value = tab.file;
    source.value = tab.source;
    lastSavedContent.value = tab.lastSavedContent;
  }
  await closeTab(tab.id);
}

async function onVimCommand(command: VimCommand): Promise<void> {
  if (command === 'write') {
    if (await saveCurrentFileAndReport()) {
      status.value = 'Vim :w 已保存';
    }
    return;
  }
  if (command === 'write-quit') {
    if (await saveCurrentFileAndReport()) {
      await closeActiveCleanTab();
    }
    return;
  }
  if (command === 'quit') {
    await closeActiveCleanTab();
    return;
  }
  await forceCloseActiveTab();
}

function toggleEditor(): void {
  if (isEditorForcedVisible.value) {
    persistSession({ editorVisible: true });
    status.value = `${currentDocumentLabel.value} 文件始终使用编辑器模式`;
    return;
  }

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
  if (!hasPreviewPane.value) {
    status.value = `${currentDocumentLabel.value} 文件没有预览视图`;
    return;
  }

  const willShowPreview = session.value.previewHidden;
  persistSession({
    previewHidden: !session.value.previewHidden,
    editorVisible: true,
  });
  if (willShowPreview) {
    void nextTick(() => syncScroll('editor', false));
  }
}

function toggleTocPanel(): void {
  isTocPanelCollapsed.value = !isTocPanelCollapsed.value;
}

function startResize(target: 'toc' | 'editor', event: PointerEvent): void {
  if (target === 'toc' && isTocPanelCollapsed.value) {
    return;
  }
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
    editorWidth: Math.max(320, Math.min(1200, event.clientX - tocColumnWidth.value - 6)),
  }, { deferred: true });
}

function stopResize(): void {
  activeResize.value = null;
}

function setPreviewZoom(value: number): void {
  previewZoom.value = Math.min(previewZoomMax, Math.max(previewZoomMin, Number(value.toFixed(2))));
}

function zoomPreview(delta: number): void {
  setPreviewZoom(previewZoom.value + delta);
}

function resetPreviewZoom(): void {
  setPreviewZoom(1);
}

function executeAppMenuCommand(command: AppMenuCommand): void {
  if (command === 'new-file') {
    createNewMarkdownTab();
    return;
  }
  if (command === 'open-file') {
    void openFile();
    return;
  }
  if (command === 'refresh-file') {
    void refreshCurrentFile();
    return;
  }
  if (command === 'save-file') {
    void saveCurrentFile();
    return;
  }
  if (command === 'save-as') {
    void saveTabAs(activeTabId.value);
    return;
  }
  if (command === 'save-all') {
    void saveAllUnsavedTabs();
    return;
  }
  if (command === 'format-json') {
    transformJsonSource(false);
    return;
  }
  if (command === 'compact-json') {
    transformJsonSource(true);
    return;
  }
  if (command === 'export-html') {
    void exportDocument('html');
    return;
  }
  if (command === 'export-pdf') {
    void exportDocument('pdf');
    return;
  }
  if (command === 'close-tab' && activeTabId.value) {
    void closeTab(activeTabId.value);
    return;
  }
  if (command === 'duplicate-tab' && activeTabId.value) {
    duplicateTab(activeTabId.value);
    return;
  }
  if (command === 'copy-tab-path' && activeTabId.value) {
    void copyTabPath(activeTabId.value);
    return;
  }
  if (command === 'copy-tab-content' && activeTabId.value) {
    void copyTabContent(activeTabId.value);
    return;
  }
  if (command === 'undo') {
    undoEditor();
    return;
  }
  if (command === 'redo') {
    redoEditor();
    return;
  }
  if (command === 'show-search') {
    showEditorSearch();
    return;
  }
  if (command === 'find-next') {
    findNext();
    return;
  }
  if (command === 'replace-current') {
    replaceCurrent();
    return;
  }
  if (command === 'replace-all') {
    replaceAll();
    return;
  }
  if (command === 'insert-table') {
    insertTable();
    return;
  }
  if (command === 'insert-link') {
    insertLink();
    return;
  }
  if (command === 'insert-code') {
    insertCodeBlock();
    return;
  }
  if (command === 'import-image') {
    void importImageAsset();
    return;
  }
  if (command === 'image-upload-local') {
    setImageUploadMode('local');
    status.value = '粘贴图片将保存到本地资源目录';
    return;
  }
  if (command === 'image-upload-cloud') {
    showCloudUploadPlaceholder();
    return;
  }
  if (command === 'refresh-assets') {
    void refreshImageAssets();
    return;
  }
  if (command === 'insert-selected-asset') {
    insertSelectedAsset();
    return;
  }
  if (command === 'delete-selected-asset') {
    void deleteSelectedAsset();
    return;
  }
  if (command === 'toggle-editor') {
    toggleEditor();
    return;
  }
  if (command === 'toggle-toc-panel') {
    toggleTocPanel();
    return;
  }
  if (command === 'toggle-preview') {
    togglePreview();
    return;
  }
  if (command === 'toggle-fullscreen-preview') {
    isPreviewFullscreen.value = !isPreviewFullscreen.value;
    return;
  }
  if (command === 'preview-zoom-in') {
    zoomPreview(previewZoomStep);
    return;
  }
  if (command === 'preview-zoom-out') {
    zoomPreview(-previewZoomStep);
    return;
  }
  if (command === 'preview-zoom-reset') {
    resetPreviewZoom();
    return;
  }
  if (command === 'theme-light') {
    setTheme('light');
    return;
  }
  if (command === 'theme-dark') {
    setTheme('dark');
    return;
  }
  if (command === 'theme-eye') {
    setTheme('eye');
    return;
  }
  if (command === 'expand-toc') {
    expandAllHeadings();
    return;
  }
  if (command === 'collapse-toc') {
    collapseAllHeadings();
    return;
  }
  if (command === 'toggle-vim') {
    toggleVimMode();
    return;
  }
  if (command === 'open-editor-config') {
    openEditorConfigDialog();
    return;
  }
  if (command === 'show-help') {
    helpPopoverPinned.value = true;
  }
}

function onKeyDown(event: KeyboardEvent): void {
  if (event.key === 'Escape' && activeMermaidDiagram.value) {
    activeMermaidDiagram.value = null;
    event.preventDefault();
    return;
  }
  if (event.key === 'Escape' && activeImagePreview.value) {
    activeImagePreview.value = null;
    event.preventDefault();
    return;
  }
  if (event.key === 'Escape' && editorSearchVisible.value) {
    hideEditorSearch();
    event.preventDefault();
    return;
  }
  if (event.key === 'Escape' && bookmarkManagerOpen.value) {
    closeBookmarkManager();
    event.preventDefault();
    return;
  }
  if (event.key === 'Escape' && helpPopoverPinned.value) {
    helpPopoverPinned.value = false;
    event.preventDefault();
    return;
  }
  if (event.key === 'Escape' && recentFilesOpen.value) {
    recentFilesOpen.value = false;
    event.preventDefault();
    return;
  }

  const command = event.metaKey || event.ctrlKey;
  if (!command) {
    return;
  }

  const key = event.key.toLowerCase();
  if (event.ctrlKey && !event.altKey && !event.shiftKey && (key === '[' || key === ']')) {
    event.preventDefault();
    void jumpToCursorHistory(key === '[' ? -1 : 1);
    return;
  }
  if (key === 'b' && !event.altKey) {
    event.preventDefault();
    if (event.shiftKey) {
      toggleBookmarkAtCursor();
    } else {
      openBookmarkManager();
    }
    return;
  }
  if (key === 'z' && !event.altKey && !event.shiftKey && eventTargetIsEditor(event.target)) {
    undoEditor();
    event.preventDefault();
    return;
  }
  if ((key === 'z' && event.shiftKey || key === 'y') && !event.altKey && eventTargetIsEditor(event.target)) {
    redoEditor();
    event.preventDefault();
    return;
  }
  if (key === '+' || key === '=') {
    event.preventDefault();
    zoomPreview(previewZoomStep);
    return;
  }
  if (key === '-' || key === '_') {
    event.preventDefault();
    zoomPreview(-previewZoomStep);
    return;
  }
  if (key === '0') {
    event.preventDefault();
    resetPreviewZoom();
    return;
  }
  if (key === 'f') {
    event.preventDefault();
    showEditorSearch();
  }
  if (key === 'o') {
    event.preventDefault();
    void openFile();
  }
  if (key === 't') {
    event.preventDefault();
    createNewMarkdownTab();
  }
  if (key === 's') {
    event.preventDefault();
    void saveCurrentFile();
  }
  if (key === 'r') {
    event.preventDefault();
    void refreshCurrentFile();
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
    suppressErrorRendering: true,
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
  const diagrams = Array.from(preview.value?.querySelectorAll<HTMLElement>('.mermaid') ?? []);
  if (!diagrams?.length) {
    return;
  }

  const mermaid = await import('mermaid');
  mermaid.default.initialize(mermaidThemeConfig());
  for (const element of diagrams) {
    try {
      await mermaid.default.run({ nodes: [element] });
    } catch (error) {
      const message = error instanceof Error ? error.message.split('\n')[0] : '请检查语法';
      element.removeAttribute('data-processed');
      element.textContent = `Mermaid 图渲染失败：${message}`;
      element.classList.add('mermaid-error');
      element.style.transform = '';
      element.style.transformOrigin = '';
      status.value = `Mermaid 图渲染失败：${message}`;
    }
  }
  applyMermaidTransforms();
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

function safeDownloadName(value: string, fallback: string): string {
  return value
    .replace(/[?#].*$/, '')
    .split(/[\\/]/)
    .pop()
    ?.replace(/[^\p{L}\p{N}._-]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    || fallback;
}

function imageFilenameFromSource(src: string, title: string): string {
  try {
    const url = new URL(src, window.location.href);
    const name = safeDownloadName(decodeURIComponent(url.pathname), '');
    if (name && /\.[a-z0-9]{2,5}$/i.test(name)) {
      return name;
    }
  } catch {
    const name = safeDownloadName(src, '');
    if (name && /\.[a-z0-9]{2,5}$/i.test(name)) {
      return name;
    }
  }

  const baseName = safeDownloadName(title, 'markdown-image');
  return `${baseName}.png`;
}

function imageNameFromSource(src: string): string {
  try {
    const url = new URL(src, window.location.href);
    const assetPath = url.searchParams.get('path');
    return safeDownloadName(decodeURIComponent(assetPath || url.pathname), '');
  } catch {
    return safeDownloadName(src, '');
  }
}

function imageContainerIndex(container: HTMLElement): number {
  const containers = Array.from(preview.value?.querySelectorAll<HTMLElement>('.markdown-image-frame') ?? []);
  return Math.max(0, containers.indexOf(container));
}

function imagePreviewTitle(altText: string, src: string, index: number): string {
  const fallbackTitle = `图片 ${index + 1}`;
  const title = altText.trim() || fallbackTitle;
  const sourceName = imageNameFromSource(src);

  if (!sourceName || sourceName === title) {
    return title;
  }

  return `${fallbackTitle}：${title} · ${sourceName}`;
}

function openImagePreview(container: HTMLElement): void {
  const image = container.querySelector<HTMLImageElement>('img');
  const src = image?.currentSrc || image?.src || container.dataset.imageSrc;
  if (!image || !src) {
    status.value = '图片尚未加载完成';
    return;
  }

  const index = imageContainerIndex(container);
  const altText = image.getAttribute('alt') || container.dataset.imageTitle || '';
  const title = imagePreviewTitle(altText, src, index);
  activeImagePreview.value = {
    src,
    title,
    filename: imageFilenameFromSource(src, title),
    scale: 1,
    x: 0,
    y: 0,
    dragPointerId: null,
    dragStartX: 0,
    dragStartY: 0,
  };
}

function updateActiveImagePreview(patch: Partial<ActiveImagePreview>): void {
  if (!activeImagePreview.value) {
    return;
  }
  activeImagePreview.value = {
    ...activeImagePreview.value,
    ...patch,
  };
}

function zoomActiveImage(delta: number): void {
  const image = activeImagePreview.value;
  if (!image) {
    return;
  }
  updateActiveImagePreview({
    scale: Math.min(8, Math.max(0.1, Number((image.scale + delta).toFixed(2)))),
  });
}

function resetActiveImageView(): void {
  updateActiveImagePreview({
    scale: 1,
    x: 0,
    y: 0,
    dragPointerId: null,
  });
}

async function downloadImage(src: string, filename: string): Promise<void> {
  try {
    const response = await fetch(src);
    if (!response.ok) {
      throw new Error(`Image request failed: ${response.status}`);
    }
    downloadBlob(await response.blob(), filename);
    status.value = `已下载 ${filename}`;
  } catch {
    const link = document.createElement('a');
    link.href = src;
    link.download = filename;
    link.target = '_blank';
    link.rel = 'noopener';
    document.body.append(link);
    link.click();
    link.remove();
    status.value = `已打开图片下载 ${filename}`;
  }
}

async function downloadImageFromContainer(container: HTMLElement): Promise<void> {
  const image = container.querySelector<HTMLImageElement>('img');
  const src = image?.currentSrc || image?.src || container.dataset.imageSrc;
  if (!src) {
    status.value = '图片尚未加载完成';
    return;
  }

  const title = image?.getAttribute('alt') || container.dataset.imageTitle || `图片 ${imageContainerIndex(container) + 1}`;
  await downloadImage(src, imageFilenameFromSource(src, title));
}

async function downloadActiveImage(): Promise<void> {
  const image = activeImagePreview.value;
  if (!image) {
    return;
  }
  await downloadImage(image.src, image.filename);
}

async function openPreviewLink(link: HTMLAnchorElement): Promise<void> {
  const href = link.getAttribute('href') ?? '';
  const opened = await bridge?.openExternalLink(href, currentFile.value?.path ?? null);
  status.value = opened ? '已在系统浏览器中打开链接' : '无法打开此链接';
}

function openMermaidFullscreen(container: HTMLElement): void {
  const prepared = preparedMermaidSvg(container);
  if (!prepared) {
    status.value = 'Mermaid 图尚未渲染完成';
    return;
  }

  const sourceScale = Number(container.dataset.scale ?? '1');
  const sourceX = Number(container.dataset.x ?? '0');
  const sourceY = Number(container.dataset.y ?? '0');
  activeMermaidDiagram.value = {
    container,
    html: prepared.text,
    title: `Mermaid 图 ${mermaidDiagramIndex(container) + 1}`,
    scale: Number.isFinite(sourceScale) ? sourceScale : 1,
    x: Number.isFinite(sourceX) ? sourceX : 0,
    y: Number.isFinite(sourceY) ? sourceY : 0,
    dragPointerId: null,
    dragStartX: 0,
    dragStartY: 0,
  };
}

function updateActiveMermaidDiagram(patch: Partial<ActiveMermaidDiagram>): void {
  if (!activeMermaidDiagram.value) {
    return;
  }
  activeMermaidDiagram.value = {
    ...activeMermaidDiagram.value,
    ...patch,
  };
}

function zoomActiveMermaid(delta: number): void {
  const diagram = activeMermaidDiagram.value;
  if (!diagram) {
    return;
  }
  updateActiveMermaidDiagram({
    scale: Math.min(6, Math.max(0.2, Number((diagram.scale + delta).toFixed(2)))),
  });
}

function resetActiveMermaidView(): void {
  updateActiveMermaidDiagram({
    scale: 1,
    x: 0,
    y: 0,
    dragPointerId: null,
  });
}

function closeMermaidModalFromBackdrop(): void {
  if (mermaidModalDragged) {
    mermaidModalDragged = false;
    return;
  }
  activeMermaidDiagram.value = null;
}

function closeImageModalFromBackdrop(): void {
  if (imageModalDragged) {
    imageModalDragged = false;
    return;
  }
  activeImagePreview.value = null;
}

function onMermaidModalWheel(event: WheelEvent): void {
  event.preventDefault();
  zoomActiveMermaid(event.deltaY > 0 ? -0.1 : 0.1);
}

function onMermaidModalPointerDown(event: PointerEvent): void {
  if ((event.target as HTMLElement).closest('.mermaid-modal-bar')) {
    return;
  }
  mermaidModalDragged = false;
  (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
  updateActiveMermaidDiagram({
    dragPointerId: event.pointerId,
    dragStartX: event.clientX,
    dragStartY: event.clientY,
  });
}

function onMermaidModalPointerMove(event: PointerEvent): void {
  const diagram = activeMermaidDiagram.value;
  if (!diagram || diagram.dragPointerId !== event.pointerId) {
    return;
  }

  const deltaX = event.clientX - diagram.dragStartX;
  const deltaY = event.clientY - diagram.dragStartY;
  if (Math.abs(deltaX) + Math.abs(deltaY) > 2) {
    mermaidModalDragged = true;
  }

  updateActiveMermaidDiagram({
    x: diagram.x + deltaX,
    y: diagram.y + deltaY,
    dragStartX: event.clientX,
    dragStartY: event.clientY,
  });
}

function onMermaidModalPointerUp(event: PointerEvent): void {
  if (activeMermaidDiagram.value?.dragPointerId !== event.pointerId) {
    return;
  }
  updateActiveMermaidDiagram({ dragPointerId: null });
}

function onImageModalWheel(event: WheelEvent): void {
  event.preventDefault();
  zoomActiveImage(event.deltaY > 0 ? -0.1 : 0.1);
}

function onImageModalPointerDown(event: PointerEvent): void {
  if ((event.target as HTMLElement).closest('.image-modal-bar')) {
    return;
  }
  imageModalDragged = false;
  (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
  updateActiveImagePreview({
    dragPointerId: event.pointerId,
    dragStartX: event.clientX,
    dragStartY: event.clientY,
  });
}

function onImageModalPointerMove(event: PointerEvent): void {
  const image = activeImagePreview.value;
  if (!image || image.dragPointerId !== event.pointerId) {
    return;
  }

  const deltaX = event.clientX - image.dragStartX;
  const deltaY = event.clientY - image.dragStartY;
  if (Math.abs(deltaX) + Math.abs(deltaY) > 2) {
    imageModalDragged = true;
  }

  updateActiveImagePreview({
    x: image.x + deltaX,
    y: image.y + deltaY,
    dragStartX: event.clientX,
    dragStartY: event.clientY,
  });
}

function onImageModalPointerUp(event: PointerEvent): void {
  if (activeImagePreview.value?.dragPointerId !== event.pointerId) {
    return;
  }
  updateActiveImagePreview({ dragPointerId: null });
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
  const codeCopyButton = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-code-action="copy"]');
  if (codeCopyButton) {
    const container = codeCopyButton.closest<HTMLElement>('.markdown-code-frame');
    if (!container) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    void copyCodeBlock(container, codeCopyButton);
    return;
  }

  const imageActionButton = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-image-action]');
  if (imageActionButton) {
    const container = imageActionButton.closest<HTMLElement>('.markdown-image-frame');
    if (!container) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    if (imageActionButton.dataset.imageAction === 'fullscreen') {
      openImagePreview(container);
      return;
    }
    if (imageActionButton.dataset.imageAction === 'download') {
      void downloadImageFromContainer(container);
      return;
    }
  }

  const link = (event.target as HTMLElement).closest<HTMLAnchorElement>('a[href]');
  if (link && preview.value?.contains(link)) {
    const href = link.getAttribute('href')?.trim() ?? '';
    if (!href || href.startsWith('#')) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    void openPreviewLink(link);
    return;
  }

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
  previewSearchRange.value = null;
  clearPreviewSearchHighlight();
  if (activeTab.value) {
    activeTab.value.source = source.value;
  }
  scheduleSave();
  if (isHtmlDocument.value) {
    scheduleHtmlPreviewReload();
  } else {
    void renderMermaid();
  }
});

watch(() => [currentDocumentKind.value, currentFile.value?.path ?? null] as const, () => {
  if (!hasPreviewPane.value) {
    isPreviewFullscreen.value = false;
    htmlPreviewSrc.value = '';
    return;
  }
  scheduleHtmlPreviewReload();
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

async function restoreSessionTabs(): Promise<boolean> {
  if (!bridge || session.value.tabs.length === 0) {
    return false;
  }

  const restoredTabs = (await Promise.all(session.value.tabs.map(async (tab) => {
    if (!tab.filePath) {
      const content = tab.content ?? '';
      return {
        id: tab.id,
        file: {
          path: null,
          name: tab.name,
          content,
          encoding: normalizeTextEncoding(tab.encoding),
        },
        source: content,
        lastSavedContent: tab.lastSavedContent ?? '',
        scrollTop: tab.scrollTop,
      } satisfies OpenTab;
    }
    try {
      const file = await readMarkdownFileWithEncoding(tab.filePath, tab.encoding);
      return {
        id: file.path ? tabIdForPath(file.path) : tab.id,
        file,
        source: file.content,
        lastSavedContent: file.content,
        scrollTop: tab.scrollTop,
      } satisfies OpenTab;
    } catch {
      return null;
    }
  }))).filter((tab): tab is OpenTab => tab !== null);

  if (restoredTabs.length === 0) {
    return false;
  }

  openTabs.value = restoredTabs;
  const desired = session.value.tabs.find((tab) => tab.id === session.value.activeTabId);
  const active = restoredTabs.find((tab) => tab.id === desired?.id)
    ?? restoredTabs.find((tab) => tab.file.path === desired?.filePath)
    ?? restoredTabs[0];
  activeTabId.value = active.id;
  currentFile.value = active.file;
  source.value = active.source;
  lastSavedContent.value = active.lastSavedContent;
  status.value = active.file.path ?? '未保存的新文档';
  session.value = mergeSession(session.value, {
    filePath: active.file.path,
    tabs: restoredTabs.map((tab) => ({
      id: tab.id,
      filePath: tab.file.path,
      name: tab.file.name,
      scrollTop: tab.scrollTop,
      content: tab.file.path ? undefined : tab.source,
      lastSavedContent: tab.file.path ? undefined : tab.lastSavedContent,
      encoding: normalizeTextEncoding(tab.file.encoding),
    })),
    activeTabId: active.id,
    scrollTop: active.scrollTop,
    ...forcedEditorPatchForFile(active.file),
  });
  void refreshImageAssets(active.file.path ?? undefined);
  void nextTick(() => {
    if (preview.value) {
      preview.value.scrollTop = active.scrollTop;
    }
    syncScroll('preview', false);
    updateActiveHeadingFromPreview();
  });
  saveSessionNow(session.value);
  return true;
}

onMounted(async () => {
  isRestoringStartup = true;
  session.value = normalizeSession((await bridge?.getSession()) ?? createDefaultSession());
  removeExternalOpenListener = bridge?.onExternalMarkdownFile(queueMarkdownOpenRequest);
  removeMarkdownFileChangedListener = bridge?.onMarkdownFileChanged(onMarkdownFileChanged);
  removeToggleEditorShortcutListener = bridge?.onToggleEditorShortcut(toggleEditor);
  removeCloseRequestListener = bridge?.onCloseRequest(requestApplicationClose);
  removeAppMenuCommandListener = bridge?.onAppMenuCommand?.(executeAppMenuCommand);
  const launchRequest = await bridge?.takeLaunchMarkdownFile();
  if (launchRequest) {
    queuedOpenRequests.push(launchRequest);
  }

  const restored = await restoreSessionTabs();
  if (!restored && queuedOpenRequests.length === 0) {
    const file = await bridge?.readLastMarkdownFile();
    if (file) {
      setFile(file, session.value.scrollTop);
    }
  }
  isRestoringStartup = false;
  await flushQueuedOpenRequests();
  await bridge?.notifyReadyForExternalOpen?.();
  await renderMermaid();
  window.addEventListener('keydown', onKeyDown, true);
  window.addEventListener('click', closeFloatingMenus);
  window.addEventListener('beforeunload', saveSessionBeforeUnload);
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
  if (htmlPreviewTimer !== undefined) {
    window.clearTimeout(htmlPreviewTimer);
    htmlPreviewTimer = undefined;
  }
  removeExternalOpenListener?.();
  removeMarkdownFileChangedListener?.();
  removeToggleEditorShortcutListener?.();
  removeCloseRequestListener?.();
  removeAppMenuCommandListener?.();
  window.removeEventListener('keydown', onKeyDown, true);
  window.removeEventListener('click', closeFloatingMenus);
  window.removeEventListener('beforeunload', saveSessionBeforeUnload);
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
        'preview-fullscreen': isPreviewFullscreen && hasPreviewPane,
        'preview-hidden': session.previewHidden,
        'reader-mode': !isEditorVisible,
        'no-preview-pane': !hasPreviewPane,
        'toc-collapsed': isTocPanelCollapsed,
      },
    ]"
    @dragover.prevent
    @drop.prevent="onDropFile"
  >
    <header class="topbar">
      <div class="title-block">
        <strong>{{ displayTitle }}</strong>
        <span>{{ statusText }}</span>
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
          data-testid="new-file"
          class="icon-button"
          type="button"
          aria-label="新建"
          :title="`新建 Markdown 文件 (${shortcutModifier}+T)`"
          @click="createNewMarkdownTab()"
        >
          <svg aria-hidden="true" viewBox="0 0 24 24"><path :d="icons.plus" /></svg>
        </button>
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
        <div class="recent-files-menu" :class="{ 'is-open': recentFilesOpen }">
          <button
            data-testid="recent-files"
            class="recent-files-trigger"
            type="button"
            :disabled="recentFileOptions.length === 0"
            :title="`最近打开文件（最多 20 个）`"
            :aria-expanded="recentFilesOpen"
            aria-haspopup="menu"
            @click.stop="toggleRecentFiles"
          >
            <span>{{ recentFileTriggerLabel() }}</span>
            <svg aria-hidden="true" viewBox="0 0 24 24"><path :d="icons.chevronDown" /></svg>
          </button>
          <div
            v-if="recentFilesOpen"
            class="recent-files-popover"
            data-testid="recent-files-popover"
            role="menu"
            @click.stop
          >
            <div
              v-for="file in recentFileOptions"
              :key="file.path"
              class="recent-file-row"
              role="none"
              :data-testid="`recent-file-${file.label}`"
              :title="file.path"
            >
              <button
                class="recent-file-open"
                type="button"
                role="menuitem"
                @click="openRecentFilePath(file.path)"
              >
                <span>{{ file.label }}</span>
              </button>
              <button
                class="recent-file-delete"
                type="button"
                :data-testid="`delete-recent-file-${file.label}`"
                :aria-label="`从最近文件移除 ${file.label}`"
                :title="`从最近文件移除 ${file.path}`"
                @click.stop="deleteRecentFile(file.path)"
              >
                <svg aria-hidden="true" viewBox="0 0 24 24"><path :d="icons.trash" /></svg>
              </button>
            </div>
          </div>
        </div>
        <button
          data-testid="bookmark-manager-button"
          class="icon-button"
          type="button"
          :class="{ active: bookmarkTotalCount > 0 }"
          aria-label="书签"
          :title="bookmarkManagerShortcutHint"
          @click="openBookmarkManager"
        >
          <svg aria-hidden="true" viewBox="0 0 24 24"><path :d="icons.bookmark" /></svg>
          <span v-if="bookmarkTotalCount > 0" class="action-badge" aria-hidden="true">{{ bookmarkTotalCount }}</span>
        </button>
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
          data-testid="refresh-file"
          class="icon-button"
          type="button"
          :disabled="!currentFilePath()"
          aria-label="刷新"
          :title="refreshShortcutHint"
          @click="refreshCurrentFile"
        >
          <svg aria-hidden="true" viewBox="0 0 24 24"><path :d="icons.refresh" /></svg>
        </button>
        <button
          data-testid="export-html"
          class="icon-button"
          type="button"
          :disabled="!currentFilePath()"
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
          :disabled="!currentFilePath()"
          aria-label="导出 PDF"
          title="导出整篇文档为 PDF"
          @click="exportDocument('pdf')"
        >
          <svg aria-hidden="true" viewBox="0 0 24 24"><path :d="icons.fileText" /></svg>
        </button>
        <button
          v-if="hasPreviewPane"
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
        <div class="help-menu" :class="{ 'is-open': helpPopoverPinned }">
          <button
            data-testid="help-button"
            class="icon-button"
            type="button"
            aria-label="帮助"
            title="帮助"
            @click.stop="toggleHelpPopover"
          >
            <svg aria-hidden="true" viewBox="0 0 24 24"><path :d="icons.info" /></svg>
          </button>
          <div class="help-popover" data-testid="help-popover" role="tooltip" @click.stop>
            <div class="help-popover-header">
              <strong>Markdown 纪 <span>v{{ appVersion }}</span></strong>
              <span>菜单分组、功能说明与快捷键</span>
            </div>
            <section v-for="group in helpGroups" :key="group.title" class="help-group">
              <h3>{{ group.title }}</h3>
              <dl>
                <template v-for="item in group.items" :key="item.label">
                  <dt>
                    <span>{{ item.label }}</span>
                    <kbd v-if="item.shortcut">{{ item.shortcut }}</kbd>
                  </dt>
                  <dd>{{ item.detail }}</dd>
                </template>
              </dl>
            </section>
          </div>
        </div>
      </div>
    </header>

    <nav class="tabbar" aria-label="打开的文件">
      <div
        v-for="tab in openTabs"
        :key="tab.id"
        class="tab-button"
        role="button"
        tabindex="0"
        :class="{ active: tab.id === activeTabId, dirty: tab.source !== tab.lastSavedContent }"
        :title="tab.file.path ?? '未保存的新文档'"
        :data-testid="`tab-${tab.file.name}`"
        draggable="true"
        @click="activateTab(tab.id)"
        @contextmenu="openTabContextMenu(tab.id, $event)"
        @dragstart="startTabDrag(tab.id, $event)"
        @dragover.prevent
        @drop.stop.prevent="dropTabOn(tab.id, $event)"
        @dragend="finishTabDrag"
        @keydown.enter.prevent="activateTab(tab.id)"
        @keydown.space.prevent="activateTab(tab.id)"
      >
        <span>{{ tab.file.name }}</span>
        <span v-if="tab.source !== tab.lastSavedContent" class="dirty-dot" aria-label="有未保存更改" />
        <button
          class="tab-close"
          type="button"
          :aria-label="`关闭 ${tab.file.name}`"
          :title="`关闭 ${tab.file.name}`"
          :data-testid="`close-tab-${tab.file.name}`"
          @click="closeTab(tab.id, $event)"
        >
          ×
        </button>
      </div>
    </nav>

    <div
      v-if="tabContextMenu"
      class="tab-context-menu"
      data-testid="tab-context-menu"
      role="menu"
      :style="{ left: `${tabContextMenu.x}px`, top: `${tabContextMenu.y}px` }"
      @click.stop
    >
      <button type="button" role="menuitem" data-testid="tab-duplicate" @click="duplicateTab(tabContextMenu.tabId)">
        Duplicate
      </button>
      <button type="button" role="menuitem" data-testid="tab-copy-path" @click="copyTabPath(tabContextMenu.tabId)">
        复制路径
      </button>
      <button type="button" role="menuitem" data-testid="tab-copy-content" @click="copyTabContent(tabContextMenu.tabId)">
        复制内容
      </button>
      <button type="button" role="menuitem" data-testid="tab-save-as" @click="saveContextTabAs(tabContextMenu.tabId)">
        另存为
      </button>
      <button type="button" role="menuitem" data-testid="tab-reveal-in-folder" @click="revealTabInFolder(tabContextMenu.tabId)">
        在文件夹中显示
      </button>
    </div>

    <section class="workspace" :style="gridStyle">
      <aside class="toc-panel" data-testid="toc">
        <div class="panel-toolbar">
          <div class="toc-toolbar-row">
            <h2>目录</h2>
            <div class="toc-actions">
              <button
                data-testid="toggle-toc-panel"
                class="icon-button toc-panel-toggle"
                type="button"
                :aria-label="isTocPanelCollapsed ? '展开目录侧栏' : '收起目录侧栏'"
                :title="isTocPanelCollapsed ? '展开目录侧栏' : '收起目录侧栏'"
                @click="toggleTocPanel"
              >
                <svg aria-hidden="true" viewBox="0 0 24 24"><path :d="isTocPanelCollapsed ? icons.sidebarShow : icons.sidebarHide" /></svg>
              </button>
              <button data-testid="expand-toc" class="icon-button" type="button" aria-label="展开全部标题" title="展开全部标题" @click="expandAllHeadings">
                <svg aria-hidden="true" viewBox="0 0 24 24"><path :d="icons.tocExpandAll" /></svg>
              </button>
              <button data-testid="collapse-toc" class="icon-button" type="button" aria-label="收起全部标题" title="收起全部标题" @click="collapseAllHeadings">
                <svg aria-hidden="true" viewBox="0 0 24 24"><path :d="icons.tocCollapseAll" /></svg>
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
        class="resize-handle toc-resize-handle"
        data-testid="toc-resizer"
        role="separator"
        @pointerdown="startResize('toc', $event)"
      />

      <section class="editor-panel" :class="{ 'search-visible': editorSearchVisible && !isPreviewSearchMode }">
        <div class="format-toolbar" :aria-label="`${currentDocumentLabel} 快捷工具栏`">
          <div class="format-actions">
            <button v-if="isMarkdownDocument" data-testid="insert-table" class="icon-button" type="button" aria-label="插入表格" title="插入表格" @click="insertTable">
              <svg aria-hidden="true" viewBox="0 0 24 24"><path :d="icons.columns" /></svg>
            </button>
            <button v-if="isMarkdownDocument" data-testid="insert-link" class="icon-button" type="button" aria-label="插入链接" title="插入链接" @click="insertLink">
              <svg aria-hidden="true" viewBox="0 0 24 24"><path :d="icons.link" /></svg>
            </button>
            <button v-if="isMarkdownDocument" data-testid="insert-code" class="icon-button" type="button" aria-label="插入代码块" title="插入代码块" @click="insertCodeBlock">
              <svg aria-hidden="true" viewBox="0 0 24 24"><path :d="icons.code" /></svg>
            </button>
            <button v-if="isJsonDocument" data-testid="format-json" class="icon-button" type="button" aria-label="格式化 JSON" title="格式化 JSON（2 空格缩进）" @click="transformJsonSource(false)">
              <svg aria-hidden="true" viewBox="0 0 24 24"><path :d="icons.code" /></svg>
            </button>
            <button v-if="isJsonDocument" data-testid="compact-json" class="icon-button" type="button" aria-label="JSON 转单行" title="JSON 转换为单行" @click="transformJsonSource(true)">
              <svg aria-hidden="true" viewBox="0 0 24 24"><path :d="icons.columns" /></svg>
            </button>
            <button
              data-testid="add-bookmark"
              class="icon-button"
              type="button"
              :aria-label="currentLineHasBookmark ? '取消当前行书签' : '添加书签'"
              :class="{ active: currentLineHasBookmark }"
              :disabled="!activeTab"
              :title="addBookmarkShortcutHint"
              @click="toggleBookmarkAtCursor"
            >
              <svg aria-hidden="true" viewBox="0 0 24 24"><path :d="icons.bookmark" /></svg>
            </button>
            <button
              data-testid="toggle-vim-mode"
              class="icon-button"
              type="button"
              :class="{ active: session.editorPreferences.vimEnabled }"
              :aria-label="session.editorPreferences.vimEnabled ? '关闭 Vim' : '开启 Vim'"
              :title="session.editorPreferences.vimEnabled ? '关闭 Vim 模式' : '开启 Vim 模式'"
              @click="toggleVimMode"
            >
              <svg aria-hidden="true" viewBox="0 0 24 24"><path :d="icons.keyboard" /></svg>
            </button>
            <button
              data-testid="open-editor-config"
              class="icon-button"
              type="button"
              aria-label="编辑器配置"
              title="配置 Monaco 与 Vim"
              @click="openEditorConfigDialog"
            >
              <svg aria-hidden="true" viewBox="0 0 24 24"><path :d="icons.settings" /></svg>
            </button>
            <button data-testid="import-image" class="icon-button" type="button" :disabled="!currentFilePath()" aria-label="导入图片" title="选择图片并复制到资源目录" @click="importImageAsset">
              <svg aria-hidden="true" viewBox="0 0 24 24"><path :d="icons.image" /></svg>
            </button>
            <div class="image-upload-mode" role="group" aria-label="图片上传方式">
              <button
                data-testid="image-upload-local"
                class="mode-button"
                type="button"
                :class="{ active: imageUploadMode === 'local' }"
                aria-label="使用本地图片"
                title="粘贴图片保存到 assets/images"
                @click="setImageUploadMode('local')"
              >
                本地
              </button>
              <button
                data-testid="image-upload-cloud"
                class="mode-button"
                type="button"
                :class="{ active: imageUploadMode === 'cloud' }"
                aria-label="使用云端图片"
                title="云端上传入口，下一步实现服务配置"
                @click="showCloudUploadPlaceholder"
              >
                云端
              </button>
            </div>
            <button data-testid="cloud-image-upload" class="icon-button" type="button" aria-label="云端上传图片" title="云端上传入口，下一步实现服务配置" @click="showCloudUploadPlaceholder">
              <svg aria-hidden="true" viewBox="0 0 24 24"><path :d="icons.cloudUpload" /></svg>
            </button>
          </div>
          <div class="encoding-tools" role="group" aria-label="文档编码">
            <select
              :value="currentEncoding"
              data-testid="encoding-select"
              :disabled="!activeTab"
              :title="`当前编码 ${currentEncodingLabel}；保存时使用该编码`"
              @change="onEncodingChange"
            >
              <option v-for="option in textEncodingOptions" :key="option.value" :value="option.value">
                {{ option.label }}
              </option>
            </select>
            <button
              data-testid="reopen-with-encoding"
              class="icon-button"
              type="button"
              :disabled="!currentFilePath() || hasUnsavedChanges"
              aria-label="用当前编码重新打开"
              :title="`用 ${currentEncodingLabel} 重新打开当前文件`"
              @click="reopenCurrentFileWithEncoding"
            >
              <svg aria-hidden="true" viewBox="0 0 24 24"><path :d="icons.refresh" /></svg>
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
            <button data-testid="refresh-assets" class="icon-button" type="button" :disabled="!currentFilePath()" aria-label="刷新图片资源" title="刷新图片资源" @click="refreshImageAssets()">
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
        <div v-if="editorSearchVisible && !isPreviewSearchMode" class="editor-tools">
          <input
            ref="editorSearchInput"
            v-model="editorSearch"
            data-testid="editor-search"
            type="search"
            placeholder="搜索源码"
            @keydown="onEditorSearchKeyDown"
          />
          <input v-model="editorReplace" data-testid="editor-replace" type="text" placeholder="替换为" />
          <button class="icon-button" type="button" aria-label="查找" title="查找" @click="findNext()">
            <svg aria-hidden="true" viewBox="0 0 24 24"><path :d="icons.search" /></svg>
          </button>
          <button class="icon-button" type="button" aria-label="替换" title="替换" @click="replaceCurrent">
            <svg aria-hidden="true" viewBox="0 0 24 24"><path :d="icons.replace" /></svg>
          </button>
          <button data-testid="replace-all" class="icon-button" type="button" aria-label="全部替换" title="全部替换" @click="replaceAll">
            <svg aria-hidden="true" viewBox="0 0 24 24"><path :d="icons.refresh" /></svg>
          </button>
        </div>
        <div class="source-editor-shell">
          <MarkdownMonacoEditor
            ref="editor"
            v-model="source"
            :bookmark-line-numbers="currentFileBookmarkLines"
            :config-text="session.editorPreferences.configText"
            :language="currentEditorLanguage"
            :theme="session.theme"
            :vim-enabled="session.editorPreferences.vimEnabled"
            @focus-line-change="onEditorFocusLineChange"
            @scroll="onEditorScroll"
            @paste="onEditorPaste"
            @vim-command="onVimCommand"
            @vim-status="onVimStatus"
          />
        </div>
      </section>

      <div
        class="resize-handle editor-resize-handle"
        data-testid="editor-resizer"
        role="separator"
        @pointerdown="startResize('editor', $event)"
      />

      <section v-if="hasPreviewPane" class="preview-panel" data-testid="preview-panel" :aria-label="`${currentDocumentLabel} 预览`">
        <div class="preview-controls" role="group" aria-label="预览控制">
          <div v-if="isPreviewSearchMode" class="preview-search-tools">
            <input
              ref="editorSearchInput"
              v-model="editorSearch"
              data-testid="editor-search"
              type="search"
              placeholder="搜索预览"
              @keydown="onEditorSearchKeyDown"
            />
            <button class="icon-button" type="button" aria-label="查找" title="查找" @click="findNext()">
              <svg aria-hidden="true" viewBox="0 0 24 24"><path :d="icons.search" /></svg>
            </button>
          </div>
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
          <button
            data-testid="preview-zoom-out"
            class="icon-button"
            type="button"
            :disabled="previewZoom <= previewZoomMin"
            aria-label="缩小预览"
            :title="`缩小预览 (${shortcutModifier}+-)，当前 ${previewZoomPercent}%`"
            @click="zoomPreview(-previewZoomStep)"
          >
            <svg aria-hidden="true" viewBox="0 0 24 24"><path :d="icons.minus" /></svg>
          </button>
          <button
            v-if="isPreviewZoomResettable"
            data-testid="preview-zoom-reset"
            class="icon-button"
            type="button"
            aria-label="还原预览缩放"
            :title="`还原预览缩放 (${shortcutModifier}+0)，当前 ${previewZoomPercent}%`"
            @click="resetPreviewZoom"
          >
            <svg aria-hidden="true" viewBox="0 0 24 24"><path :d="icons.refresh" /></svg>
          </button>
          <button
            data-testid="preview-zoom-in"
            class="icon-button"
            type="button"
            :disabled="previewZoom >= previewZoomMax"
            aria-label="放大预览"
            :title="`放大预览 (${shortcutModifier}++)，当前 ${previewZoomPercent}%`"
            @click="zoomPreview(previewZoomStep)"
          >
            <svg aria-hidden="true" viewBox="0 0 24 24"><path :d="icons.plus" /></svg>
          </button>
        </div>
        <iframe
          v-if="isHtmlDocument"
          class="preview html-preview-frame"
          data-testid="html-preview-frame"
          :src="htmlPreviewSrc"
          title="HTML 预览"
          scrolling="auto"
          sandbox="allow-downloads allow-forms allow-modals allow-popups allow-same-origin allow-scripts"
        />
        <article
          v-else
          ref="preview"
          class="preview"
          data-testid="preview"
          :style="previewZoomStyle"
          @scroll="onPreviewScroll"
          @wheel="onPreviewWheel"
          @click="onPreviewClick"
          @pointerdown="onPreviewPointerDown"
          @pointermove="onPreviewPointerMove"
          v-html="previewHtml"
        />
      </section>
    </section>

    <div
      v-if="bookmarkManagerOpen"
      class="bookmark-modal"
      data-testid="bookmark-modal"
      role="dialog"
      aria-modal="true"
      aria-label="书签管理"
      @click.self="closeBookmarkManager"
      @keydown.capture="onBookmarkManagerKeyDown"
    >
      <section class="bookmark-dialog">
        <div class="bookmark-dialog-bar">
          <strong>{{ bookmarkManagerTitle }}</strong>
          <button class="icon-button" type="button" aria-label="关闭" title="关闭" @click="closeBookmarkManager">
            <svg aria-hidden="true" viewBox="0 0 24 24"><path :d="icons.x" /></svg>
          </button>
        </div>
        <div class="bookmark-tools">
          <input
            ref="bookmarkSearchInput"
            v-model="bookmarkSearch"
            data-testid="bookmark-search"
            type="search"
            placeholder="搜索文件、路径或正文片段"
          />
          <div class="bookmark-view-switch" role="group" aria-label="书签范围">
            <button
              data-testid="bookmark-view-all"
              class="mode-button"
              type="button"
              :class="{ active: session.bookmarkViewMode === 'all' }"
              @click="setBookmarkViewMode('all')"
            >
              所有文件
            </button>
            <button
              data-testid="bookmark-view-current"
              class="mode-button"
              type="button"
              :class="{ active: session.bookmarkViewMode === 'current' }"
              @click="setBookmarkViewMode('current')"
            >
              当前文件
            </button>
          </div>
        </div>
        <div ref="bookmarkList" class="bookmark-list" role="listbox" aria-label="书签列表" tabindex="0">
          <div
            v-for="bookmark in visibleBookmarks"
            :key="bookmark.id"
            class="bookmark-row"
            role="option"
            tabindex="-1"
            :data-bookmark-id="bookmark.id"
            :aria-selected="bookmark.id === selectedBookmarkId"
            :class="{ active: bookmark.id === selectedBookmarkId }"
            :title="formatBookmarkPath(bookmark)"
            :data-testid="`bookmark-${bookmark.fileName}-${bookmark.lineNumber}-${bookmark.column}`"
            @click="selectedBookmarkId = bookmark.id"
            @dblclick="activateBookmark(bookmark)"
          >
            <span class="bookmark-main">
              <strong>{{ bookmark.fileName }}</strong>
              <span>{{ bookmark.excerpt || '空行' }}</span>
            </span>
            <span class="bookmark-meta">
              <span class="bookmark-position">
                <span>行 {{ bookmark.lineNumber }}</span>
                <span>列 {{ bookmark.column }}</span>
              </span>
              <button
                class="bookmark-delete"
                type="button"
                :aria-label="`删除 ${bookmark.fileName} ${bookmark.lineNumber}:${bookmark.column}`"
                title="删除书签"
                @click="deleteBookmark(bookmark.id, $event)"
              >
                <svg aria-hidden="true" viewBox="0 0 24 24"><path :d="icons.trash" /></svg>
              </button>
            </span>
          </div>
          <p v-if="visibleBookmarks.length === 0" class="bookmark-empty" data-testid="bookmark-empty">
            没有匹配的书签
          </p>
        </div>
        <div class="bookmark-dialog-actions">
          <span>↑/↓ 选择 · Ctrl+↑/↓ 翻页 · Enter 跳转 · Delete 删除</span>
          <button type="button" class="primary-button" data-testid="bookmark-jump" :disabled="!selectedBookmark" @click="activateBookmark()">
            跳转
          </button>
        </div>
      </section>
    </div>

    <div
      v-if="closeConfirmationVisible"
      class="close-confirm-modal"
      data-testid="close-confirm-modal"
      role="dialog"
      aria-modal="true"
      aria-label="关闭前处理未保存文件"
    >
      <div class="close-confirm-dialog">
        <div class="close-confirm-dialog-bar">
          <strong>有未保存的修改</strong>
        </div>
        <div class="close-confirm-body">
          <p>{{ unsavedTabCount }} 个文件还没有手工保存。</p>
          <p>关闭前可以全部保存，也可以放弃这些未保存修改。</p>
        </div>
        <div class="close-confirm-actions">
          <button type="button" class="secondary-button" :disabled="closeConfirmationBusy" @click="cancelCloseConfirmation">
            取消
          </button>
          <button type="button" class="secondary-button" data-testid="close-discard-all" :disabled="closeConfirmationBusy" @click="discardAllAndClose">
            放弃修改并关闭
          </button>
          <button type="button" class="primary-button" data-testid="close-save-all" :disabled="closeConfirmationBusy" @click="saveAllAndClose">
            全部保存并关闭
          </button>
        </div>
      </div>
    </div>

    <div
      v-if="cloudUploadDialog"
      class="cloud-upload-modal"
      data-testid="cloud-upload-modal"
      role="dialog"
      aria-modal="true"
      aria-label="云端上传图片"
      @click.self="closeCloudUploadDialog"
    >
      <form class="cloud-upload-dialog" @submit.prevent="confirmCloudImageUpload">
        <div class="cloud-upload-dialog-bar">
          <strong>云端上传图片</strong>
          <button class="icon-button" type="button" aria-label="关闭" title="关闭" :disabled="cloudUploadDialog.isUploading" @click="closeCloudUploadDialog">
            <svg aria-hidden="true" viewBox="0 0 24 24"><path :d="icons.x" /></svg>
          </button>
        </div>
        <div class="cloud-upload-fields">
          <label>
            <span>appId</span>
            <input v-model="cloudUploadDialog.appId" data-testid="cloud-upload-app-id" type="text" required autocomplete="off" />
          </label>
          <label>
            <span>subDir</span>
            <input v-model="cloudUploadDialog.subDir" data-testid="cloud-upload-sub-dir" type="text" autocomplete="off" />
          </label>
          <label>
            <span>链接名称</span>
            <input v-model="cloudUploadDialog.linkName" data-testid="cloud-upload-link-name" type="text" autocomplete="off" :placeholder="cloudUploadDialog.file.name" />
          </label>
          <p class="cloud-upload-file" :title="cloudUploadDialog.file.absolutePath">{{ cloudUploadDialog.file.absolutePath }}</p>
          <p v-if="cloudUploadDialog.error" class="cloud-upload-error" data-testid="cloud-upload-error">{{ cloudUploadDialog.error }}</p>
        </div>
        <div class="cloud-upload-actions">
          <button type="button" class="secondary-button" :disabled="cloudUploadDialog.isUploading" @click="closeCloudUploadDialog">取消</button>
          <button type="submit" class="primary-button" data-testid="cloud-upload-confirm" :disabled="cloudUploadDialog.isUploading">
            {{ cloudUploadDialog.isUploading ? '上传中...' : '确认上传' }}
          </button>
        </div>
      </form>
    </div>

    <div
      v-if="editorConfigDialogOpen"
      class="editor-config-modal"
      data-testid="editor-config-modal"
      role="dialog"
      aria-modal="true"
      aria-label="编辑器配置"
      @click.self="closeEditorConfigDialog"
    >
      <form class="editor-config-dialog" @submit.prevent="saveEditorConfig">
        <div class="editor-config-dialog-bar">
          <strong>Monaco / Vim 配置</strong>
          <button class="icon-button" type="button" aria-label="关闭" title="关闭" @click="closeEditorConfigDialog">
            <svg aria-hidden="true" viewBox="0 0 24 24"><path :d="icons.x" /></svg>
          </button>
        </div>
        <textarea
          v-model="editorConfigDraft"
          data-testid="editor-config-text"
          spellcheck="false"
          aria-label="编辑器配置 JSON"
        />
        <p v-if="editorConfigError" class="editor-config-error" data-testid="editor-config-error">{{ editorConfigError }}</p>
        <div class="editor-config-actions">
          <button type="button" class="secondary-button" @click="closeEditorConfigDialog">取消</button>
          <button type="button" class="primary-button" data-testid="editor-config-save" @click="saveEditorConfig">保存配置</button>
        </div>
      </form>
    </div>

    <div
      v-if="activeMermaidDiagram"
      class="mermaid-modal"
      data-testid="mermaid-modal"
      role="dialog"
      aria-modal="true"
      :aria-label="activeMermaidDiagram.title"
      @click.self="closeMermaidModalFromBackdrop"
      @wheel="onMermaidModalWheel"
      @pointerdown="onMermaidModalPointerDown"
      @pointermove="onMermaidModalPointerMove"
      @pointerup="onMermaidModalPointerUp"
      @pointercancel="onMermaidModalPointerUp"
    >
      <div class="mermaid-modal-bar">
        <strong>{{ activeMermaidDiagram.title }}</strong>
        <div class="mermaid-modal-actions">
          <button data-testid="mermaid-modal-zoom-out" class="icon-button" type="button" aria-label="缩小" title="缩小" @click="zoomActiveMermaid(-0.2)">
            <svg aria-hidden="true" viewBox="0 0 24 24"><path :d="icons.minus" /></svg>
          </button>
          <button data-testid="mermaid-modal-reset" class="icon-button" type="button" aria-label="还原比例" title="还原比例" @click="resetActiveMermaidView">
            <svg aria-hidden="true" viewBox="0 0 24 24"><path :d="icons.refresh" /></svg>
          </button>
          <button data-testid="mermaid-modal-zoom-in" class="icon-button" type="button" aria-label="放大" title="放大" @click="zoomActiveMermaid(0.2)">
            <svg aria-hidden="true" viewBox="0 0 24 24"><path :d="icons.plus" /></svg>
          </button>
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
            <svg aria-hidden="true" viewBox="0 0 24 24"><path :d="icons.x" /></svg>
          </button>
        </div>
      </div>
      <div class="mermaid-modal-body">
        <div
          class="mermaid-modal-canvas"
          data-testid="mermaid-modal-canvas"
          :style="activeMermaidStyle"
          v-html="activeMermaidDiagram.html"
        />
      </div>
    </div>

    <div
      v-if="activeImagePreview"
      class="image-modal"
      :class="{ 'image-modal--dragging': activeImagePreview.dragPointerId !== null }"
      data-testid="image-modal"
      role="dialog"
      aria-modal="true"
      :aria-label="activeImagePreview.title"
      @click.self="closeImageModalFromBackdrop"
      @wheel="onImageModalWheel"
      @pointerdown="onImageModalPointerDown"
      @pointermove="onImageModalPointerMove"
      @pointerup="onImageModalPointerUp"
      @pointercancel="onImageModalPointerUp"
    >
      <div class="image-modal-bar">
        <strong>{{ activeImagePreview.title }}</strong>
        <div class="image-modal-actions">
          <button data-testid="image-modal-zoom-out" class="icon-button" type="button" aria-label="缩小" title="缩小" @click="zoomActiveImage(-0.2)">
            <svg aria-hidden="true" viewBox="0 0 24 24"><path :d="icons.minus" /></svg>
          </button>
          <button data-testid="image-modal-reset" class="icon-button" type="button" aria-label="还原比例" title="还原比例" @click="resetActiveImageView">
            <svg aria-hidden="true" viewBox="0 0 24 24"><path :d="icons.refresh" /></svg>
          </button>
          <button data-testid="image-modal-zoom-in" class="icon-button" type="button" aria-label="放大" title="放大" @click="zoomActiveImage(0.2)">
            <svg aria-hidden="true" viewBox="0 0 24 24"><path :d="icons.plus" /></svg>
          </button>
          <button data-testid="image-modal-download" class="icon-button" type="button" aria-label="下载图片" title="下载图片" @click="downloadActiveImage">
            <svg aria-hidden="true" viewBox="0 0 24 24"><path :d="icons.download" /></svg>
          </button>
          <button class="icon-button" type="button" aria-label="关闭" title="关闭" @click="activeImagePreview = null">
            <svg aria-hidden="true" viewBox="0 0 24 24"><path :d="icons.x" /></svg>
          </button>
        </div>
      </div>
      <div class="image-modal-body">
        <img
          class="image-modal-canvas"
          data-testid="image-modal-canvas"
          :alt="activeImagePreview.title"
          :src="activeImagePreview.src"
          :style="activeImageStyle"
          draggable="false"
          @dragstart.prevent
        />
      </div>
    </div>
  </main>
</template>
