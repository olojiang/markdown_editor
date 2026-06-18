<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import type * as Monaco from 'monaco-editor/esm/vs/editor/editor.api.js';
import {
  defaultEditorConfigText,
  parseEditorConfig,
  type ParsedEditorConfig,
} from '@/renderer/lib/editorConfig';
import { rendererLog } from '@/renderer/lib/logger';

interface SelectionRange {
  end: number;
  start: number;
}

interface MonacoPasteEvent {
  clipboardEvent?: ClipboardEvent;
  range: SelectionRange;
}

interface PasteShortcutEvent {
  altKey?: boolean;
  ctrlKey?: boolean;
  key?: string;
  metaKey?: boolean;
  preventDefault(): void;
  shiftKey?: boolean;
  stopPropagation(): void;
}

interface CursorPosition {
  column: number;
  lineNumber: number;
}

const props = defineProps<{
  bookmarkLineNumbers: number[];
  configText: string;
  language: string;
  modelValue: string;
  theme: 'light' | 'dark' | 'eye';
  vimEnabled: boolean;
}>();

const emit = defineEmits<{
  (event: 'focus-line-change'): void;
  (event: 'monaco-paste', value: MonacoPasteEvent): void;
  (event: 'paste', value: ClipboardEvent): void;
  (event: 'paste-shortcut', value: PasteShortcutEvent): void;
  (event: 'scroll', value: Event): void;
  (event: 'show-search-shortcut', value: string): void;
  (event: 'update:modelValue', value: string): void;
  (event: 'vim-command', value: 'write' | 'write-quit' | 'quit' | 'force-quit'): void;
  (event: 'vim-status', value: string): void;
}>();

const container = ref<HTMLElement | null>(null);
const statusbar = ref<HTMLElement | null>(null);
const fallbackEditor = ref<HTMLTextAreaElement | null>(null);
const isTestMode = computed(() => (import.meta as ImportMeta & { env?: { MODE?: string } }).env?.MODE === 'test');
const parsedConfig = computed(() => {
  try {
    return parseEditorConfig(props.configText);
  } catch (error) {
    rendererLog.warn('editor.config.fallback', {
      message: error instanceof Error ? error.message : String(error),
    });
    return parseEditorConfig(defaultEditorConfigText);
  }
});

let monacoModule: typeof Monaco | null = null;
let monacoEditor: Monaco.editor.IStandaloneCodeEditor | null = null;
let vimMode: { dispose(): void } | null = null;
let ignoreModelChange = false;
let disposables: Array<{ dispose(): void }> = [];
let bookmarkDecorationIds: string[] = [];

function editorTheme(): string {
  return props.theme === 'dark' ? 'markdown-dark' : props.theme === 'eye' ? 'markdown-eye' : 'markdown-light';
}

async function loadMonacoEditor(): Promise<typeof Monaco> {
  const [monaco] = await Promise.all([
    import('monaco-editor/esm/vs/editor/editor.api.js'),
    import('monaco-editor/esm/vs/basic-languages/html/html.contribution.js'),
    import('monaco-editor/esm/vs/language/json/monaco.contribution.js'),
  ]);

  return monaco;
}

function monacoOptions(config: ParsedEditorConfig): Monaco.editor.IStandaloneEditorConstructionOptions {
  return {
    automaticLayout: true,
    detectIndentation: false,
    fontFamily: '"SFMono-Regular", Consolas, "Liberation Mono", monospace',
    fontSize: config.fontSize,
    insertSpaces: config.insertSpaces,
    language: props.language,
    glyphMargin: true,
    lineNumbers: config.lineNumbers,
    minimap: { enabled: config.minimap },
    padding: { bottom: 18, top: 18 },
    renderLineHighlight: 'line',
    scrollBeyondLastLine: false,
    tabSize: config.tabSize,
    theme: editorTheme(),
    value: props.modelValue,
    wordWrap: config.wordWrap,
    wrappingIndent: 'same',
  };
}

function normalizedBookmarkLineNumbers(model: Monaco.editor.ITextModel): number[] {
  const lineCount = model.getLineCount();
  const lineNumbers = props.bookmarkLineNumbers
    .filter((lineNumber) => Number.isFinite(lineNumber))
    .map((lineNumber) => Math.trunc(lineNumber))
    .filter((lineNumber) => lineNumber >= 1 && lineNumber <= lineCount);

  return Array.from(new Set(lineNumbers)).sort((a, b) => a - b);
}

function syncBookmarkDecorations(): void {
  const monaco = monacoModule;
  const model = getModel();
  if (!monacoEditor || !monaco || !model) {
    return;
  }

  const decorations: Monaco.editor.IModelDeltaDecoration[] = normalizedBookmarkLineNumbers(model).map((lineNumber) => ({
    range: new monaco.Range(lineNumber, 1, lineNumber, 1),
    options: {
      className: 'bookmark-line-highlight',
      glyphMarginClassName: 'bookmark-glyph',
      glyphMarginHoverMessage: { value: '书签' },
      isWholeLine: true,
      linesDecorationsClassName: 'bookmark-line-decoration',
    },
  }));

  bookmarkDecorationIds = monacoEditor.deltaDecorations(bookmarkDecorationIds, decorations);
}

function defineMonacoThemes(monaco: typeof Monaco): void {
  monaco.editor.defineTheme('markdown-light', {
    base: 'vs',
    inherit: true,
    rules: [
      { token: 'tag.html', foreground: '0f766e' },
      { token: 'delimiter.html', foreground: '64748b' },
      { token: 'metatag.html', foreground: '7c3aed' },
      { token: 'attribute.name.html', foreground: 'b45309' },
      { token: 'attribute.value.html', foreground: '0969da' },
      { token: 'string.key.json', foreground: '0969da' },
      { token: 'string.value.json', foreground: '0f766e' },
      { token: 'number.json', foreground: 'b45309' },
      { token: 'keyword.json', foreground: '7c3aed' },
      { token: 'delimiter.bracket.json', foreground: '64748b' },
      { token: 'delimiter.array.json', foreground: '64748b' },
      { token: 'delimiter.colon.json', foreground: '64748b' },
      { token: 'delimiter.comma.json', foreground: '64748b' },
    ],
    colors: {
      'editor.background': '#fbfdff',
      'editor.foreground': '#172026',
      'editorCursor.foreground': '#0b7a75',
      'editor.lineHighlightBackground': '#d9e8f255',
    },
  });
  monaco.editor.defineTheme('markdown-dark', {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: 'tag.html', foreground: '5eead4' },
      { token: 'delimiter.html', foreground: '94a3b8' },
      { token: 'metatag.html', foreground: 'c4b5fd' },
      { token: 'attribute.name.html', foreground: 'f8c471' },
      { token: 'attribute.value.html', foreground: '8ec5ff' },
      { token: 'string.key.json', foreground: '8ec5ff' },
      { token: 'string.value.json', foreground: '5eead4' },
      { token: 'number.json', foreground: 'f8c471' },
      { token: 'keyword.json', foreground: 'c4b5fd' },
      { token: 'delimiter.bracket.json', foreground: '94a3b8' },
      { token: 'delimiter.array.json', foreground: '94a3b8' },
      { token: 'delimiter.colon.json', foreground: '94a3b8' },
      { token: 'delimiter.comma.json', foreground: '94a3b8' },
    ],
    colors: {
      'editor.background': '#0f1724',
      'editor.foreground': '#e5edf6',
      'editorCursor.foreground': '#5eead4',
      'editor.lineHighlightBackground': '#123b3c66',
    },
  });
  monaco.editor.defineTheme('markdown-eye', {
    base: 'vs',
    inherit: true,
    rules: [
      { token: 'tag.html', foreground: '557a35' },
      { token: 'delimiter.html', foreground: '65755d' },
      { token: 'metatag.html', foreground: '7c4d25' },
      { token: 'attribute.name.html', foreground: '9a5319' },
      { token: 'attribute.value.html', foreground: '1d6e7d' },
      { token: 'string.key.json', foreground: '1d6e7d' },
      { token: 'string.value.json', foreground: '557a35' },
      { token: 'number.json', foreground: '9f6a13' },
      { token: 'keyword.json', foreground: '7c4d25' },
      { token: 'delimiter.bracket.json', foreground: '65755d' },
      { token: 'delimiter.array.json', foreground: '65755d' },
      { token: 'delimiter.colon.json', foreground: '65755d' },
      { token: 'delimiter.comma.json', foreground: '65755d' },
    ],
    colors: {
      'editor.background': '#fffef2',
      'editor.foreground': '#243024',
      'editorCursor.foreground': '#557a35',
      'editor.lineHighlightBackground': '#dfead066',
    },
  });
}

function emitFocusLineChange(): void {
  emit('focus-line-change');
}

function emitScroll(): void {
  emit('scroll', new Event('scroll'));
}

function onFallbackInput(event: Event): void {
  emit('update:modelValue', (event.target as HTMLTextAreaElement).value);
  emitFocusLineChange();
}

function onFallbackPaste(event: ClipboardEvent): void {
  emit('paste', event);
}

function onPasteCapture(event: ClipboardEvent): void {
  emit('paste', event);
}

function isPasteShortcut(event: KeyboardEvent): boolean {
  return event.key.toLowerCase() === 'v' && (event.metaKey || event.ctrlKey) && !event.altKey && !event.shiftKey;
}

function isSearchShortcut(event: KeyboardEvent | Monaco.IKeyboardEvent): boolean {
  const isDomSearchKey = 'key' in event && event.key.toLowerCase() === 'f';
  const isMonacoSearchKey = monacoModule !== null && 'keyCode' in event && event.keyCode === monacoModule.KeyCode.KeyF;

  return (isDomSearchKey || isMonacoSearchKey) && (event.metaKey || event.ctrlKey) && !event.altKey && !event.shiftKey;
}

function interceptSearchShortcut(event: KeyboardEvent | Monaco.IKeyboardEvent): void {
  if (!isSearchShortcut(event)) {
    return;
  }

  event.preventDefault();
  event.stopPropagation();
  emit('show-search-shortcut', selectedText());
}

function onKeydownCapture(event: KeyboardEvent): void {
  interceptSearchShortcut(event);
  if (isPasteShortcut(event)) {
    emit('paste-shortcut', event);
  }
}

function onMonacoKeyDown(event: Monaco.IKeyboardEvent): void {
  interceptSearchShortcut(event);
  if (event.keyCode === monacoModule?.KeyCode.KeyV && (event.metaKey || event.ctrlKey) && !event.altKey && !event.shiftKey) {
    emit('paste-shortcut', event);
  }
}

function onMonacoPaste(event: Monaco.editor.IPasteEvent): void {
  const model = getModel();
  if (!model) {
    return;
  }

  emit('monaco-paste', {
    clipboardEvent: event.clipboardEvent,
    range: {
      start: model.getOffsetAt({
        column: event.range.startColumn,
        lineNumber: event.range.startLineNumber,
      }),
      end: model.getOffsetAt({
        column: event.range.endColumn,
        lineNumber: event.range.endLineNumber,
      }),
    },
  });
}

function registerSearchShortcutOverride(monaco: typeof Monaco, editor: Monaco.editor.IStandaloneCodeEditor): void {
  editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyF, () => {
    emit('show-search-shortcut', selectedText());
  });
}

async function startVimMode(): Promise<void> {
  if (!monacoEditor || vimMode) {
    return;
  }

  const [{ initVimMode, VimMode }] = await Promise.all([import('monaco-vim')]);
  vimMode = initVimMode(monacoEditor, statusbar.value);
  const vimApi = (VimMode as unknown as { Vim?: {
    defineEx?(name: string, prefix: string, callback: unknown): void;
    mapclear?(mode?: string): void;
    map?(before: string, after: string, mode?: string): void;
    setOption?(name: string, value: unknown): void;
  } }).Vim;
  const config = parsedConfig.value;
  vimApi?.defineEx?.('write', 'w', () => emit('vim-command', 'write'));
  vimApi?.defineEx?.('wq', 'wq', () => emit('vim-command', 'write-quit'));
  vimApi?.defineEx?.('quit', 'q', (_cm: unknown, params: { argString?: string } = {}) => {
    emit('vim-command', params.argString?.trim() === '!' ? 'force-quit' : 'quit');
  });
  vimApi?.setOption?.('mapleader', config.vimLeader);
  vimApi?.mapclear?.();
  config.vimKeymaps.forEach((keymap) => {
    vimApi?.map?.(keymap.before, keymap.after, keymap.mode);
  });
  emit('vim-status', 'Vim 模式已开启');
  rendererLog.info('editor.vim.enabled', {
    keymaps: config.vimKeymaps.length,
    leader: config.vimLeader,
  });
}

function stopVimMode(): void {
  if (!vimMode) {
    return;
  }
  vimMode.dispose();
  vimMode = null;
  statusbar.value?.replaceChildren();
  emit('vim-status', 'Vim 模式已关闭');
  rendererLog.info('editor.vim.disabled');
}

async function syncVimMode(): Promise<void> {
  if (!monacoEditor) {
    return;
  }
  if (props.vimEnabled) {
    await startVimMode();
    return;
  }
  stopVimMode();
}

async function createMonacoEditor(): Promise<void> {
  if (isTestMode.value || !container.value || monacoEditor) {
    return;
  }

  rendererLog.info('editor.monaco.init.start', {
    theme: props.theme,
    vimEnabled: props.vimEnabled,
  });
  monacoModule = await loadMonacoEditor();
  defineMonacoThemes(monacoModule);
  monacoEditor = monacoModule.editor.create(container.value, monacoOptions(parsedConfig.value));
  registerSearchShortcutOverride(monacoModule, monacoEditor);
  syncBookmarkDecorations();
  disposables = [
    monacoEditor.onDidChangeModelContent(() => {
      if (ignoreModelChange) {
        return;
      }
      emit('update:modelValue', monacoEditor?.getValue() ?? '');
      emitFocusLineChange();
      syncBookmarkDecorations();
    }),
    monacoEditor.onDidScrollChange(emitScroll),
    monacoEditor.onDidChangeCursorPosition(emitFocusLineChange),
    monacoEditor.onDidPaste(onMonacoPaste),
    monacoEditor.onKeyDown(onMonacoKeyDown),
  ];
  container.value.addEventListener('paste', onPasteCapture, { capture: true });
  container.value.addEventListener('keydown', onKeydownCapture, { capture: true });
  await syncVimMode();
  rendererLog.info('editor.monaco.init.done', {
    lineCount: monacoEditor.getModel()?.getLineCount() ?? 0,
  });
}

function applyConfig(): void {
  if (!monacoEditor) {
    return;
  }
  try {
    const config = parsedConfig.value;
    monacoEditor.updateOptions(monacoOptions(config));
    rendererLog.info('editor.monaco.config.applied', { ...config });
  } catch (error) {
    rendererLog.error('editor.monaco.config.failed', {
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

function getModel(): Monaco.editor.ITextModel | null {
  return monacoEditor?.getModel() ?? null;
}

function applyLanguage(): void {
  const model = getModel();
  if (!monacoModule || !model) {
    return;
  }
  monacoModule.editor.setModelLanguage(model, props.language);
}

function getSelectionRange(): SelectionRange {
  const fallback = fallbackEditor.value;
  if (fallback) {
    return {
      start: fallback.selectionStart,
      end: fallback.selectionEnd,
    };
  }

  const model = getModel();
  const selection = monacoEditor?.getSelection();
  if (!model || !selection) {
    return { start: props.modelValue.length, end: props.modelValue.length };
  }

  return {
    start: model.getOffsetAt(selection.getStartPosition()),
    end: model.getOffsetAt(selection.getEndPosition()),
  };
}

function selectedText(): string {
  const range = getSelectionRange();
  const start = Math.min(Math.max(0, range.start), props.modelValue.length);
  const end = Math.min(Math.max(start, range.end), props.modelValue.length);
  return props.modelValue.slice(start, end);
}

function cursorPositionFromOffset(value: string, offset: number): CursorPosition {
  const safeOffset = Math.min(Math.max(0, offset), value.length);
  const lines = value.slice(0, safeOffset).split('\n');
  return {
    column: lines[lines.length - 1].length + 1,
    lineNumber: lines.length,
  };
}

function offsetFromCursorPosition(value: string, position: CursorPosition): number {
  const lines = value.split('\n');
  const lineIndex = Math.min(Math.max(1, position.lineNumber), lines.length) - 1;
  const beforeLines = lines.slice(0, lineIndex).join('\n');
  const lineOffset = lineIndex === 0 ? 0 : beforeLines.length + 1;
  const columnOffset = Math.min(Math.max(1, position.column), lines[lineIndex].length + 1) - 1;

  return lineOffset + columnOffset;
}

function getCursorPosition(): CursorPosition {
  const fallback = fallbackEditor.value;
  if (fallback) {
    return cursorPositionFromOffset(fallback.value, fallback.selectionStart);
  }

  return monacoEditor?.getPosition() ?? { column: 1, lineNumber: 1 };
}

function setCursorPosition(position: CursorPosition): void {
  const fallback = fallbackEditor.value;
  if (fallback) {
    const offset = offsetFromCursorPosition(fallback.value, position);
    fallback.setSelectionRange(offset, offset);
    fallback.focus();
    return;
  }

  const model = getModel();
  if (!model || !monacoEditor) {
    return;
  }

  const lineNumber = Math.min(Math.max(1, position.lineNumber), model.getLineCount());
  const column = Math.min(Math.max(1, position.column), model.getLineMaxColumn(lineNumber));
  monacoEditor.setPosition({ column, lineNumber });
  monacoEditor.revealPositionInCenterIfOutsideViewport({ column, lineNumber });
  monacoEditor.focus();
}

function setSelectionRange(start: number, end: number): void {
  const fallback = fallbackEditor.value;
  if (fallback) {
    fallback.setSelectionRange(start, end);
    return;
  }

  const model = getModel();
  if (!model || !monacoEditor) {
    return;
  }
  const startPosition = model.getPositionAt(start);
  const endPosition = model.getPositionAt(end);
  monacoEditor.setSelection({
    startLineNumber: startPosition.lineNumber,
    startColumn: startPosition.column,
    endLineNumber: endPosition.lineNumber,
    endColumn: endPosition.column,
  });
  monacoEditor.revealPositionInCenterIfOutsideViewport(endPosition);
}

function getScrollTop(): number {
  return fallbackEditor.value?.scrollTop ?? monacoEditor?.getScrollTop() ?? 0;
}

function fallbackLineHeight(element: HTMLElement): number {
  const lineHeight = Number.parseFloat(window.getComputedStyle(element).lineHeight);
  return Number.isFinite(lineHeight) && lineHeight > 0 ? lineHeight : 22.4;
}

function getLineScrollTop(lineNumber: number): number | null {
  const requestedLineNumber = Number.isFinite(lineNumber) ? Math.trunc(lineNumber) : 1;
  const fallback = fallbackEditor.value;
  if (fallback) {
    return (Math.max(1, requestedLineNumber) - 1) * fallbackLineHeight(fallback);
  }

  if (!monacoEditor) {
    return null;
  }

  const model = getModel();
  if (!model) {
    return null;
  }

  const safeLineNumber = Math.min(Math.max(1, requestedLineNumber), model.getLineCount());
  return monacoEditor.getTopForLineNumber(safeLineNumber);
}

function getMaxScrollTop(): number {
  const fallback = fallbackEditor.value;
  if (fallback) {
    return Math.max(0, fallback.scrollHeight - fallback.clientHeight);
  }
  if (!monacoEditor) {
    return 0;
  }

  return Math.max(0, monacoEditor.getScrollHeight() - monacoEditor.getLayoutInfo().height);
}

function setScrollTop(value: number): void {
  if (fallbackEditor.value) {
    fallbackEditor.value.scrollTop = value;
    return;
  }
  monacoEditor?.setScrollTop(value);
}

function focus(): void {
  fallbackEditor.value?.focus();
  monacoEditor?.focus();
}

function undo(): void {
  const fallback = fallbackEditor.value;
  if (fallback) {
    document.execCommand?.('undo');
    emit('update:modelValue', fallback.value);
    return;
  }
  monacoEditor?.trigger('keyboard', 'undo', null);
}

function redo(): void {
  const fallback = fallbackEditor.value;
  if (fallback) {
    document.execCommand?.('redo');
    emit('update:modelValue', fallback.value);
    return;
  }
  monacoEditor?.trigger('keyboard', 'redo', null);
}

function getElement(): HTMLElement | null {
  return fallbackEditor.value ?? monacoEditor?.getDomNode() ?? null;
}

onMounted(() => {
  void createMonacoEditor();
});

onBeforeUnmount(() => {
  stopVimMode();
  disposables.forEach((disposable) => disposable.dispose());
  disposables = [];
  container.value?.removeEventListener('paste', onPasteCapture, { capture: true });
  container.value?.removeEventListener('keydown', onKeydownCapture, { capture: true });
  monacoEditor?.dispose();
  monacoEditor = null;
});

watch(() => props.modelValue, (value) => {
  const fallback = fallbackEditor.value;
  if (fallback && fallback.value !== value) {
    fallback.value = value;
  }
  if (!monacoEditor || monacoEditor.getValue() === value) {
    return;
  }
  ignoreModelChange = true;
  monacoEditor.setValue(value);
  ignoreModelChange = false;
  syncBookmarkDecorations();
});

watch(() => props.theme, () => {
  monacoModule?.editor.setTheme(editorTheme());
});

watch(() => props.language, applyLanguage);

watch(() => props.configText, () => {
  applyConfig();
  if (props.vimEnabled) {
    stopVimMode();
    void nextTick(syncVimMode);
  }
});

watch(() => props.vimEnabled, () => {
  void syncVimMode();
});

watch(() => props.bookmarkLineNumbers, () => {
  syncBookmarkDecorations();
}, { deep: true });

defineExpose({
  focus,
  getCursorPosition,
  getElement,
  getLineScrollTop,
  getMaxScrollTop,
  getScrollTop,
  getSelectionRange,
  redo,
  setCursorPosition,
  setScrollTop,
  setSelectionRange,
  undo,
});
</script>

<template>
  <div class="monaco-editor-host">
    <textarea
      v-if="isTestMode"
      ref="fallbackEditor"
      class="source-editor"
      data-testid="editor"
      :value="modelValue"
      wrap="soft"
      spellcheck="false"
      :placeholder="language === 'markdown' ? '# 开始写 Markdown' : '开始编辑文档'"
      @click="emitFocusLineChange"
      @focus="emitFocusLineChange"
      @input="onFallbackInput"
      @keyup="emitFocusLineChange"
      @keydown.capture="onKeydownCapture"
      @paste="onFallbackPaste"
      @scroll="$emit('scroll', $event)"
      @select="emitFocusLineChange"
    />
    <div v-else ref="container" class="source-editor monaco-editor-surface" data-testid="editor" />
    <div ref="statusbar" class="vim-statusbar" data-testid="vim-statusbar" />
  </div>
</template>
