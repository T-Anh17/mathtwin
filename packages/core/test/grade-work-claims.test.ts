import { describe, expect, it } from 'vitest';
import { grade, validateSpec } from '../src/index.js';
import type { ClaimBody, ProblemSpec, StatementCheck } from '../src/index.js';
const spec: ProblemSpec = { graph: { directed: false,
  vertices: ['A', 'B', 'I'].map((id) => ({ id, label: id })),
  edges: [{ id: 'l', u: 'A', v: 'A' }, { id: 'a', u: 'A', v: 'B' }, { id: 'b', u: 'B', v: 'A' }] },
  task: { type: 'elements' }, questionFormat: 'tu_luan' };
const run = (body: ClaimBody, input = spec) => grade(input, [{ ...body, step: 1, raw: 'Bài làm.' }]);
describe('five work claims', () => {
  it.each<ClaimBody>([
    { type: 'vertex_list', vertices: ['I', 'B', 'A'] },
    { type: 'edge_list', edges: [{ u: 'B', v: 'A' }, { u: 'A', v: 'A' }, { u: 'A', v: 'B' }] },
    { type: 'loop_count', value: 1 }, { type: 'odd_count', value: 0 }, { type: 'component_count', value: 2 },
  ])('accepts $type with loops, parallel edges and isolation', (body) => expect(run(body).verdict).toBe('DUNG'));
  it.each<{ body: ClaimBody; code: string }>([
    { body: { type: 'vertex_list', vertices: ['A', 'B'] }, code: 'BO_SOT' },
    { body: { type: 'vertex_list', vertices: ['A', 'B', 'I', 'X'] }, code: 'SAI_PHEP_TINH' },
    { body: { type: 'vertex_list', vertices: ['A', 'B', 'I', 'A'] }, code: 'SAI_PHEP_TINH' },
    { body: { type: 'edge_list', edges: [{ u: 'A', v: 'B' }, { u: 'A', v: 'A' }] }, code: 'BO_SOT' },
    { body: { type: 'edge_list', edges: [{ u: 'A', v: 'I' }] }, code: 'CANH_KHONG_TON_TAI' },
    { body: { type: 'edge_list', edges: [{ u: 'X', v: 'A' }] }, code: 'CANH_KHONG_TON_TAI' },
    { body: { type: 'edge_list', edges: [...spec.graph.edges, { u: 'A', v: 'B' }] }, code: 'CANH_KHONG_TON_TAI' },
    { body: { type: 'loop_count', value: 0 }, code: 'SAI_PHEP_TINH' },
    { body: { type: 'odd_count', value: 2 }, code: 'SAI_PHEP_TINH' },
    { body: { type: 'component_count', value: 1 }, code: 'SAI_PHEP_TINH' },
  ])('rejects $body.type with $code', ({ body, code }) => {
    expect(run(body)).toMatchObject({ verdict: 'SAI', firstErrorStep: 1, errorCode: code });
    expect(run(body).message).not.toContain('undefined');
  });
  it('uses confidence and counterfactual uncertainty, never weights for structural counts', () => {
    const body: ClaimBody = { type: 'loop_count', value: 0 };
    expect(grade(spec, [{ ...body, step: 1, raw: 'Không có khuyên.', conf: 0.4 }]).verdict).toBe('CAN_XAC_NHAN');
    expect(run(body, { ...spec, uncertain: [{ item: 'l.v', candidates: ['B'] }] }).verdict).toBe('CAN_XAC_NHAN');
    expect(run({ type: 'odd_count', value: 2 }, { ...spec, uncertain: [{ item: 'l.v', candidates: ['B'] }] }).verdict).toBe('CAN_XAC_NHAN');
    expect(run({ type: 'component_count', value: 1 }, { ...spec, uncertain: [{ item: 'b.v', candidates: ['I'] }] }).verdict).toBe('CAN_XAC_NHAN');
    expect(run({ type: 'edge_list', edges: [{ u: 'A', v: 'B' }, { u: 'B', v: 'B' }, { u: 'B', v: 'A' }] }, { ...spec, uncertain: [{ item: 'l.u', candidates: ['B'] }, { item: 'l.v', candidates: ['B'] }] }).verdict).toBe('SAI');
    expect(run(body, { ...spec, uncertain: [{ item: 'l.w', candidates: [1, 9] }] }).verdict).toBe('SAI');
  });
  it('keeps the new claims outside StatementCheck at runtime and compile time', () => {
    // @ts-expect-error work-only claim is not a StatementCheck
    const check: StatementCheck = { type: 'loop_count', value: 1 };
    expect(validateSpec({ ...spec, task: { type: 'statements', items: [{ id: 'a', text: 'Một khuyên', check }] } }).ok).toBe(false);
  });
  it('accepts empty lists and counts on an empty graph', () => {
    const empty = { ...spec, graph: { directed: false as const, vertices: [], edges: [] } };
    for (const body of [{ type: 'vertex_list', vertices: [] }, { type: 'edge_list', edges: [] }, { type: 'loop_count', value: 0 }, { type: 'odd_count', value: 0 }, { type: 'component_count', value: 0 }] as ClaimBody[]) expect(run(body, empty).verdict).toBe('DUNG');
  });
});
