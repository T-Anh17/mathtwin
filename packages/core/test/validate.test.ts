import { describe, expect, it } from 'vitest';
import type { ClaimBody, ProblemSpec, StatementCheck, Task } from '../src/index.js';
import { validateSpec } from '../src/index.js';
import { graph, problem } from './fixtures.js';

// Deliberately bypass TS to exercise the untrusted JSON boundary.
function validate(value: unknown): ReturnType<typeof validateSpec> {
  return validateSpec(value as ProblemSpec);
}
function expectInvalid(value: unknown, path: string): void {
  const result = validate(value);
  expect(result.ok).toBe(false);
  expect(result.errors.some((error) => error.startsWith(`${path}:`))).toBe(true);
}

describe('validateSpec', () => {
  const tasks: Task[] = [
    { type: 'elements' }, { type: 'degree' }, { type: 'degree', vertices: ['A', 'C'] },
    { type: 'degree_sequence', sequence: [2, 3, 4, 3], simple: true },
    { type: 'degree_sequence', sequence: [2, 3, 4, 3], simple: false },
    { type: 'path', from: 'A', to: 'C' }, { type: 'connectivity' },
    { type: 'euler', want: 'any' }, { type: 'euler', want: 'path', start: 'A' },
    { type: 'euler', want: 'circuit', start: 'B' },
    { type: 'hamilton', want: 'path', start: 'A', end: 'C' },
    { type: 'hamilton', want: 'cycle' },
    { type: 'shortest_path', from: 'A', to: 'C' },
    { type: 'tsp', method: 'both', start: 'A' },
    { type: 'tsp', method: 'nearest_neighbor' }, { type: 'tsp', method: 'optimal' },
    { type: 'postman', start: 'B' }, { type: 'statements', items: [] },
  ];

  it.each(tasks)('accepts well-formed task $type without deciding solvability', (task) => {
    expect(validateSpec(problem(task))).toEqual({ ok: true, errors: [] });
  });

  it.each(['tu_luan', 'trac_nghiem', 'dung_sai', 'tra_loi_ngan'])('accepts question format %s', (questionFormat) => {
    expect(validate({ ...problem(), questionFormat }).ok).toBe(true);
  });

  it('accepts empty graphs and unweighted loops and parallel named edges', () => {
    expect(validateSpec({ ...problem(), graph: graph([]) }).ok).toBe(true);
    expect(validateSpec({ ...problem(), graph: graph(['A', 'B'], [
      { id: 'e1', u: 'A', v: 'A', name: 'a' },
      { id: 'e2', u: 'A', v: 'B' }, { id: 'e3', u: 'B', v: 'A' },
    ]) }).ok).toBe(true);
  });

  it('accepts twenty vertices but rejects twenty-one', () => {
    const vertices = Array.from({ length: 20 }, (_, i) => String(i));
    expect(validate({ ...problem(), graph: graph(vertices) }).ok).toBe(true);
    expectInvalid({ ...problem(), graph: graph([...vertices, '20']) }, 'graph.vertices');
  });

  it('accepts arbitrary ids and repeated display labels', () => {
    const spec = problem();
    spec.graph = { directed: false, vertices: [{ id: '__proto__', label: 'A' }, { id: 'constructor', label: 'A' }], edges: [] };
    expect(validateSpec(spec).ok).toBe(true);
  });

  it.each([null, undefined, [], 42, 'bad'])('rejects malformed spec %j without throwing', (input) => {
    expectInvalid(input, 'spec');
  });

  it('collects independent errors in a deterministic order', () => {
    const input = { graph: { directed: true, vertices: 'bad', edges: null }, task: null, questionFormat: 'bad' };
    const result = validate(input);
    expect(result.errors.map((error) => error.split(':')[0])).toEqual(['graph.directed', 'graph.vertices', 'graph.edges', 'task', 'questionFormat']);
    expect(validate(input)).toEqual(result);
  });

  it.each([
    [{ ...problem(), graph: null }, 'graph'],
    [{ ...problem(), graph: { directed: true, vertices: [], edges: [] } }, 'graph.directed'],
    [{ ...problem(), graph: { directed: false, vertices: {}, edges: [] } }, 'graph.vertices'],
    [{ ...problem(), graph: { directed: false, vertices: [], edges: {} } }, 'graph.edges'],
    [{ ...problem(), graph: { directed: false, vertices: [null], edges: [] } }, 'graph.vertices[0]'],
    [{ ...problem(), graph: { directed: false, vertices: [{ id: ' ', label: 'A' }], edges: [] } }, 'graph.vertices[0].id'],
    [{ ...problem(), graph: { directed: false, vertices: [{ id: 'A', label: 1 }], edges: [] } }, 'graph.vertices[0].label'],
    [{ ...problem(), graph: graph(['A', 'A']) }, 'graph.vertices[1].id'],
    [{ ...problem(), graph: { directed: false, vertices: [], edges: [null] } }, 'graph.edges[0]'],
    [{ ...problem(), graph: graph(['A'], [{ id: '', u: 'A', v: 'A' }]) }, 'graph.edges[0].id'],
    [{ ...problem(), graph: graph(['A'], [{ id: 'e', u: 'A', v: 'A' }, { id: 'e', u: 'A', v: 'A' }]) }, 'graph.edges[1].id'],
    [{ ...problem(), graph: graph(['A'], [{ id: 'e', u: 'B', v: 'A' }]) }, 'graph.edges[0].u'],
    [{ ...problem(), graph: graph(['A'], [{ id: 'e', u: 'A', v: 'B' }]) }, 'graph.edges[0].v'],
    [{ ...problem(), graph: { directed: false, vertices: [{ id: 'A', label: 'A' }], edges: [{ id: 'e', u: 'A', v: 'A', name: 1 }] } }, 'graph.edges[0].name'],
    [{ ...problem(), questionFormat: 'other' }, 'questionFormat'],
    [{ ...problem(), task: { type: 'other' } }, 'task.type'],
    [{ ...problem(), task: {} }, 'task.type'],
  ])('rejects invalid graph/spec at %s (%s)', (input, path) => {
    expectInvalid(input, path);
  });

  it.each([0, -1, NaN, Infinity, -Infinity, '3', null])('rejects nonpositive or nonfinite weight %j', (w) => {
    const spec = problem();
    expectInvalid({ ...spec, graph: { ...spec.graph, edges: [{ id: 'e', u: 'A', v: 'B', w }] } }, 'graph.edges[0].w');
  });

  it('reports every missing weight in a mixed graph, even for an elements task', () => {
    const spec = { ...problem(), graph: graph(['A', 'B', 'C'], [
      { id: 'e1', u: 'A', v: 'B' },
      { id: 'e2', u: 'B', v: 'C', w: 0.5 },
      { id: 'e3', u: 'C', v: 'A' },
    ]) };
    expect(validateSpec(spec)).toEqual({ ok: false, errors: [
      'graph.edges[0].w: Thiếu trọng số.',
      'graph.edges[2].w: Thiếu trọng số.',
    ] });
  });

  const weightedTasks: Task[] = [
    { type: 'shortest_path', from: 'A', to: 'C' },
    { type: 'tsp', method: 'both' },
    { type: 'postman', start: 'B' },
  ];
  it.each(weightedTasks)('requires every edge weight for $type', (task) => {
    const spec = problem(task);
    spec.graph.edges = spec.graph.edges.map(({ w: _w, ...edge }) => edge);
    expect(validateSpec(spec)).toEqual({ ok: false, errors: [
      'graph.edges[0].w: Thiếu trọng số.',
      'graph.edges[1].w: Thiếu trọng số.',
    ] });
  });

  it.each(weightedTasks)('accepts explicit positive weights for $type', (task) => {
    const spec = problem(task);
    spec.graph.edges = spec.graph.edges.map((edge) => ({ ...edge, w: 0.5 }));
    expect(validateSpec(spec)).toEqual({ ok: true, errors: [] });
  });

  it('accepts degree sequences at the limit of 100', () => {
    expect(validateSpec(problem({ type: 'degree_sequence', sequence: Array<number>(20).fill(100), simple: false }))).toEqual({ ok: true, errors: [] });
  });

  it.each([
    [{ type: 'degree', vertices: ['D'] }, 'task.vertices[0]'],
    [{ type: 'degree', vertices: 'A' }, 'task.vertices'],
    [{ type: 'path', from: 'D', to: 'C' }, 'task.from'],
    [{ type: 'shortest_path', from: 'A', to: 'D' }, 'task.to'],
    [{ type: 'euler', want: 'bad' }, 'task.want'],
    [{ type: 'euler', want: 'path', start: 'D' }, 'task.start'],
    [{ type: 'hamilton', want: 'circuit' }, 'task.want'],
    [{ type: 'hamilton', want: 'path', start: 'D' }, 'task.start'],
    [{ type: 'hamilton', want: 'path', end: 'D' }, 'task.end'],
    [{ type: 'tsp', method: 'bad' }, 'task.method'],
    [{ type: 'tsp', method: 'both', start: 'D' }, 'task.start'],
    [{ type: 'postman' }, 'task.start'],
    [{ type: 'degree_sequence', sequence: [1], simple: 'true' }, 'task.simple'],
    [{ type: 'degree_sequence', sequence: [1, -1], simple: false }, 'task.sequence'],
    [{ type: 'degree_sequence', sequence: [0.5, 1.5], simple: true }, 'task.sequence'],
    [{ type: 'degree_sequence', sequence: [Infinity], simple: false }, 'task.sequence'],
    [{ type: 'degree_sequence', sequence: ['2'], simple: false }, 'task.sequence'],
    [{ type: 'degree_sequence', sequence: [101, 1], simple: false }, 'task.sequence'],
    [{ type: 'degree_sequence', sequence: [2e7], simple: false }, 'task.sequence'],
    [{ type: 'degree_sequence', sequence: [1e15], simple: false }, 'task.sequence'],
    [{ type: 'degree_sequence', sequence: Array<number>(21).fill(0), simple: false }, 'task.sequence'],
    [{ type: 'degree_sequence', sequence: [Number.MAX_SAFE_INTEGER, 1], simple: false }, 'task.sequence'],
    [{ type: 'degree_sequence', sequence: null, simple: true }, 'task.sequence'],
    [{ type: 'statements', items: null }, 'task.items'],
  ])('rejects malformed task %j', (task, path) => {
    expectInvalid({ ...problem(), task }, path);
  });

  it('accepts uncertainty metadata without inferring its candidates', () => {
    expect(validate({ ...problem(), uncertain: [{ item: 'e1.w', candidates: [7, 1, null, { text: 'unknown' }] }] }).ok).toBe(true);
  });

  it.each([
    [null, 'uncertain'], [[null], 'uncertain[0]'],
    [[{ item: 3, candidates: [] }], 'uncertain[0].item'],
    [[{ item: 'e1.w', candidates: null }], 'uncertain[0].candidates'],
  ])('rejects malformed uncertainty metadata %j', (uncertain, path) => {
    expectInvalid({ ...problem(), uncertain }, path);
  });

  const checks: StatementCheck[] = [
    { type: 'vertex_count', value: 99 }, { type: 'edge_count', value: 2 },
    { type: 'degree', v: 'A', value: -1 }, { type: 'degree_sum', value: 4 },
    { type: 'odd_vertices', vertices: ['A', 'C'] }, { type: 'connected', value: true },
    { type: 'euler_exists', kind: 'path', value: true },
    { type: 'hamilton_exists', kind: 'cycle', value: false, reason: 'degree1' },
    { type: 'theorem', name: 'dirac', holds: false },
    { type: 'walk', kind: 'path', vertices: ['A', 'B'], edgeIds: ['e1'] },
    { type: 'length', vertices: ['A', 'B'], value: 2 },
    { type: 'dijkstra_init', source: 'A' }, { type: 'dijkstra_select', v: 'B' },
    { type: 'dijkstra_label', v: 'B', value: null },
    { type: 'dijkstra_label', v: 'B', value: 2, via: 'A' },
    { type: 'nn_step', from: 'A', to: 'B' },
    { type: 'postman_duplicate', vertices: ['A', 'B'] },
    { type: 'shortest_length', from: 'A', to: 'C', value: 5 },
  ];
  it.each(checks)('accepts structured StatementCheck $type including possibly false propositions', (check) => {
    expect(validateSpec(problem({ type: 'statements', items: [{ id: 's1', text: 'Mệnh đề', check }] })).ok).toBe(true);
  });

  const nonCheckableClaims: ClaimBody[] = [
    { type: 'statement', id: 's1', value: true },
    { type: 'choice', option: 'A' },
    { type: 'final_answer', value: { answer: 3 } },
  ];
  it.each(nonCheckableClaims)('rejects $type as a StatementCheck', (check) => {
    expectInvalid({ ...problem(), task: { type: 'statements', items: [{ id: 's1', text: 'Mệnh đề', check }] } }, 'task.items[0].check.type');
  });

  it.each([
    [null, 'task.items[0].check'], [{ type: 'bad' }, 'task.items[0].check.type'],
    [{ type: 'degree', v: 'D', value: 1 }, 'task.items[0].check.v'],
    [{ type: 'edge_count', value: Infinity }, 'task.items[0].check.value'],
    [{ type: 'connected', value: 'true' }, 'task.items[0].check.value'],
    [{ type: 'euler_exists', kind: 'cycle', value: true }, 'task.items[0].check.kind'],
    [{ type: 'hamilton_exists', kind: 'path', value: true, reason: 'bad' }, 'task.items[0].check.reason'],
    [{ type: 'theorem', name: 'bad', holds: true }, 'task.items[0].check.name'],
    [{ type: 'theorem', name: 'ore', holds: 1 }, 'task.items[0].check.holds'],
    [{ type: 'walk', kind: 'path', vertices: ['A'], edgeIds: ['missing'] }, 'task.items[0].check.edgeIds[0]'],
    [{ type: 'dijkstra_init', source: 'D' }, 'task.items[0].check.source'],
    [{ type: 'dijkstra_label', v: 'B', value: 2, via: 'D' }, 'task.items[0].check.via'],
    [{ type: 'shortest_length', from: 'A', to: 'D', value: 2 }, 'task.items[0].check.to'],
    [{ type: 'odd_vertices', vertices: null }, 'task.items[0].check.vertices'],
    [{ type: 'final_answer' }, 'task.items[0].check.type'],
    [{ type: 'choice', option: null }, 'task.items[0].check.type'],
  ])('rejects malformed StatementCheck %j', (check, path) => {
    expectInvalid({ ...problem(), task: { type: 'statements', items: [{ id: 's1', text: 'Mệnh đề', check }] } }, path);
  });

  it('rejects malformed statements and duplicate statement ids', () => {
    expectInvalid({ ...problem(), task: { type: 'statements', items: [null] } }, 'task.items[0]');
    expectInvalid({ ...problem(), task: { type: 'statements', items: [{ id: '', text: 1, check: checks[0] }] } }, 'task.items[0].id');
    expectInvalid({ ...problem(), task: { type: 'statements', items: [{ id: 's1', text: 1, check: checks[0] }] } }, 'task.items[0].text');
    const item = { id: 's1', text: 'Mệnh đề', check: checks[0] };
    expectInvalid({ ...problem(), task: { type: 'statements', items: [item, item] } }, 'task.items[1].id');
  });

  it('does not mutate validated input', () => {
    const spec = problem();
    const before = JSON.stringify(spec);
    Object.freeze(spec);
    expect(validateSpec(spec).ok).toBe(true);
    expect(JSON.stringify(spec)).toBe(before);
  });
});
