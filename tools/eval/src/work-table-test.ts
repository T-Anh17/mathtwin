import type { TableFamily } from './work-table-render.js';
// Held-out notation families; never imported by parser development tests.
export const testTableFamilies: TableFamily[] = [
  { id: 'test-bracket', split: 'test', heading: 'Đỉnh chọn', row: 'vertex', cell: (n, v) => v ? `[${n}; ${v}]` : String(n) },
  { id: 'test-parenthesis', split: 'test', heading: '', row: 'mark', cell: (n, v) => v ? `${n}(${v})` : String(n) },
];
