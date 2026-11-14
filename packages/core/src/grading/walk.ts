import type { ClaimBody, ProblemSpec } from '../types.js';
import { checkWalk } from '../graph/walk.js';
import { evaluateStatement } from '../solvers/statements.js';
import { compare, fail, pass } from './result.js';
import type { CheckResult } from './result.js';

export function checkWalkClaim(spec: ProblemSpec, claim: Extract<ClaimBody, { type: 'walk' }>): CheckResult {
  const { graph, task } = spec;
  const constraints: { start?: string; end?: string } = {};
  if ((task.type === 'path' || task.type === 'shortest_path') && claim.kind === 'path') {
    constraints.start = task.from;
    constraints.end = task.to;
  }
  if ((task.type === 'euler' && claim.kind.startsWith('euler_'))
    || (task.type === 'hamilton' && claim.kind.startsWith('hamilton_'))
    || (task.type === 'tsp' && claim.kind === 'tsp_tour')
    || (task.type === 'postman' && claim.kind === 'postman_tour')) {
    if (task.start !== undefined) constraints.start = task.start;
    if (task.type === 'hamilton' && task.end !== undefined) constraints.end = task.end;
  }
  const kind = claim.kind === 'tsp_tour' || claim.kind === 'postman_tour' ? 'path' : claim.kind;
  const result = checkWalk(graph, { ...claim, kind }, constraints);
  if (!result.ok) {
    const facts = { ...result.facts, reason: result.reason, ...(result.index === undefined ? {} : { index: result.index }) };
    return result.reason === 'edge_count_mismatch'
      ? { status: 'confirm', item: 'edgeIds', facts }
      : fail(result.errorCode, facts);
  }
  const closed = claim.vertices[0] === claim.vertices.at(-1);
  if ((claim.kind === 'tsp_tour' || claim.kind === 'postman_tour'
      || (task.type === 'euler' && task.want === 'circuit' && claim.kind === 'euler_path')
      || (task.type === 'hamilton' && task.want === 'cycle' && claim.kind === 'hamilton_path')) && !closed) {
    return fail('HIEU_SAI_DE', { reason: 'not_closed', vertices: claim.vertices });
  }
  if (claim.kind === 'tsp_tour' || claim.kind === 'postman_tour') {
    const evaluation = evaluateStatement(graph, claim);
    if (!evaluation.value) {
      const visits = graph.vertices.length === 1 ? claim.vertices : claim.vertices.slice(0, -1);
      return fail(claim.kind === 'tsp_tour' && new Set(visits).size < visits.length ? 'LAP' : 'BO_SOT', evaluation.facts);
    }
  }
  if (task.type === 'shortest_path' && claim.kind === 'path') {
    // Check this route, allowing every shortest route and every lightest parallel edge.
    const length = claim.vertices.slice(1).reduce((total, v, i) => total + Math.min(...graph.edges
      .filter((e) => (e.u === claim.vertices[i] && e.v === v) || (e.v === claim.vertices[i] && e.u === v))
      .filter((e) => claim.edgeIds === undefined || e.id === claim.edgeIds[i]).map((e) => e.w!)), 0);
    const check = evaluateStatement(graph, { type: 'shortest_length', from: task.from, to: task.to, value: length });
    return check.value ? pass(check.facts) : fail('KET_LUAN_KHONG_SUY_RA', check.facts);
  }
  // A Hamilton path is a different requested object from a Hamilton cycle.
  if (task.type === 'hamilton' && task.want === 'cycle' && claim.kind === 'hamilton_path') {
    return compare('hamilton_cycle', claim.kind, 'HIEU_SAI_DE');
  }
  return pass({ walk: result.walk });
}
