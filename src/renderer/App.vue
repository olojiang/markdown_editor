<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import TocTree from '@/renderer/components/TocTree.vue';
import { buildHeadingTree, renderMarkdown, type HeadingNode } from '@/renderer/lib/markdown';
import { createDefaultSession, mergeSession, type MarkdownSession } from '@/renderer/lib/session';

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
const status = ref('请选择或打开一个 Markdown 文件');
let saveTimer: number | undefined;

const previewHtml = computed(() => renderMarkdown(source.value));
const headingTree = computed(() => buildHeadingTree(source.value));
const title = computed(() => currentFile.value?.name ?? 'Markdown Editor');

function toggleNode(target: HeadingNode): void {
  target.collapsed = !target.collapsed;
}

function rememberScroll(scrollTop: number): void {
  session.value = mergeSession(session.value, { scrollTop });
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
  session.value = { filePath: file.path, scrollTop };
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
    await bridge?.saveSession({ filePath: file.path, scrollTop: 0 });
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
  session.value = (await bridge?.getSession()) ?? createDefaultSession();
  const file = await bridge?.readLastMarkdownFile();
  if (file) {
    setFile(file, session.value.scrollTop);
  }
  await renderMermaid();
});
</script>

<template>
  <main :class="['app-shell', { 'preview-fullscreen': isPreviewFullscreen }]">
    <header class="topbar">
      <div class="title-block">
        <strong>{{ title }}</strong>
        <span>{{ status }}</span>
      </div>
      <div class="actions">
        <button type="button" @click="openFile">打开</button>
        <button type="button" @click="saveCurrentFile">保存</button>
        <button data-testid="fullscreen-preview" type="button" @click="isPreviewFullscreen = !isPreviewFullscreen">
          {{ isPreviewFullscreen ? '退出预览' : '全屏预览' }}
        </button>
      </div>
    </header>

    <section class="workspace">
      <aside class="toc-panel" data-testid="toc">
        <h2>目录</h2>
        <TocTree v-if="headingTree.length" :nodes="headingTree" @toggle="toggleNode" @jump="jumpToHeading" />
        <p v-else class="empty">暂无标题</p>
      </aside>

      <textarea
        v-model="source"
        class="source-editor"
        data-testid="editor"
        spellcheck="false"
        placeholder="# 开始写 Markdown"
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
