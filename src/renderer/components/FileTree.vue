<script setup lang="ts">
import { computed, ref } from 'vue';
import { filterWorkspaceEntries, type WorkspaceTreeFilter } from '@/renderer/lib/workspace-tree';

const props = defineProps<{
  rootPath: string;
  entry: DirectoryEntry;
  activePath?: string;
  depth?: number;
  filter: WorkspaceTreeFilter;
}>();
const emit = defineEmits<{ open: [path: string] }>();
const expanded = ref(false);
const loaded = ref(false);
const loading = ref(false);
const error = ref('');
const children = ref<DirectoryEntry[]>([]);
const visibleChildren = computed(() => filterWorkspaceEntries(children.value, props.filter));

async function toggleDirectory(): Promise<void> {
  expanded.value = !expanded.value;
  if (!expanded.value || loaded.value || loading.value) return;
  loading.value = true;
  error.value = '';
  try {
    children.value = await window.markdownBridge?.listDirectory?.(props.rootPath, props.entry.path) ?? [];
    loaded.value = true;
  } catch {
    error.value = '无法读取此文件夹';
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <li class="file-tree-node">
    <button
      v-if="entry.isDirectory"
      class="file-tree-row"
      :style="{ paddingLeft: `${8 + (depth ?? 0) * 14}px` }"
      type="button"
      :data-testid="`workspace-file-${entry.path}`"
      :aria-expanded="expanded"
      :aria-label="`${expanded ? '收起' : '展开'}文件夹 ${entry.name}`"
      @click="toggleDirectory"
    >
      <svg class="file-tree-chevron" :class="{ expanded }" aria-hidden="true" viewBox="0 0 16 16"><path d="m6 3 5 5-5 5" /></svg>
      <svg class="file-tree-icon folder" aria-hidden="true" viewBox="0 0 16 16"><path d="M1.5 4.5h5l1.4 1.6h6.6v6.4H1.5z" /></svg>
      <span>{{ entry.name }}</span>
      <span v-if="loading" class="file-tree-hint">…</span>
    </button>
    <button
      v-else
      class="file-tree-row"
      :class="{ active: activePath === entry.path }"
      :style="{ paddingLeft: `${30 + (depth ?? 0) * 14}px` }"
      type="button"
      :data-testid="`workspace-file-${entry.path}`"
      :title="`${entry.path}\n${entry.size === null ? '' : `${entry.size.toLocaleString()} B · `}${new Date(entry.modifiedAt).toLocaleString()}`"
      @click="emit('open', entry.path)"
    >
      <svg class="file-tree-icon" aria-hidden="true" viewBox="0 0 16 16"><path d="M3 1.5h6l4 4v9H3z" /><path d="M9 1.5v4h4" /></svg>
      <span>{{ entry.name }}</span>
    </button>
    <p v-if="error" class="file-tree-error" :style="{ paddingLeft: `${30 + (depth ?? 0) * 14}px` }">{{ error }}</p>
    <ul v-if="entry.isDirectory && expanded && loaded" class="file-tree-children">
      <FileTree
        v-for="child in visibleChildren"
        :key="child.path"
        :root-path="rootPath"
        :entry="child"
        :active-path="activePath"
        :depth="(depth ?? 0) + 1"
        :filter="filter"
        @open="emit('open', $event)"
      />
      <li v-if="visibleChildren.length === 0" class="file-tree-empty" :style="{ paddingLeft: `${30 + (depth ?? 0) * 14}px` }">{{ children.length ? '没有匹配项' : '空文件夹' }}</li>
    </ul>
  </li>
</template>
