import { describe, expect, it } from 'vitest';
import type { Graph, ProblemSpec } from '@mathtwin/core';
import { compareGraphMetrics, compareRead } from '../src/index.js';

const graph: Graph = { directed: false, vertices: [{ id: 'a', label: 'v₁' }, { id: 'b', label: 'Đ' }], edges: [
  { id: 'a', u: 'a', v: 'b', w: 12, name: 'a' }, { id: 'b', u: 'b', v: 'a', w: 7, name: 'b' }, { id: 'l', u: 'a', v: 'a' },
] };
describe('graph-only metrics', () => {
  it('normalizes labels, ignores ids/order/orientation, and preserves parallel multiplicity', () => {
    const predicted: Graph = { directed: false, vertices: [{ id: 'x', label: ' V1 ' }, { id: 'y', label: 'đ' }], edges: [
      { id: '1', u: 'y', v: 'x', w: 7, name: 'b' }, { id: '2', u: 'x', v: 'x' }, { id: '3', u: 'x', v: 'y', w: 12, name: 'a' },
    ] };
    expect(compareGraphMetrics(predicted, graph)).toMatchObject({ vertices: { precision: 1, recall: 1 }, edges: { matched: 3, f1: 1 },
      weights: { correct: 3, total: 3, accuracy: 1 }, loops: { applicable: true, correct: true }, parallelEdges: { applicable: true, correct: true } });
  });
  it('counts missing/extra duplicates and weights independently, never matching a different endpoint pair', () => {
    const predicted = structuredClone(graph);
    predicted.edges[0]!.w = 0;
    predicted.edges.pop();
    predicted.edges.push({ id: 'extra', u: 'b', v: 'b', w: 7 }, { id: 'duplicate', u: 'a', v: 'b', w: 7 });
    expect(compareGraphMetrics(predicted, graph)).toMatchObject({ edges: { matched: 2, predicted: 4, reference: 3, precision: 0.5, recall: 2 / 3, f1: 4 / 7 },
      weights: { correct: 1, total: 2, accuracy: 0.5 }, loops: { correct: false }, parallelEdges: { correct: false } });
  });
  it('treats zero as an incorrect weight when truth has no weight; weights do not affect structural F1', () => {
    const predicted = structuredClone(graph); predicted.edges[2]!.w = 0;
    const truth: ProblemSpec = { graph, task: { type: 'elements' }, questionFormat: 'tu_luan' };
    const read = { spec: null, graph: predicted, graphUncertain: [], drafts: [], usage: { engine: 'fixture', passes: 1, latencyMs: 0 },
      issues: [{ code: 'missing_question' as const, severity: 'blocking' as const, message: 'Thiếu đề.' }] };
    const result = compareRead(read, truth);
    expect(result).toMatchObject({ graphCorrect: false, graphSilentError: true, graphMetrics: { edges: { f1: 1 }, weights: { correct: 2, total: 3 } } });
    expect(compareRead({ ...read, issues: [...read.issues, { code: 'nonpositive_weight', severity: 'blocking', item: 'l.w', message: 'Trọng số không dương.' }] }, truth).graphSilentError).toBe(false);
  });
  it('handles absent graphs and empty denominators explicitly', () => {
    expect(compareGraphMetrics(null, graph)).toMatchObject({ vertices: { precision: null, recall: 0 }, edges: { f1: 0 }, weights: { accuracy: null }, loops: { correct: false } });
    const empty: Graph = { directed: false, vertices: [], edges: [] };
    expect(compareGraphMetrics(empty, empty)).toMatchObject({ vertices: { precision: null, recall: null }, edges: { f1: null }, loops: { applicable: false } });
  });
  it('penalizes hallucinated loops and parallel edges even if truth has none', () => {
    const truth: Graph = { ...graph, edges: [graph.edges[0]!] };
    expect(compareGraphMetrics(graph, truth)).toMatchObject({ loops: { applicable: true, correct: false }, parallelEdges: { applicable: true, correct: false } });
  });
});
