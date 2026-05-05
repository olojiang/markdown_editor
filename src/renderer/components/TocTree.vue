<script setup lang="ts">
import type { HeadingNode } from '@/renderer/lib/markdown';

defineProps<{
  nodes: HeadingNode[];
  activeId?: string;
}>();

const emit = defineEmits<{
  toggle: [node: HeadingNode];
  jump: [id: string];
}>();
</script>

<template>
  <ul class="toc-tree">
    <li v-for="node in nodes" :key="node.id" class="toc-node">
      <div class="toc-row" :style="{ paddingLeft: `${Math.max(0, node.level - 1) * 10}px` }">
        <button
          v-if="node.children.length"
          class="toc-toggle"
          type="button"
          :aria-label="node.collapsed ? '展开目录' : '折叠目录'"
          @click.stop="emit('toggle', node)"
        >
          {{ node.collapsed ? '▸' : '▾' }}
        </button>
        <span v-else class="toc-spacer" />
        <button
          class="toc-link"
          type="button"
          :class="{ active: activeId === node.id }"
          :data-toc-id="node.id"
          @click="emit('jump', node.id)"
        >
          {{ node.title }}
        </button>
      </div>
      <TocTree
        v-if="node.children.length && !node.collapsed"
        :nodes="node.children"
        :active-id="activeId"
        @toggle="emit('toggle', $event)"
        @jump="emit('jump', $event)"
      />
    </li>
  </ul>
</template>
