import type { Edge, Graph } from '@mathtwin/core';
import { displayVertices, draftGraph, draftGraphFlags, finalizeGraphRead, normalizeDraft, questionSpec } from './normalize.js';
import { ReadDraftSchema } from './schema.js';
import type { QuestionDraft, ReadDraft, StatementCheckDraft } from './schema.js';
import { finish, flag, same, vertexFlagItem } from './model.js';
import { readIssue } from './messages.vi.js';
import type { NormalizedRead, ReadUncertainty } from './types.js';

function endpoints(a: Edge, b: Edge): boolean {
  return (a.u === b.u && a.v === b.v) || (a.u === b.v && a.v === b.u);
}
function swap(b: Edge, a: Edge): Edge {
  const direct = Number(a.u !== b.u) + Number(a.v !== b.v);
  const reversed = Number(a.u !== b.v) + Number(a.v !== b.u);
  return reversed < direct ? { ...b, u: b.v, v: b.u } : b;
}
function remapQuestion(question: QuestionDraft | null, ids: Map<string, string>): QuestionDraft | null {
  if (question === null) return null;
  const result = structuredClone(question);
  const check = (value: StatementCheckDraft | null): StatementCheckDraft | null =>
    value?.type === 'walk' && value.edgeIds !== undefined
      ? { ...value, edgeIds: value.edgeIds.map((id) => ids.get(id) ?? id) } : value;
  result.options = result.options.map((option) => ({ ...option, check: check(option.check) }));
  if (result.task.type === 'statements') {
    const task = result.task as { type: 'statements'; items: { id: string; text: string; check: StatementCheckDraft | null }[] };
    result.task = { ...task, items: task.items.map((item) => ({ ...item, check: check(item.check) })) };
  }
  return result;
}

/** Stable multiset matching operates on graphs, including incomplete weights and absent questions. */
export function reconcile(a: ReadDraft, b: ReadDraft): NormalizedRead {
  const parsedA = ReadDraftSchema.safeParse(a); const parsedB = ReadDraftSchema.safeParse(b);
  if (!parsedA.success || !parsedB.success) {
    const retained = parsedA.success ? normalizeDraft(parsedA.data) : parsedB.success ? normalizeDraft(parsedB.data) : null;
    return finish(null, [...(retained?.issues ?? []), readIssue('invalid_spec', 'blocking')], retained?.graph ?? null, retained?.graphUncertain ?? []);
  }
  const da = parsedA.data; const db = parsedB.data;
  const vertices = displayVertices([da, db]);
  const left = draftGraph(da, vertices); const right = draftGraph(db, vertices);
  const graph: Graph = { directed: false, vertices, edges: [] };
  const holder = { uncertain: [] as ReadUncertainty[] };
  const leftFlags = draftGraphFlags(da, left); const rightFlags = draftGraphFlags(db, right);
  const available = new Set(right.edges.map((_, i) => i));
  const pairs = new Map<number, number>();
  const match = (predicate: (a: Edge, b: Edge) => boolean, unique: boolean): void => {
    left.edges.forEach((edge, i) => {
      if (pairs.has(i)) return;
      const matches = [...available].filter((j) => predicate(edge, right.edges[j]!));
      if (matches.length === 0 || (unique && (matches.length !== 1 || left.edges.some((e, k) => k !== i && !pairs.has(k) && predicate(e, right.edges[matches[0]!]!))))) return;
      const j = matches[0]!;
      pairs.set(i, j); available.delete(j);
    });
  };
  match((x, y) => endpoints(x, y) && x.w === y.w && x.name === y.name, false);
  match((x, y) => endpoints(x, y) && x.name === y.name, false);
  match((x, y) => x.name !== undefined && x.name === y.name, true);
  match((x, y) => endpoints(x, y), true);
  match((x, y) => x.name === y.name && x.w === y.w && (x.u === y.u || x.u === y.v || x.v === y.u || x.v === y.v), true);
  const ids = new Map<string, string>();
  for (const [i, j] of pairs) ids.set(right.edges[j]!.id, left.edges[i]!.id);
  [...available].forEach((j, index) => ids.set(right.edges[j]!.id, `e${left.edges.length + index + 1}`));

  const transferEdgeFlags = (flags: ReadUncertainty[], id: string, target: Edge): void => {
    for (const entry of flags) {
      if (entry.item !== id && !entry.item.startsWith(`${id}.`)) continue;
      const suffix = entry.item.slice(id.length);
      const used = suffix === '' ? true : target[suffix.slice(1) as 'w' | 'u' | 'v'];
      flag(holder, `${target.id}${suffix}`, [used, ...entry.candidates]);
    }
  };
  graph.edges = left.edges.map((edge, i) => {
    const j = pairs.get(i);
    if (j === undefined) {
      flag(holder, edge.id, [true, false]); transferEdgeFlags(leftFlags, edge.id, edge);
      return edge;
    }
    const second = swap(right.edges[j]!, edge);
    const chosen = { ...(db.edges[j]!.conf > da.edges[i]!.conf ? second : edge), id: edge.id };
    // A known reading wins over a missing reading, regardless of confidence; retain null as an alternative.
    if (chosen.w === undefined && (edge.w !== undefined || second.w !== undefined)) chosen.w = edge.w ?? second.w!;
    for (const field of ['w', 'u', 'v'] as const) {
      if (edge[field] !== second[field]) flag(holder, `${edge.id}.${field}`, [chosen[field] ?? null,
        (chosen[field] === edge[field] ? second[field] : edge[field]) ?? null]);
    }
    if (edge.name !== second.name) flag(holder, 'graph', [graph, left, right]);
    transferEdgeFlags(leftFlags, edge.id, chosen);
    transferEdgeFlags(rightFlags, right.edges[j]!.id, chosen);
    return chosen;
  });
  for (const j of available) {
    const edge = { ...right.edges[j]!, id: ids.get(right.edges[j]!.id)! };
    graph.edges.push(edge); flag(holder, edge.id, [true, false]); transferEdgeFlags(rightFlags, right.edges[j]!.id, edge);
  }
  const leftVertices = new Set(left.vertices.map((v) => v.id));
  const rightVertices = new Set(right.vertices.map((v) => v.id));
  for (const vertex of vertices) if (!leftVertices.has(vertex.id) || !rightVertices.has(vertex.id)) {
    const item = vertexFlagItem(graph, vertex.id);
    flag(holder, item, item === 'graph' ? [graph] : [vertex.id, false]);
  }
  for (const [source, flags] of [[left, leftFlags], [right, rightFlags]] as const) {
    for (const entry of flags) {
      if (source.edges.some((edge) => entry.item === edge.id || entry.item.startsWith(`${edge.id}.`))) continue;
      const item = entry.item === 'graph' ? 'graph' : vertexFlagItem(graph, entry.item);
      flag(holder, item, [item === 'graph' ? graph : item, ...entry.candidates]);
    }
  }

  const qa = da.question; const qb = remapQuestion(db.question, ids);
  const preferSecond = qb !== null && (qa === null || qb.conf > qa.conf);
  const selected = preferSecond ? qb : qa;
  const result = finalizeGraphRead(graph, holder.uncertain, [da, db], selected);
  // Compare question interpretations after mapping both onto the merged graph and first-pass edge ids.
  if (result.spec !== null && qa !== null && qb !== null) {
    const first = questionSpec(graph, qa).spec; const second = questionSpec(graph, qb).spec;
    if (first !== null && second !== null) {
      for (const key of new Set([...Object.keys(first.task), ...Object.keys(second.task)])) {
        const l = (first.task as unknown as Record<string, unknown>)[key];
        const r = (second.task as unknown as Record<string, unknown>)[key];
        if (!same(l, r)) flag(result.spec, `task.${key}`, [preferSecond ? r : l, preferSecond ? l : r]);
      }
      for (const source of [first, second]) for (const entry of source.uncertain ?? []) {
        const used = entry.item === 'questionFormat' ? result.spec.questionFormat
          : (result.spec.task as unknown as Record<string, unknown>)[entry.item.slice(5)];
        flag(result.spec, entry.item, [used, ...entry.candidates]);
      }
    } else flag(result.spec, 'task.type', [result.spec.task.type, qa.task.type, qb.task.type]);
    if (qa.format !== qb.format) flag(result.spec, 'questionFormat', [result.spec.questionFormat, preferSecond ? qa.format : qb.format]);
  }
  return result;
}
