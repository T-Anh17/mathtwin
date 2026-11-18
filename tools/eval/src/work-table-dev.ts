import type { TableFamily } from './work-table-render.js';
export const devTableFamilies: TableFamily[] = [
  { id: 'dev-pair', split: 'dev', heading: 'Bước', row: 'number', cell: (n, v) => v ? `(${n}, ${v})` : String(n) },
  { id: 'dev-slash', split: 'dev', heading: 'Chọn', row: 'vertex', cell: (n, v) => v ? `${n}/${v}` : String(n) },
  { id: 'dev-compact', split: 'dev', heading: '', row: 'mark', cell: (n, v) => `${n}${v ?? ''}` },
];
