const minimumColumnPercent = 8;
const maximumColumnPercent = 45;

export function estimateMarkdownColumnWidths(rows: string[][]): number[] {
  const columnCount = rows.reduce((maxColumns, row) => Math.max(maxColumns, row.length), 0);
  if (!columnCount) return [];
  const weights = Array.from({ length: columnCount }, (_, column) => rows.reduce((maxLength, row) => (
    Math.max(maxLength, row[column]?.trim().length ?? 0)
  ), 6)).map((length) => Math.min(40, length));
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  const widths = weights.map((weight) => Math.min(maximumColumnPercent, Math.max(minimumColumnPercent, weight / total * 100)));
  const scale = 100 / widths.reduce((sum, width) => sum + width, 0);
  return widths.map((width) => width * scale);
}

function readTableRows(table: HTMLTableElement): string[][] {
  return Array.from(table.rows, (row) => Array.from(row.cells, (cell) => cell.textContent ?? ''));
}

function resizePair(left: HTMLTableColElement, right: HTMLTableColElement, delta: number): void {
  const leftWidth = left.getBoundingClientRect().width;
  const rightWidth = right.getBoundingClientRect().width;
  const nextLeft = Math.max(64, Math.min(leftWidth + rightWidth - 64, leftWidth + delta));
  left.style.width = `${nextLeft}px`;
  right.style.width = `${leftWidth + rightWidth - nextLeft}px`;
}

function addResizeHandle(table: HTMLTableElement, header: HTMLTableCellElement, index: number, columns: HTMLTableColElement[]): void {
  const handle = document.createElement('span');
  handle.className = 'markdown-table-resizer';
  handle.setAttribute('role', 'separator');
  handle.setAttribute('aria-orientation', 'vertical');
  handle.setAttribute('aria-label', `调整第 ${index + 1} 列宽度`);
  handle.tabIndex = 0;
  let startX = 0;
  const resize = (delta: number) => resizePair(columns[index], columns[index + 1], delta);
  handle.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    startX = event.clientX;
    const move = (moveEvent: PointerEvent) => { resize(moveEvent.clientX - startX); startX = moveEvent.clientX; };
    const stop = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', stop);
      window.removeEventListener('pointercancel', stop);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', stop, { once: true });
    window.addEventListener('pointercancel', stop, { once: true });
  });
  handle.addEventListener('keydown', (event) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    resize(event.key === 'ArrowRight' ? 16 : -16);
  });
  header.append(handle);
  table.classList.add('markdown-table-resizable');
}

export function makeMarkdownTablesResizable(root: HTMLElement): void {
  root.querySelectorAll<HTMLTableElement>('.markdown-table-frame table:not(.markdown-table-resizable)').forEach((table) => {
    const headers = Array.from(table.tHead?.rows[0]?.cells ?? []);
    if (headers.length < 2) return;
    const colgroup = document.createElement('colgroup');
    const columns = estimateMarkdownColumnWidths(readTableRows(table)).map((width) => {
      const column = document.createElement('col');
      column.style.width = `${width}%`;
      colgroup.append(column);
      return column;
    });
    table.prepend(colgroup);
    headers.slice(0, -1).forEach((header, index) => addResizeHandle(table, header, index, columns));
  });
}
