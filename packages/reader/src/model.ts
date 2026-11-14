import type { Graph, ProblemSpec, StatementCheck, Task } from '@mathtwin/core';
import { validateSpec } from '@mathtwin/core';
import { readIssue } from './messages.vi.js';
import type { NormalizedRead, ReadIssue, ReadUncertainty } from './types.js';

export const CONFIDENCE_THRESHOLD = 0.85;
export function displayLabel(label: string): string {
  const subscripts = '₀₁₂₃₄₅₆₇₈₉';
  return label.normalize('NFC').trim().replace(/\s+/gu, ' ').replace(/[₀-₉]/gu, (c) => String(subscripts.indexOf(c)));
}
/** Internal matching key; ids and labels retain the first displayed spelling. */
export function normalizeLabel(label: string): string {
  return displayLabel(label).replace(/\s+/gu, '').toLowerCase();
}
export function referenceMapper(graph: Pick<Graph, 'vertices'>): (label: string) => string {
  const ids = new Map(graph.vertices.map(({ id }) => [normalizeLabel(id), id]));
  return (label) => ids.get(normalizeLabel(label)) ?? displayLabel(label);
}
export function vertexFlagItem(graph: Graph, id: string): string {
  return id === 'graph' || id === 'questionFormat' || id.startsWith('task.')
    || graph.edges.some((edge) => id === edge.id || id.startsWith(`${edge.id}.`)) ? 'graph' : id;
}

/** Only vertex references are normalized; edge names, option ids and prose are preserved. */
export function mapReferences<T extends Task | StatementCheck>(value: T, map: (label: string) => string): T {
  const result = { ...value } as Record<string, unknown>;
  for (const field of ['u', 'v', 'from', 'to', 'start', 'end', 'source', 'via']) {
    if (typeof result[field] === 'string') result[field] = map(result[field]);
  }
  if (Array.isArray(result.vertices)) result.vertices = result.vertices.map((v: string) => map(v));
  if (value.type === 'statements') result.items = value.items.map((item) => ({ ...item, check: mapReferences(item.check, map) }));
  return result as T;
}

export function same(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((v, i) => same(v, b[i]));
  if (a !== null && b !== null && typeof a === 'object' && typeof b === 'object') {
    const left = Object.entries(a); const right = Object.entries(b);
    return left.length === right.length && left.every(([k, v]) => Object.hasOwn(b, k) && same(v, (b as Record<string, unknown>)[k]));
  }
  return false;
}
export function flag(spec: { uncertain?: ReadUncertainty[] }, item: string, candidates: unknown[]): void {
  const existing = spec.uncertain?.find((entry) => entry.item === item);
  // JSON uses null to represent an absent optional task field or edge weight.
  const values = [...(existing?.candidates ?? []), ...candidates].map((v) => v === undefined ? null : v);
  const unique = values.filter((v, i) => values.findIndex((other) => same(v, other)) === i);
  if (existing) existing.candidates = unique;
  else (spec.uncertain ??= []).push({ item, candidates: unique });
}
export function finish(spec: ProblemSpec | null, issues: ReadIssue[], graph: Graph | null, graphUncertain: ReadUncertainty[]): NormalizedRead {
  const unique = issues.filter((issue, i) => issues.findIndex((other) => same(issue, other)) === i);
  if (spec !== null && !unique.some((issue) => issue.severity === 'blocking') && !validateSpec(spec).ok) {
    unique.push(readIssue('invalid_spec', 'blocking'));
  }
  return { spec: unique.some((issue) => issue.severity === 'blocking') ? null : spec, graph, graphUncertain, issues: unique };
}
