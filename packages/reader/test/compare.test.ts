import { describe, expect, it } from 'vitest';
import type { Graph, ProblemSpec } from '@mathtwin/core';
import { compareRead, completeWithQuestion, normalizeDraft } from '../src/index.js';
import type { ReadOutcome } from '../src/index.js';
import { draft } from './fixtures.js';

function fixture(): { predicted: ReadOutcome; truth: ProblemSpec } {
  const d = draft(); const normalized = normalizeDraft(d);
  const predicted: ReadOutcome = { ...normalized, drafts: [d], usage: { engine: 'fake', passes: 1, latencyMs: 0 } };
  const truth = structuredClone(predicted.spec!); delete truth.uncertain;
  return { predicted, truth };
}
describe('compareRead', () => {
  it('is pure, ignores edge ids/order, endpoint orientation and normalized vertex spelling', () => {
    const { predicted, truth } = fixture();
    predicted.spec!.graph.edges.reverse();
    predicted.spec!.graph.edges.forEach((e, i) => { [e.u, e.v] = [e.v, e.u]; e.id = `other${i}`; });
    truth.graph.vertices.forEach((v) => { v.label = ` ${v.label.toLowerCase()} `; });
    const before = structuredClone({ predicted, truth });
    expect(compareRead(predicted, truth)).toMatchObject({ completeCorrect: true, graphCorrect: true, fullyFlagged: true, silentError: false,
      graphSilentError: false, coverage: { precise: 0, coarse: 0, none: 0 }, extraFlags: 0 });
    expect({ predicted, truth }).toEqual(before);
  });
  it.each([true, false])('requires candidates to contain the correct weight (contains: %s)', (contains) => {
    const { predicted, truth } = fixture();
    predicted.spec!.graph.edges[3]!.w = 9;
    predicted.spec!.uncertain = [{ item: 'e4.w', candidates: contains ? [9, 7] : [9, 1] }];
    expect(compareRead(predicted, truth)).toMatchObject({ completeCorrect: false, graphCorrect: false, fullyFlagged: contains, silentError: !contains, extraFlags: 0, errorCounts: { weight: 1 } });
  });
  it('requires coverage for every mismatch, and ignores unrelated flags', () => {
    const { predicted, truth } = fixture();
    predicted.spec!.graph.edges[0]!.w = 9; predicted.spec!.graph.edges[1]!.w = 9;
    predicted.spec!.uncertain = [{ item: 'e1.w', candidates: [9, 2] }, { item: 'e3', candidates: [true, false] }];
    expect(compareRead(predicted, truth)).toMatchObject({ silentError: true, fullyFlagged: false, extraFlags: 1 });
  });
  it('counts flags on correct elements, including when the whole result is correct', () => {
    const { predicted, truth } = fixture();
    predicted.spec!.uncertain = [{ item: 'e1.w', candidates: [2, 7] }, { item: 'graph', candidates: [predicted.graph] }];
    expect(compareRead(predicted, truth)).toMatchObject({ completeCorrect: true, extraFlags: 2 });
  });
  it('counts a retained flag and its spec copy only once, merging alternative candidates', () => {
    const { predicted, truth } = fixture();
    predicted.spec!.uncertain = [{ item: 'e1.w', candidates: [2, 7] }];
    predicted.graphUncertain = [{ item: 'e1.w', candidates: [2, 1] }];
    expect(compareRead(predicted, truth).extraFlags).toBe(1);
  });
  it('covers a missing question coarsely and a flagged graph error precisely', () => {
    const { predicted, truth } = fixture();
    predicted.spec = null; predicted.issues = [{ code: 'missing_question', severity: 'blocking', message: '' }];
    expect(compareRead(predicted, truth)).toMatchObject({ completeCorrect: false, graphCorrect: true, fullyFlagged: true, silentError: false,
      graphSilentError: false, coverage: { precise: 0, coarse: 1, none: 0 } });
    predicted.graph!.edges[0]!.w = 100;
    predicted.graphUncertain = [{ item: 'e1.w', candidates: [100, 2] }];
    expect(compareRead(predicted, truth)).toMatchObject({ graphCorrect: false, fullyFlagged: true, extraFlags: 0, errorCounts: { weight: 1 },
      graphSilentError: false, coverage: { precise: 1, coarse: 1, none: 0 } });
  });
  it('can complete a missing question without changing graph comparison', () => {
    const { truth } = fixture(); const d = draft(); d.question = null;
    const predicted = { ...normalizeDraft(d), drafts: [d], usage: { engine: 'fake', passes: 1, latencyMs: 0 } };
    expect(compareRead(predicted, truth).graphCorrect).toBe(true);
    expect(compareRead(completeWithQuestion(predicted, draft().question!), truth).completeCorrect).toBe(true);
  });
  it('does not count a failed read as a correct graph, or a warning as a blocker', () => {
    const { predicted, truth } = fixture(); predicted.spec = null; predicted.graph = null;
    predicted.issues = [{ code: 'read_failed', severity: 'warning', message: '' }];
    expect(compareRead(predicted, truth)).toMatchObject({ graphCorrect: false, silentError: true });
    predicted.issues[0]!.severity = 'blocking';
    expect(compareRead(predicted, truth)).toMatchObject({ fullyFlagged: false, graphSilentError: true });
    predicted.issues[0]!.item = 'graph';
    expect(compareRead(predicted, truth)).toMatchObject({ fullyFlagged: false, graphSilentError: false,
      coverage: { precise: 0, coarse: 1, none: 1 } });
  });
  it('matches a multiset of loops and parallel edges optimally despite shuffled weights', () => {
    const { predicted, truth } = fixture();
    const graph: Graph = { directed: false, vertices: [{ id: 'a', label: 'v₁' }], edges: [
      { id: 'l1', u: 'a', v: 'a', w: 3 }, { id: 'l2', u: 'a', v: 'a', w: 7 },
    ] };
    truth.graph = structuredClone(graph); truth.task = { type: 'elements' };
    predicted.spec!.task = { type: 'elements' }; predicted.spec!.graph = structuredClone(graph);
    predicted.spec!.graph.edges = [graph.edges[1]!, graph.edges[0]!].map((e) => ({ ...e }));
    expect(compareRead(predicted, truth).completeCorrect).toBe(true);
    predicted.spec!.graph.edges[1]!.w = 9;
    predicted.spec!.uncertain = [{ item: 'l1.w', candidates: [9, 3] }];
    expect(compareRead(predicted, truth)).toMatchObject({ fullyFlagged: true, errorCounts: { weight: 1, loop: 1, parallel_edge: 1 } });
  });
  it('reports missing and extra edges without conflating them; graph flags cover missing edges coarsely', () => {
    const { predicted, truth } = fixture(); predicted.spec!.graph.edges.pop();
    predicted.spec!.uncertain = [{ item: 'graph', candidates: [predicted.spec!.graph] }];
    expect(compareRead(predicted, truth)).toMatchObject({ silentError: false, errorCounts: { missing_edge: 1 }, coverage: { precise: 0, coarse: 1, none: 0 } });
    predicted.spec!.uncertain[0]!.candidates.push(truth.graph);
    expect(compareRead(predicted, truth)).toMatchObject({ fullyFlagged: true, coverage: { precise: 0, coarse: 1, none: 0 } });
    predicted.spec!.graph.edges.push({ id: 'new', u: 'D', v: 'D' });
    expect(compareRead(predicted, truth).errorCounts).toMatchObject({ missing_edge: 1, extra_edge: 1, loop: 1 });
  });
  it('requires a false existence candidate for an extra edge, rather than a weight flag', () => {
    const { predicted, truth } = fixture(); predicted.spec!.graph.edges.push({ id: 'new', u: 'D', v: 'D' });
    predicted.spec!.uncertain = [{ item: 'new', candidates: [true, false] }];
    expect(compareRead(predicted, truth).fullyFlagged).toBe(true);
    predicted.spec!.uncertain = [{ item: 'new.w', candidates: [null, 5] }];
    expect(compareRead(predicted, truth).silentError).toBe(true);
  });
  it('reports edge names without treating them as weight or existence errors', () => {
    const { predicted, truth } = fixture(); predicted.spec!.graph.edges[0]!.name = 'm';
    expect(compareRead(predicted, truth).errorCounts).toEqual({ edge_name: 1 });
    predicted.spec!.uncertain = [{ item: 'graph', candidates: [predicted.spec!.graph, truth.graph] }];
    expect(compareRead(predicted, truth).fullyFlagged).toBe(true);
  });
  it('compares task references by label, unordered degree sets and ignores statement wording', () => {
    const { predicted, truth } = fixture();
    truth.task = { type: 'degree', vertices: ['A', 'B'] };
    predicted.spec!.task = { type: 'degree', vertices: [' b ', 'a'] };
    expect(compareRead(predicted, truth).completeCorrect).toBe(true);
    truth.task = { type: 'statements', items: [{ id: 'a', text: 'Một câu', check: { type: 'degree', v: 'A', value: 2 } }] };
    predicted.spec!.task = { type: 'statements', items: [{ id: 'a', text: 'Cách diễn đạt khác', check: { type: 'degree', v: ' a ', value: 2 } }] };
    expect(compareRead(predicted, truth).completeCorrect).toBe(true);
  });
  it('requires correct task and question-format candidates without losing graph accuracy', () => {
    const { predicted, truth } = fixture(); predicted.spec!.task = { type: 'connectivity' };
    predicted.spec!.questionFormat = 'tra_loi_ngan';
    predicted.spec!.uncertain = [{ item: 'task.type', candidates: ['connectivity', 'shortest_path'] },
      { item: 'task.from', candidates: [null, 'a'] }, { item: 'task.to', candidates: [null, 'd'] },
      { item: 'questionFormat', candidates: ['tra_loi_ngan', 'tu_luan'] }];
    expect(compareRead(predicted, truth)).toMatchObject({ completeCorrect: false, graphCorrect: true, fullyFlagged: true });
  });
  it('does not lose Vietnamese accents when comparing labels', () => {
    const { predicted, truth } = fixture();
    truth.graph.vertices[0]!.label = 'Đỉnh'; predicted.spec!.graph.vertices[0]!.label = 'Dinh';
    expect(compareRead(predicted, truth).errorCounts.vertex_label).toBeGreaterThan(0);
  });
});

describe('review 1: coverage is scoped to each difference', () => {
  function offlineFixture(): { predicted: ReadOutcome; truth: ProblemSpec } {
    const d = draft(); d.edges[1]!.w = 9; d.question = null;
    const predicted: ReadOutcome = { ...normalizeDraft(d), drafts: [d], usage: { engine: 'fake', passes: 1, latencyMs: 0 } };
    const { truth } = fixture(); truth.graph.edges[1]!.w = 7;
    return { predicted, truth };
  }
  it('detects an unflagged 9/7 weight error despite missing_question blocking', () => {
    const { predicted, truth } = offlineFixture();
    expect(compareRead(predicted, truth)).toMatchObject({ graphCorrect: false, fullyFlagged: false, silentError: true, graphSilentError: true,
      coverage: { precise: 0, coarse: 1, none: 1 } });
  });
  it('uses precise weight coverage ahead of coarse graph coverage, counting each error once', () => {
    const { predicted, truth } = offlineFixture();
    predicted.graphUncertain = [{ item: 'e2.w', candidates: [9, 7] }, { item: 'graph', candidates: [predicted.graph] }];
    expect(compareRead(predicted, truth)).toMatchObject({ fullyFlagged: true, silentError: false, graphSilentError: false,
      coverage: { precise: 1, coarse: 1, none: 0 } });
  });
  it('does not accept a weight candidate that omits the true value', () => {
    const { predicted, truth } = offlineFixture();
    predicted.graphUncertain = [{ item: 'e2.w', candidates: [9, 1] }];
    expect(compareRead(predicted, truth)).toMatchObject({ fullyFlagged: false, graphSilentError: true,
      coverage: { precise: 0, coarse: 1, none: 1 } });
  });
  it('uses count_mismatch with a graph flag as coarse coverage even without a correct graph candidate', () => {
    const { predicted, truth } = offlineFixture();
    predicted.graphUncertain = [{ item: 'graph', candidates: [predicted.graph] }];
    predicted.issues.push({ code: 'count_mismatch', severity: 'warning', item: 'graph', message: '' });
    expect(compareRead(predicted, truth)).toMatchObject({ fullyFlagged: true, silentError: false, graphSilentError: false,
      coverage: { precise: 0, coarse: 2, none: 0 } });
  });
  it('uses missing_weight blocking on e2.w as coarse coverage for a missing weight of 7', () => {
    const { predicted, truth } = offlineFixture(); delete predicted.graph!.edges[1]!.w;
    predicted.graphUncertain = [{ item: 'e2.w', candidates: [null] }];
    predicted.issues.push({ code: 'missing_weight', severity: 'blocking', item: 'e2.w', message: '' });
    expect(compareRead(predicted, truth)).toMatchObject({ fullyFlagged: true, silentError: false, graphSilentError: false,
      coverage: { precise: 0, coarse: 2, none: 0 } });
  });
  it.each(['e1.w', undefined])('does not let an unrelated or unscoped blocking issue cover e2.w (item: %s)', (item) => {
    const { predicted, truth } = offlineFixture();
    predicted.issues.push({ code: 'missing_weight', severity: 'blocking', ...(item === undefined ? {} : { item }), message: '' });
    expect(compareRead(predicted, truth)).toMatchObject({ graphSilentError: true, coverage: { precise: 0, coarse: 1, none: 1 } });
  });
  it('does not count a warning with a matching item as blocking coverage', () => {
    const { predicted, truth } = offlineFixture();
    predicted.issues.push({ code: 'missing_weight', severity: 'warning', item: 'e2.w', message: '' });
    expect(compareRead(predicted, truth)).toMatchObject({ graphSilentError: true, coverage: { precise: 0, coarse: 1, none: 1 } });
  });
  it.each(['directed_graph', 'too_many_vertices'] as const)('uses %s blocking with item graph for graph errors only', (code) => {
    const { predicted, truth } = offlineFixture();
    predicted.issues = [{ code, severity: 'blocking', item: 'graph', message: '' }];
    expect(compareRead(predicted, truth)).toMatchObject({ fullyFlagged: false, silentError: true, graphSilentError: false,
      coverage: { precise: 0, coarse: 1, none: 1 } });
  });
  it.each(['missing_question', 'unmapped_option', 'unsupported_task'] as const)('%s covers question errors without covering graph errors', (code) => {
    const { predicted, truth } = fixture(); predicted.spec!.task = { type: 'connectivity' }; predicted.spec!.questionFormat = 'tra_loi_ngan';
    predicted.spec!.graph.edges[1]!.w = 9;
    // Even an erroneous graph item cannot turn a question blocker into graph coverage.
    predicted.issues = [{ code, severity: 'blocking', item: 'graph', message: '' }];
    expect(compareRead(predicted, truth)).toMatchObject({ fullyFlagged: false, silentError: true, graphSilentError: true,
      coverage: { precise: 0, coarse: 4, none: 1 } });
  });
  it('keeps graphSilentError false when only the question has an uncovered difference', () => {
    const { predicted, truth } = fixture(); predicted.spec!.questionFormat = 'tra_loi_ngan';
    expect(compareRead(predicted, truth)).toMatchObject({ fullyFlagged: false, silentError: true, graphSilentError: false,
      coverage: { precise: 0, coarse: 0, none: 1 } });
  });
});
