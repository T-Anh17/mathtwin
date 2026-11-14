import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { grade, validateSpec } from '@mathtwin/core';
import { applyConfirmation, reconcile } from '../src/index.js';
import { draft } from './fixtures.js';

describe('reconcile', () => {
  it('has no flags for identical, confident drafts', () => {
    const a = draft(); a.vertices.forEach((v) => { v.conf = 0.85; });
    a.edges.forEach((e) => { e.conf = 0.85; }); a.question!.conf = 0.85;
    const result = reconcile(a, structuredClone(a));
    expect(result.issues).toEqual([]); expect(result.spec!.uncertain ?? []).toEqual([]);
  });
  it('aligns unordered, reversed parallel edges as a multiset without losing loops', () => {
    const a = draft(); a.edges[1] = { ...a.edges[0]!, w: 3, name: null }; a.edges[0]!.name = null;
    a.edges[2]!.u = 'A'; a.edges[2]!.v = 'A';
    const b = structuredClone(a); b.edges.reverse().forEach((e) => { [e.u, e.v] = [e.v, e.u]; });
    const spec = reconcile(a, b).spec!;
    expect(spec.graph.edges).toHaveLength(4); expect(spec.uncertain ?? []).toEqual([]);
    expect(spec.graph.edges.map((e) => e.w)).toEqual([2, 3, 4, 7]);
  });
  it('flags a 7/1 weight difference and core asks for confirmation for work using 1', () => {
    const a = draft(); const b = structuredClone(a); b.edges[3]!.w = 1;
    const spec = reconcile(a, b).spec!;
    expect(spec.uncertain).toEqual([{ item: 'e4.w', candidates: [7, 1] }]);
    expect(grade(spec, [{ type: 'length', vertices: ['C', 'D'], value: 1, step: 1, raw: 'CD = 1' }]).verdict).toBe('CAN_XAC_NHAN');
  });
  it('selects the higher confidence weight and keeps the used value first', () => {
    const a = draft(); const b = structuredClone(a); b.edges[3]!.w = 1; b.edges[3]!.conf = 0.99;
    a.edges[3]!.wAlternatives = [5]; b.edges[3]!.wAlternatives = [3];
    const spec = reconcile(a, b).spec!;
    expect(spec.graph.edges[3]!.w).toBe(1);
    expect(spec.uncertain).toContainEqual({ item: 'e4.w', candidates: [1, 7, 5, 3] });
  });
  it('flags existence differences and appends second-pass edges after first-pass ids', () => {
    const a = draft(); const b = structuredClone(a); b.edges.splice(1, 1);
    b.edges.push({ u: 'B', v: 'D', w: 9, wAlternatives: [], name: 'x', conf: 0.96 });
    const spec = reconcile(a, b).spec!;
    expect(spec.uncertain).toEqual(expect.arrayContaining([
      { item: 'e2', candidates: [true, false] }, { item: 'e5', candidates: [true, false] },
    ]));
    expect(spec.graph.edges.map((e) => e.id)).toEqual(['e1', 'e2', 'e3', 'e4', 'e5']);
  });
  it('does not collapse duplicate edges that differ only in multiplicity', () => {
    const a = draft(); a.edges.push({ ...a.edges[0]! });
    const spec = reconcile(a, draft()).spec!;
    expect(spec.graph.edges).toHaveLength(5);
    expect(spec.uncertain).toEqual([{ item: 'e5', candidates: [true, false] }]);
  });
  it('flags changed endpoints on a uniquely named edge', () => {
    const a = draft(); const b = structuredClone(a); b.edges[3]!.v = 'B'; b.edges[3]!.conf = 0.99;
    const spec = reconcile(a, b).spec!;
    expect(spec.graph.edges[3]!.v).toBe('B');
    expect(spec.uncertain).toEqual([{ item: 'e4.v', candidates: ['B', 'D'] }]);
  });
  it('flags name disagreements as graph uncertainty', () => {
    const a = draft(); const b = structuredClone(a); b.edges[3]!.name = 'n';
    const spec = reconcile(a, b).spec!;
    expect(spec.uncertain!.find((u) => u.item === 'graph')!.candidates[0]).toEqual(spec.graph);
  });
  it('flags vertex discrepancies and confidence even if edges agree', () => {
    const a = draft(); a.vertices.push({ label: 'Z', conf: 0.9 });
    const b = draft(); b.vertices.push({ label: 'X', conf: 0.8 });
    const spec = reconcile(a, b).spec!;
    expect(spec.graph.vertices.map((v) => v.id)).toEqual(['A', 'B', 'C', 'D', 'Z', 'X']);
    expect(spec.uncertain).toEqual(expect.arrayContaining([{ item: 'Z', candidates: ['Z', false] }, { item: 'X', candidates: ['X', false] }]));
  });
  it('compares task fields and question format with the higher confidence value first', () => {
    const a = draft(); const b = draft(); b.question!.conf = 0.99;
    b.question!.task = { type: 'shortest_path', from: 'B', to: 'D' }; b.question!.format = 'tra_loi_ngan';
    const spec = reconcile(a, b).spec!;
    expect(spec.uncertain).toContainEqual({ item: 'task.from', candidates: ['B', 'A'] });
    expect(spec.uncertain).toContainEqual({ item: 'questionFormat', candidates: ['tra_loi_ngan', 'tu_luan'] });
  });
  it('remaps second-pass edge ids in walk propositions', () => {
    const a = draft(); a.question!.task = { type: 'statements', items: [{ id: 'a', text: 'AB', check: { type: 'walk', kind: 'path', vertices: ['A', 'B'], edgeIds: ['e1'] } }] };
    const b = structuredClone(a); b.edges.reverse();
    (b.question!.task as { items: { check: { edgeIds: string[] } }[] }).items[0]!.check.edgeIds = ['e4'];
    expect(reconcile(a, b).spec!.uncertain ?? []).toEqual([]);
    b.question!.conf = 0.8;
    const spec = reconcile(a, b).spec!;
    expect(spec.uncertain!.find((u) => u.item === 'task.items')!.candidates).toHaveLength(1);
  });
  it('uses JSON-safe null candidates for absent optional task fields', () => {
    const a = draft(); a.question!.task = { type: 'euler', want: 'any' };
    const b = structuredClone(a); b.question!.task = { type: 'euler', want: 'any', start: 'A' };
    const spec = reconcile(a, b).spec!;
    expect(spec.uncertain).toEqual([{ item: 'task.start', candidates: [null, 'A'] }]);
    expect(JSON.parse(JSON.stringify(spec))).toEqual(spec);
    expect(applyConfirmation(spec, { 'task.start': null }).task).toEqual({ type: 'euler', want: 'any' });
  });
  it('checks stated facts again after merging different same-sized graphs', () => {
    const a = draft(); const b = draft(); a.statedFacts.edgeCount = 4; b.statedFacts.edgeCount = 4;
    b.edges[3] = { ...b.edges[3]!, u: 'A', v: 'D', name: 'x', w: 99 };
    const result = reconcile(a, b);
    expect(result.spec!.graph.edges).toHaveLength(5);
    expect(result.issues).toContainEqual(expect.objectContaining({ code: 'count_mismatch' }));
    expect(result.spec!.uncertain!.find((u) => u.item === 'graph')!.candidates[0]).toEqual(result.spec!.graph);
  });
  it('uses the readable question when the other pass has no question', () => {
    const a = draft(); const b = draft(); b.question = null;
    expect(reconcile(a, b).spec).not.toBeNull();
    expect(reconcile(a, b).issues).toEqual([]);
    expect(reconcile(b, a).spec).not.toBeNull();
    expect(reconcile(b, a).issues).toEqual([]);
  });
  it('validates the union, including a union exceeding 20 vertices', () => {
    const a = draft(); const b = draft();
    a.vertices.push(...Array.from({ length: 16 }, (_, i) => ({ label: `X${i}`, conf: 0.96 })));
    b.vertices.push(...Array.from({ length: 16 }, (_, i) => ({ label: `Y${i}`, conf: 0.96 })));
    expect(reconcile(a, b).spec).toBeNull();
  });
  it('preserves deterministic, immutable matching under generated permutations', () => {
    fc.assert(fc.property(fc.shuffledSubarray([0, 1, 2, 3], { minLength: 4, maxLength: 4 }), (order) => {
      const a = draft(); const b = draft(); b.edges = order.map((i) => ({ ...b.edges[i]! }));
      const originals = structuredClone([a, b]); const first = reconcile(a, b);
      expect(reconcile(a, b)).toEqual(first); expect([a, b]).toEqual(originals);
      expect(validateSpec(first.spec!).ok).toBe(true); expect(first.spec!.uncertain ?? []).toEqual([]);
    }), { numRuns: 50 });
  });
});

describe('applyConfirmation', () => {
  it('applies a weight and removes just its flag, without mutating the input', () => {
    const a = draft(); const b = draft(); b.edges[3]!.w = 1;
    const spec = reconcile(a, b).spec!; const original = structuredClone(spec);
    const confirmed = applyConfirmation(spec, { 'e4.w': 1 });
    expect(confirmed.graph.edges[3]!.w).toBe(1); expect(confirmed.uncertain ?? []).toEqual([]);
    expect(validateSpec(confirmed).ok).toBe(true); expect(spec).toEqual(original);
  });
  it('removes a rejected edge and its obsolete weight flags without renumbering', () => {
    const a = draft(); a.edges[0]!.wAlternatives = [1];
    const b = draft(); b.edges.shift();
    const result = applyConfirmation(reconcile(a, b).spec!, { e1: false });
    expect(result.graph.edges.map((e) => e.id)).toEqual(['e2', 'e3', 'e4']); expect(result.uncertain ?? []).toEqual([]);
  });
  it('renames vertices and updates references in edges and the task', () => {
    const spec = reconcile(draft(), draft()).spec!;
    const result = applyConfirmation(spec, { A: ' V₁ ', 'task.to': ' B ' });
    expect(result.graph.vertices[0]).toEqual({ id: 'V1', label: 'V1' });
    expect(result.graph.edges[0]!.u).toBe('V1');
    expect(result.task).toEqual({ type: 'shortest_path', from: 'V1', to: 'B' });
  });
  it('supports whole-graph and question-format confirmation', () => {
    const spec = reconcile(draft(), draft()).spec!;
    expect(applyConfirmation(spec, { graph: spec.graph, questionFormat: 'tra_loi_ngan' }).questionFormat).toBe('tra_loi_ngan');
  });
  it('keeps unresolved candidates current after a related task correction', () => {
    const a = draft(); a.question!.conf = 0.8;
    const spec = reconcile(a, a).spec!;
    const result = applyConfirmation(spec, { 'task.to': 'B' });
    expect(result.uncertain!.some((u) => u.item === 'task.to')).toBe(false);
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
  });
  it.each([{ 'e4.w': -1 }, { 'e4.u': 'missing' }, { 'task.to': 'missing' }, { graph: null }, { questionFormat: 'bad' },
    { e1: 'false' }, { A: 'B' }, { A: 'b' }, { 'task.__proto__': {} }, { 'e4.name': 'n' }])('rejects invalid/unknown confirmation atomically: %j', (answers) => {
    const spec = reconcile(draft(), draft()).spec!; const before = structuredClone(spec);
    expect(() => applyConfirmation(spec, answers)).toThrow(); expect(spec).toEqual(before);
  });
});
