import { describe, expect, it } from 'vitest';
import { solve, validateSpec } from '@mathtwin/core';
import { applyConfirmation, completeWithQuestion, normalizeDraft, readProblem, reconcile } from '../src/index.js';
import type { QuestionDraft } from '../src/index.js';
import { draft, FakeVisionReader, image } from './fixtures.js';

describe('review 1: display spelling and matching keys', () => {
  it('preserves A/B/C ids, labels and solver text instead of lowercasing display names', () => {
    const d = draft(); d.question!.task = { type: 'shortest_path', from: ' a ', to: ' d ' };
    const spec = normalizeDraft(d).spec!;
    expect(spec.graph.vertices.map((v) => [v.id, v.label])).toEqual([['A', 'A'], ['B', 'B'], ['C', 'C'], ['D', 'D']]);
    expect(spec.task).toEqual({ type: 'shortest_path', from: 'A', to: 'D' });
    const text = solve(spec).steps.map((step) => step.text).join('\n');
    expect(text).toContain('Khoanh A'); expect(text).toContain('Tại B');
    expect(text).not.toContain('Khoanh a'); expect(text).not.toContain('Tại b');
  });
  it('merges v₁/V1/ v1 using the first displayed spelling and marks case collisions', () => {
    const d = draft(); d.vertices = ['v₁', 'V1', ' v1 '].map((label) => ({ label, conf: 0.96 }));
    d.edges = [{ ...d.edges[0]!, u: 'V1', v: ' v₁ ' }];
    d.question!.task = { type: 'path', from: 'V1', to: ' v1 ' };
    const result = normalizeDraft(d);
    expect(result.graph!.vertices).toEqual([{ id: 'v1', label: 'v1' }]);
    expect(result.graph!.edges[0]).toMatchObject({ u: 'v1', v: 'v1' });
    expect(result.spec!.task).toEqual({ type: 'path', from: 'v1', to: 'v1' });
    expect(result.issues).toContainEqual(expect.objectContaining({ code: 'count_mismatch', severity: 'warning' }));
    expect(result.graphUncertain).toContainEqual({ item: 'graph', candidates: [result.graph] });
  });
  it('marks A/a ambiguity even when the stated vertex count matches the merged count', () => {
    const d = draft(); d.vertices.push({ label: 'a', conf: 0.96 }); d.statedFacts.vertexCount = 4;
    const result = normalizeDraft(d);
    expect(result.graph!.vertices[0]).toEqual({ id: 'A', label: 'A' });
    expect(result.graph!.vertices).toHaveLength(4);
    expect(result.issues).toContainEqual(expect.objectContaining({ code: 'count_mismatch', severity: 'warning' }));
    expect(result.graphUncertain.find((u) => u.item === 'graph')!.candidates[0]).toEqual(result.graph);
  });
  it('uses first-pass spelling even when the neighbors question and edge have higher confidence', () => {
    const a = draft(); const b = draft();
    b.vertices.forEach((v) => { v.label = v.label.toLowerCase(); });
    b.edges.forEach((e) => { e.u = e.u.toLowerCase(); e.v = e.v.toLowerCase(); e.conf = 0.99; });
    b.question!.conf = 0.99; b.question!.task = { type: 'shortest_path', from: 'a', to: 'd' };
    const result = reconcile(a, b);
    expect(result.graph!.vertices.map((v) => v.id)).toEqual(['A', 'B', 'C', 'D']);
    expect(result.spec!.task).toEqual({ type: 'shortest_path', from: 'A', to: 'D' });
    expect(result.graph!.edges[0]).toMatchObject({ u: 'A', v: 'B' });
    expect(result.spec!.uncertain).toEqual([]);
  });
  it('maps every kind of task and statement vertex reference to the displayed id', () => {
    const d = draft();
    d.question!.task = { type: 'statements', items: [
      { id: 'a', text: '...', check: { type: 'dijkstra_label', source: 'a', v: ' b ', via: 'A', value: 2 } },
      { id: 'b', text: '...', check: { type: 'nn_step', start: 'a', from: 'a', to: 'b' } },
      { id: 'c', text: '...', check: { type: 'walk', kind: 'path', vertices: ['a', 'b'], edgeIds: ['e1'] } },
    ] };
    const result = normalizeDraft(d);
    expect(result.spec!.task).toMatchObject({ items: [
      { check: { source: 'A', v: 'B', via: 'A' } }, { check: { start: 'A', from: 'A', to: 'B' } },
      { check: { vertices: ['A', 'B'] } },
    ] });
    d.question!.task = { type: 'hamilton', want: 'path', start: 'a', end: 'd' };
    expect(normalizeDraft(d).spec!.task).toEqual({ type: 'hamilton', want: 'path', start: 'A', end: 'D' });
    d.question!.task = { type: 'degree', vertices: ['b', 'd'] };
    expect(normalizeDraft(d).spec!.task).toEqual({ type: 'degree', vertices: ['B', 'D'] });
  });
  it('keeps display spelling during weight, endpoint and task confirmation', () => {
    const spec = normalizeDraft(draft()).spec!;
    const result = applyConfirmation(spec, { 'e1.u': ' c ', 'e4.w': 5, 'task.from': 'a' });
    expect(result.graph.edges[0]!.u).toBe('C');
    expect(result.graph.vertices.map((v) => v.label)).toEqual(['A', 'B', 'C', 'D']);
    expect(result.task).toEqual({ type: 'shortest_path', from: 'A', to: 'D' });
    expect(validateSpec(result).ok).toBe(true);
  });
});

describe('review 2: retained graphs and manual questions', () => {
  it('returns the full graph and weight flags without a question, then completes a valid spec', async () => {
    const d = draft(); d.question = null; d.edges[3]!.wAlternatives = [1];
    const normalized = normalizeDraft(d);
    expect(normalized.spec).toBeNull(); expect(normalized.graph!.edges).toHaveLength(4);
    expect(normalized.graphUncertain).toEqual([{ item: 'e4.w', candidates: [7, 1] }]);
    const reader = new FakeVisionReader({ edges: d, neighbors: d });
    const outcome = await readProblem([image], { reader }); const original = structuredClone(outcome);
    const completed = completeWithQuestion(outcome, draft().question!);
    expect(completed.spec).not.toBeNull(); expect(validateSpec(completed.spec!).ok).toBe(true);
    expect(completed.graph).toEqual(outcome.graph); expect(completed.graphUncertain).toEqual(outcome.graphUncertain);
    expect(completed.spec!.uncertain).toEqual(outcome.graphUncertain);
    expect(completed.issues.some((i) => i.code === 'missing_question')).toBe(false);
    expect(completed.drafts).toEqual(outcome.drafts); expect(completed.usage).toEqual(outcome.usage);
    expect(outcome).toEqual(original); expect(reader.calls).toHaveLength(2);
  });
  it('reports all graph diagnostics and flags even when the question is null', () => {
    const d = draft(); d.question = null; d.directed = true;
    d.vertices.push(...Array.from({ length: 17 }, (_, i) => ({ label: `V${i}`, conf: 0.96 })));
    d.edges[0]!.w = null; d.edges[1]!.w = -2; d.statedFacts.edgeCount = 6;
    d.unreadable = [{ what: 'góc ảnh', note: 'mờ' }];
    const result = normalizeDraft(d);
    expect(result.spec).toBeNull(); expect(result.graph!.vertices).toHaveLength(21);
    expect(result.issues.map((i) => i.code)).toEqual(expect.arrayContaining([
      'missing_question', 'directed_graph', 'too_many_vertices', 'missing_weight', 'nonpositive_weight', 'count_mismatch', 'unreadable_region',
    ]));
    expect(result.graphUncertain).toContainEqual({ item: 'e1.w', candidates: [null] });
    expect(result.graphUncertain.find((u) => u.item === 'graph')!.candidates[0]).toEqual(result.graph);
    expect(result.issues.some((i) => i.code === 'invalid_spec')).toBe(false);
  });
  it('rechecks weighted requirements when a user completes a graph with a missing weight', async () => {
    const d = draft(); d.question = null; d.edges[1]!.w = null;
    const outcome = await readProblem([image], { reader: new FakeVisionReader({ edges: d, neighbors: d }) });
    const result = completeWithQuestion(outcome, draft().question!);
    expect(result.spec).toBeNull(); expect(result.graph).toEqual(outcome.graph);
    expect(result.issues).toContainEqual(expect.objectContaining({ code: 'missing_weight', severity: 'blocking', item: 'e2.w' }));
    expect(result.issues.some((i) => i.code === 'missing_question' || i.code === 'invalid_spec')).toBe(false);
  });
  const invalidQuestions: [string, (q: QuestionDraft) => void][] = [
    ['unsupported_task', (q) => { q.task = { type: 'coloring' }; }],
    ['invalid_spec', (q) => { q.task = { type: 'shortest_path', from: 'X', to: 'D' }; }],
    ['unmapped_option', (q) => { q.format = 'dung_sai'; q.options = ['a', 'b', 'c', 'd'].map((id, i) => ({
      id, text: id, check: i === 3 ? null : { type: 'edge_count', value: 4 }, conf: 1,
    })); }],
  ];
  it.each(invalidQuestions)('uses the same blocking rules for a supplied question: %s', async (code, alter) => {
    const d = draft(); d.question = null;
    const outcome = await readProblem([image], { reader: new FakeVisionReader({ edges: d, neighbors: d }) });
    const q = draft().question!; alter(q);
    const result = completeWithQuestion(outcome, q);
    expect(result.spec).toBeNull(); expect(result.graph).toEqual(outcome.graph);
    expect(result.issues).toContainEqual(expect.objectContaining({ code, severity: 'blocking' }));
  });
  it('retains structural blockers and graph flags when supplied with a valid question', async () => {
    const d = draft(); d.question = null; d.directed = true; d.vertices[0]!.conf = 0.6;
    const outcome = await readProblem([image], { reader: new FakeVisionReader({ edges: d, neighbors: d }) });
    const result = completeWithQuestion(outcome, draft().question!);
    expect(result.spec).toBeNull(); expect(result.graphUncertain).toContainEqual({ item: 'A', candidates: ['A'] });
    expect(result.issues).toContainEqual(expect.objectContaining({ code: 'directed_graph', severity: 'blocking' }));
  });
});

describe('review 3: graph reconciliation before blocking decisions', () => {
  it.each([false, true])('recovers a known weight from either pass (reverse: %s)', (reverse) => {
    const a = draft(); const b = draft(); a.edges[1]!.w = null; a.edges[1]!.conf = 0.6; b.edges[1]!.w = 7;
    const original = structuredClone([a, b]); const result = reverse ? reconcile(b, a) : reconcile(a, b);
    expect(result.spec).not.toBeNull(); expect(validateSpec(result.spec!).ok).toBe(true);
    expect(result.graph!.edges[1]!.w).toBe(7);
    expect(result.graphUncertain).toContainEqual({ item: 'e2.w', candidates: [7, null] });
    expect(result.issues).toEqual([]); expect([a, b]).toEqual(original);
  });
  it('prefers a known weight even when the missing reading has higher confidence', () => {
    const a = draft(); const b = draft(); a.edges[1]!.w = null; a.edges[1]!.conf = 0.99;
    const result = reconcile(a, b);
    expect(result.spec).not.toBeNull(); expect(result.graph!.edges[1]!.w).toBe(3);
    expect(result.graphUncertain).toEqual([{ item: 'e2.w', candidates: [3, null] }]);
    expect(result.issues).toEqual([]);
  });
  it('blocks a weight missing in both passes without duplicating invalid_spec', () => {
    const a = draft(); const b = draft(); a.edges[1]!.w = null; b.edges[1]!.w = null;
    const result = reconcile(a, b);
    expect(result.spec).toBeNull(); expect(result.graph).not.toBeNull();
    expect(result.issues).toMatchObject([{ code: 'missing_weight', severity: 'blocking', item: 'e2.w' }]);
    expect(result.graphUncertain).toContainEqual({ item: 'e2.w', candidates: [null] });
  });
  it('reconciles different graphs even when both questions are null', async () => {
    const a = draft(); const b = draft(); a.question = null; b.question = null;
    b.edges[3]!.w = 1; b.edges.splice(1, 1);
    const result = reconcile(a, b);
    expect(result.spec).toBeNull(); expect(result.graph!.edges).toHaveLength(4);
    expect(result.graphUncertain).toEqual(expect.arrayContaining([
      { item: 'e4.w', candidates: [7, 1] }, { item: 'e2', candidates: [true, false] },
    ]));
    expect(result.issues).toMatchObject([{ code: 'missing_question', severity: 'blocking' }]);
    const outcome = await readProblem([image], { reader: new FakeVisionReader({ edges: a, neighbors: b }) });
    expect(outcome.graph).toEqual(result.graph); expect(outcome.graphUncertain).toEqual(result.graphUncertain);
    const completed = completeWithQuestion(outcome, draft().question!);
    expect(validateSpec(completed.spec!).ok).toBe(true); expect(completed.spec!.uncertain).toEqual(result.graphUncertain);
  });
  it('drops resolved per-pass count and missing-weight diagnostics', () => {
    const a = draft(); const b = draft(); a.edges.pop(); a.statedFacts.edgeCount = 4;
    b.edges[1]!.w = null;
    const result = reconcile(a, b);
    expect(result.graph!.edges).toHaveLength(4); expect(result.spec).not.toBeNull();
    expect(result.issues).toEqual([]);
  });
  it('reports invalid_spec only for the actual merged spec', () => {
    const a = draft(); const b = draft(); a.edges[0]!.u = 'X'; b.edges[0]!.u = 'X';
    const result = reconcile(a, b);
    expect(result.spec).toBeNull(); expect(result.graph).not.toBeNull();
    expect(result.issues).toMatchObject([{ code: 'invalid_spec', severity: 'blocking' }]);
  });
});
