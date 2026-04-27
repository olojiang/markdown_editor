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

const bridge = window.markdownBridge;
const currentFile = ref<MarkdownFile | null>(null);
const source = ref('');
const session = ref<MarkdownSession>(createDefaultSession());
const isPreviewFullscreen = ref(false);
const preview = ref<HTMLElement | null>(null);
const editor = ref<HTMLTextAreaElement | null>(null);
const status = ref('请选择或打开一个 Markdown 文件');
const tocSearch = ref('');
const editorSearch = ref('');
const editorReplace = ref('');
const activeResize = ref<'toc' | 'editor' | null>(null);
let saveTimer: number | undefined;

const previewHtml = computed(() => renderMarkdown(source.value));
const headingTree = computed(() => buildHeadingTree(source.value));
const visibleHeadingTree = computed(() => filterHeadingTree(headingTree.value, tocSearch.value));
const title = computed(() => currentFile.value?.name ?? 'Markdown Editor');
const isEditorVisible = computed(() => session.value.editorVisible || !currentFile.value);
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

function toggleNode(target: HeadingNode): void {
  target.collapsed = !target.collapsed;
}

function rememberScroll(scrollTop: number): void {
  session.value = mergeSession(session.value, { scrollTop });
  void bridge?.saveSession(session.value);
}

function persistSession(patch: Partial<MarkdownSession>): void {
  session.value = mergeSession(session.value, patch);
  void bridge?.saveSession(session.value);
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
  session.value = mergeSession(session.value, { filePath: file.path, scrollTop });
  status.value = file.path;
  void nextTick(() => {
    if (preview.value) {
      preview.value.scrollTop = scrollTop;
    }
  });
}

async function openFile(): Promise<void> {
  const file = await bridge?.openMarkdownFile();
  if (file) {
    setFile(file, 0);
    await bridge?.saveSession(session.value);
  }
}

async function saveCurrentFile(): Promise<void> {
  if (!currentFile.value || !bridge) {
    return;
  }

  currentFile.value = await bridge.saveMarkdownFile(currentFile.value.path, source.value);
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
  persistSession({
    editorVisible: !isEditorVisible.value,
    previewHidden: false,
  });
}

function togglePreview(): void {
  persistSession({
    previewHidden: !session.value.previewHidden,
    editorVisible: true,
  });
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
          <h2>目录</h2>
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
        @scroll="rememberScroll(($event.target as HTMLElement).scrollTop)"
        @wheel="onPreviewWheel"
        @pointerdown="onPreviewPointerDown"
        @pointermove="onPreviewPointerMove"
        v-html="previewHtml"
      />
    </section>
  </main>
</template>
