import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { ProblemSpec } from '@mathtwin/core';
import type { ReadOutcome } from '@mathtwin/reader';
import type { WorkLine } from '@mathtwin/work';
import { createSession, sessionReducer as reduce } from '../src/flow/sessionReducer.js';
import type { Session, SessionEvent, Stage } from '../src/flow/types.js';
import { SessionScreen } from '../src/SessionScreen.js';
import { sessionVi } from '../src/flow/messages.vi.js';

const spec: ProblemSpec = { graph: { directed: false, vertices: [{ id: 'A', label: 'A' }, { id: 'B', label: 'B' }],
  edges: [{ id: 'e1', u: 'A', v: 'B' }] }, task: { type: 'elements' }, questionFormat: 'tu_luan' };
const outcome: ReadOutcome = { spec, graph: spec.graph, graphUncertain: [], issues: [], drafts: [],
  usage: { passes: 1, latencyMs: 10, engine: 'fake' } };
const photo = { id: 'p1', width: 100, height: 200, page: 0 };
const workPhoto = { ...photo, id: 'w1' };
const line = (text = 'Đồ thị có 2 đỉnh.', conf = 1): WorkLine => ({ text, conf, alternatives: [], index: 0, page: 0, region: 'solution' });
const fresh = () => createSession('s1', '2026-11-18T00:00:00Z');
function stages(): Record<Stage, Session> {
  const problem_capture = fresh();
  const problem_reading = reduce(problem_capture, { type: 'problem_photos', photos: [photo] });
  const problem_confirm = reduce(problem_reading, { type: 'problem_read', outcome, ms: 10 });
  const solution = reduce(problem_confirm, { type: 'spec_confirmed', spec });
  const work_capture = reduce(solution, { type: 'retake', target: 'work' });
  const work_reading = reduce(work_capture, { type: 'work_photos', photos: [workPhoto] });
  const work_review = reduce(work_reading, { type: 'work_read', lines: [line()], ms: 20 });
  const result = reduce(work_review, { type: 'review_ack' });
  return { problem_capture, problem_reading, problem_confirm, solution, work_capture, work_reading, work_review, result };
}
function freeze(value: unknown): void {
  if (value && typeof value === 'object') { Object.freeze(value); for (const child of Object.values(value)) freeze(child); }
}

describe('4.1 session reducer', () => {
  it('follows the full photo flow; a correct photo requires review_ack', () => {
    for (const [stage, session] of Object.entries(stages())) expect(session.stage).toBe(stage);
    const all = stages();
    expect(all.problem_confirm.solution).toBeUndefined(); expect(all.problem_confirm.workGrade).toBeUndefined();
    expect(all.solution.solution).toBeDefined();
    expect(all.work_review.workGrade?.result.verdict).toBe('CAN_XAC_NHAN');
    expect(all.work_review.reviewAcknowledged).toBe(false);
    expect(all.result.workGrade?.result.verdict).toBe('DUNG'); expect(all.result.reviewAcknowledged).toBe(true);
    expect(all.result.timings).toEqual({ problemRead: 10, workRead: 20 });
    expect(all.result.readerId).toBe('fake');
  });
  it('follows manual entry with no photo review and regrades each edited line', () => {
    const confirmed = reduce(fresh(), { type: 'manual_spec', spec });
    expect(confirmed.stage).toBe('solution'); expect(confirmed.specSource).toBe('manual');
    const correct = reduce(confirmed, { type: 'manual_work', lines: [line().text] });
    expect(correct.stage).toBe('result'); expect(correct.workSource).toBe('manual');
    expect(correct.workGrade?.result.verdict).toBe('DUNG');
    const wrong = reduce(correct, { type: 'work_answer', answer: { line: 0, text: 'Đồ thị có 9 đỉnh.' } });
    expect(wrong.workGrade?.result.verdict).toBe('SAI');
    expect(wrong.workGrade?.firstErrorLines).toEqual([0]);
  });
  it('blocks solving and grading before confirmation, including invalid/unresolved specs', () => {
    const events: SessionEvent[] = [
      { type: 'work_photos', photos: [workPhoto] }, { type: 'work_read', lines: [line()], ms: 1 },
      { type: 'manual_work', lines: [line().text] }, { type: 'review_ack' }, { type: 'spec_confirmed', spec },
      { type: 'manual_spec', spec: { ...spec, uncertain: [{ item: 'graph', candidates: [] }] } },
      { type: 'manual_spec', spec: { ...spec, graph: { ...spec.graph, edges: [{ id: 'bad', u: 'A', v: 'missing' }] } } },
      { type: 'problem_read', outcome, ms: 1 }, { type: 'work_answer', answer: { line: 0, skip: true } },
      { type: 'problem_photos', photos: [] },
    ];
    for (const event of events) expect(reduce(fresh(), event)).toEqual(fresh());
  });
  for (const stage of Object.keys(stages()) as Stage[]) {
    it(`retake and reset at ${stage} invalidate exactly the downstream data`, () => {
      const s = stages()[stage];
      expect(reduce(s, { type: 'retake', target: 'problem' })).toEqual(fresh());
      expect(reduce(s, { type: 'reset' })).toEqual(fresh());
      const retaken = reduce(s, { type: 'retake', target: 'work' });
      expect(retaken.stage).toBe(s.specConfirmed ? 'work_capture' : stage);
      expect(retaken.spec).toEqual(s.spec); expect(retaken.solution).toEqual(s.solution);
      expect(retaken.problemPhotos).toEqual(s.problemPhotos); expect(retaken.problemRead).toEqual(s.problemRead);
      expect(retaken.workPhotos).toEqual([]); expect(retaken.workLines).toEqual([]); expect(retaken.workAnswers).toEqual([]);
      expect(retaken.workGrade).toBeUndefined(); expect(retaken.reviewAcknowledged).toBe(false);
      expect(retaken.timings.workRead).toBeUndefined(); expect(retaken.timings.grade).toBeUndefined();
    });
  }
  it('reconfirming a changed problem discards the old grade and regrades retained work', () => {
    const old = stages().result;
    const changed = { ...spec, graph: { ...spec.graph, vertices: [...spec.graph.vertices, { id: 'C', label: 'C' }] } };
    const next = reduce(old, { type: 'spec_confirmed', spec: changed });
    expect(next.workGrade?.result.verdict).toBe('SAI'); expect(next.reviewAcknowledged).toBe(false);
    expect(next.workLines).toEqual(old.workLines); expect(next.workPhotos).toEqual(old.workPhotos);
    expect(next.workGrade).not.toEqual(old.workGrade); expect(next.solution).not.toEqual(old.solution);
    expect(reduce(old, { type: 'spec_confirmed', spec }).workGrade?.result.verdict).toBe('DUNG');
  });
  it('reconfirming while preparing work keeps the capture stage without grading empty work', () => {
    const capture = stages().work_capture;
    const next = reduce(capture, { type: 'spec_confirmed', spec });
    expect(next.stage).toBe('work_capture'); expect(next.workGrade).toBeUndefined();
    expect(next.specConfirmed).toBe(true); expect(next.solution).toBeDefined();
  });
  it('asks about uncertain/unparsed work before a verdict; answering and edits regrade', () => {
    let s = reduce(stages().work_reading, { type: 'work_read', lines: [line('Đồ thị có 9 đỉnh.', 0.2)], ms: 2 });
    expect(s.stage).toBe('work_review'); expect(s.workGrade?.questions.length).toBeGreaterThan(0);
    expect(s.workGrade?.result.verdict).toBe('CAN_XAC_NHAN');
    expect(reduce(s, { type: 'review_ack' })).toEqual(s);
    s = reduce(s, { type: 'work_answer', answer: { line: 0, text: line().text } });
    expect(s.workGrade?.questions).toEqual([]); expect(s.workGrade?.result.verdict).toBe('CAN_XAC_NHAN');
    s = reduce(s, { type: 'review_ack' }); expect(s.workGrade?.result.verdict).toBe('DUNG');
    s = reduce(s, { type: 'work_answer', answer: { line: 0, text: 'Đồ thị có 9 đỉnh.' } });
    expect(s.workGrade?.result.verdict).toBe('SAI'); expect(s.reviewAcknowledged).toBe(false);
    s = reduce(s, { type: 'work_answer', answer: { line: 0, text: line().text } });
    expect(s.workGrade?.result.verdict).toBe('CAN_XAC_NHAN');
  });
  it('checkpoints page readings without losing existing lines and rereads by index', () => {
    const first = stages().work_review;
    const next = reduce(first, { type: 'work_read', lines: [{ ...line('Đồ thị có 1 cạnh.'), index: 1, page: 1 }], ms: 3 });
    expect(next.workLines).toHaveLength(2); expect(next.workLines[0]).toEqual(first.workLines[0]);
    const reread = reduce(next, { type: 'work_read', lines: [line('Đồ thị có 3 đỉnh.')], ms: 4 });
    expect(reread.workLines).toHaveLength(2); expect(reread.workLines[0]?.text).toBe('Đồ thị có 3 đỉnh.');
    expect(reread.timings.workRead).toBe(27);
    expect(reduce(reread, { type: 'work_photos', photos: [workPhoto] }).workLines).toEqual([]);
  });
  it('keeps partial page readings at work_reading until the final reading event', () => {
    const partial = reduce(stages().work_reading, { type: 'work_read', lines: [line()], ms: 3, complete: false });
    expect(partial.stage).toBe('work_reading'); expect(partial.workGrade).toBeUndefined();
    expect(reduce(partial, { type: 'review_ack' })).toEqual(partial);
    const confirmed = reduce(partial, { type: 'spec_confirmed', spec });
    expect(confirmed.stage).toBe('work_reading'); expect(confirmed.workGrade).toBeUndefined();
    const completed = reduce(confirmed, { type: 'work_read', lines: [], ms: 0 });
    expect(completed.stage).toBe('work_review'); expect(completed.workLines).toEqual(partial.workLines);
  });
  it('can switch from a pending photo reading to manual work', () => {
    const manual = reduce(stages().work_reading, { type: 'manual_work', lines: [line().text] });
    expect(manual.stage).toBe('result'); expect(manual.workSource).toBe('manual');
    expect(manual.workGrade?.result.verdict).toBe('DUNG'); expect(manual.workPhotos).toEqual([]);
  });
  it('has deterministic output, does not mutate input and owns event payloads', () => {
    const s = stages().result, event: SessionEvent = { type: 'spec_confirmed', spec: structuredClone(spec) };
    const before = structuredClone(s); freeze(s); freeze(event);
    expect(reduce(s, event)).toEqual(reduce(s, event)); expect(s).toEqual(before);
    const mutable = structuredClone(spec), next = reduce(fresh(), { type: 'manual_spec', spec: mutable });
    mutable.graph.vertices[0]!.label = 'changed'; expect(next.spec?.graph.vertices[0]?.label).toBe('A');
  });
});

describe('4.1 routing and isolation', () => {
  for (const stage of Object.keys(stages()) as Stage[]) it(`resumes the ${stage} screen from saved state`, () => {
    const html = renderToStaticMarkup(createElement(SessionScreen, { session: stages()[stage], busy: false, onEvent: () => {}, onBack: () => {} }));
    expect(html).toContain(`data-stage="${stage}"`); expect(html).toContain(sessionVi.stages[stage]);
  });
  it('flow imports neither React, Capacitor nor platform adapters, directly or transitively through local files', () => {
    const root = new URL('../src/flow/', import.meta.url);
    const visited = new Set<string>();
    const check = (file: URL): void => {
      if (visited.has(file.href)) return;
      visited.add(file.href);
      const source = readFileSync(file, 'utf8');
      const imports = [...source.matchAll(/(?:from\s*|import\s*(?:\(\s*)?)['"]([^'"]+)/g)].map((match) => match[1]!);
      for (const name of imports) {
        expect(name, fileURLToPath(file)).not.toMatch(/react|capacitor|storage|native|node:/i);
        if (name.startsWith('.')) check(new URL(name.replace(/\.js$/, '.ts'), file));
        else if (name.startsWith('@mathtwin/')) check(new URL(`../../../packages/${name.slice('@mathtwin/'.length)}/src/index.ts`, import.meta.url));
      }
    };
    for (const file of readdirSync(root)) {
      if (!file.endsWith('.ts')) continue;
      check(new URL(file, root));
    }
    const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
    expect(app).not.toMatch(/sample-data|work-sample/);
    expect(app).toContain('store.get(item.id)'); expect(app).toContain('store.remove(item.id)');
    for (const screen of ['App.tsx', 'HomeScreen.tsx', 'SecondaryScreens.tsx', 'SessionScreen.tsx']) {
      expect(readFileSync(new URL(`../src/${screen}`, import.meta.url), 'utf8')).not.toMatch(/from ['"].*sample/);
    }
  });
});
