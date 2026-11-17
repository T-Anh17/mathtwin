import type { Graph } from '@mathtwin/core';
import { labelMapper } from './comparison-model.js';
import { normalizeLabel, same } from './model.js';

export interface MatchScore { matched: number; predicted: number; reference: number; precision: number | null; recall: number | null; f1: number | null }
export function matchScore(matched: number, predicted: number, reference: number): MatchScore {
  return { matched, predicted, reference, precision: predicted ? matched / predicted : null,
    recall: reference ? matched / reference : null, f1: predicted + reference ? 2 * matched / (predicted + reference) : null };
}
export interface GraphMetrics {
  vertices: MatchScore;
  edges: MatchScore;
  weights: { correct: number; total: number; accuracy: number | null };
  loops: { applicable: boolean; correct: boolean };
  parallelEdges: { applicable: boolean; correct: boolean };
}
function intersection(a: string[], b: string[]): number {
  const counts = new Map<string, number>();
  for (const key of b) counts.set(key, (counts.get(key) ?? 0) + 1);
  let result = 0;
  for (const key of a) if ((counts.get(key) ?? 0) > 0) { result++; counts.set(key, counts.get(key)! - 1); }
  return result;
}
/** Structural matches use only unordered normalized endpoint labels, preserving multiplicity.
 * Within each endpoint group match equal weights first; remaining edges count as wrong weights.
 * Absent weights are null and participate in accuracy (so spurious 0 is an error).
 */
export function compareGraphMetrics(predicted: Graph | null, truth: Graph): GraphMetrics {
  const groups = (graph: Graph | null) => {
    const map = new Map<string, Graph['edges']>();
    if (graph) {
      const label = labelMapper(graph);
      for (const edge of graph.edges) {
        const key = JSON.stringify([label(edge.u), label(edge.v)].sort());
        map.set(key, [...(map.get(key) ?? []), edge]);
      }
    }
    return map;
  };
  const left = groups(predicted); const right = groups(truth);
  let matched = 0; let correct = 0;
  for (const [key, edges] of left) {
    const expected = right.get(key) ?? [];
    matched += Math.min(edges.length, expected.length);
    correct += intersection(edges.map((e) => JSON.stringify(e.w ?? null)), expected.map((e) => JSON.stringify(e.w ?? null)));
  }
  const special = (kind: 'loop' | 'parallel') => {
    const keys = [...new Set([...left.keys(), ...right.keys()])].filter((key) => {
      const ends = JSON.parse(key) as string[];
      return kind === 'loop' ? ends[0] === ends[1] : Math.max(left.get(key)?.length ?? 0, right.get(key)?.length ?? 0) > 1;
    });
    const signature = (map: typeof left, key: string) => (map.get(key) ?? []).map((e) => JSON.stringify([e.w ?? null, e.name ?? null])).sort();
    return { applicable: keys.length > 0, correct: predicted !== null && keys.every((key) => same(signature(left, key), signature(right, key))) };
  };
  const a = predicted?.vertices.map((v) => normalizeLabel(v.label)) ?? []; const b = truth.vertices.map((v) => normalizeLabel(v.label));
  return { vertices: matchScore(intersection(a, b), a.length, b.length), edges: matchScore(matched, predicted?.edges.length ?? 0, truth.edges.length),
    weights: { correct, total: matched, accuracy: matched ? correct / matched : null }, loops: special('loop'), parallelEdges: special('parallel') };
}
