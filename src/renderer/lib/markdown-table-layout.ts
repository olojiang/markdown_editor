const minimumColumnPercent = 8;
const maximumColumnPercent = 45;

function distributeColumnWidths(weights: number[]): number[] {
  const minWidth = Math.min(minimumColumnPercent, 100 / weights.length);
  const maxWidth = Math.max(minWidth, Math.min(maximumColumnPercent, 100 - minWidth * (weights.length - 1)));
  const widths = Array<number>(weights.length).fill(0);
  const remaining = new Set(weights.map((_, index) => index));
  let remainingWidth = 100;

  while (remaining.size) {
    const totalWeight = [...remaining].reduce((sum, index) => sum + weights[index], 0);
    const constrained = [...remaining].find((index) => {
      const proposed = weights[index] / totalWeight * remainingWidth;
      return proposed < minWidth || proposed > maxWidth;
    });
    if (constrained === undefined) {
      remaining.forEach((index) => { widths[index] = weights[index] / totalWeight * remainingWidth; });
      break;
    }

    const proposed = weights[constrained] / totalWeight * remainingWidth;
    widths[constrained] = Math.max(minWidth, Math.min(maxWidth, proposed));
    remainingWidth -= widths[constrained];
    remaining.delete(constrained);
  }
  return widths;
}

export function estimateMarkdownColumnWidths(rows: string[][]): number[] {
  const columnCount = rows.reduce((maxColumns, row) => Math.max(maxColumns, row.length), 0);
  if (!columnCount) return [];
  const weights = Array.from({ length: columnCount }, (_, column) => rows.reduce((maxLength, row) => (
    Math.max(maxLength, row[column]?.trim().length ?? 0)
  ), 6)).map((length) => Math.min(40, length));
  return distributeColumnWidths(weights);
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
