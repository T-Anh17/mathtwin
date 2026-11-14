import type { Claim, ClaimBody, Graph, ProblemSpec } from '../types.js';
import { advanceDijkstra, createDijkstraState, dijkstraCandidates } from '../solvers/dijkstra.js';
import type { DijkstraState, DijkstraUpdate } from '../solvers/dijkstra.js';
import { weightedGraph, floydWarshall } from '../graph/weighted.js';
import { oddVertices } from '../graph/basic.js';
import { minimumMatching } from '../graph/matching.js';
import { checkStaticClaim } from './static.js';
import { compare, fail, pass, skip } from './result.js';
import type { CheckResult } from './result.js';

export type AlgorithmClaim = Extract<ClaimBody, { type: 'dijkstra_init' | 'dijkstra_select' | 'dijkstra_label' | 'nn_step' | 'postman_duplicate' }>;

/** Private state for one grading run; student numbers never become mathematical state. */
export class AlgorithmChecker {
  private dijkstra: DijkstraState | undefined;
  private updates: DijkstraUpdate[] = [];
  private writtenLabels = new Set<string>();
  private nn: { start: string; current: string; visited: Set<string>; closed: boolean; length: number } | undefined;
  private paired = new Set<string>();
  private duplicateLength = 0;
  constructor(private spec: ProblemSpec, private confused: boolean) {
    if (spec.task.type === 'shortest_path') this.dijkstra = createDijkstraState(spec.graph, spec.task.from, spec.task.to);
  }

  check(claim: AlgorithmClaim): CheckResult {
    if (this.spec.graph.edges.some((e) => e.w === undefined)) return skip('missing_weights');
    switch (claim.type) {
      case 'dijkstra_init': return this.init(claim);
      case 'dijkstra_select': return this.select(claim);
      case 'dijkstra_label': return this.label(claim);
      case 'nn_step': return this.nearest(claim);
      case 'postman_duplicate': return this.duplicate(claim);
    }
  }

  nearestLength(): number | undefined {
    return this.spec.task.type === 'tsp' && this.spec.task.start !== undefined && this.nn?.closed ? this.nn.length : undefined;
  }

  private init(claim: Extract<AlgorithmClaim, { type: 'dijkstra_init' }>): CheckResult {
    const source = this.spec.task.type === 'shortest_path' ? this.spec.task.from : claim.source;
    if (!this.spec.graph.vertices.some(({ id }) => id === source)) return fail('CANH_KHONG_TON_TAI', { vertex: source });
    if (this.dijkstra !== undefined && this.dijkstra.settled.length > 0) return fail('SAI_DIEU_KIEN', { source, settled: this.dijkstra.settled });
    this.dijkstra = createDijkstraState(this.spec.graph, source, this.spec.task.type === 'shortest_path' ? this.spec.task.to : undefined);
    this.updates = [];
    this.writtenLabels.clear();
    return compare(source, claim.source, 'HIEU_SAI_DE');
  }

  private select(claim: Extract<AlgorithmClaim, { type: 'dijkstra_select' }>): CheckResult {
    if (this.dijkstra === undefined) return skip('missing_source');
    const candidates = dijkstraCandidates(this.spec.graph, this.dijkstra);
    const missing = this.writtenLabels.size === 0 ? [] : this.updates.filter((u) => u.old !== u.new && !this.writtenLabels.has(u.v)).map((u) => u.v);
    const chosen = candidates.includes(claim.v) ? claim.v : candidates[0];
    const facts = { expected: candidates, got: claim.v, labels: { ...this.dijkstra.labels }, settled: [...this.dijkstra.settled] };
    if (chosen !== undefined) {
      const next = advanceDijkstra(this.spec.graph, this.dijkstra, chosen);
      this.dijkstra = next.state;
      this.updates = next.trace.updates;
      this.writtenLabels.clear();
    }
    if (missing.length > 0) return fail('BO_SOT', { ...facts, vertices: missing });
    return candidates.includes(claim.v) ? pass(facts) : fail(this.confused ? 'NHAM_THUAT_TOAN' : 'SAI_LUA_CHON', facts);
  }

  private label(claim: Extract<AlgorithmClaim, { type: 'dijkstra_label' }>): CheckResult {
    if (this.dijkstra === undefined) return skip('missing_source');
    if (!Object.hasOwn(this.dijkstra.labels, claim.v)) return fail('CANH_KHONG_TON_TAI', { vertex: claim.v });
    const expected = this.dijkstra.labels[claim.v]!;
    const update = this.updates.find((u) => u.v === claim.v);
    if (update !== undefined) this.writtenLabels.add(claim.v);
    const facts = { vertex: claim.v, expected, got: claim.value, ...(update === undefined ? {} : { ...update, expected, got: claim.value }) };
    // Distinguish the addition from the min operation before checking a predecessor.
    // An arithmetic error through the current pivot is not a traceback error.
    if (update !== undefined && (claim.via === undefined || claim.via === update.via) && claim.value !== expected) {
      const arithmetic = {
        ...facts, edge: `${update.via}-${claim.v}`, nVia: update.viaDistance,
        [`n${update.via}`]: update.viaDistance, w: update.weight,
        expected: claim.value === update.candidate ? expected : update.candidate,
        reason: claim.value === update.candidate ? 'minimum_not_taken' : 'incorrect_candidate',
      };
      return fail('SAI_PHEP_TINH', arithmetic);
    }
    if (claim.via !== undefined) {
      const edges = this.spec.graph.edges.filter((e) => (e.u === claim.via && e.v === claim.v) || (e.v === claim.via && e.u === claim.v));
      if (edges.length === 0) return fail('CANH_KHONG_TON_TAI', { ...facts, via: claim.via });
      const viaDistance = this.dijkstra.labels[claim.via];
      if (claim.v === this.dijkstra.source || claim.v === claim.via || !this.dijkstra.settled.includes(claim.via)
        || viaDistance === null || viaDistance === undefined || !edges.some((e) => viaDistance + e.w! === expected)) {
        return fail('KET_LUAN_KHONG_SUY_RA', { ...facts, via: claim.via });
      }
    }
    if (expected === claim.value) return pass(facts);
    return fail(update !== undefined && update.old !== update.new && claim.value === update.old ? 'BO_SOT' : 'SAI_PHEP_TINH', facts);
  }

  private nearest(claim: Extract<AlgorithmClaim, { type: 'nn_step' }>): CheckResult {
    const input = weightedGraph(this.spec.graph);
    if (!input.indices.has(claim.from) || !input.indices.has(claim.to)) return fail('CANH_KHONG_TON_TAI', { from: claim.from, to: claim.to });
    const wrongStart = this.nn === undefined && this.spec.task.type === 'tsp' && this.spec.task.start !== undefined && claim.from !== this.spec.task.start;
    if (this.nn === undefined || (this.nn.closed && this.spec.task.type === 'tsp' && this.spec.task.start === undefined)) {
      const start = this.spec.task.type === 'tsp' ? this.spec.task.start ?? claim.from : claim.from;
      this.nn = { start, current: start, visited: new Set([start]), closed: false, length: 0 };
    }
    const state = this.nn;
    const u = input.indices.get(state.current)!;
    let minimum = Infinity;
    let candidates: string[] = [];
    if (!state.closed && input.ids.length > 1) {
      if (state.visited.size === input.ids.length) {
        if (Number.isFinite(input.weights[u]![input.indices.get(state.start)!]!)) candidates = [state.start];
      } else {
        for (let v = 0; v < input.ids.length; v++) {
          const id = input.ids[v]!;
          if (state.visited.has(id)) continue;
          const w = input.weights[u]![v]!;
          if (w < minimum) { minimum = w; candidates = [id]; }
          else if (w === minimum && Number.isFinite(w)) candidates.push(id);
        }
      }
    }
    const valid = claim.from === state.current && candidates.includes(claim.to);
    const weight = (v: string): number | null => {
      const value = input.weights[u]![input.indices.get(v)!]!;
      return Number.isFinite(value) ? value : null;
    };
    const facts = { from: state.current, gotFrom: claim.from, expected: candidates, got: claim.to, visited: [...state.visited],
      minimumWeight: candidates[0] === undefined ? null : weight(candidates[0]), chosenWeight: weight(claim.to) };
    const next = valid ? claim.to : candidates[0];
    if (next !== undefined) {
      state.length += input.weights[u]![input.indices.get(next)!]!;
      state.closed = state.visited.size === input.ids.length;
      state.current = next;
      state.visited.add(next);
    }
    if (wrongStart) return fail('HIEU_SAI_DE', { expected: state.start, got: claim.from, reason: 'wrong_start' });
    return valid ? pass(facts) : fail('SAI_LUA_CHON', facts);
  }

  private duplicate(claim: Extract<AlgorithmClaim, { type: 'postman_duplicate' }>): CheckResult {
    const check = checkStaticClaim(this.spec, claim);
    if (check.status !== 'pass') return check;
    const from = claim.vertices[0]!;
    const to = claim.vertices.at(-1)!;
    if (this.paired.has(from) || this.paired.has(to)) return fail('LAP', { from, to, paired: [...this.paired] });
    const input = weightedGraph(this.spec.graph);
    const shortest = floydWarshall(input);
    const odd = oddVertices(this.spec.graph);
    const cost = (members: string[]): number => minimumMatching(members.map((u) => members.map((v) => shortest.distances[input.indices.get(u)!]![input.indices.get(v)!]!))).length;
    const length = shortest.distances[input.indices.get(from)!]![input.indices.get(to)!]!;
    const remaining = odd.filter((v) => !this.paired.has(v) && v !== from && v !== to);
    const expected = cost(odd);
    const got = this.duplicateLength + length + cost(remaining);
    if (expected !== got) return fail('SAI_LUA_CHON', { expected, got, from, to });
    this.paired.add(from);
    this.paired.add(to);
    this.duplicateLength += length;
    return pass({ from, to, length, remaining });
  }
}

/** Recognize a whole selection sequence, accepting ties in Prim and NN too. */
export function detectsAlgorithmConfusion(graph: Graph, claims: readonly Claim[], source: string): boolean {
  return algorithmConfusionModes(graph, claims, source).length > 0;
}

export function algorithmConfusionModes(graph: Graph, claims: readonly Claim[], source: string): string[] {
  const selected = claims.filter((c) => c.type === 'dijkstra_select').map((c) => c.v);
  if (selected.length < 2 || selected[0] !== source || graph.edges.some((e) => e.w === undefined)) return [];
  const input = weightedGraph(graph);
  const matches = (mode: 'prim' | 'nn'): boolean => {
    const visited = new Set([source]);
    let last = source;
    for (const v of selected.slice(1)) {
      if (visited.has(v) || !input.indices.has(v)) return false;
      const costs = input.ids.filter((id) => !visited.has(id)).map((id) => ({ id, cost: Math.min(...[...(mode === 'nn' ? [last] : visited)]
        .map((u) => input.weights[input.indices.get(u)!]![input.indices.get(id)!]!)) }));
      const minimum = Math.min(...costs.map((c) => c.cost));
      if (!Number.isFinite(minimum) || !costs.some((c) => c.id === v && c.cost === minimum)) return false;
      visited.add(v);
      last = v;
    }
    return true;
  };
  return (['prim', 'nn'] as const).filter(matches);
}
