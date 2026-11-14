import type { Edge, Graph, ProblemSpec } from '@mathtwin/core';
import { assignEdges, canonicalTask, labelMapper } from './comparison-model.js';
import { flag as mergeFlag, normalizeLabel, same } from './model.js';
import type { ReadComparison, ReadDifference, ReadErrorType, ReadOutcome, ReadUncertainty } from './types.js';

function isGraphDifference(diff: ReadDifference): boolean {
  return diff.type !== 'task' && diff.type !== 'question_format';
}

function graphDifferences(predicted: Graph | null, truth: Graph): ReadDifference[] {
  if (predicted === null) return [{ item: 'graph', type: 'graph', predicted: null, expected: truth }];
  const result: ReadDifference[] = [];
  const add = (item: string, type: ReadErrorType, actual: unknown, expected: unknown, tags: ReadErrorType[] = []): void => {
    if (!same(actual, expected)) result.push({ item, type, predicted: actual, expected, tags });
  };
  const leftLabel = labelMapper(predicted); const rightLabel = labelMapper(truth);
  const leftVertices = new Map(predicted.vertices.map((v) => [normalizeLabel(v.label), v]));
  const rightVertices = new Set(truth.vertices.map((v) => normalizeLabel(v.label)));
  const missingLabels = [...rightVertices].filter((label) => !leftVertices.has(label));
  for (const [label, vertex] of leftVertices) if (!rightVertices.has(label)) {
    const expected = missingLabels.shift() ?? false;
    add(vertex.id, 'vertex_label', label, expected);
  }
  for (const label of missingLabels) add('graph', 'vertex_label', null, label);
  add('graph', 'graph', predicted.directed, truth.directed);
  const edges = (graph: Graph, map: (id: string) => string): Edge[] => graph.edges.map((e) => ({ ...e, u: map(e.u), v: map(e.v) }));
  const left = edges(predicted, leftLabel); const right = edges(truth, rightLabel);
  const pairs = assignEdges(left, right); const used = new Set(pairs.values());
  const tags = (edge: Edge, collection: Edge[]): ReadErrorType[] => [
    ...(edge.u === edge.v ? ['loop' as const] : []),
    ...(collection.some((other) => other !== edge
      && ((other.u === edge.u && other.v === edge.v) || (other.u === edge.v && other.v === edge.u))) ? ['parallel_edge' as const] : []),
  ];
  left.forEach((a, i) => {
    const j = pairs.get(i); const t = tags(a, left);
    if (j === undefined) { add(a.id, 'extra_edge', true, false, t); return; }
    let b = right[j]!;
    if (Number(a.u !== b.v) + Number(a.v !== b.u) < Number(a.u !== b.u) + Number(a.v !== b.v)) b = { ...b, u: b.v, v: b.u };
    add(`${a.id}.u`, 'vertex_label', a.u, b.u, t);
    add(`${a.id}.v`, 'vertex_label', a.v, b.v, t);
    add(`${a.id}.w`, 'weight', a.w ?? null, b.w ?? null, t);
    // Edge names have no field-level uncertainty code; a graph flag supplies coarse coverage.
    add(`${a.id}.name`, 'edge_name', a.name ?? null, b.name ?? null, t);
  });
  right.forEach((b, j) => { if (!used.has(j)) add('graph', 'missing_edge', null, b, tags(b, right)); });
  return result;
}

/** Compare semantic labels and undirected edge multisets, never reader-generated ids. */
export function compareRead(predicted: ReadOutcome, truth: ProblemSpec): ReadComparison {
  const graph = predicted.spec?.graph ?? predicted.graph;
  const differences = graphDifferences(graph, truth.graph);
  const graphCorrect = differences.length === 0;
  if (predicted.spec === null) {
    differences.push({ item: 'spec', type: 'task', predicted: null, expected: truth.task });
  } else {
    const left = canonicalTask(predicted.spec.task, predicted.spec.graph) as unknown as Record<string, unknown>;
    const right = canonicalTask(truth.task, truth.graph) as unknown as Record<string, unknown>;
    for (const key of new Set([...Object.keys(left), ...Object.keys(right)])) if (!same(left[key], right[key])) {
      differences.push({ item: `task.${key}`, type: 'task', predicted: left[key] ?? null, expected: right[key] ?? null });
    }
    if (predicted.spec.questionFormat !== truth.questionFormat) differences.push({
      item: 'questionFormat', type: 'question_format', predicted: predicted.spec.questionFormat, expected: truth.questionFormat,
    });
  }
  const holder = { uncertain: [] as ReadUncertainty[] };
  for (const entry of [...(predicted.spec?.uncertain ?? []), ...predicted.graphUncertain]) mergeFlag(holder, entry.item, entry.candidates);
  const flags = holder.uncertain;
  const affects = (flag: ReadUncertainty, diff: ReadDifference): boolean => {
    if (flag.item === diff.item || (flag.item === 'graph' && isGraphDifference(diff))) return true;
    const edge = graph?.edges.find((e) => diff.item === `${e.id}.u` || diff.item === `${e.id}.v`);
    return edge !== undefined && flag.item === edge[diff.item.endsWith('.u') ? 'u' : 'v'];
  };
  const preciselyCovers = (flag: ReadUncertainty, diff: ReadDifference): boolean => {
    if (flag.item === 'graph' || !affects(flag, diff)) return false;
    return flag.candidates.some((candidate) => {
      if ((diff.item.endsWith('.u') || diff.item.endsWith('.v')) && typeof candidate === 'string' && graph) {
        return labelMapper(graph)(candidate) === diff.expected;
      }
      if (diff.type === 'vertex_label' && typeof candidate === 'string') return normalizeLabel(candidate) === diff.expected;
      if (diff.item.startsWith('task.') && predicted.spec) {
        const field = diff.item.slice(5);
        try {
          const task = { ...predicted.spec.task, [field]: candidate } as ProblemSpec['task'];
          return same((canonicalTask(task, predicted.spec.graph) as unknown as Record<string, unknown>)[field], diff.expected);
        } catch { return false; }
      }
      return same(candidate, diff.expected);
    });
  };
  const coarselyCovers = (diff: ReadDifference): boolean => {
    const graphDifference = isGraphDifference(diff);
    if (graphDifference && flags.some((flag) => flag.item === 'graph')) return true;
    return predicted.issues.some((issue) => {
      if (issue.severity !== 'blocking') return false;
      // Question blockers prompt a review of the question, never the retained graph.
      if (['missing_question', 'unmapped_option', 'unsupported_task'].includes(issue.code)) return !graphDifference;
      return issue.item === diff.item || (issue.item === 'graph' && graphDifference);
    });
  };
  const coverage: ReadComparison['coverage'] = { precise: 0, coarse: 0, none: 0 };
  let graphSilentError = false;
  for (const diff of differences) {
    const level = flags.some((flag) => preciselyCovers(flag, diff)) ? 'precise' : coarselyCovers(diff) ? 'coarse' : 'none';
    coverage[level]++;
    if (level === 'none' && isGraphDifference(diff)) graphSilentError = true;
  }
  const completeCorrect = predicted.spec !== null && differences.length === 0;
  const fullyFlagged = coverage.none === 0;
  const errorCounts: Partial<Record<ReadErrorType, number>> = {};
  for (const diff of differences) for (const type of new Set([diff.type, ...(diff.tags ?? [])])) errorCounts[type] = (errorCounts[type] ?? 0) + 1;
  return { completeCorrect, graphCorrect, fullyFlagged, silentError: !fullyFlagged, graphSilentError, coverage,
    extraFlags: flags.filter((flag) => !differences.some((diff) => affects(flag, diff))).length, differences, errorCounts };
}
