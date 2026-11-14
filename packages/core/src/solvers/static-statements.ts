import type { Graph, StatementCheck } from '../types.js';
import { degree, degrees, isConnected, oddVertices } from '../graph/basic.js';
import { analyzeHamilton, hamiltonCycleRules } from '../graph/hamilton.js';
import { checkWalk } from '../graph/walk.js';
import { analyzeEuler } from './euler.js';
import { solveHamilton } from './hamilton.js';
import { solveDijkstra } from './dijkstra.js';

export type StaticStatementCheck = Exclude<StatementCheck, {
  type: 'length' | 'dijkstra_label' | 'nn_step' | 'postman_duplicate';
}>;
export interface StatementEvaluation { value: boolean; facts: Record<string, unknown> }

/** A tour predicate checks this particular tour, independently of a reference tour. */
function checkTour(graph: Graph, check: Extract<StatementCheck, { type: 'walk' }>): StatementEvaluation {
  const path = checkWalk(graph, { ...check, kind: 'path' });
  if (!path.ok) return { value: false, facts: { ...path.facts, reason: path.reason } };
  const walk = path.walk;
  const first = walk.vertices[0];
  const closed = first !== undefined && first === walk.vertices.at(-1);
  if (!closed) return { value: false, facts: { closed: false } };
  if (check.kind === 'tsp_tour') {
    // TSP conventions inherited from solveTsp: singleton length zero, n=2 allowed.
    const visits = graph.vertices.length === 1 && walk.vertices.length === 1 ? walk.vertices : walk.vertices.slice(0, -1);
    return { value: visits.length === graph.vertices.length && new Set(visits).size === graph.vertices.length,
      facts: { vertices: walk.vertices, vertexCount: graph.vertices.length } };
  }
  if (check.edgeIds !== undefined) {
    const used = new Set(walk.edgeIds);
    return { value: graph.edges.every(({ id }) => used.has(id)), facts: { edgeIds: walk.edgeIds, edgeCount: graph.edges.length } };
  }
  // Without explicit IDs, each endpoint pair must be traversed at least as often
  // as its multiplicity. This accepts every feasible assignment of parallel IDs.
  const counts = new Map<string, number>();
  const indices = new Map(graph.vertices.map(({ id }, i) => [id, i]));
  const key = (u: string, v: string): string => {
    const a = indices.get(u)!;
    const b = indices.get(v)!;
    return `${Math.min(a, b)},${Math.max(a, b)}`;
  };
  for (let i = 1; i < walk.vertices.length; i++) {
    const pair = key(walk.vertices[i - 1]!, walk.vertices[i]!);
    counts.set(pair, (counts.get(pair) ?? 0) + 1);
  }
  for (const edge of graph.edges) {
    const pair = key(edge.u, edge.v);
    counts.set(pair, (counts.get(pair) ?? 0) - 1);
  }
  return { value: [...counts.values()].every((count) => count >= 0), facts: { vertices: walk.vertices, edgeCount: graph.edges.length } };
}

/** Structural propositions; weighted independent propositions are handled separately. */
export function evaluateStaticStatement(graph: Graph, check: StaticStatementCheck): StatementEvaluation {
  const compare = (expected: number | boolean, got: number | boolean): StatementEvaluation => ({ value: expected === got, facts: { expected, got } });
  switch (check.type) {
    case 'vertex_count': return compare(graph.vertices.length, check.value);
    case 'edge_count': return compare(graph.edges.length, check.value);
    case 'degree': return { ...compare(degree(graph, check.v), check.value), facts: { vertex: check.v, expected: degree(graph, check.v), got: check.value } };
    case 'degree_sum': return compare(Object.values(degrees(graph)).reduce((sum, d) => sum + d, 0), check.value);
    case 'odd_vertices': {
      const expected = oddVertices(graph);
      const actual = new Set(check.vertices);
      return { value: actual.size === check.vertices.length && actual.size === expected.length && expected.every((id) => actual.has(id)), facts: { expected, got: check.vertices } };
    }
    case 'connected': return compare(isConnected(graph), check.value);
    case 'euler_exists': {
      const analysis = analyzeEuler(graph);
      return { ...compare(check.kind === 'path' ? analysis.hasPath : analysis.hasCircuit, check.value), facts: { analysis, got: check.value } };
    }
    case 'hamilton_exists': {
      const solution = solveHamilton(graph, { want: check.kind });
      let reasonValid = true;
      const analysis = solution.analysis;
      switch (check.reason) {
        case 'dirac': case 'ore': reasonValid = check.value && analysis[check.reason].holds; break;
        case 'degree1': reasonValid = !check.value && check.kind === 'cycle' && Object.values(analysis.neighborCounts).includes(1); break;
        case 'forced_edges': {
          const rules = hamiltonCycleRules(graph);
          reasonValid = check.kind === 'cycle' && (check.value ? rules.status === 'cycle' : rules.status === 'impossible');
          break;
        }
        case 'found': reasonValid = check.value; break;
      }
      return { value: solution.answer.exists === check.value && reasonValid,
        facts: { expected: solution.answer.exists, got: check.value, reasonValid, analysis, answer: solution.answer } };
    }
    case 'theorem': {
      const analysis = analyzeHamilton(graph);
      return { ...compare(analysis[check.name].holds, check.holds), facts: { expected: analysis[check.name].holds, got: check.holds, applicable: analysis[check.name].applicable, neighborCounts: analysis.neighborCounts } };
    }
    case 'walk': {
      if (check.kind === 'tsp_tour' || check.kind === 'postman_tour') return checkTour(graph, check);
      const result = checkWalk(graph, { ...check, kind: check.kind });
      return { value: result.ok, facts: result.ok ? { walk: result.walk } : { ...result.facts, reason: result.reason } };
    }
    case 'shortest_length': {
      const solution = solveDijkstra(graph, { from: check.from, to: check.to });
      const expected = solution.answer.exists ? solution.answer.length : null;
      return { value: expected === check.value, facts: { from: check.from, to: check.to, expected, got: check.value, answer: solution.answer } };
    }
  }
}
