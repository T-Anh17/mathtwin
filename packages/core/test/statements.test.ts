import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { evaluateStatement, solve, solveStatements } from '../src/index.js';
import type { Graph, StatementCheck } from '../src/index.js';
import { graph, problem } from './fixtures.js';
import { freezeGraph } from './traversal-fixtures.js';

function statementProblem(input: Graph, checks: StatementCheck[]) {
  return { ...problem({ type: 'statements', items: checks.map((check, i) => ({ id: `s${i}`, text: `Ý ${i}`, check })) }), graph: input };
}

/** Independent oracle: enumerate every greedy run without memoization or a reference trace. */
function allNearestSteps(input: Graph, start: string): Set<string> {
  const steps = new Set<string>();
  const pair = (u: string, v: string): string => JSON.stringify([u, v]);
  const weight = (u: string, v: string): number => Math.min(...input.edges.filter((e) =>
    (e.u === u && e.v === v) || (e.u === v && e.v === u)).map((e) => e.w!));
  const visit = (route: string[]): void => {
    const current = route.at(-1)!;
    if (route.length === input.vertices.length) {
      if (route.length > 1 && Number.isFinite(weight(current, start))) steps.add(pair(current, start));
      return;
    }
    const unvisited = input.vertices.map(({ id }) => id).filter((id) => !route.includes(id));
    const minimum = Math.min(...unvisited.map((id) => weight(current, id)));
    if (!Number.isFinite(minimum)) return;
    for (const id of unvisited) {
      if (weight(current, id) !== minimum) continue;
      steps.add(pair(current, id));
      visit([...route, id]);
    }
  };
  visit([start]);
  return steps;
}

describe('independent weighted statements', () => {
  const weighted = graph(['S', 'A', 'B', 'T', 'U', 'Z'], [
    { id: 'sa', u: 'S', v: 'A', w: 1 }, { id: 'sb', u: 'S', v: 'B', w: 1 },
    { id: 'at', u: 'A', v: 'T', w: 2 }, { id: 'bt', u: 'B', v: 'T', w: 2 },
    { id: 'st', u: 'S', v: 'T', w: 9 }, { id: 'tu', u: 'T', v: 'U', w: 1 },
  ]);

  const labels: [StatementCheck, boolean][] = [
    [{ type: 'dijkstra_label', source: 'S', v: 'T', value: 3 }, true],
    [{ type: 'dijkstra_label', source: 'S', v: 'T', value: 9 }, false],
    [{ type: 'dijkstra_label', source: 'S', v: 'T', value: 3, via: 'A' }, true],
    [{ type: 'dijkstra_label', source: 'S', v: 'T', value: 3, via: 'B' }, true],
    [{ type: 'dijkstra_label', source: 'S', v: 'T', value: 3, via: 'S' }, false],
    [{ type: 'dijkstra_label', source: 'S', v: 'T', value: 3, via: 'U' }, false],
    [{ type: 'dijkstra_label', source: 'S', v: 'T', value: 3, via: 'Z' }, false],
    [{ type: 'dijkstra_label', source: 'S', v: 'Z', value: null }, true],
    [{ type: 'dijkstra_label', source: 'S', v: 'Z', value: 0 }, false],
    [{ type: 'dijkstra_label', source: 'S', v: 'Z', value: null, via: 'A' }, false],
    [{ type: 'dijkstra_label', source: 'S', v: 'S', value: 0 }, true],
    [{ type: 'dijkstra_label', source: 'S', v: 'S', value: 0, via: 'A' }, false],
    [{ type: 'dijkstra_label', source: 'B', v: 'T', value: 2, via: 'B' }, true],
  ];
  it.each(labels)('evaluates final Dijkstra label %j as %s', (check, expected) => {
    expect(solve(statementProblem(weighted, [check])).answer).toEqual({ s0: expected });
  });

  it('uses the shortest parallel edge for final labels and accepts tied predecessors', () => {
    const input = graph(['A', 'B', 'C'], [
      { id: 'heavy', u: 'A', v: 'B', w: 9 }, { id: 'light', u: 'A', v: 'B', w: 2 },
      { id: 'ac', u: 'A', v: 'C', w: 1 }, { id: 'cb', u: 'C', v: 'B', w: 1 },
    ]);
    expect(solve(statementProblem(input, [
      { type: 'dijkstra_label', source: 'A', v: 'B', value: 2, via: 'A' },
      { type: 'dijkstra_label', source: 'A', v: 'B', value: 2, via: 'C' },
    ])).answer).toEqual({ s0: true, s1: true });
  });

  it('compares unambiguous route lengths, including equal parallel weights and loops', () => {
    const input = graph(['A', 'B', 'C'], [
      { id: 'ab', u: 'A', v: 'B', w: 2 }, { id: 'ba', u: 'B', v: 'A', w: 2 },
      { id: 'loop', u: 'A', v: 'A', w: 3 },
    ]);
    expect(solve(statementProblem(input, [
      { type: 'length', vertices: ['A', 'B', 'A', 'A'], value: 7 },
      { type: 'length', vertices: ['A', 'B'], value: 9 },
      { type: 'length', vertices: ['A'], value: 0 },
      { type: 'length', vertices: [], value: 0 },
      { type: 'length', vertices: ['A', 'C'], value: 1 },
    ])).answer).toEqual({ s0: true, s1: false, s2: true, s3: false, s4: false });
  });

  it('returns insufficient data for ambiguous lengths, and false for missing edges even after ambiguity', () => {
    const input = graph(['A', 'B', 'C'], [{ id: 'ab', u: 'A', v: 'B', w: 2 }, { id: 'ba', u: 'B', v: 'A', w: 3 }]);
    const checks: StatementCheck[] = [
      { type: 'length', vertices: ['A', 'B'], value: 2 },
      { type: 'length', vertices: ['A', 'B'], value: 100 },
      { type: 'length', vertices: ['A', 'B', 'C'], value: 5 },
      { type: 'length', vertices: ['A'], value: 0 },
    ];
    const result = solve(statementProblem(input, checks));
    expect(result.answer).toEqual({ s0: null, s1: null, s2: false, s3: true });
    expect(result.steps[0]?.text).toContain('Chưa đủ dữ kiện');
    expect(result.steps[0]?.text).not.toContain('— Sai');
    expect(result.steps[0]?.data).toMatchObject({ value: null, facts: { reason: 'ambiguous_length', ambiguousSteps: [{ from: 'A', to: 'B', edgeIds: ['ab', 'ba'], weights: [2, 3] }] } });
    expect(result.steps[2]?.text).toContain('không kề');
  });

  it('finds NN steps on noncanonical tied runs, including the closing step', () => {
    const input = graph(['A', 'B', 'C'], [
      { id: 'ab', u: 'A', v: 'B', w: 1 }, { id: 'ac', u: 'A', v: 'C', w: 1 }, { id: 'bc', u: 'B', v: 'C', w: 2 },
    ]);
    expect(solve(statementProblem(input, [
      { type: 'nn_step', start: 'A', from: 'A', to: 'C' },
      { type: 'nn_step', start: 'A', from: 'C', to: 'B' },
      { type: 'nn_step', start: 'A', from: 'B', to: 'A' },
      { type: 'nn_step', start: 'B', from: 'A', to: 'B' },
      { type: 'nn_step', start: 'A', from: 'A', to: 'A' },
    ])).answer).toEqual({ s0: true, s1: true, s2: true, s3: false, s4: false });
    const result = evaluateStatement(input, { type: 'nn_step', start: 'A', from: 'B', to: 'A' });
    expect(result.facts.walk).toEqual({ vertices: ['A', 'C', 'B', 'A'], edgeIds: ['ac', 'bc', 'ab'] });
  });

  it('checks NN reachability from start rather than a locally plausible edge', () => {
    const input = graph(['A', 'B', 'C', 'D'], [
      { id: 'ab', u: 'A', v: 'B', w: 1 }, { id: 'ac', u: 'A', v: 'C', w: 2 },
      { id: 'ad', u: 'A', v: 'D', w: 3 }, { id: 'bc', u: 'B', v: 'C', w: 1 },
      { id: 'bd', u: 'B', v: 'D', w: 2 }, { id: 'cd', u: 'C', v: 'D', w: 1 },
    ]);
    expect(evaluateStatement(input, { type: 'nn_step', start: 'A', from: 'B', to: 'D' }).value).toBe(false);
    expect(evaluateStatement(input, { type: 'nn_step', start: 'A', from: 'D', to: 'C' }).value).toBe(false);
    expect(evaluateStatement(input, { type: 'nn_step', start: 'A', from: 'D', to: 'A' }).value).toBe(true);
  });

  it('handles singleton, two-vertex and stuck NN runs consistently with the TSP solver', () => {
    expect(evaluateStatement(graph(['A']), { type: 'nn_step', start: 'A', from: 'A', to: 'A' }).value).toBe(false);
    const two = graph(['A', 'B'], [{ id: 'ab', u: 'A', v: 'B', w: 1 }]);
    expect(evaluateStatement(two, { type: 'nn_step', start: 'A', from: 'B', to: 'A' }).value).toBe(true);
    const sparse = graph(['A', 'B', 'C'], [{ id: 'ab', u: 'A', v: 'B', w: 1 }]);
    expect(evaluateStatement(sparse, { type: 'nn_step', start: 'A', from: 'A', to: 'B' }).value).toBe(true);
    expect(evaluateStatement(sparse, { type: 'nn_step', start: 'A', from: 'B', to: 'A' }).value).toBe(false);
    expect(evaluateStatement(sparse, { type: 'nn_step', start: 'C', from: 'A', to: 'B' }).value).toBe(false);
  });

  it('keeps every item independent under reordering, failed assertions and different sources/starts', () => {
    const spec = statementProblem(weighted, [
      { type: 'dijkstra_label', source: 'S', v: 'T', value: 9 },
      { type: 'dijkstra_label', source: 'B', v: 'T', value: 2 },
      { type: 'nn_step', start: 'S', from: 'S', to: 'A' },
      { type: 'nn_step', start: 'B', from: 'B', to: 'S' },
      { type: 'length', vertices: ['S', 'T'], value: 9 },
    ]);
    freezeGraph(spec.graph);
    if (spec.task.type !== 'statements') throw new Error('Expected statement task');
    const before = JSON.stringify(spec);
    const result = solve(spec);
    const reordered = { ...spec, task: { ...spec.task, items: [...spec.task.items].reverse() } };
    expect(solve(reordered).answer).toEqual(result.answer);
    for (const item of spec.task.items) {
      expect(solve({ ...spec, task: { ...spec.task, items: [item] } }).answer).toEqual({ [item.id]: (result.answer as Record<string, boolean>)[item.id] });
    }
    expect(JSON.stringify(spec)).toBe(before);
    expect(solve(spec)).toEqual(result);
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
  });

  it('handles prototype-like source, item and vertex identifiers', () => {
    const input = graph(['__proto__', 'constructor'], [{ id: 'ab', u: '__proto__', v: 'constructor', w: 3 }]);
    const result = solveStatements(input, { items: [{ id: '__proto__', text: 'Nhãn', check: { type: 'dijkstra_label', source: '__proto__', v: 'constructor', value: 3, via: '__proto__' } }] });
    expect(result.answer).toEqual(Object.fromEntries([['__proto__', true]]));
  });

  it('supports NN statements at twenty vertices with tied choices and closing steps', () => {
    const ids = Array.from({ length: 20 }, (_, i) => String(i));
    const input = graph(ids, ids.map((u, i) => ({ id: `e${i}`, u, v: ids[(i + 1) % ids.length]!, w: 1 })));
    expect(evaluateStatement(input, { type: 'nn_step', start: '0', from: '19', to: '0' }).value).toBe(true);
    expect(evaluateStatement(input, { type: 'nn_step', start: '0', from: '1', to: '0' }).value).toBe(true);
    expect(evaluateStatement(input, { type: 'nn_step', start: '0', from: '5', to: '5' }).value).toBe(false);
    expect(evaluateStatement(input, { type: 'nn_step', start: '0', from: '5', to: '10' }).value).toBe(false);
  });

  it('matches all steps of exhaustive NN runs on generated graphs with ties and missing edges', () => {
    const arbitrary = fc.integer({ min: 1, max: 7 }).chain((n) => {
      const ids = Array.from({ length: n }, (_, i) => String(i));
      const pairs = ids.flatMap((u, i) => ids.slice(i + 1).map((v) => [u, v] as const));
      return fc.array(fc.integer({ min: 0, max: 3 }), { minLength: pairs.length, maxLength: pairs.length })
        .map((weights) => graph(ids, pairs.flatMap(([u, v], i) => weights[i] === 0 ? [] : [{ id: `e${i}`, u, v, w: weights[i]! }])));
    });
    fc.assert(fc.property(arbitrary, (input) => {
      const start = input.vertices[0]!.id;
      const expected = allNearestSteps(input, start);
      for (const { id: from } of input.vertices) for (const { id: to } of input.vertices) {
        expect(evaluateStatement(input, { type: 'nn_step', start, from, to }).value).toBe(expected.has(JSON.stringify([from, to])));
      }
    }), { seed: 1401, numRuns: 300 });
  }, 20000);
});

describe('postman duplication statements', () => {
  it('accepts alternative optimal pairings and both directions', () => {
    const input = graph(['O', 'A', 'B', 'C', 'D'], ['A', 'B', 'C', 'D'].map((v) => ({ id: `o${v}`, u: 'O', v, w: 1 })));
    for (const vertices of [['A', 'O', 'C'], ['C', 'O', 'A'], ['B', 'O', 'D']]) {
      expect(evaluateStatement(input, { type: 'postman_duplicate', vertices }).value).toBe(true);
    }
    expect(evaluateStatement(input, { type: 'postman_duplicate', vertices: ['A', 'O'] }).value).toBe(false);
    expect(evaluateStatement(input, { type: 'postman_duplicate', vertices: ['A', 'O', 'A'] }).value).toBe(false);
    expect(evaluateStatement(input, { type: 'postman_duplicate', vertices: ['A', 'C'] }).value).toBe(false);
  });

  it('rejects a shortest odd-pair path if that pair cannot belong to any optimal matching', () => {
    const input = graph(['A', 'B', 'C', 'D'], [
      { id: 'ab', u: 'A', v: 'B', w: 1 }, { id: 'cd', u: 'C', v: 'D', w: 1 },
      { id: 'ac', u: 'A', v: 'C', w: 10 }, { id: 'ad', u: 'A', v: 'D', w: 10 },
      { id: 'bc', u: 'B', v: 'C', w: 10 }, { id: 'bd', u: 'B', v: 'D', w: 10 },
    ]);
    expect(evaluateStatement(input, { type: 'postman_duplicate', vertices: ['A', 'B'] }).value).toBe(true);
    expect(evaluateStatement(input, { type: 'postman_duplicate', vertices: ['A', 'C'] })).toMatchObject({ value: false, facts: { length: 10, expected: 10, optimalLength: 2, forcedLength: 20 } });
  });

  it('accepts a tied shortest route different from Floyd-Warshall witness and rejects detours', () => {
    const input = graph(['A', 'B', 'C', 'D'], [
      { id: 'ab', u: 'A', v: 'B', w: 1 }, { id: 'bd', u: 'B', v: 'D', w: 1 },
      { id: 'ac', u: 'A', v: 'C', w: 1 }, { id: 'cd', u: 'C', v: 'D', w: 1 },
      { id: 'ad', u: 'A', v: 'D', w: 2 },
    ]);
    for (const vertices of [['A', 'B', 'D'], ['A', 'C', 'D'], ['A', 'D']]) {
      expect(evaluateStatement(input, { type: 'postman_duplicate', vertices }).value).toBe(true);
    }
    expect(evaluateStatement(input, { type: 'postman_duplicate', vertices: ['A', 'B', 'A', 'D'] }).value).toBe(false);
  });

  it('rejects disconnected edge components and graphs with no odd vertices', () => {
    const disconnected = graph(['A', 'B', 'C', 'D'], [{ id: 'ab', u: 'A', v: 'B', w: 1 }, { id: 'cd', u: 'C', v: 'D', w: 1 }]);
    expect(evaluateStatement(disconnected, { type: 'postman_duplicate', vertices: ['A', 'B'] }).value).toBe(false);
    expect(evaluateStatement(graph(['A']), { type: 'postman_duplicate', vertices: ['A'] }).value).toBe(false);
  });
});
