import type { ClaimBody, ProblemSpec, StatementCheck } from '../types.js';
import { evaluateStatement } from '../solvers/statements.js';
import { checkWalkClaim } from './walk.js';
import { fail, pass, skip } from './result.js';
import type { CheckResult } from './result.js';
import { connectedComponents, oddVertices } from '../graph/basic.js';
import { compare } from './result.js';

export type StaticClaim = Exclude<ClaimBody, { type: 'dijkstra_init' | 'dijkstra_select' | 'dijkstra_label' | 'nn_step' | 'final_answer' | 'statement' | 'choice' }>;

export function checkStaticClaim(spec: ProblemSpec, claim: StaticClaim): CheckResult {
  if (claim.type === 'walk') return checkWalkClaim(spec, claim);
  switch (claim.type) {
    case 'loop_count': return compare(spec.graph.edges.filter((e) => e.u === e.v).length, claim.value, 'SAI_PHEP_TINH');
    case 'odd_count': return compare(oddVertices(spec.graph).length, claim.value, 'SAI_PHEP_TINH');
    case 'component_count': return compare(connectedComponents(spec.graph).length, claim.value, 'SAI_PHEP_TINH');
    case 'vertex_list': {
      const expected = spec.graph.vertices.map((v) => v.id);
      const extra = claim.vertices.filter((v, i) => !expected.includes(v) || claim.vertices.indexOf(v) !== i);
      const missing = expected.filter((v) => !claim.vertices.includes(v));
      const facts = { expected, got: claim.vertices, missing, extra };
      return extra.length ? fail('SAI_PHEP_TINH', facts) : missing.length ? fail('BO_SOT', facts) : pass(facts);
    }
    case 'edge_list': {
      const expected = spec.graph.edges.map(({ u, v }) => ({ u, v }));
      const remaining = [...expected];
      const extra: typeof expected = [];
      for (const edge of claim.edges) {
        const index = remaining.findIndex((e) => (e.u === edge.u && e.v === edge.v) || (e.u === edge.v && e.v === edge.u));
        if (index < 0) extra.push(edge); else remaining.splice(index, 1);
      }
      const facts = { expected, got: claim.edges, missing: remaining, extra };
      return extra.length ? fail('CANH_KHONG_TON_TAI', facts) : remaining.length ? fail('BO_SOT', facts) : pass(facts);
    }
  }
  const ids = new Set(spec.graph.vertices.map(({ id }) => id));
  const references = 'v' in claim ? [claim.v] : 'vertices' in claim ? claim.vertices : 'from' in claim ? [claim.from, claim.to] : [];
  const unknown = references.find((id) => !ids.has(id));
  if (unknown !== undefined) return fail('CANH_KHONG_TON_TAI', { vertex: unknown });
  if (['length', 'shortest_length', 'postman_duplicate'].includes(claim.type) && spec.graph.edges.some((e) => e.w === undefined)) return skip('missing_weights');
  const evaluation = evaluateStatement(spec.graph, claim as StatementCheck);
  if (evaluation.value === null) return skip('insufficient_data');
  if (evaluation.value) return pass(evaluation.facts);
  switch (claim.type) {
    case 'vertex_count': case 'edge_count': case 'degree': case 'degree_sum': case 'shortest_length': return fail('SAI_PHEP_TINH', evaluation.facts);
    case 'length': return fail(evaluation.facts.validWalk === false ? 'CANH_KHONG_TON_TAI' : 'SAI_PHEP_TINH', evaluation.facts);
    case 'hamilton_exists': case 'theorem': case 'euler_exists': case 'postman_duplicate': return fail('SAI_DIEU_KIEN', evaluation.facts);
    case 'odd_vertices': return fail('BO_SOT', evaluation.facts);
    case 'connected': return fail('KET_LUAN_KHONG_SUY_RA', evaluation.facts);
  }
}
