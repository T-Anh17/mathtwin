import type { ErrorCode, Graph, VertexId } from '../types.js';

export interface GraphWalk { vertices: VertexId[]; edgeIds: string[] }
export type WalkKind = 'path' | 'euler_path' | 'euler_circuit' | 'hamilton_path' | 'hamilton_cycle';
export interface WalkInput {
  kind: WalkKind;
  vertices: readonly VertexId[];
  edgeIds?: readonly string[];
}
export interface WalkConstraints { start?: VertexId; end?: VertexId }
export type WalkFailureReason =
  | 'empty_walk' | 'unknown_vertex' | 'edge_count_mismatch' | 'missing_edge'
  | 'repeated_edge' | 'repeated_vertex' | 'missing_edges' | 'missing_vertices'
  | 'not_closed' | 'wrong_start' | 'wrong_end' | 'cycle_too_short';
export type WalkCheckResult =
  | { ok: true; walk: GraphWalk }
  | { ok: false; errorCode: ErrorCode; reason: WalkFailureReason; index?: number; facts: Record<string, unknown> };

/** Check the supplied walk itself, independently of any solver's chosen answer. */
export function checkWalk(graph: Graph, input: WalkInput, constraints: WalkConstraints = {}): WalkCheckResult {
  const fail = (
    errorCode: ErrorCode, reason: WalkFailureReason, facts: Record<string, unknown>, index?: number,
  ): WalkCheckResult => ({ ok: false, errorCode, reason, facts, ...(index === undefined ? {} : { index }) });
  const euler = input.kind === 'euler_path' || input.kind === 'euler_circuit';
  const hamilton = input.kind === 'hamilton_path' || input.kind === 'hamilton_cycle';
  const closed = input.kind === 'euler_circuit' || input.kind === 'hamilton_cycle';
  const vertices = input.vertices;
  const expectedEdges = Math.max(0, vertices.length - 1);
  if (input.edgeIds !== undefined && input.edgeIds.length !== expectedEdges) {
    return fail('SAI_DIEU_KIEN', 'edge_count_mismatch', { expected: expectedEdges, got: input.edgeIds.length });
  }
  if (vertices.length === 0) {
    if (euler && graph.vertices.length === 0 && graph.edges.length === 0
      && constraints.start === undefined && constraints.end === undefined) {
      return { ok: true, walk: { vertices: [], edgeIds: [] } };
    }
    return fail('BO_SOT', 'empty_walk', { vertices: graph.vertices.map(({ id }) => id) });
  }

  const knownVertices = new Set(graph.vertices.map(({ id }) => id));
  const edgesById = new Map(graph.edges.map((edge) => [edge.id, edge]));
  const usedEdges = new Set<string>();
  const visited = new Set<VertexId>();
  const edgeIds: string[] = [];
  for (let i = 0; i < vertices.length; i++) {
    const v = vertices[i]!;
    if (!knownVertices.has(v)) return fail('CANH_KHONG_TON_TAI', 'unknown_vertex', { vertex: v }, i);
    if (i === 0 && constraints.start !== undefined && v !== constraints.start) {
      return fail('HIEU_SAI_DE', 'wrong_start', { expected: constraints.start, got: v }, i);
    }
    if (i > 0) {
      const u = vertices[i - 1]!;
      const matches = (edge: Graph['edges'][number]): boolean =>
        (edge.u === u && edge.v === v) || (edge.u === v && edge.v === u);
      const explicitId = input.edgeIds?.[i - 1];
      const edge = explicitId === undefined
        ? graph.edges.find((candidate) => matches(candidate) && (!euler || !usedEdges.has(candidate.id)))
        : edgesById.get(explicitId);
      if (edge === undefined || !matches(edge)) {
        if (explicitId === undefined && euler && graph.edges.some(matches)) {
          return fail('LAP', 'repeated_edge', { from: u, to: v }, i);
        }
        return fail('CANH_KHONG_TON_TAI', 'missing_edge', {
          from: u, to: v, ...(explicitId === undefined ? {} : { edgeId: explicitId }),
        }, i);
      }
      if (euler && usedEdges.has(edge.id)) return fail('LAP', 'repeated_edge', { edgeId: edge.id }, i);
      usedEdges.add(edge.id);
      edgeIds.push(edge.id);
    }
    const closesHamiltonCycle = input.kind === 'hamilton_cycle' && i === vertices.length - 1 && i > 0 && v === vertices[0];
    if (hamilton && visited.has(v) && !closesHamiltonCycle) {
      return fail('LAP', 'repeated_vertex', { vertex: v }, i);
    }
    visited.add(v);
  }
  const last = vertices[vertices.length - 1]!;
  if (constraints.end !== undefined && last !== constraints.end) {
    return fail('HIEU_SAI_DE', 'wrong_end', { expected: constraints.end, got: last }, vertices.length - 1);
  }
  if (closed && last !== vertices[0]) {
    return fail('HIEU_SAI_DE', 'not_closed', { start: vertices[0], end: last }, vertices.length - 1);
  }
  if (input.kind === 'hamilton_cycle' && visited.size < 3) {
    return fail('SAI_DIEU_KIEN', 'cycle_too_short', { minimum: 3, got: visited.size });
  }
  if (euler && usedEdges.size !== graph.edges.length) {
    return fail('BO_SOT', 'missing_edges', { edgeIds: graph.edges.filter(({ id }) => !usedEdges.has(id)).map(({ id }) => id) });
  }
  if (hamilton && visited.size !== graph.vertices.length) {
    return fail('BO_SOT', 'missing_vertices', { vertices: graph.vertices.filter(({ id }) => !visited.has(id)).map(({ id }) => id) });
  }
  return { ok: true, walk: { vertices: [...vertices], edgeIds } };
}
