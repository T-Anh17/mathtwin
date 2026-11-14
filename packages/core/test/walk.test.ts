import { describe, expect, it } from 'vitest';
import { checkWalk } from '../src/index.js';
import type { ErrorCode, WalkConstraints, WalkFailureReason, WalkInput } from '../src/index.js';
import { graph } from './fixtures.js';
import { freezeGraph, fromPairs } from './traversal-fixtures.js';

describe('walk checking', () => {
  const triangle = fromPairs(['A', 'B', 'C'], [['A', 'B'], ['B', 'C'], ['C', 'A']]);
  const multi = fromPairs(['A', 'B', 'C'], [['A', 'A'], ['A', 'B'], ['B', 'A'], ['B', 'C']]);

  it.each(['euler_circuit', 'euler_path', 'hamilton_cycle'] as const)('accepts both directions of a %s', (kind) => {
    expect(checkWalk(triangle, { kind, vertices: ['A', 'B', 'C', 'A'] })).toEqual({
      ok: true, walk: { vertices: ['A', 'B', 'C', 'A'], edgeIds: ['e1', 'e2', 'e3'] },
    });
    expect(checkWalk(triangle, { kind, vertices: ['B', 'A', 'C', 'B'], edgeIds: ['e1', 'e3', 'e2'] }).ok).toBe(true);
  });

  it('accepts different Hamilton paths and a single-vertex path', () => {
    expect(checkWalk(triangle, { kind: 'hamilton_path', vertices: ['B', 'A', 'C'] }).ok).toBe(true);
    expect(checkWalk(graph(['A']), { kind: 'hamilton_path', vertices: ['A'] }).ok).toBe(true);
  });

  it('checks adjacency alone for an ordinary walk, allowing repeated edges and vertices', () => {
    expect(checkWalk(triangle, { kind: 'path', vertices: ['A', 'B', 'A'] })).toEqual({
      ok: true, walk: { vertices: ['A', 'B', 'A'], edgeIds: ['e1', 'e1'] },
    });
  });

  it('infers distinct parallel edge IDs for Euler and accepts explicitly named alternatives', () => {
    const vertices = ['B', 'A', 'A', 'B', 'C'];
    expect(checkWalk(multi, { kind: 'euler_path', vertices })).toEqual({
      ok: true, walk: { vertices, edgeIds: ['e2', 'e1', 'e3', 'e4'] },
    });
    expect(checkWalk(multi, { kind: 'euler_path', vertices, edgeIds: ['e3', 'e1', 'e2', 'e4'] }).ok).toBe(true);
  });

  it('checks the complete specified start and end constraints', () => {
    expect(checkWalk(triangle, { kind: 'hamilton_path', vertices: ['A', 'B', 'C'] }, { start: 'A', end: 'C' }).ok).toBe(true);
  });

  const failures: {
    name: string; input: WalkInput; reason: WalkFailureReason; code: ErrorCode;
    constraints?: WalkConstraints; index?: number;
  }[] = [
    { name: 'empty walk', input: { kind: 'path', vertices: [] }, reason: 'empty_walk', code: 'BO_SOT' },
    { name: 'unknown vertex', input: { kind: 'path', vertices: ['A', 'X'] }, reason: 'unknown_vertex', code: 'CANH_KHONG_TON_TAI', index: 1 },
    { name: 'missing loop', input: { kind: 'path', vertices: ['A', 'A'] }, reason: 'missing_edge', code: 'CANH_KHONG_TON_TAI', index: 1 },
    { name: 'unknown edge ID', input: { kind: 'path', vertices: ['A', 'B'], edgeIds: ['missing'] }, reason: 'missing_edge', code: 'CANH_KHONG_TON_TAI', index: 1 },
    { name: 'edge with wrong endpoints', input: { kind: 'path', vertices: ['A', 'B'], edgeIds: ['e2'] }, reason: 'missing_edge', code: 'CANH_KHONG_TON_TAI', index: 1 },
    { name: 'short edge ID list', input: { kind: 'path', vertices: ['A', 'B'], edgeIds: [] }, reason: 'edge_count_mismatch', code: 'SAI_DIEU_KIEN' },
    { name: 'long edge ID list', input: { kind: 'path', vertices: ['A', 'B'], edgeIds: ['e1', 'e2'] }, reason: 'edge_count_mismatch', code: 'SAI_DIEU_KIEN' },
    { name: 'repeated inferred edge', input: { kind: 'euler_path', vertices: ['A', 'B', 'A'] }, reason: 'repeated_edge', code: 'LAP', index: 2 },
    { name: 'repeated explicit edge', input: { kind: 'euler_path', vertices: ['A', 'B', 'A'], edgeIds: ['e1', 'e1'] }, reason: 'repeated_edge', code: 'LAP', index: 2 },
    { name: 'missing Euler edges', input: { kind: 'euler_path', vertices: ['A', 'B'] }, reason: 'missing_edges', code: 'BO_SOT' },
    { name: 'unclosed Euler circuit', input: { kind: 'euler_circuit', vertices: ['A', 'B', 'C'] }, reason: 'not_closed', code: 'HIEU_SAI_DE', index: 2 },
    { name: 'repeated Hamilton vertex', input: { kind: 'hamilton_path', vertices: ['A', 'B', 'A', 'C'] }, reason: 'repeated_vertex', code: 'LAP', index: 2 },
    { name: 'premature return to Hamilton start', input: { kind: 'hamilton_cycle', vertices: ['A', 'B', 'A', 'C', 'A'] }, reason: 'repeated_vertex', code: 'LAP', index: 2 },
    { name: 'closed Hamilton path', input: { kind: 'hamilton_path', vertices: ['A', 'B', 'C', 'A'] }, reason: 'repeated_vertex', code: 'LAP', index: 3 },
    { name: 'missing Hamilton vertex', input: { kind: 'hamilton_path', vertices: ['A', 'B'] }, reason: 'missing_vertices', code: 'BO_SOT' },
    { name: 'unclosed Hamilton cycle', input: { kind: 'hamilton_cycle', vertices: ['A', 'B', 'C'] }, reason: 'not_closed', code: 'HIEU_SAI_DE', index: 2 },
    { name: 'wrong start', input: { kind: 'path', vertices: ['A', 'B'] }, constraints: { start: 'C' }, reason: 'wrong_start', code: 'HIEU_SAI_DE', index: 0 },
    { name: 'wrong end', input: { kind: 'path', vertices: ['A', 'B'] }, constraints: { end: 'C' }, reason: 'wrong_end', code: 'HIEU_SAI_DE', index: 1 },
  ];
  it.each(failures)('reports $name', ({ input, reason, code, constraints, index }) => {
    const result = checkWalk(triangle, input, constraints);
    expect(result).toMatchObject({ ok: false, reason, errorCode: code });
    if (index !== undefined) expect(result).toHaveProperty('index', index);
  });

  it('reports the first local invalid transition and gives missing items as structured facts', () => {
    expect(checkWalk(triangle, { kind: 'euler_path', vertices: ['A', 'B', 'A', 'missing'] })).toMatchObject({ reason: 'repeated_edge', index: 2 });
    expect(checkWalk(triangle, { kind: 'euler_path', vertices: ['A', 'B'] })).toMatchObject({ facts: { edgeIds: ['e2', 'e3'] } });
    expect(checkWalk(triangle, { kind: 'hamilton_path', vertices: ['A', 'B'] })).toMatchObject({ facts: { vertices: ['C'] } });
  });

  it('rejects using one parallel edge twice even when another one is unused', () => {
    expect(checkWalk(multi, { kind: 'euler_path', vertices: ['B', 'A', 'A', 'B', 'C'], edgeIds: ['e2', 'e1', 'e2', 'e4'] }))
      .toMatchObject({ ok: false, errorCode: 'LAP', index: 3 });
  });

  it('rejects a short Hamilton cycle even when a loop or two parallel edges exist', () => {
    expect(checkWalk(fromPairs(['A'], [['A', 'A']]), { kind: 'hamilton_cycle', vertices: ['A', 'A'] })).toMatchObject({ reason: 'cycle_too_short' });
    expect(checkWalk(fromPairs(['A', 'B'], [['A', 'B'], ['A', 'B']]), { kind: 'hamilton_cycle', vertices: ['A', 'B', 'A'] }))
      .toMatchObject({ reason: 'cycle_too_short' });
  });

  it('requires Hamilton coverage of isolated vertices but ignores them for Euler', () => {
    const isolated = graph([...triangle.vertices.map(({ id }) => id), 'D'], triangle.edges);
    expect(checkWalk(isolated, { kind: 'hamilton_cycle', vertices: ['A', 'B', 'C', 'A'] })).toMatchObject({ reason: 'missing_vertices' });
    expect(checkWalk(isolated, { kind: 'euler_circuit', vertices: ['A', 'B', 'C', 'A'] }).ok).toBe(true);
  });

  it('checks zero-edge Euler walks consistently, including the graph with no vertices', () => {
    expect(checkWalk(graph([]), { kind: 'euler_circuit', vertices: [] })).toEqual({ ok: true, walk: { vertices: [], edgeIds: [] } });
    expect(checkWalk(graph(['A', 'B']), { kind: 'euler_path', vertices: ['B'] }).ok).toBe(true);
    expect(checkWalk(graph(['A']), { kind: 'euler_path', vertices: [] }).ok).toBe(false);
    expect(checkWalk(graph([]), { kind: 'hamilton_path', vertices: [] }).ok).toBe(false);
    expect(checkWalk(graph([]), { kind: 'euler_path', vertices: [] }, { start: 'A' }).ok).toBe(false);
  });

  it('handles prototype-like IDs and does not mutate input arrays or graph data', () => {
    const input = freezeGraph(graph(['__proto__', 'constructor'], [{ id: '__proto__', u: '__proto__', v: 'constructor' }]));
    const vertices = Object.freeze(['constructor', '__proto__']);
    const edgeIds = Object.freeze(['__proto__']);
    const result = checkWalk(input, { kind: 'euler_path', vertices, edgeIds });
    expect(result).toEqual({ ok: true, walk: { vertices: [...vertices], edgeIds: [...edgeIds] } });
    if (result.ok) expect(result.walk.vertices).not.toBe(vertices);
  });
});
