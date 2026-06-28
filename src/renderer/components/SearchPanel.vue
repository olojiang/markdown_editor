<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import {
  SearchHistory,
  searchInOpenedTabs,
  groupResultsByFile,
  truncateLineContent,
  type FileSearchMatch,
  type FileSearchScope,
} from '../lib/search';
import { rendererLog } from '../lib/logger';

const props = defineProps<{
  openedTabs: { filePath: string | null; fileName: string; content: string }[];
  currentFileDir: string | null;
}>();

const emit = defineEmits<{
  (e: 'navigate', match: FileSearchMatch): void;
  (e: 'close'): void;
}>();

const bridge = window.markdownBridge;
const searchInput = ref<HTMLInputElement | null>(null);
const query = ref('');
const isRegex = ref(false);
const scope = ref<FileSearchScope>('opened');
const excludeInput = ref('');
const results = ref<FileSearchMatch[]>([]);
const isSearching = ref(false);
const showHistory = ref(false);
const historyVersion = ref(0);
const history = new SearchHistory();
let searchVersion = 0;

const excludeFolders = computed(() =>
  excludeInput.value
    .split(',')
    .map(f => f.trim())
    .filter(Boolean),
);

const groupedResults = computed(() => groupResultsByFile(results.value));

const resultCount = computed(() => results.value.length);

const fileCount = computed(() => groupedResults.value.size);

const historyItems = computed(() => {
  void historyVersion.value;
  return history.getAll();
});

const statusText = computed(() => {
  if (isSearching.value) {
    return '搜索中...';
  }
  if (!query.value) {
    return '';
  }
  return `${fileCount.value} 个文件中找到 ${resultCount.value} 个结果`;
});

function focusInput(): void {
  showHistory.value = false;
  nextTick(() => searchInput.value?.focus());
}

async function executeSearch(): Promise<void> {
  const q = query.value.trim();
  if (!q) {
    results.value = [];
    return;
  }

  const version = ++searchVersion;
  isSearching.value = true;
  history.add(q);
  historyVersion.value++;

  rendererLog.info('search.execute', { query: q, scope: scope.value, isRegex: isRegex.value });

  try {
    if (scope.value === 'opened') {
      results.value = searchInOpenedTabs(props.openedTabs, q, isRegex.value);
    } else if (bridge?.searchInFiles && props.currentFileDir) {
      const ipcResults = await bridge.searchInFiles({
        query: q,
        isRegex: isRegex.value,
        searchDir: props.currentFileDir,
        excludeFolders: excludeFolders.value,
        maxResults: 1000,
      });
      if (version === searchVersion) {
        results.value = ipcResults;
      }
    } else {
      results.value = [];
      rendererLog.warn('search.execute.noDir', { scope: scope.value });
    }
  } catch (error) {
    rendererLog.error('search.execute.failed', {
      message: error instanceof Error ? error.message : String(error),
    });
    if (version === searchVersion) {
      results.value = [];
    }
  } finally {
    if (version === searchVersion) {
      isSearching.value = false;
    }
  }
}

function onResultClick(match: FileSearchMatch): void {
  emit('navigate', match);
}

function selectHistoryItem(item: string): void {
  query.value = item;
  showHistory.value = false;
  void executeSearch();
}

function removeHistoryItem(item: string, event: Event): void {
  event.stopPropagation();
  history.remove(item);
  historyVersion.value++;
}

function onKeyDown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    if (showHistory.value) {
      showHistory.value = false;
      event.preventDefault();
      event.stopPropagation();
    }
    return;
  }
  if (event.key === 'Enter') {
    showHistory.value = false;
    void executeSearch();
    event.preventDefault();
  }
}

function formatLineContent(match: FileSearchMatch): string {
  return truncateLineContent(match.lineContent, match.column).trim();
}

function onInputBlur(): void {
  setTimeout(() => { showHistory.value = false; }, 200);
}

watch(scope, () => {
  if (query.value.trim()) {
    void executeSearch();
  }
});

defineExpose({ focusInput });
</script>

<template>
  <div class="file-search-panel" data-testid="file-search-panel">
    <div class="file-search-panel-bar">
      <strong>在文件中搜索</strong>
      <button class="icon-button" type="button" aria-label="关闭搜索" title="关闭搜索" @click="emit('close')">
        <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M18 6 6 18M6 6l12 12" /></svg>
      </button>
    </div>
    <div class="file-search-tools">
      <div class="file-search-input-row">
        <div class="file-search-input-wrap">
          <input
            ref="searchInput"
            v-model="query"
            data-testid="file-search-input"
            type="search"
            placeholder="搜索关键词或正则表达式"
            @keydown="onKeyDown"
            @focus="showHistory = historyItems.length > 0"
            @blur="onInputBlur"
          />
          <div v-if="showHistory && historyItems.length > 0" class="file-search-history" data-testid="file-search-history">
            <button
              v-for="item in historyItems"
              :key="item"
              class="file-search-history-item"
              type="button"
              @click="selectHistoryItem(item)"
            >
              <span>{{ item }}</span>
              <span class="file-search-history-delete" @click="removeHistoryItem(item, $event)">x</span>
            </button>
          </div>
        </div>
        <button
          data-testid="file-search-regex"
          class="mode-button"
          type="button"
          :class="{ active: isRegex }"
          title="正则表达式"
          @click="isRegex = !isRegex"
        >
          .*
        </button>
        <button
          data-testid="file-search-run"
          class="primary-button"
          type="button"
          :disabled="isSearching || !query.trim()"
          @click="executeSearch"
        >
          搜索
        </button>
      </div>
      <div class="file-search-options">
        <div class="file-search-scope" role="group" aria-label="搜索范围">
          <button
            data-testid="file-search-scope-opened"
            class="mode-button"
            type="button"
            :class="{ active: scope === 'opened' }"
            @click="scope = 'opened'"
          >
            已打开文件
          </button>
          <button
            data-testid="file-search-scope-folder"
            class="mode-button"
            type="button"
            :class="{ active: scope === 'folder' }"
            :disabled="!currentFileDir"
            @click="scope = 'folder'"
          >
            当前文件夹
          </button>
        </div>
        <input
          v-if="scope === 'folder'"
          v-model="excludeInput"
          data-testid="file-search-exclude"
          type="text"
          placeholder="排除文件夹（逗号分隔）"
        />
      </div>
    </div>
    <div class="file-search-results" data-testid="file-search-results" role="listbox" aria-label="搜索结果">
      <template v-for="[fileKey, matches] in groupedResults" :key="fileKey">
        <div class="file-search-file-header">
          <strong :title="fileKey">{{ matches[0].fileName }}</strong>
          <span>{{ matches.length }} 个匹配</span>
        </div>
        <button
          v-for="match in matches"
          :key="`${fileKey}:${match.lineNumber}:${match.column}`"
          class="file-search-result-row"
          type="button"
          :title="`${match.fileName}:${match.lineNumber}:${match.column}`"
          :data-testid="`search-result-${match.fileName}-${match.lineNumber}`"
          @click="onResultClick(match)"
        >
          <span class="file-search-result-location">{{ match.lineNumber }}:{{ match.column }}</span>
          <span class="file-search-result-preview">{{ formatLineContent(match) }}</span>
        </button>
      </template>
      <p v-if="!isSearching && query.trim() && resultCount === 0" class="file-search-empty" data-testid="file-search-empty">
        没有找到匹配结果
      </p>
    </div>
    <div v-if="statusText" class="file-search-status" data-testid="file-search-status">
      {{ statusText }}
    </div>
  </div>
</template>
