import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { applyConfirmation, normalizeDraft } from '@mathtwin/reader';
import type { ReadOutcome } from '@mathtwin/reader';
import { validateSpec } from '@mathtwin/core';
import { previewReaders } from '../src/preview-readers.js';
import { confirmationQuestions, confirmationValue, confirmProblem, initialProblem, replaceGraph } from '../src/flow/confirmation.js';
import { combineProblemPages, readProblemPages } from '../src/flow/reading.js';
import type { ProblemPageRead, Readers, ReadingProgress } from '../src/flow/reading.js';
import { createSession, sessionReducer as reduce } from '../src/flow/sessionReducer.js';
import { createMemoryStorage } from '../src/storage/memory.js';
import { ProblemConfirmScreen } from '../src/ProblemConfirmScreen.js';
import { ProblemFlowScreen } from '../src/ProblemFlowScreen.js';
import { ProblemForm, defaultTask } from '../src/ProblemForm.js';
import { editorFromGraph, toGraph } from '../src/graph-editor.js';
import { problemVi as m, confirmationQuestionText } from '../src/problem.vi.js';

const image = { width: 2, height: 2, pixels: new Uint8ClampedArray(16) };
const fresh = () => createSession('problem-test', '2026-11-18T00:00:00Z');
const photo = { id: 'photo', width: 2, height: 2, page: 0 };
const outcome = () => previewReaders().problem([image]);
const pageRead = (outcome: ReadOutcome, page = 0): ProblemPageRead => ({ page, outcome, ms: 4, figureMs: 2 });

describe('4.2 problem confirmation', () => {
  it('maps every uncertainty to candidates and a coarse measured endpoint crop', async () => {
    const read = await outcome(), questions = confirmationQuestions(read);
    expect(questions.map((q) => q.item)).toEqual(read.spec!.uncertain!.map((q) => q.item));
    expect(questions.find((q) => q.item === 'e1.w')).toMatchObject({ candidates: [3, 8], page: 0, box: [100, 300, 480, 380] });
    expect(questions.every((q) => Array.isArray(q.candidates))).toBe(true);
  });
  it('maps vertex crops, graph-only outcomes and unknown regions without inventing boxes', async () => {
    const read = await outcome();
    read.spec = null; read.graphUncertain = [{ item: 'B', candidates: ['B', 'D'] }, { item: 'graph', candidates: [] }];
    expect(confirmationQuestions(read, 2)).toEqual([
      { item: 'B', candidates: ['B', 'D'], page: 2, box: [400, 300, 480, 380] },
      { item: 'graph', candidates: [], page: 2 },
    ]);
    expect(initialProblem(read).graph).toEqual(read.graph);
  });
  it('applies typed candidates or another value atomically and keeps unresolved flags', async () => {
    const read = await outcome(), spec = read.spec!, before = structuredClone(spec);
    const next = applyConfirmation(spec, { 'e1.w': confirmationValue('5') });
    expect(spec).toEqual(before); expect(next.graph.edges[0]?.w).toBe(5);
    expect(next.uncertain?.some((u) => u.item === 'e1.w')).toBe(false);
    if (next.uncertain?.length) expect(() => confirmProblem(next, {})).toThrow(m.unresolved);
    const answers = Object.fromEntries(spec.uncertain!.map((u) => [u.item, u.item === 'e1.w' ? 5 : u.candidates[0]]));
    expect(confirmProblem(spec, answers).uncertain).toEqual([]);
    expect(confirmationValue('C')).toBe('C'); expect(confirmationValue('false')).toBe(false);
  });
  it('rejects bad weights, missing endpoints and stale graph references without solving', async () => {
    const spec = (await outcome()).spec!;
    expect(() => applyConfirmation(spec, { 'e1.w': -1 })).toThrow();
    const invalid = { ...spec, uncertain: [], task: { type: 'shortest_path' as const, from: 'A', to: 'missing' } };
    expect(() => confirmProblem(invalid, {})).toThrow();
    const s = reduce(fresh(), { type: 'manual_spec', spec: invalid });
    expect(s.solution).toBeUndefined(); expect(s.specConfirmed).toBe(false);
  });
  it('graph edits clear graph flags while preserving task and question format questions', async () => {
    const spec = (await outcome()).spec!;
    spec.uncertain!.push({ item: 'task.to', candidates: ['C', 'B'] }, { item: 'questionFormat', candidates: ['tu_luan'] });
    const graph = toGraph(editorFromGraph(spec.graph)).graph!;
    const edited = replaceGraph(spec, graph);
    expect(edited.uncertain?.map((u) => u.item)).toEqual(['task.to', 'questionFormat']);
    expect(validateSpec({ ...edited, uncertain: [] }).ok).toBe(true);
  });
  it('renders real photos, every question, candidates, input and editable parameters', async () => {
    const read = await outcome();
    const html = renderToStaticMarkup(createElement(ProblemConfirmScreen, { outcome: read,
      photos: [{ image: 'blob:real-photo', width: 2, height: 2 }], manual: false, busy: false,
      runner: previewReaders().figure!, onBack: () => {}, onDone: () => {} }));
    expect(html).toContain('blob:real-photo'); expect(html).toContain(m.edit); expect(html).toContain(m.other);
    for (const q of read.spec!.uncertain!) expect(html).toContain(confirmationQuestionText(read.spec!, q.item));
    expect(html).toContain('viewBox="100 300 380 80"'); expect(html).toContain(m.from); expect(html).toContain(m.to);
    expect(html).toContain(m.format); expect(html).toContain('disabled');
  });
  it('manual forms cover all supported task kinds and block invalid parameters through core', () => {
    const types = ['elements', 'degree', 'degree_sequence', 'path', 'connectivity', 'euler', 'hamilton', 'shortest_path', 'tsp', 'postman', 'statements'] as const;
    for (const type of types) {
      const spec = { ...initialProblem(), task: defaultTask(type) };
      const html = renderToStaticMarkup(createElement(ProblemForm, { spec, onChange: () => {} }));
      expect(html).toContain(m.task); expect(html).toContain(`value="${type}" selected`);
    }
    expect(validateSpec({ ...initialProblem(), task: defaultTask('postman') }).ok).toBe(false);
  });
  it('offers reader download/manual input and labels simulated preview explicitly', () => {
    const html = renderToStaticMarkup(createElement(ProblemFlowScreen, { session: fresh(), busy: false,
      preview: true, readerReady: false, onEvent: () => {}, onBack: () => {} }));
    expect(html).toContain(m.missing); expect(html).toContain(m.settings); expect(html).toContain(m.manual); expect(html).toContain(m.preview);
  });
});

describe('4.2 reading, checkpoints and cancellation', () => {
  it('preview goes photos → read → answer all questions → spec_confirmed', async () => {
    const readers = previewReaders(), checkpoints: ProblemPageRead[] = [], progress: ReadingProgress[] = [];
    let s = reduce(fresh(), { type: 'problem_photos', photos: [photo] });
    const read = await readProblemPages({ count: 1, readers, signal: new AbortController().signal, load: async () => image,
      progress: (p) => progress.push(p), checkpoint: async (reading) => { checkpoints.push(reading); s = reduce(s, { type: 'problem_page', reading }); } });
    expect(progress.map((p) => p.phase)).toEqual(['problem', 'figure']);
    expect(checkpoints).toHaveLength(2); expect(checkpoints[0]?.figure).toBeUndefined(); expect(checkpoints[1]?.figure).toBeDefined();
    s = reduce(s, { type: 'problem_read', outcome: read, ms: 0 });
    expect(s.stage).toBe('problem_confirm'); expect(s.solution).toBeUndefined();
    const answers = Object.fromEntries(read.spec!.uncertain!.map((q) => [q.item, q.candidates[0]]));
    const spec = confirmProblem(read.spec!, answers);
    s = reduce(s, { type: 'spec_confirmed', spec });
    expect(s.stage).toBe('solution'); expect(s.specConfirmed).toBe(true); expect(s.solution).toBeDefined();
  });
  it('manual graph and parameters reach solution without a reader', async () => {
    const spec = replaceGraph(initialProblem(), (await outcome()).spec!.graph);
    spec.task = { type: 'shortest_path', from: 'A', to: 'C' };
    const s = reduce(fresh(), { type: 'manual_spec', spec: confirmProblem(spec, {}) });
    expect(s.specSource).toBe('manual'); expect(s.stage).toBe('solution'); expect(s.problemPhotos).toEqual([]);
  });
  it('cancellation rejects a non-cooperative reader and ignores its late success', async () => {
    const read = await outcome(), controller = new AbortController(); let resolve: (value: ReadOutcome) => void = () => {};
    const checkpoints: ProblemPageRead[] = [];
    const reading = readProblemPages({ count: 1, readers: { ...previewReaders(), problem: () => new Promise((done) => { resolve = done; }) },
      signal: controller.signal, load: async () => image, progress: (p) => { if (p.phase === 'problem') queueMicrotask(() => controller.abort()); },
      checkpoint: async (p) => { checkpoints.push(p); } });
    await expect(reading).rejects.toBeDefined(); resolve(read); await Promise.resolve(); expect(checkpoints).toEqual([]);
  });
  it('keeps the B result if cancelled during the optional D worker', async () => {
    const controller = new AbortController(), checkpoints: ProblemPageRead[] = [];
    const readers = { ...previewReaders(), figure: async () => { controller.abort(); return new Promise<never>(() => {}); } };
    await expect(readProblemPages({ count: 1, readers, signal: controller.signal, load: async () => image, progress: () => {},
      checkpoint: async (p) => { checkpoints.push(p); } })).rejects.toBeDefined();
    expect(checkpoints).toHaveLength(1); expect(checkpoints[0]?.outcome.spec).not.toBeNull();
  });
  it('resumes after app restart without rereading durable pages; reports the next page', async () => {
    const storage = createMemoryStorage(), controller = new AbortController();
    let s = reduce(fresh(), { type: 'problem_photos', photos: [photo, { ...photo, id: 'p2', page: 1 }] });
    const readers = previewReaders(); delete readers.figure;
    await expect(readProblemPages({ count: 2, readers, signal: controller.signal, load: async () => image, progress: () => {},
      checkpoint: async (reading) => { s = reduce(s, { type: 'problem_page', reading }); await storage.sessions.put(s); controller.abort(); } })).rejects.toBeDefined();
    const saved = (await storage.sessions.get(s.id))!, loaded: number[] = [], progress: ReadingProgress[] = [];
    const result = await readProblemPages({ count: 2, readers, signal: new AbortController().signal, saved: saved.problemPages!,
      load: async (page) => { loaded.push(page); return image; }, progress: (p) => progress.push(p), checkpoint: async () => {} });
    expect(loaded).toEqual([1]); expect(progress[0]?.page).toBe(1); expect(result.spec?.uncertain?.some((q) => q.item === 'graph')).toBe(true);
    expect(saved.stage).toBe('problem_reading'); expect(saved.solution).toBeUndefined();
  });
  it('D failure leaves the B outcome available for confirmation', async () => {
    const readers = { ...previewReaders(), figure: async () => { throw { code: 'figure_failed' }; } };
    const read = await readProblemPages({ count: 1, readers, signal: new AbortController().signal,
      load: async () => image, progress: () => {}, checkpoint: async () => {} });
    expect(read.spec).not.toBeNull();
  });
  it('merges graph pages conservatively and maps a second-page edge back to its photo', async () => {
    const read = await outcome(), draft = structuredClone(read.drafts[0]!);
    draft.question = null;
    const first = { ...normalizeDraft(draft), drafts: [draft], usage: read.usage };
    const combined = combineProblemPages([pageRead(first), pageRead(read, 1)]);
    expect(combined.spec?.task.type).toBe('shortest_path'); expect(combined.graph?.edges).toHaveLength(4);
    expect(combined.spec?.uncertain?.map((q) => q.item)).toContain('graph');
    expect(combined.spec?.uncertain?.map((q) => q.item)).toContain('task.type');
    expect(confirmationQuestions(combined).find((q) => q.item === 'e3.w')?.page).toBe(1);
    expect(() => confirmProblem(combined.spec!, {})).toThrow(m.unresolved);
  });
  it('does not erase a failed-page issue while merging and never publishes a definitive spec', async () => {
    const read = await outcome(), bad = structuredClone(read);
    bad.issues = [{ code: 'read_failed', severity: 'blocking', message: m.failed }]; bad.spec = null;
    const combined = combineProblemPages([pageRead(read), pageRead(bad, 1)]);
    expect(combined.spec).toBeNull(); expect(combined.issues.some((i) => i.code === 'read_failed')).toBe(true);
  });
  it('capture add/remove/order is persisted and invalidates old results', async () => {
    const storage = createMemoryStorage();
    let s = reduce(fresh(), { type: 'manual_spec', spec: { ...initialProblem(), graph: (await outcome()).spec!.graph } });
    s = reduce(s, { type: 'problem_capture', photos: [{ ...photo, page: 0 }, { ...photo, id: 'two', page: 1 }] });
    await storage.sessions.put(s);
    expect((await storage.sessions.get(s.id))?.problemPhotos.map((p) => p.id)).toEqual(['photo', 'two']);
    s = reduce(s, { type: 'problem_capture', photos: [{ ...photo, id: 'two', page: 0 }] });
    expect(s.stage).toBe('problem_capture'); expect(s.spec).toBeUndefined(); expect(s.solution).toBeUndefined();
    expect(s.problemPhotos[0]?.page).toBe(0);
  });
});
