import type { ClaimBody } from '@mathtwin/core';
import type { WorkLine, WorkVocabulary } from '../types.js';
import { oneLabel, LabelError } from './labels.js';
import { language, labelKey } from './text.js';
import { evidenceSlice } from './confidence.js';

interface Token { text: string; sources: WorkLine[]; evidence?: WorkLine[]; x?: number }
interface Row { tokens: Token[]; sources: WorkLine[] }
export interface TableClaim { body: ClaimBody; sources: WorkLine[]; inferred: boolean; evidence?: WorkLine[] }
const normalize = (text: string): string => text.normalize('NFC').replace(/[₀-₉]/gu, (s) => String(s.charCodeAt(0) - 0x2080)).replace(/−/gu, '-');
function tokens(text: string): string[] {
  // Delimited rows preserve empty (already settled) cells.
  if (text.includes('|')) return text.replace(/^\s*\||\|\s*$/gu, '').split('|').map((s) => s.trim());
  return text.match(/\([^)]*\)|\[[^\]]*\]|[^\s]+/gu) ?? [];
}
function headerText(text: string): string {
  return language(text.replace(/\*/gu, '✓'), []).replace(/^(?:dinh\s+)?(?:duoc\s+)?chon\b/u, 'chon');
}
export function tableLike(line: WorkLine, vocab: WorkVocabulary): boolean {
  const text = normalize(line.text);
  const tail = headerText(text).replace(/^(?:buoc|chon)\s*/u, '');
  const labels = new Set(vocab.vertexLabels.map(labelKey));
  const parts = tokens(tail);
  return parts.length >= 2 && parts.every((s) => labels.has(labelKey(s)) || /^[\d\s.,;()/\[\]*✓∞+\-\p{L}_]+$/u.test(s)
    && (/[\d∞*✓-]/u.test(s)));
}
function rowsOf(lines: WorkLine[]): Row[] {
  const rows: Row[] = [];
  for (const line of lines) {
    const previous = rows.at(-1);
    const overlap = previous && line.box && previous.sources.every((s) => s.page === line.page && s.box
      && Math.min(s.box[3], line.box![3]) > Math.max(s.box[1], line.box![1]));
    if (overlap) previous.sources.push(line);
    else rows.push({ sources: [line], tokens: [] });
  }
  for (const row of rows) {
    const sources = [...row.sources].sort((a, b) => a.box && b.box ? a.box[0] - b.box[0] : a.index - b.index);
    row.tokens = sources.flatMap((line) => {
      const pieces = tokens(normalize(line.text));
      let cursor = 0;
      return pieces.map((text, i) => {
        const start = normalize(line.text).indexOf(text, cursor); cursor = start + text.length;
        return { text, sources: [line], evidence: [evidenceSlice(line, start, cursor)],
          ...(line.box ? { x: line.box[0] + (i + 0.5) / pieces.length * (line.box[2] - line.box[0]) } : {}) };
      });
    });
  }
  return rows;
}
interface Cell { value?: number | null; via?: string; selected: boolean; blank: boolean; sources: WorkLine[]; evidence?: WorkLine[] }
function cell(token: Token, vocab: WorkVocabulary): Cell {
  let text = token.text.trim();
  const selected = /[*✓]/u.test(text);
  text = text.replace(/[*✓]/gu, '').trim();
  if (selected && !text) return { selected, blank: false, sources: token.sources, ...(token.evidence ? { evidence: token.evidence } : {}) };
  if (text === '-' || text === '') return { selected, blank: true, sources: token.sources, ...(token.evidence ? { evidence: token.evidence } : {}) };
  // Brackets and their separators are notation, not evidence about correctness.
  text = text.replace(/^[([]|[)\]]$/gu, '');
  const match = text.match(/^(∞|[+\-]?\d+(?:[.,]\d+)?)(?:\s*[,;/]\s*|\s*\(\s*|\s*)([\p{L}_][\p{L}\p{N}_]*)?\)?$/u);
  if (!match) throw new Error('table');
  const value = match[1] === '∞' ? null : Number(match[1]!.replace(',', '.'));
  if (value !== null && !Number.isFinite(value)) throw new Error('table');
  return { selected, blank: false, value, ...(match[2] ? { via: oneLabel(match[2], vocab.vertexLabels) } : {}), sources: token.sources,
    ...(token.evidence ? { evidence: token.evidence } : {}) };
}
/** Validate one OCR row/cell using notation and vocabulary alone, without settlement state. */
export function validTableReading(line: WorkLine, vocab: WorkVocabulary): boolean {
  const pieces = tokens(normalize(line.text));
  if (!pieces.length) return false;
  try {
    const names = [...pieces];
    while (names.length && /^(?:buoc|chon|dinh|duoc)$/u.test(headerText(names[0]!))) names.shift();
    if (names.length && names.every((s) => vocab.vertexLabels.some((v) => labelKey(s) === labelKey(v)))) return true;
    if (pieces.length > vocab.vertexLabels.length) {
      const first = pieces.shift()!;
      if (!/^\d+$/u.test(first)) oneLabel(first, vocab.vertexLabels);
    }
    if (pieces.length !== 1 && pieces.length !== vocab.vertexLabels.length) return false;
    for (const text of pieces) cell({ text, sources: [line] }, vocab);
    return true;
  } catch { return false; }
}
/** Header and writing marks only; never select the minimum numeric label. */
export function parseTable(lines: WorkLine[], vocab: WorkVocabulary): TableClaim[] | undefined {
  try {
    const rows = rowsOf(lines);
    const header = rows.shift();
    if (!header) return undefined;
    // Merge the optional multi-word first heading before resolving columns.
    const names = header.tokens.map((t) => t.text);
    while (names.length && /^(?:buoc|chon|dinh|duoc)$/u.test(headerText(names[0]!))) names.shift();
    const columns = names.filter(Boolean).map((s) => oneLabel(s, vocab.vertexLabels));
    if (columns.length < 2 || new Set(columns).size !== columns.length || columns.length !== vocab.vertexLabels.length) return undefined;
    const headerColumns = header.tokens.slice(-columns.length);
    const data = rows.map((row) => {
      // A repeated header across pages is harmless.
      if (row.tokens.map((t) => labelKey(t.text)).join(' ') === header.tokens.map((t) => labelKey(t.text)).join(' ')) return undefined;
      let entries = row.tokens;
      let explicit: string | undefined;
      let selectSources = row.sources;
      let selectEvidence = row.sources;
      if (entries.length === columns.length + 1 || entries[0]?.x !== undefined && headerColumns[0]?.x !== undefined && entries[0].x < Math.min(...headerColumns.map((h) => h.x!)) - 30) {
        const first = entries[0]!;
        if (/^\d+$/u.test(first.text)) entries = entries.slice(1); // written row number
        else { explicit = oneLabel(first.text, vocab.vertexLabels); selectSources = first.sources; selectEvidence = first.evidence ?? first.sources; entries = entries.slice(1); }
      }
      if (entries.length !== columns.length && entries.every((t) => t.x !== undefined) && headerColumns.every((t) => t.x !== undefined)) {
        // Empty boxed columns have no OCR line. Use header x positions to retain them.
        const assigned: (Token | undefined)[] = columns.map(() => undefined);
        for (const token of entries) {
          const distances = headerColumns.map((h) => Math.abs(h.x! - token.x!));
          const c = distances.indexOf(Math.min(...distances));
          if (assigned[c]) throw new Error('table');
          assigned[c] = token;
        }
        entries = assigned.map((t) => t ?? { text: '', sources: row.sources });
      }
      if (entries.length !== columns.length) throw new Error('table');
      const cells = entries.map((t) => cell(t, vocab));
      const marked = cells.flatMap((c, i) => c.selected ? [columns[i]!] : []);
      if (marked.length > 1 || explicit && marked.length && marked[0] !== explicit) throw new Error('table');
      if (!explicit && marked.length) {
        explicit = marked[0]; const c = columns.indexOf(explicit!);
        selectSources = cells[c]!.sources;
        selectEvidence = [...(cells[c]!.evidence ?? cells[c]!.sources), ...(headerColumns[c]!.evidence ?? headerColumns[c]!.sources)];
      }
      return { row, cells, explicit, selectSources, selectEvidence };
    }).filter((row) => row !== undefined);
    const result: TableClaim[] = [];
    const settled = new Set<string>();
    for (let i = 0; i < data.length; i++) {
      const row = data[i]!;
      let selected = row.explicit;
      const inferred = !selected;
      if (!selected) {
        const next = data[i + 1];
        const changed = columns.filter((v, c) => !settled.has(v) && !row.cells[c]!.blank && next?.cells[c]!.blank);
        if (changed.length !== 1) throw new Error('table');
        selected = changed[0]!;
      }
      if (settled.has(selected)) throw new Error('table');
      // '-' is evidence of settlement, never a missing or infinite distance.
      if (row.cells.some((c, j) => c.blank && !settled.has(columns[j]!) && columns[j] !== selected)) throw new Error('table');
      result.push({ body: { type: 'dijkstra_select', v: selected }, sources: row.selectSources, inferred, evidence: row.selectEvidence });
      settled.add(selected);
      row.cells.forEach((c, j) => {
        const v = columns[j]!;
        if (!settled.has(v) && typeof c.value === 'number') result.push({ body: { type: 'dijkstra_label', v, value: c.value, ...(c.via ? { via: c.via } : {}) }, sources: c.sources, inferred: false,
          evidence: [...(c.evidence ?? c.sources), ...(headerColumns[j]!.evidence ?? headerColumns[j]!.sources)] });
      });
    }
    return result.length ? result : undefined;
  } catch (error) {
    if (error instanceof LabelError || error instanceof Error && error.message === 'table') return undefined;
    throw error;
  }
}
