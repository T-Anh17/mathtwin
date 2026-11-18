import type { ClaimBody, ProblemSpec } from '@mathtwin/core';
import type { WorkLine, WorkTruth } from '@mathtwin/work';
import { grade } from '@mathtwin/core';
export interface TableFamily {
  id: string; split: 'dev' | 'test'; heading: string; row: 'vertex' | 'number' | 'mark';
  cell: (value: number, via?: string) => string;
}
export interface WrittenRow { selected: string; labels: Record<string, number | null>; via: Record<string, string | undefined> }
/** Fixture renderer owns its claims, independent of the parser under evaluation. */
export function renderTable(spec: ProblemSpec, rows: WrittenRow[], family: TableFamily): { lines: WorkLine[]; work: WorkTruth } {
  const lines: WorkLine[] = []; const claims: WorkTruth['claims'] = []; const lineOf: WorkTruth['lineOf'] = {};
  const label = (id: string): string => spec.graph.vertices.find((v) => v.id === id)!.label;
  const add = (text: string): number => { const index = lines.length; lines.push({ text, page: 0, index, conf: 1, alternatives: [], region: 'table' }); return index; };
  add([family.heading, ...spec.graph.vertices.map((v) => v.label)].filter(Boolean).join(' | '));
  const settled = new Set<string>();
  for (const [i, row] of rows.entries()) {
    const cells = spec.graph.vertices.map((v) => {
      if (settled.has(v.id)) return '-';
      const value = row.labels[v.id]!;
      return (value === null ? '∞' : family.cell(value, row.via[v.id] === undefined ? undefined : label(row.via[v.id]!)))
        + (family.row !== 'vertex' && v.id === row.selected ? (i % 2 ? '✓' : '*') : '');
    });
    const first = family.row === 'vertex' ? label(row.selected) : family.row === 'number' ? String(i + 1) : '';
    const index = add([...(first ? [first] : []), ...cells].join(' | '));
    const bodies: ClaimBody[] = [{ type: 'dijkstra_select', v: row.selected }];
    settled.add(row.selected);
    for (const v of spec.graph.vertices) if (!settled.has(v.id) && typeof row.labels[v.id] === 'number') bodies.push({
      type: 'dijkstra_label', v: v.id, value: row.labels[v.id]!, ...(row.via[v.id] ? { via: row.via[v.id]! } : {}),
    });
    for (const body of bodies) {
      const step = claims.length + 1; claims.push({ ...body, step, raw: lines[index]!.text }); lineOf[String(step)] = [index];
    }
  }
  const result = grade(spec, claims);
  return { lines, work: { claims, lineOf, prose: [], expected: { verdict: result.verdict, firstErrorStep: result.firstErrorStep ?? null, errorCode: result.errorCode ?? null } } };
}
