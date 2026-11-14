import { describe, expect, it } from 'vitest';
import type { StaticStatementCheck } from '../src/solvers/static-statements.js';
import { evaluateStaticStatement } from '../src/solvers/static-statements.js';
import { solveStatements } from '../src/index.js';
import { graph, problem } from './fixtures.js';
import { cycleGraph } from './traversal-fixtures.js';

describe('static statements', () => {
  const input = problem().graph;
  const cases: [StaticStatementCheck, boolean][] = [
    [{ type: 'vertex_count', value: 3 }, true], [{ type: 'vertex_count', value: 4 }, false],
    [{ type: 'edge_count', value: 2 }, true], [{ type: 'edge_count', value: 3 }, false],
    [{ type: 'degree', v: 'B', value: 2 }, true], [{ type: 'degree', v: 'A', value: 2 }, false],
    [{ type: 'degree_sum', value: 4 }, true], [{ type: 'degree_sum', value: 5 }, false],
    [{ type: 'odd_vertices', vertices: ['C', 'A'] }, true], [{ type: 'odd_vertices', vertices: ['A', 'A', 'C'] }, false],
    [{ type: 'connected', value: true }, true], [{ type: 'connected', value: false }, false],
    [{ type: 'euler_exists', kind: 'path', value: true }, true], [{ type: 'euler_exists', kind: 'circuit', value: true }, false],
    [{ type: 'hamilton_exists', kind: 'path', value: true }, true], [{ type: 'hamilton_exists', kind: 'cycle', value: false, reason: 'degree1' }, true],
    [{ type: 'hamilton_exists', kind: 'path', value: false, reason: 'degree1' }, false],
    [{ type: 'theorem', name: 'dirac', holds: false }, true], [{ type: 'theorem', name: 'ore', holds: true }, false],
    [{ type: 'walk', kind: 'hamilton_path', vertices: ['C', 'B', 'A'] }, true],
    [{ type: 'walk', kind: 'hamilton_path', vertices: ['A', 'B', 'A'] }, false],
    [{ type: 'walk', kind: 'euler_path', vertices: ['C', 'B', 'A'], edgeIds: ['e2', 'e1'] }, true],
    [{ type: 'walk', kind: 'euler_path', vertices: ['A', 'B'] }, false],
    [{ type: 'walk', kind: 'path', vertices: ['A', 'C'] }, false],
    [{ type: 'shortest_length', from: 'A', to: 'C', value: 5 }, true],
    [{ type: 'shortest_length', from: 'A', to: 'C', value: 4 }, false],
    [{ type: 'walk', kind: 'postman_tour', vertices: ['A', 'B', 'C', 'B', 'A'] }, true],
    [{ type: 'walk', kind: 'postman_tour', vertices: ['A', 'B', 'A'] }, false],
    [{ type: 'walk', kind: 'tsp_tour', vertices: ['A', 'B', 'C', 'B', 'A'] }, false],
  ];
  it.each(cases)('evaluates %j as %s', (check, expected) => {
    expect(evaluateStaticStatement(input, check).value).toBe(expected);
  });

  it('rejects an invalid sufficient-condition argument even if the conclusion is true', () => {
    const ring = cycleGraph(5);
    expect(evaluateStaticStatement(ring, { type: 'hamilton_exists', kind: 'cycle', value: true }).value).toBe(true);
    expect(evaluateStaticStatement(ring, { type: 'hamilton_exists', kind: 'cycle', value: false, reason: 'dirac' }).value).toBe(false);
    expect(evaluateStaticStatement(ring, { type: 'hamilton_exists', kind: 'cycle', value: true, reason: 'dirac' }).value).toBe(false);
    expect(evaluateStaticStatement(ring, { type: 'hamilton_exists', kind: 'cycle', value: true, reason: 'forced_edges' }).value).toBe(true);
    ring.edges.push({ id: 'copy', u: '0', v: '1' }, { id: 'loop', u: '0', v: '0' });
    expect(evaluateStaticStatement(ring, { type: 'hamilton_exists', kind: 'cycle', value: true, reason: 'forced_edges' }).value).toBe(true);
  });

  it('accepts all alternative Hamilton tours, not just the solver witness', () => {
    const triangle = graph(['A', 'B', 'C'], [{ id: 'ab', u: 'A', v: 'B' }, { id: 'bc', u: 'B', v: 'C' }, { id: 'ca', u: 'C', v: 'A' }]);
    for (const vertices of [['A', 'B', 'C', 'A'], ['C', 'B', 'A', 'C']]) {
      expect(evaluateStaticStatement(triangle, { type: 'walk', kind: 'hamilton_cycle', vertices }).value).toBe(true);
      expect(evaluateStaticStatement(triangle, { type: 'walk', kind: 'tsp_tour', vertices }).value).toBe(true);
    }
  });

  it('allows TSP singleton and two-vertex conventions without relaxing Hamilton', () => {
    expect(evaluateStaticStatement(graph(['A']), { type: 'walk', kind: 'tsp_tour', vertices: ['A'] }).value).toBe(true);
    const two = graph(['A', 'B'], [{ id: 'ab', u: 'A', v: 'B' }]);
    expect(evaluateStaticStatement(two, { type: 'walk', kind: 'tsp_tour', vertices: ['A', 'B', 'A'] }).value).toBe(true);
    expect(evaluateStaticStatement(two, { type: 'walk', kind: 'hamilton_cycle', vertices: ['A', 'B', 'A'] }).value).toBe(false);
  });

  it('checks every parallel edge and loop for a postman tour with or without edge ids', () => {
    const multi = graph(['A', 'B'], [{ id: 'ab', u: 'A', v: 'B' }, { id: 'ab2', u: 'B', v: 'A' }, { id: 'loop', u: 'A', v: 'A' }]);
    expect(evaluateStaticStatement(multi, { type: 'walk', kind: 'postman_tour', vertices: ['A', 'B', 'A', 'A'] }).value).toBe(true);
    expect(evaluateStaticStatement(multi, { type: 'walk', kind: 'postman_tour', vertices: ['A', 'B', 'A', 'A'], edgeIds: ['ab', 'ab2', 'loop'] }).value).toBe(true);
    expect(evaluateStaticStatement(multi, { type: 'walk', kind: 'postman_tour', vertices: ['A', 'B', 'A', 'A'], edgeIds: ['ab', 'ab', 'loop'] }).value).toBe(false);
    expect(evaluateStaticStatement(multi, { type: 'walk', kind: 'postman_tour', vertices: ['A', 'A'] }).value).toBe(false);
  });

  it('reports unreachable shortest lengths as false without Infinity in facts', () => {
    const result = evaluateStaticStatement(graph(['A', 'B']), { type: 'shortest_length', from: 'A', to: 'B', value: 4 });
    expect(result).toMatchObject({ value: false, facts: { expected: null } });
    expect(JSON.stringify(result)).not.toContain('Infinity');
  });

  it('solves static true/false items in input order using structured checks and safe ids', () => {
    const result = solveStatements(input, { items: [
      { id: '__proto__', text: 'Có 3 đỉnh', check: { type: 'vertex_count', value: 3 } },
      { id: 'constructor', text: 'Có 3 cạnh', check: { type: 'edge_count', value: 3 } },
      { id: 'A', text: 'Có chu trình Hamilton', check: { type: 'hamilton_exists', kind: 'cycle', value: true } },
    ] });
    expect(result.answer).toEqual(Object.fromEntries([['__proto__', true], ['constructor', false], ['A', false]]));
    expect(result.steps.map(({ index }) => index)).toEqual([1, 2, 3]);
    expect(result.steps[0]?.text).toContain('Đúng');
    expect(result.steps[1]?.text).toContain('Số cạnh thực tế là 2');
    expect(result.notes.length).toBeGreaterThan(0);
    expect(solveStatements(input, { items: [] })).toMatchObject({ answer: {}, steps: [] });
  });
});
