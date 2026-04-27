<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import TocTree from '@/renderer/components/TocTree.vue';
import {
  buildHeadingTree,
  filterHeadingTree,
  renderMarkdown,
  type HeadingNode,
} from '@/renderer/lib/markdown';
import {
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

const bridge = window.markdownBridge;
const currentFile = ref<MarkdownFile | null>(null);
const source = ref('');
const lastSavedContent = ref('');
const session = ref<MarkdownSession>(createDefaultSession());
const isPreviewFullscreen = ref(false);
const preview = ref<HTMLElement | null>(null);
const editor = ref<HTMLTextAreaElement | null>(null);
const status = ref('请选择或打开一个 Markdown 文件');
const tocSearch = ref('');
const collapsedHeadingIds = ref(new Set<string>());
const editorSearch = ref('');
const editorReplace = ref('');
const activeResize = ref<'toc' | 'editor' | null>(null);
let saveTimer: number | undefined;
let scrollSyncSource: 'editor' | 'preview' | null = null;
let scrollSyncFrame: number | undefined;
const previewScrollOffset = -50;

const previewHtml = computed(() => renderMarkdown(source.value));
const headingTree = computed(() => applyCollapsedState(buildHeadingTree(source.value)));
const visibleHeadingTree = computed(() => filterHeadingTree(headingTree.value, tocSearch.value));
const title = computed(() => currentFile.value?.name ?? 'Markdown Editor');
const isEditorVisible = computed(() => session.value.editorVisible || !currentFile.value);
const hasUnsavedChanges = computed(() => currentFile.value !== null && source.value !== lastSavedContent.value);
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

function persistableSession(): MarkdownSession {
  return { ...session.value };
}

function rememberScroll(scrollTop: number): void {
  session.value = mergeSession(session.value, { scrollTop });
  void bridge?.saveSession(persistableSession());
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
  rememberScroll(preview.value?.scrollTop ?? (event.target as HTMLElement).scrollTop);
}

function onPreviewScroll(event: Event): void {
  rememberScroll((event.target as HTMLElement).scrollTop);
  syncScroll('preview');
}

function persistSession(patch: Partial<MarkdownSession>): void {
  session.value = mergeSession(session.value, patch);
  void bridge?.saveSession(persistableSession());
}

function jumpToHeading(id: string): void {
  const container = preview.value;
  const heading = container?.querySelector<HTMLElement>(`#${CSS.escape(id)}`);
  if (!container || !heading) {
    return;
  }

  container.scrollTop = heading.offsetTop - 16;
  rememberScroll(container.scrollTop);
}

function setFile(file: MarkdownFile, scrollTop = 0): void {
  currentFile.value = file;
  source.value = file.content;
  lastSavedContent.value = file.content;
  session.value = mergeSession(session.value, { filePath: file.path, scrollTop });
  status.value = file.path;
  void nextTick(() => {
    if (preview.value) {
      preview.value.scrollTop = scrollTop;
    }
    syncScroll('preview', false);
  });
}

async function openFile(): Promise<void> {
  const file = await bridge?.openMarkdownFile();
  if (file) {
    setFile(file, 0);
    await bridge?.saveSession(persistableSession());
  }
}

async function saveCurrentFile(): Promise<void> {
  if (!currentFile.value || !bridge || !hasUnsavedChanges.value) {
    return;
  }

  currentFile.value = await bridge.saveMarkdownFile(currentFile.value.path, source.value);
  lastSavedContent.value = currentFile.value.content;
  status.value = `已保存 ${currentFile.value.path}`;
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
    persistSession({ tocWidth: Math.max(180, Math.min(520, event.clientX)) });
    return;
  }

  persistSession({
    editorWidth: Math.max(320, Math.min(1200, event.clientX - session.value.tocWidth - 6)),
  });
}

function stopResize(): void {
  activeResize.value = null;
}

function onKeyDown(event: KeyboardEvent): void {
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

async function renderMermaid(): Promise<void> {
  await nextTick();
  const diagrams = preview.value?.querySelectorAll('.mermaid');
  if (!diagrams?.length) {
    return;
  }

  try {
    const mermaid = await import('mermaid');
    mermaid.default.initialize({ startOnLoad: false, securityLevel: 'strict' });
    await mermaid.default.run({ nodes: Array.from(diagrams) as HTMLElement[] });
    applyMermaidTransforms();
  } catch {
    status.value = 'Mermaid 图渲染失败，请检查语法';
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
            type="button"
            :class="{ active: session.theme === 'light' }"
            title="浅色主题"
            @click="setTheme('light')"
          >
            浅色
          </button>
          <button
            data-testid="theme-dark"
            type="button"
            :class="{ active: session.theme === 'dark' }"
            title="深色主题"
            @click="setTheme('dark')"
          >
            深色
          </button>
          <button
            data-testid="theme-eye"
            type="button"
            :class="{ active: session.theme === 'eye' }"
            title="护眼模式"
            @click="setTheme('eye')"
          >
            护眼
          </button>
        </div>
        <button
          data-testid="open-file"
          type="button"
          title="打开 Markdown 文件 (Cmd/Ctrl+O)"
          @click="openFile"
        >
          打开
        </button>
        <button
          data-testid="save-file"
          type="button"
          :disabled="!hasUnsavedChanges"
          title="保存 Markdown 文件 (Cmd/Ctrl+S)"
          @click="saveCurrentFile"
        >
          保存
        </button>
        <button
          data-testid="toggle-preview"
          type="button"
          title="显示/隐藏预览 (Cmd/Ctrl+P)"
          @click="togglePreview"
        >
          {{ session.previewHidden ? '展开预览' : '隐藏预览' }}
        </button>
        <button
          data-testid="toggle-editor"
          type="button"
          title="切换阅读/编辑模式 (Cmd/Ctrl+E)"
          @click="toggleEditor"
        >
          {{ isEditorVisible ? '阅读' : '编辑' }}
        </button>
        <button data-testid="fullscreen-preview" type="button" @click="isPreviewFullscreen = !isPreviewFullscreen">
          {{ isPreviewFullscreen ? '退出预览' : '全屏预览' }}
        </button>
      </div>
    </header>

    <section class="workspace" :style="gridStyle">
      <aside class="toc-panel" data-testid="toc">
        <div class="panel-toolbar">
          <div class="toc-toolbar-row">
            <h2>目录</h2>
            <div class="toc-actions">
              <button data-testid="expand-toc" type="button" title="全部展开" @click="expandAllHeadings">
                展开
              </button>
              <button data-testid="collapse-toc" type="button" title="全部收起" @click="collapseAllHeadings">
                收起
              </button>
            </div>
          </div>
          <input v-model="tocSearch" data-testid="toc-search" type="search" placeholder="搜索目录" />
        </div>
        <TocTree
          v-if="visibleHeadingTree.length"
          :nodes="visibleHeadingTree"
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
        <div class="editor-tools">
          <input v-model="editorSearch" data-testid="editor-search" type="search" placeholder="搜索源码" />
          <input v-model="editorReplace" data-testid="editor-replace" type="text" placeholder="替换为" />
          <button type="button" @click="findNext">查找</button>
          <button type="button" @click="replaceCurrent">替换</button>
          <button data-testid="replace-all" type="button" @click="replaceAll">全部替换</button>
        </div>
        <textarea
          ref="editor"
          v-model="source"
          class="source-editor"
          data-testid="editor"
          spellcheck="false"
          placeholder="# 开始写 Markdown"
          @scroll="onEditorScroll"
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
        @pointerdown="onPreviewPointerDown"
        @pointermove="onPreviewPointerMove"
        v-html="previewHtml"
      />
    </section>
  </main>
</template>
