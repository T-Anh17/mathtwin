import type { ClaimBody, Graph, ProblemSpec } from '../types.js';
import { degrees, isSimpleGraph } from '../graph/basic.js';
import { validateSpec } from '../validate.js';
import { solveTsp } from '../solvers/tsp.js';
import { AlgorithmChecker } from './algorithms.js';
import { checkWalkClaim } from './walk.js';
import { compare, equal, fail, object, pass, skip } from './result.js';
import type { CheckResult } from './result.js';

function route(value: unknown): { vertices: string[]; edgeIds?: string[] } | null {
  if (!object(value) || !Array.isArray(value.vertices) || !value.vertices.every((v) => typeof v === 'string')) return null;
  if (value.edgeIds !== undefined && (!Array.isArray(value.edgeIds) || !value.edgeIds.every((v) => typeof v === 'string'))) return null;
  return { vertices: value.vertices as string[], ...(value.edgeIds === undefined ? {} : { edgeIds: value.edgeIds as string[] }) };
}

function scalarAnswer(spec: ProblemSpec, answer: unknown): unknown {
  if (!object(answer)) return answer;
  switch (spec.task.type) {
    case 'degree': {
      const values = object(answer.degrees) ? Object.values(answer.degrees) : [];
      return values.length === 1 ? values[0] : undefined;
    }
    case 'connectivity': return answer.connected;
    case 'path': case 'euler': case 'hamilton': case 'degree_sequence': return answer.exists;
    case 'shortest_path': case 'postman': return answer.exists ? answer.length : null;
    case 'tsp': {
      if (typeof answer.exists === 'boolean') return answer.exists ? answer.length : null;
      if (object(answer.optimal)) return answer.optimal.exists ? answer.optimal.length : null;
      if (Array.isArray(answer.nearestNeighbor) && answer.nearestNeighbor.length === 1) {
        const run: unknown = answer.nearestNeighbor[0];
        if (object(run) && object(run.answer)) return run.answer.exists ? run.answer.length : null;
      }
      return undefined;
    }
    case 'elements': case 'statements': return undefined;
  }
}

function ambiguousNearestAnswer(spec: ProblemSpec): boolean {
  return spec.task.type === 'tsp' && spec.task.method === 'nearest_neighbor'
    && solveTsp(spec.graph, spec.task).trace.some((step) => step.type === 'nearest_neighbor' && step.tied.length > 1);
}

/** Compare claims about an answer, with semantic checks for witnesses. */
export function checkFinalAnswer(spec: ProblemSpec, value: unknown, answer: unknown, nearestLength?: number): CheckResult {
  if (equal(value, answer)) return pass();
  if (!object(value)) {
    const expected = spec.task.type === 'tsp' && spec.task.method === 'nearest_neighbor' && nearestLength !== undefined
      ? nearestLength : scalarAnswer(spec, answer);
    if (typeof value === 'number' && value !== expected && nearestLength === undefined && ambiguousNearestAnswer(spec)) return skip('ambiguous_nearest_answer');
    return expected === undefined ? skip('answer_shape') : compare(expected, value, 'KET_LUAN_KHONG_SUY_RA');
  }
  if (spec.task.type === 'tsp' && value.optimal === undefined && value.nearestNeighbor === undefined && object(answer)) {
    if (spec.task.method !== 'nearest_neighbor' && object(answer.optimal)) answer = answer.optimal;
    else if (spec.task.method === 'nearest_neighbor' && Array.isArray(answer.nearestNeighbor)) {
      const start = spec.task.start;
      const run: unknown = answer.nearestNeighbor.find((run: unknown) => object(run) && run.start === start);
      if (object(run)) answer = run.answer;
    }
  }
  if (!object(answer)) return skip('answer_shape');
  if (spec.task.type === 'tsp' && spec.task.method === 'nearest_neighbor' && nearestLength !== undefined && typeof answer.exists === 'boolean') {
    answer = { ...answer, exists: true, length: nearestLength };
  }
  if (spec.task.type === 'tsp' && (value.optimal !== undefined || value.nearestNeighbor !== undefined)) {
    if (value.optimal !== undefined) {
      const checked = checkFinalAnswer({ ...spec, task: { ...spec.task, method: 'optimal' } }, value.optimal, answer);
      if (checked.status !== 'pass') return checked;
    }
    if (value.nearestNeighbor !== undefined) {
      if (!Array.isArray(value.nearestNeighbor)) return skip('answer_shape');
      const starts = new Set<string>();
      for (const run of value.nearestNeighbor as unknown[]) {
        if (!object(run) || typeof run.start !== 'string' || !Object.hasOwn(run, 'answer')) return skip('answer_shape');
        if (starts.has(run.start) || !spec.graph.vertices.some(({ id }) => id === run.start) || (spec.task.start !== undefined && run.start !== spec.task.start)) return fail('HIEU_SAI_DE', { start: run.start });
        starts.add(run.start);
        const checked = checkFinalAnswer({ ...spec, task: { type: 'tsp', start: run.start, method: 'nearest_neighbor' } }, run.answer, answer, spec.task.start === run.start ? nearestLength : undefined);
        if (checked.status !== 'pass') return checked;
      }
      const expectedCount = spec.task.start === undefined ? spec.graph.vertices.length : 1;
      if (starts.size !== expectedCount) return fail('BO_SOT', { expected: expectedCount, got: starts.size });
    }
    const rest = Object.fromEntries(Object.entries(value).filter(([key]) => !['optimal', 'nearestNeighbor'].includes(key)));
    return Object.keys(rest).length === 0 ? pass() : checkFinalAnswer(spec, rest, answer);
  }
  if (spec.task.type === 'degree_sequence' && value.exists === true && value.graph !== undefined) {
    const graph = value.graph as Graph;
    const validation = validateSpec({ graph, task: { type: 'elements' }, questionFormat: 'tu_luan' });
    if (!validation.ok) return fail('KET_LUAN_KHONG_SUY_RA', { reason: 'invalid_realization' });
    const actual = Object.values(degrees(graph));
    const expected = [...spec.task.sequence].sort((a, b) => a - b);
    if (!equal(actual.sort((a, b) => a - b), expected) || (spec.task.simple && !isSimpleGraph(graph))) return fail('KET_LUAN_KHONG_SUY_RA', { expected, got: actual });
    return pass();
  }
  if (value.walk !== undefined) {
    const walk = route(value.walk);
    if (walk === null) return skip('answer_shape');
    let kind: Extract<ClaimBody, { type: 'walk' }>['kind'];
    switch (spec.task.type) {
      case 'path': case 'shortest_path': kind = 'path'; break;
      case 'euler': kind = spec.task.want === 'circuit' ? 'euler_circuit' : 'euler_path'; break;
      case 'hamilton': kind = spec.task.want === 'cycle' ? 'hamilton_cycle' : 'hamilton_path'; break;
      case 'tsp': kind = 'tsp_tour'; break;
      case 'postman': kind = 'postman_tour'; break;
      default: return skip('answer_shape');
    }
    const checked = checkWalkClaim(spec, { type: 'walk', kind, ...walk });
    if (checked.status !== 'pass') return checked;
    if (value.exists === false) return fail('KET_LUAN_KHONG_SUY_RA', { got: value.exists, walk });
    if (spec.task.type === 'tsp' && spec.task.method === 'nearest_neighbor') {
      const checker = new AlgorithmChecker(spec, false);
      for (let i = 1; i < walk.vertices.length; i++) {
        const step = checker.check({ type: 'nn_step', from: walk.vertices[i - 1]!, to: walk.vertices[i]! });
        if (step.status !== 'pass') return step;
        if (walk.edgeIds !== undefined) {
          const edge = spec.graph.edges.find((e) => e.id === walk.edgeIds![i - 1])!;
          const expected = Math.min(...spec.graph.edges.filter((e) => (e.u === edge.u && e.v === edge.v) || (e.u === edge.v && e.v === edge.u)).map((e) => e.w!));
          if (edge.w !== expected) return fail('SAI_LUA_CHON', { edgeId: edge.id, expected, got: edge.w });
        }
      }
    }
    if (['shortest_path', 'postman', 'tsp'].includes(spec.task.type)) {
      let length = 0;
      for (let i = 1; i < walk.vertices.length; i++) {
        const edges = spec.graph.edges.filter((e) => (e.u === walk.vertices[i - 1] && e.v === walk.vertices[i]) || (e.v === walk.vertices[i - 1] && e.u === walk.vertices[i]));
        length += Math.min(...edges.filter((e) => walk.edgeIds === undefined || walk.edgeIds[i - 1] === e.id).map((e) => e.w!));
      }
      if (spec.task.type === 'postman' && walk.edgeIds === undefined) {
        // Cover each original parallel edge once, then use the cheapest for extras.
        const remaining = new Set(spec.graph.edges.map((e) => e.id));
        for (const edge of spec.graph.edges) {
          if (!remaining.has(edge.id)) continue;
          const group = spec.graph.edges.filter((e) => (e.u === edge.u && e.v === edge.v) || (e.u === edge.v && e.v === edge.u));
          const minimum = Math.min(...group.map((e) => e.w!));
          length += group.reduce((sum, e) => sum + e.w! - minimum, 0);
          group.forEach((e) => remaining.delete(e.id));
        }
      }
      if (value.length !== undefined && value.length !== length) return compare(length, value.length);
      if (spec.task.type !== 'tsp' || spec.task.method !== 'nearest_neighbor') {
        const checkedLength = compare(scalarAnswer(spec, answer), length, 'KET_LUAN_KHONG_SUY_RA');
        if (checkedLength.status !== 'pass') return checkedLength;
      }
    }
    // Other supplied fields still assert facts, even with a valid witness.
    const rest = Object.fromEntries(Object.entries(value).filter(([key]) => !['walk', 'length', 'exists', 'kind'].includes(key)));
    if (Object.keys(rest).length === 0) return pass();
    value = rest;
  }
  if (!object(value) || !object(answer)) return skip('answer_shape');
  const expectedAnswer = answer;
  const keys = Object.keys(value);
  if (keys.length === 0 || keys.some((key) => !Object.hasOwn(expectedAnswer, key))) return skip('answer_shape');
  if (typeof value.length === 'number' && value.length !== answer.length && nearestLength === undefined && ambiguousNearestAnswer(spec)) return skip('ambiguous_nearest_answer');
  const matches = keys.every((key) => {
    const got = value[key];
    const expected = expectedAnswer[key];
    if (Array.isArray(got) && Array.isArray(expected) && ['vertices', 'edges', 'loops', 'isolatedVertices', 'oddVertices'].includes(key)) {
      return got.length === new Set(got).size && got.length === expected.length && expected.every((v) => got.includes(v));
    }
    if (key === 'components' && Array.isArray(got) && Array.isArray(expected)) {
      const normalized = (groups: unknown[]): string[] => groups.map((group) => JSON.stringify(Array.isArray(group) ? [...group].sort() : group)).sort();
      return equal(normalized(got), normalized(expected));
    }
    return equal(got, expected);
  });
  return matches ? pass() : fail('KET_LUAN_KHONG_SUY_RA', { expected: answer, got: value });
}
