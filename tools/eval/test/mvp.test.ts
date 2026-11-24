import { describe, expect, it } from 'vitest';
import type { ProblemSpec } from '@mathtwin/core';
import { solve } from '@mathtwin/core';
import type { PreparedImage, ReadDraft, ReadOutcome } from '@mathtwin/reader';
import type { WorkLine, WorkTruth } from '@mathtwin/work';
import { createSession, sessionReducer } from '../../../apps/mobile/src/flow/sessionReducer.js';
import type { Session } from '../../../apps/mobile/src/flow/types.js';
import { alignMvpWork, deviationCause, replayMvpWork, strikeAudit, runMvpSample, simulateManualWorkRegion, simulateProblemConfirmation, truthWorkAnswers, formEditCount, noneModeFromStoredRow } from '../src/mvp.js';
import type { MvpInput } from '../src/mvp.js';
import { checkMvpSolution } from '../src/mvp-oracle.js';
import { deviationReason, graphEffort, mvpReport } from '../src/mvp-report.js';
import { compareAlignedWork } from '../src/work-alignment.js';
import { parseWork, vocabularyOf } from '@mathtwin/work';
import { loadCases } from '../src/dataset.js';
import { resolve } from 'node:path';

const spec: ProblemSpec = { graph: { directed: false, vertices: [{ id: 'A', label: 'A' }, { id: 'B', label: 'B' }], edges: [{ id: 'e1', u: 'A', v: 'B', w: 3 }] }, task: { type: 'elements' }, questionFormat: 'tu_luan' };
const outcome = (input = spec): ReadOutcome => ({ spec: structuredClone(input), graph: input.graph, graphUncertain: [], drafts: [], issues: [], usage: { engine: 'fake', passes: 1, latencyMs: 1 } });
const line = (text: string, index = 0, extra: Partial<WorkLine> = {}): WorkLine => ({ text, index, page: 0, region: 'solution', conf: 1, alternatives: [], box: [0, 700 + index * 50, 900, 740 + index * 50], ...extra });
function photoWork(lines: WorkLine[]): Session {
  let s = sessionReducer(createSession('test', '2026-11-18'), { type: 'manual_spec', spec });
  s = sessionReducer(s, { type: 'work_photos', photos: [{ id: 'p', page: 0, width: 20, height: 20 }] });
  return sessionReducer(s, { type: 'work_read', lines, ms: 1 });
}
const truth: WorkTruth = { claims: [{ type: 'vertex_count', value: 2, step: 1, raw: 'Có 2 đỉnh.' }], lineOf: { '1': [0] }, prose: [], expected: { verdict: 'DUNG' } };

describe('MVP evaluator, fake adapters only', () => {
  it('runs photo flow to result, persists pages and requires the real review gate', async () => {
    const image: PreparedImage = { width: 20, height: 20, pixels: new Uint8ClampedArray(1600).fill(255) };
    const draft: ReadDraft = { representation: 'figure', directed: false, vertices: [{ label: 'A', conf: 1, box: [100, 100, 150, 150] }, { label: 'B', conf: 1, box: [500, 100, 550, 150] }],
      edges: [{ u: 'A', v: 'B', w: 3, wAlternatives: [], name: null, conf: 1 }], statedFacts: { vertexCount: null, edgeCount: null, weightUnit: null }, question: null, unreadable: [] };
    const checkpoints: Session[] = [];
    const input: MvpInput = { id: 'fake', date: '2026-11-18', image, truth: spec, reference: [line('Có 2 đỉnh.')], workTruth: truth,
      region: [0, 600, 1000, 1000], figure: { version: 1, width: 20, height: 20, box: [0, 0, 20, 20], crossings: [],
        vertices: [{ id: 'A', label: 'A', center: [2.5, 2.5], labelBox: [1, 1, 4, 4], contours: [], style: '', gap: 0 },
          { id: 'B', label: 'B', center: [10.5, 2.5], labelBox: [9, 1, 12, 4], contours: [], style: '', gap: 0 }],
        edges: [{ id: 'e1', u: 'A', v: 'B', w: 3, name: null, polyline: [] }] },
      readers: { problem: async () => outcome(), text: { engine: 'fake', readLines: async () => ({ lines: [line('Có 3 đỉnh.')], usage: { engine: 'fake', passes: 1, latencyMs: 1 } }) }, figure: async () => draft },
      signal: new AbortController().signal, checkpoint: async (s) => { checkpoints.push(structuredClone(s)); } };
    const row = await runMvpSample(input);
    expect(row.session.stage).toBe('result'); expect(row.result.verdict).toBe('dung');
    expect(row.reviews).toBe(1); expect(row.session.reviewAcknowledged).toBe(true);
    expect(row.solutionCheck.correct).toBe(true); expect(row.comparison.verdictCorrect).toBe(true);
    expect(checkpoints.some((s) => s.problemPages?.length === 1)).toBe(true);
    expect(checkpoints.some((s) => s.workPages?.length === 1)).toBe(true);
    const md = mvpReport('2026-11-18', [row], 40, 'fake CPU');
    expect(md).toContain('chưa đủ căn cứ'); expect(md).toContain('1/40'); expect(md).toContain('real | 0');
    const failed = mvpReport('2026-11-18', [row], 2, 'fake CPU', [{ id: 'failed', error: 'timeout', expected: { verdict: 'SAI' } }]);
    expect(failed).toContain('1/2 (50.0%)');
    expect(failed).toContain('không có kết luận vì lỗi đọc 1');
    expect(failed).toContain('Bài SAI truth: 1');
    const deviated = { ...structuredClone(row), id: '07-name-must-not-matter', finalVerdict: 'KHONG_DU_CAN_CU' as const,
      strikes: { onMark: [1], offMark: [2] }, deviation: { cause: 'strike_off_mark' as const, lines: [2] } };
    const explained = mvpReport('2026-11-18', [deviated], 1, 'fake CPU');
    expect(explained).toContain('Tự đánh gạch dòng lời giải không có nét gạch (dòng 2)');
    expect(explained).toContain('1 dòng có nét gạch thật');
    expect(explained).toContain('1 dòng không có nét gạch nào');
    expect(explained).not.toMatch(/17\/144|17\/17/u);
    expect(row.workQuestions).toBe(1);
    const prior = structuredClone(row);
    prior.session.problemPages![0]!.figureMs = 123;
    prior.session.timings.figureDraft = 0; // Aggregate may be absent after restoring a checkpoint.
    const rescored = await runMvpSample({ ...input, prior, readers: { text: { engine: 'no-inference', readLines: async () => { throw new Error('inference'); } },
      problem: async () => { throw new Error('inference'); } } });
    expect(rescored.workQuestions).toBe(1); // The correction must be asked again from RAW OCR.
    expect(rescored.session.workPages?.[0]?.raw[0]?.text).toBe('Có 3 đỉnh.');
    expect(rescored.finalVerdict).toBe('DUNG');
    expect(rescored.timings.figureDraft).toBe(123);
  });
  it('uses the default none mode without calling the problem reader or storing its output', async () => {
    const image: PreparedImage = { width: 20, height: 20, pixels: new Uint8ClampedArray(1600).fill(255) };
    let problemCalls = 0;
    const row = await runMvpSample({ id: 'none', date: '2026-11-18', image, truth: spec, reference: [line('Có 2 đỉnh.')], workTruth: truth,
      region: [0, 600, 1000, 1000], figure: { version: 1, width: 20, height: 20, box: [0, 0, 20, 20], crossings: [],
        vertices: [{ id: 'A', label: 'A', center: [2.5, 2.5], labelBox: [1, 1, 4, 4], contours: [], style: '', gap: 0 },
          { id: 'B', label: 'B', center: [10.5, 2.5], labelBox: [9, 1, 12, 4], contours: [], style: '', gap: 0 }],
        edges: [{ id: 'e1', u: 'A', v: 'B', w: 3, name: null, polyline: [] }] },
      readers: { problem: async () => { problemCalls++; throw new Error('B must not run'); }, text: { engine: 'fake', readLines: async () => ({
        lines: [line('Có 2 đỉnh.')], usage: { engine: 'fake', passes: 1, latencyMs: 1 },
      }) }, figure: async () => ({ representation: 'figure', directed: false, vertices: [], edges: [], statedFacts: { vertexCount: null, edgeCount: null, weightUnit: null }, question: null, unreadable: [] }) },
      signal: new AbortController().signal, checkpoint: async () => {}, problemRead: 'none' });
    expect(problemCalls).toBe(0); expect(row.session.problemRead).toBeUndefined(); expect(row.session.problemPages).toBeUndefined();
    expect(row.session.specSource).toBe('manual'); expect(row.problemFormEdits).toBe(2); expect(row.timings.problemRead).toBe(0);
  });
  it('re-expresses a stored B row as the default none path without touching its work side', () => {
    const stored = { problemQuestions: 3, problemFormEdits: 0, machineMs: 100_000, workQuestions: 4, finalVerdict: 'SAI' as const,
      timings: { problemRead: 80_000, figureDraft: 500, workRead: 15_000 }, session: { spec } };
    const none = noneModeFromStoredRow(stored);
    expect(none.problemRead).toBe('none'); expect(none.problemQuestions).toBe(0);
    expect(none.problemFormEdits).toBe(formEditCount(spec) + 1); expect(none.timings.problemRead).toBe(0);
    expect(none.machineMs).toBe(20_000); expect(none.workQuestions).toBe(4); expect(none.finalVerdict).toBe('SAI');
    expect(none.timings.workRead).toBe(15_000); expect(none.timings.figureDraft).toBe(500);
    expect(() => noneModeFromStoredRow({ ...stored, session: {} })).toThrow();
  });
  it('counts manual graph entry for none rows and the D draft for B rows', () => {
    const effort = { draftOps: 5, manualOps: 12 };
    expect(graphEffort({ problemRead: 'none', effort } as unknown as Parameters<typeof graphEffort>[0])).toBe(12);
    expect(graphEffort({ problemRead: 'b', effort } as unknown as Parameters<typeof graphEffort>[0])).toBe(5);
    // Rows saved before the mode existed were B rows.
    expect(graphEffort({ effort } as unknown as Parameters<typeof graphEffort>[0])).toBe(5);
  });
  it('answers uncertain task fields but never fixes a confident task from truth', () => {
    const wrong: ProblemSpec = { ...spec, task: { type: 'degree' } };
    expect(simulateProblemConfirmation(outcome(wrong), spec).spec.task.type).toBe('degree');
    wrong.uncertain = [{ item: 'task.type', candidates: ['degree', 'elements'] }];
    const result = simulateProblemConfirmation(outcome(wrong), spec);
    expect(result.spec.task.type).toBe('elements'); expect(result.questions).toBe(1);
  });
  it('simulates a hand crop from aligned labels without admitting prompt or vertex rows', () => {
    const image: PreparedImage = { width: 20, height: 20, pixels: new Uint8ClampedArray(1600).fill(255) };
    const reference = [
      line('Bài 1. Hãy liệt kê.', 0, { region: 'question', box: [0, 40, 900, 80] }),
      line('A', 1, { region: 'figure', box: [40, 120, 80, 160] }),
      line('Có 2 đỉnh.', 2, { region: 'solution', box: [0, 700, 900, 740] }),
    ];
    const raw = [
      line('Bài 1. Hãy liệt kê.', 0, { region: 'question', box: [0, 40, 900, 80] }),
      line('A', 1, { region: 'question', box: [40, 120, 80, 160] }),
      // B gave this solution row a displaced box and the wrong region.
      line('Có 2 đỉnh.', 2, { region: 'question', box: [0, 100, 900, 140] }),
    ];
    const page = simulateManualWorkRegion(image, { page: 0, raw, lines: raw, ms: 1, needsRegion: true }, reference);
    expect(page.needsRegion).toBe(false);
    expect(page.lines.find((row) => row.text === 'Bài 1. Hãy liệt kê.')?.region).toBe('question');
    expect(page.lines.find((row) => row.text === 'A')?.region).toBe('figure');
    expect(page.lines.find((row) => row.text === 'Có 2 đỉnh.')?.region).toBe('solution');
    expect(page.raw.map((row) => row.region)).toEqual(['question', 'question', 'question']);
  });
  it('shares deviation wording with pair reports', () => {
    expect(deviationReason({ cause: 'strike_off_mark', lines: [2] }))
      .toEqual(['Tự đánh gạch dòng lời giải không có nét gạch (dòng 2)', 'sản phẩm (gạch xóa)']);
  });
  it('restores an OCR split once and retains the student mathematical error verbatim', () => {
    const observed = [line('Đồ thị có', 0), line('7 đỉnh.', 1)];
    const reference = [line('Đồ thị có 7 đỉnh.')];
    const answers = truthWorkAnswers([0], observed, reference, alignMvpWork(observed, reference));
    expect(answers).toEqual([{ line: 0, text: 'Đồ thị có 7 đỉnh.' }, { line: 1, skip: true }]);
    const mixed = [{ ...observed[0]!, region: 'figure' as const }, observed[1]!];
    expect(truthWorkAnswers([1], mixed, reference, alignMvpWork(mixed, reference)))
      .toEqual([{ line: 1, text: 'Đồ thị có 7 đỉnh.' }, { line: 0, skip: true }]);
  });
  it('cannot invent an entirely absent line during optimistic review', () => {
    const observed = [line('Có 2 đỉnh.')], reference = [...observed, line('Có 5 cạnh.', 1)];
    const replay = replayMvpWork(photoWork(observed), reference);
    expect(replay.session.workLines).toHaveLength(1); expect(replay.session.workGrade?.result.verdict).toBe('DUNG');
    const wrongTruth: WorkTruth = { claims: [...truth.claims, { type: 'edge_count', value: 5, step: 2, raw: 'Có 5 cạnh.' }],
      lineOf: { '1': [0], '2': [1] }, expected: { verdict: 'SAI', firstErrorStep: 2, errorCode: 'SAI_PHEP_TINH' } };
    const comparison = compareAlignedWork({ parsed: parseWork(replay.session.workLines, vocabularyOf(spec)), grade: replay.session.workGrade! }, wrongTruth, reference, replay.session.workLines, replay.alignment);
    expect(comparison.silentFalseCorrect).toBe(true);
  });
  it('answers a visible missing-ink placeholder by crop overlap, not by a hidden claim', () => {
    const reference = [line('Có 2 đỉnh.'), line('Có 5 cạnh.', 1)];
    const observed = [reference[0]!, line('', 1, { missing: true, conf: 0 })];
    const replay = replayMvpWork(photoWork(observed), reference);
    expect(replay.questions).toBeGreaterThan(0); expect(replay.session.workLines[1]?.text).toBe('Có 5 cạnh.');
    expect(replay.session.workGrade?.result.verdict).toBe('SAI');
  });
  it('reserves truth for checkpoint-like main rows and gives a visible placeholder priority over hidden OCR', () => {
    const reference = [line('Có 2 đỉnh.', 0, { box: [0, 560, 900, 584] }), line('Có 5 cạnh.', 1, { box: [0, 596, 900, 620] })];
    const observed = [line('Có 2 đỉnh.', 0), line('Có 5 cạnh.', 1, { region: 'question', box: [0, 596, 900, 620] }),
      line('', 2, { missing: true, conf: 0, box: [0, 596, 900, 620] })];
    const alignment = alignMvpWork(observed, reference);
    expect(truthWorkAnswers([2], observed, reference, alignment)).toContainEqual({ line: 2, text: 'Có 5 cạnh.' });
  });
  it('does not let a duplicated hidden checkpoint row consume text from a visible solution row', () => {
    const reference = [line('Có 2 đỉnh.', 0)];
    const observed = [line('Có 2 đỉnh.', 0), line('Có 2 đỉnh.', 1, { region: 'question' })];
    const answers = truthWorkAnswers([0], observed, reference, alignMvpWork(observed, reference));
    expect(answers).toContainEqual({ line: 0, text: 'Có 2 đỉnh.' });
  });
  it('dismisses cancellation ink mistaken for a missing line and clears uncertain strike evidence', () => {
    const reference = [line('Có 2 đỉnh.'), line('', 1, { struck: true })];
    const observed = [line('Có 2 đỉnh.', 0, { strikeScore: .5 }), line('', 1, { missing: true, conf: 0 })];
    const replay = replayMvpWork(photoWork(observed), reference);
    expect(replay.session.workGrade?.questions).toEqual([]);
    expect(replay.session.workGrade?.result.verdict).toBe('DUNG');
    expect(replay.session.workLines[1]?.missing).toBe(false);
    expect(replay.session.workLines[0]?.strikeScore).toBeUndefined();
  });
  it('repairs a high-confidence visible misread only at the review gate', () => {
    const replay = replayMvpWork(photoWork([line('Có 2 đỉnh.\nCó 1 cạnh.')]), [line('Có 2 đỉnh.\nCó 5 cạnh.')]);
    expect(replay.reviews).toBe(1); expect(replay.reviewEdits).toBe(1); expect(replay.session.workGrade?.result.verdict).toBe('SAI');
  });
  it('reviews misclassified rows that WorkScreen still renders in its main list', () => {
    const observed = [line('Có 2 đỉnh.'), line('Có 5 cạnh.', 1, { region: 'figure', box: [0, 0, 900, 30] })];
    const reference = observed.map((l) => ({ ...l, region: 'solution' as const }));
    const s = photoWork(observed);
    s.workPages = [{ page: 0, raw: observed, lines: observed, ms: 1, needsRegion: false, inspected: true, region: [0, 700, 1000, 1000] }];
    const replay = replayMvpWork(s, reference);
    expect(replay.reviewEdits).toBe(1); expect(replay.session.workGrade?.result.verdict).toBe('SAI');
  });
  it('does not repeatedly answer unsupported wording or acknowledge remaining questions', () => {
    const reference = [line('Lập luận chưa có trong từ vựng zzz.')];
    const replay = replayMvpWork(photoWork(reference), reference);
    expect(replay.questions).toBeLessThanOrEqual(1); expect(replay.session.reviewAcknowledged).toBe(false);
  });
  it('checks shortest distance and Euler edge identity independently', () => {
    const shortest: ProblemSpec = { ...spec, task: { type: 'shortest_path', from: 'A', to: 'B' } };
    const correct = solve(shortest);
    expect(checkMvpSolution(shortest, correct).correct).toBe(true);
    expect(checkMvpSolution(shortest, { ...correct, answer: { ...(correct.answer as Record<string, unknown>), length: 99 } }).correct).toBe(false);
    const euler: ProblemSpec = { ...spec, task: { type: 'euler', want: 'path' } };
    expect(checkMvpSolution(euler, solve(euler)).correct).toBe(true);
    expect(checkMvpSolution(euler, { answer: { exists: true, walk: { vertices: ['A'], edgeIds: [] } }, steps: [], notes: [] }).correct).toBe(false);
  });
  it('covers all ten synthetic-hw problem families with the independent solution oracle', async () => {
    const samples = await loadCases(resolve('testdata/images-synthetic-hw'));
    expect(samples).toHaveLength(40);
    for (const sample of samples) expect(checkMvpSolution(sample.truth, solve(sample.truth)), sample.id).toMatchObject({ correct: true });
  });
  it('audits automatic strikes against truth cancellation rows', () => {
    const reference = [line('Có 2 đỉnh.', 0), line('Có 3 đỉnh.', 1, { struck: true, box: [0, 800, 500, 830] })];
    const observed = [line('Có 2 đỉnh.', 0, { struck: true, strikeScore: 1, box: [0, 700, 900, 740] }),
      line('Có 3 đỉnh.', 1, { struck: true, strikeScore: 1, box: [0, 790, 900, 840] }), line('Kết luận', 2)];
    expect(strikeAudit(observed, reference)).toEqual({ onMark: [1], offMark: [0] });
  });
  it('derives the deviation cause from the session, not from the sample id', () => {
    const excluded = photoWork([line('Có 2 đỉnh.', 0, { region: 'question' })]);
    expect(deviationCause(excluded, [line('Có 2 đỉnh.', 0)], truth).cause).toBe('region_excluded');
    const struck = photoWork([line('Có 2 đỉnh.', 0, { struck: true, strikeScore: 1 })]);
    expect(deviationCause(struck, [line('Có 2 đỉnh.', 0)], truth)).toEqual({ cause: 'strike_off_mark', lines: [0] });
    const merged = photoWork([line('Có 2 đỉnh.', 0, { struck: true, strikeScore: 1 })]);
    expect(deviationCause(merged, [line('Có 2 đỉnh.', 0), line('', 1, { struck: true, box: [0, 705, 900, 735] })], truth).cause).toBe('strike_merged');
  });
});
