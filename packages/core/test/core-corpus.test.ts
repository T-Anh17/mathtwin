/// <reference types="vite/client" />
import { describe, expect, it } from 'vitest';
import { grade, solve, validateSpec } from '../src/index.js';
import type { Claim, ErrorCode, GradeResult, ProblemSpec } from '../src/index.js';

interface ExpectedGrade {
  verdict: GradeResult['verdict'];
  firstErrorStep: number | null;
  errorCode: ErrorCode | null;
  facts?: Record<string, unknown>;
}
interface Expected {
  description: string;
  grade?: ExpectedGrade;
  solutionAnswer?: Record<string, unknown>;
}

// Vite is already provided by Vitest. Raw imports preserve JSON nulls and let
// this test discover every fixture without adding Node types or dependencies.
const documents = import.meta.glob<string>('../../../testdata/core/*/*.json', {
  eager: true, query: '?raw', import: 'default',
});
const directories = new Map<string, Map<string, string>>();
for (const [path, contents] of Object.entries(documents)) {
  const parts = path.split('/');
  const id = parts.at(-2)!;
  const files = directories.get(id) ?? new Map<string, string>();
  files.set(parts.at(-1)!, contents);
  directories.set(id, files);
}
const fixtures = [...directories.keys()].sort()
  .map((id) => {
    const files = directories.get(id)!;
    function readJson<T>(name: string): T {
      const contents = files.get(name);
      if (contents === undefined) throw new Error(`Missing ${id}/${name}`);
      return JSON.parse(contents) as T;
    }
    return {
      id,
      files: [...files.keys()].sort(),
      spec: readJson<ProblemSpec>('spec.json'),
      claims: readJson<Claim[]>('claims.json'),
      expected: readJson<Expected>('expected.json'),
    };
  });

const errorCodes: ErrorCode[] = [
  'SAI_PHEP_TINH', 'SAI_DIEU_KIEN', 'BO_SOT', 'CANH_KHONG_TON_TAI', 'LAP',
  'NHAM_THUAT_TOAN', 'SAI_LUA_CHON', 'KET_LUAN_KHONG_SUY_RA', 'HIEU_SAI_DE',
];
function family(spec: ProblemSpec): string {
  switch (spec.task.type) {
    case 'degree_sequence': return 'degree';
    case 'path': case 'connectivity': return 'path_connectivity';
    default: return spec.task.type;
  }
}
function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

describe('independent JSON corpus (testdata/core)', () => {
  it('retains the required coverage and a small, explicit oracle contract', () => {
    expect(fixtures.length).toBeGreaterThanOrEqual(40);
    expect(new Set(fixtures.map(({ spec }) => family(spec)))).toEqual(new Set([
      'elements', 'degree', 'path_connectivity', 'euler', 'hamilton', 'shortest_path', 'tsp', 'postman', 'statements',
    ]));
    expect(new Set(fixtures.map(({ spec }) => spec.questionFormat))).toEqual(new Set([
      'tu_luan', 'trac_nghiem', 'dung_sai', 'tra_loi_ngan',
    ]));
    expect(new Set(fixtures.flatMap(({ expected }) => expected.grade ? [expected.grade.verdict] : []))).toEqual(new Set([
      'DUNG', 'SAI', 'CAN_XAC_NHAN', 'KHONG_DU_CAN_CU',
    ]));
    for (const code of errorCodes) {
      expect(fixtures.filter(({ expected }) => expected.grade?.verdict === 'SAI' && expected.grade.errorCode === code).length, code)
        .toBeGreaterThanOrEqual(3);
    }
    // Keep the required difficult cases when the corpus is edited later.
    const requiredCases = [
      '04-degree-sequence-simple-impossible', '05-degree-sequence-multigraph',
      '06-path-alternative', '08-euler-reverse-circuit', '09-euler-loop-parallel',
      '10-hamilton-reverse-cycle', '11-hamilton-line-path-only', '12-dijkstra-tied-order',
      '13-tsp-tied-student-tour', '14-postman-alternative-matching', '15-postman-even-start',
      '16-postman-all-even', '17-answer-only-correct', '44-conclusion-answer-only-wrong',
      '48-confirm-low-confidence', '49-confirm-uncertain-weight', '50-confirm-edge-id-count',
      '51-insufficient-empty-work', '55-solve-konigsberg-no-euler', '56-solve-hamilton-no-cycle',
      '57-solve-dijkstra-unreachable', '58-solve-tsp-greedy-not-optimal',
      '59-solve-postman-two-odd', '60-solve-postman-four-odd',
    ];
    const ids = new Set(fixtures.map(({ id }) => id));
    for (const id of requiredCases) expect(ids.has(id), id).toBe(true);
    for (const { id, files, spec, claims, expected } of fixtures) {
      expect(files, id).toEqual(['claims.json', 'expected.json', 'spec.json']);
      expect(Object.keys(expected).every((key) => ['description', 'grade', 'solutionAnswer'].includes(key)), id).toBe(true);
      expect(expected.description.length, id).toBeGreaterThan(30);
      expect(Boolean(expected.grade) !== Boolean(expected.solutionAnswer), id).toBe(true);
      expect(Array.isArray(claims), id).toBe(true);
      expect(claims.every((claim) => Number.isInteger(claim.step) && claim.step > 0 && claim.raw.trim().length > 0), id).toBe(true);
      expect(new Set(claims.map((claim) => claim.step)).size, id).toBe(claims.length);
      if (expected.grade) {
        const oracle = expected.grade;
        expect(Object.keys(oracle).every((key) => ['verdict', 'firstErrorStep', 'errorCode', 'facts'].includes(key)), id).toBe(true);
        expect(oracle.firstErrorStep === null || claims.some((claim) => claim.step === oracle.firstErrorStep), id).toBe(true);
        if (oracle.verdict === 'SAI' || oracle.verdict === 'CAN_XAC_NHAN') {
          expect(oracle.firstErrorStep, id).toBeTypeOf('number');
          expect(Object.keys(oracle.facts ?? {}).length, id).toBeGreaterThan(0);
        } else expect(oracle.firstErrorStep, id).toBeNull();
        if (oracle.verdict === 'SAI') expect(errorCodes, id).toContain(oracle.errorCode);
        else expect(oracle.errorCode, id).toBeNull();
      } else {
        expect(claims, id).toEqual([]);
        expect(Object.keys(expected.solutionAnswer ?? {}).length, id).toBeGreaterThan(0);
      }
      expect(validateSpec(spec), id).toEqual({ ok: true, errors: [] });
    }
  });

  it.each(fixtures)('$id — $expected.description', ({ spec, claims, expected }) => {
    expect(validateSpec(spec)).toEqual({ ok: true, errors: [] });
    if (expected.grade) {
      const actual = grade(spec, claims);
      const { facts, ...oracle } = expected.grade;
      expect({
        verdict: actual.verdict,
        firstErrorStep: actual.firstErrorStep ?? null,
        errorCode: actual.errorCode ?? null,
      }).toEqual(oracle);
      if (facts) expect(actual.facts).toMatchObject(facts);
      // Check the required caveat without copying any generated prose to JSON.
      if (claims.length > 0 && claims.every((claim) => claim.type === 'final_answer')) {
        expect(actual.notes.some((note) => note.toLocaleLowerCase('vi').includes('không có bước giải để kiểm tra'))).toBe(true);
      }
      if (actual.verdict === 'CAN_XAC_NHAN') {
        expect(actual.needsConfirmation?.some((item) => item.step === expected.grade?.firstErrorStep)).toBe(true);
      }
    } else {
      const answer = solve(spec).answer;
      expect(answer).toMatchObject(expected.solutionAnswer!);
      // Do not pin one particular realization of a degree sequence. Count its
      // incidences directly here, independently of the core degree functions.
      if (spec.task.type === 'degree_sequence' && record(answer) && answer.exists === true) {
        expect(record(answer.graph)).toBe(true);
        const graph = answer.graph as ProblemSpec['graph'];
        expect(validateSpec({ graph, task: { type: 'elements' }, questionFormat: 'tu_luan' }).ok).toBe(true);
        const actualDegrees = graph.vertices.map(({ id }) => graph.edges.reduce((sum, edge) => sum + Number(edge.u === id) + Number(edge.v === id), 0));
        expect(actualDegrees.sort((a, b) => a - b)).toEqual([...spec.task.sequence].sort((a, b) => a - b));
        if (spec.task.simple) {
          expect(graph.edges.every((edge) => edge.u !== edge.v)).toBe(true);
          const pairs = graph.edges.map((edge) => JSON.stringify([edge.u, edge.v].sort()));
          expect(new Set(pairs).size).toBe(pairs.length);
        }
      }
    }
  });
});
