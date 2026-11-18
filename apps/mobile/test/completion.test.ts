import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync, readdirSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { grade, solve } from '@mathtwin/core';
import type { Claim, ProblemSpec } from '@mathtwin/core';
import type { ReadOutcome, TextReader } from '@mathtwin/reader';
import { vocabularyOf } from '@mathtwin/work';
import { readProblemPages, readingTask } from '../src/flow/reading.js';
import type { Readers } from '../src/flow/reading.js';
import { readWorkPages } from '../src/flow/work-reading.js';
import { createSession, sessionReducer } from '../src/flow/sessionReducer.js';
import type { Session, SessionEvent } from '../src/flow/types.js';
import { runSessionEvent } from '../src/session-runner.js';
import { createMemoryData, createMemoryStorage } from '../src/storage/memory.js';
import { readingError } from '../src/flow/reading-error.vi.js';
import { settingsVi as m } from '../src/settings.vi.js';
import { SettingsScreen } from '../src/SettingsScreen.js';
import { SessionScreen } from '../src/SessionScreen.js';
import { SessionTimings } from '../src/SessionTimings.js';
import { ResultScreen } from '../src/ResultScreen.js';
import { resultView } from '../src/flow/view.js';
import { emptyProductActions } from '../src/sample-data.js';
import { DemoScreen } from '../src/DemoScreen.js';
import manifest from '../../../tools/models/manifest.json';

const noop = () => {};
const image = { width: 20, height: 20, pixels: new Uint8ClampedArray(1600).fill(255) };
const spec: ProblemSpec = { graph: { directed: false, vertices: [{ id: 'internal-a', label: 'A' }, { id: 'internal-b', label: 'B' }],
  edges: [{ id: 'internal-edge', u: 'internal-a', v: 'internal-b' }] }, task: { type: 'elements' }, questionFormat: 'tu_luan' };
const outcome: ReadOutcome = { spec, graph: spec.graph, graphUncertain: [], issues: [], drafts: [], usage: { engine: 'fake', passes: 1, latencyMs: 5 } };
const healthy: Readers = { problem: async () => structuredClone(outcome), text: { engine: 'fake', readLines: async () => ({
  lines: [{ text: 'Đồ thị có 2 đỉnh.', conf: 1, alternatives: [], region: 'solution', regionConf: 1, box: [0, 200, 1000, 400] }],
  usage: { engine: 'fake', passes: 1, latencyMs: 5 },
}) } };
const fresh = () => createSession('internal-session', '2026-11-18T00:00:00Z');
const photo = (page: number) => ({ id: `internal-photo-${page}`, page, width: 20, height: 20 });

afterEach(() => vi.useRealTimers());

describe('4.6 fake readers: recoverable failures in both flows', () => {
  for (const flow of ['problem', 'work'] as const) {
    for (const [code, message] of [
      ['memory_pressure', m.failures.memory], ['server_killed', m.failures.memory], ['server_exit', m.failures.server],
      ['exec_blocked', m.failures.server], ['timeout', m.failures.timeout], ['image_invalid', m.failures.image],
    ]) it(`${flow}: ${code} keeps the first page; retry and manual remain possible`, async () => {
      const storage = createMemoryStorage();
      let s = flow === 'problem' ? sessionReducer(fresh(), { type: 'problem_photos', photos: [photo(0), photo(1)] })
        : sessionReducer(sessionReducer(fresh(), { type: 'manual_spec', spec }), { type: 'work_photos', photos: [photo(0), photo(1)] });
      const checkpoint = async (event: SessionEvent) => { s = runSessionEvent(s, event); await storage.sessions.put(s); };
      let calls = 0;
      const fail = () => { if (++calls === 2) throw { code, message: 'secret-internal-id' }; };
      const readers: Readers = { problem: async (images, signal) => { fail(); return healthy.problem(images, signal); },
        text: { engine: 'fake', readLines: async (images, signal) => { fail(); return healthy.text.readLines(images, signal); } } };
      const read = () => flow === 'problem' ? readProblemPages({ count: 2, readers, signal: new AbortController().signal,
        load: async () => image, saved: s.problemPages ?? [], progress: noop,
        checkpoint: (reading) => checkpoint({ type: 'problem_page', reading }) })
        : readWorkPages({ count: 2, reader: readers.text, vocab: vocabularyOf(spec), signal: new AbortController().signal,
          load: async () => image, saved: s.workPages ?? [], progress: noop,
          checkpoint: (reading) => checkpoint({ type: 'work_page', reading }) });
      await expect(read()).rejects.toMatchObject({ code });
      expect(readingError({ code, message: 'secret-internal-id' })).toBe(message);
      expect(message).toContain('nhập tay'); expect(message).toContain('thử lại'); expect(message).not.toContain('secret');
      const saved = (await storage.sessions.get(s.id))!;
      expect(saved.stage).toBe(`${flow}_reading`); expect(saved.workGrade).toBeUndefined();
      const first = structuredClone(flow === 'problem' ? saved.problemPages![0] : saved.workPages![0]);
      const manual = runSessionEvent(saved, flow === 'problem' ? { type: 'manual_spec', spec } : { type: 'manual_work', lines: ['Đồ thị có 2 đỉnh.'] });
      expect(manual.stage).toBe(flow === 'problem' ? 'solution' : 'result');
      await read();
      expect(calls).toBe(3); expect(flow === 'problem' ? s.problemPages![0] : s.workPages![0]).toEqual(first);
      await storage.close();
    });
    it(`${flow}: non-cooperative reader reaches deadline and receives abort`, async () => {
      vi.useFakeTimers(); let adapterSignal: AbortSignal | undefined;
      const hung = async (_images: unknown, signal?: AbortSignal): Promise<never> => { adapterSignal = signal; return new Promise(() => {}); };
      const checkpoint = vi.fn(async () => {});
      const pending = flow === 'problem' ? readProblemPages({ count: 1, readers: { ...healthy, problem: hung }, signal: new AbortController().signal,
        load: async () => image, progress: noop, checkpoint, timeoutMs: 10 })
        : readWorkPages({ count: 1, reader: { engine: 'fake', readLines: hung }, vocab: vocabularyOf(spec), signal: new AbortController().signal,
          load: async () => image, progress: noop, checkpoint, timeoutMs: 10 });
      const rejected = expect(pending).rejects.toMatchObject({ code: 'timeout' });
      await vi.advanceTimersByTimeAsync(11); await rejected;
      expect(adapterSignal?.aborted).toBe(true);
      expect(checkpoint.mock.calls.length).toBe(flow === 'problem' ? 0 : 1);
    });
    it(`${flow}: corrupt decoded image is rejected before OCR`, async () => {
      const problem = vi.fn(healthy.problem), text = vi.fn(healthy.text.readLines);
      const load = async () => ({ ...image, pixels: new Uint8ClampedArray(3) });
      const pending = flow === 'problem' ? readProblemPages({ count: 1, readers: { ...healthy, problem }, signal: new AbortController().signal, load, progress: noop, checkpoint: async () => {} })
        : readWorkPages({ count: 1, reader: { engine: 'fake', readLines: text }, vocab: vocabularyOf(spec), signal: new AbortController().signal, load, progress: noop, checkpoint: async () => {} });
      await expect(pending).rejects.toMatchObject({ code: 'image_invalid' });
      expect(problem).not.toHaveBeenCalled(); expect(text).not.toHaveBeenCalled();
    });
  }
  it('cancellation rejects immediately and suppresses a late result', async () => {
    let finish!: (value: ReadOutcome) => void;
    const controller = new AbortController(), checkpoint = vi.fn(async () => {});
    let started!: () => void; const began = new Promise<void>((resolve) => { started = resolve; });
    const pending = readProblemPages({ count: 1, readers: { ...healthy, problem: async () => { started(); return new Promise((resolve) => { finish = resolve; }); } },
      signal: controller.signal, load: async () => image, progress: noop, checkpoint });
    const rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    await began; controller.abort(); await rejected; finish(outcome); await Promise.resolve();
    expect(checkpoint).not.toHaveBeenCalled(); expect(readingError(controller.signal.reason)).toBe(m.cancelled);
  });
  it('app death after a work page checkpoint resumes remaining pages without losing lines', async () => {
    const data = createMemoryData(), first = createMemoryStorage(data);
    let s = runSessionEvent(runSessionEvent(fresh(), { type: 'manual_spec', spec }), { type: 'work_photos', photos: [photo(0), photo(1)] });
    const abort = new AbortController();
    await expect(readWorkPages({ count: 2, reader: healthy.text, vocab: vocabularyOf(spec), signal: abort.signal,
      load: async () => image, progress: noop, checkpoint: async (reading) => {
        s = runSessionEvent(s, { type: 'work_page', reading }); await first.sessions.put(s);
        if (reading.inspected) abort.abort();
      } })).rejects.toMatchObject({ name: 'AbortError' });
    const lines = structuredClone(s.workLines); await first.close();
    const reopened = createMemoryStorage(data); s = (await reopened.sessions.get(s.id))!;
    const readLines = vi.fn(healthy.text.readLines);
    await readWorkPages({ count: 2, reader: { engine: 'fake', readLines }, vocab: vocabularyOf(spec), signal: new AbortController().signal,
      saved: s.workPages!, load: async () => image, progress: noop, checkpoint: async (reading) => {
        s = runSessionEvent(s, { type: 'work_page', reading }); await reopened.sessions.put(s);
      } });
    expect(readLines).toHaveBeenCalledTimes(1); expect(s.workLines.slice(0, lines.length)).toEqual(lines);
    const html = renderToStaticMarkup(createElement(SessionScreen, { session: s, resumed: true, busy: false, onEvent: noop, onBack: noop }));
    expect(html).toContain(m.resumed); expect(html).not.toContain('internal-');
    s = runSessionEvent(s, { type: 'work_read', lines: [], ms: 0 });
    expect(s.workGrade?.result.verdict).toBe('CAN_XAC_NHAN');
    expect(runSessionEvent(s, { type: 'review_ack' }).workGrade?.result.verdict).toBe('DUNG');
    await reopened.close();
  });
  it('timeout also bounds a stuck image loader', async () => {
    vi.useFakeTimers();
    const pending = readingTask(async () => new Promise(() => {}), new AbortController().signal, 10);
    const rejected = expect(pending).rejects.toMatchObject({ code: 'timeout' });
    await vi.advanceTimersByTimeAsync(10); await rejected;
  });
});

describe('4.6 settings, storage and measured session', () => {
  it('reports UTF-8 history and all photo bytes, clears both and revokes local URLs', async () => {
    const data = createMemoryData(), storage = createMemoryStorage(data);
    const ref = await storage.photos.put(new Blob(['ảnh']), { width: 1, height: 1, page: 0 });
    await storage.photos.put(new Blob(['orphan']), { width: 1, height: 1, page: 0 });
    const s = { ...fresh(), problemPhotos: [ref] }; await storage.sessions.put(s);
    const url = await storage.photos.url(ref.id), revoke = vi.spyOn(URL, 'revokeObjectURL');
    expect(await storage.sessions.usage()).toEqual({ sessions: 1, historyBytes: new Blob([JSON.stringify(s)]).size, photoBytes: new Blob(['ảnhorphan']).size });
    await storage.sessions.clear();
    expect(await storage.sessions.usage()).toEqual({ sessions: 0, historyBytes: 0, photoBytes: 0 });
    expect(await storage.sessions.list()).toEqual([]); expect(data.photos.size).toBe(0); expect(revoke).toHaveBeenCalledWith(url);
    await expect(storage.photos.url(ref.id)).rejects.toThrow(); await storage.close(); revoke.mockRestore();
  });
  it('settings exposes A/B manifests, storage and demo, with C restricted to benchmark', () => {
    const html = renderToStaticMarkup(createElement(SettingsScreen, { onNavigate: noop, onBenchmark: noop,
      usage: { sessions: 2, historyBytes: 500, photoBytes: 2000 } }));
    for (const file of manifest.files.filter((f) => f.model !== 'c')) expect(html).toContain(file.sha256);
    expect(html).toContain(m.clear); expect(html).toContain(m.demo); expect(html).toContain(m.unknownCpu);
    expect(html).not.toContain('VietOCR'); expect(html).not.toContain('internal-');
    for (const file of manifest.files.filter((f) => f.model === 'c')) expect(html).not.toContain(file.sha256);
    const demo = renderToStaticMarkup(createElement(DemoScreen, { onBack: noop })); expect(demo).toContain(m.demoNote);
  });
  it('records solve and grade separately, retains reading timings, and invalidates on retake', () => {
    let clock = 0; const now = () => clock += 7;
    let s = runSessionEvent({ ...fresh(), timings: { problemRead: 18, figureDraft: 3 } }, { type: 'manual_spec', spec }, now);
    expect(s.timings).toEqual({ problemRead: 18, figureDraft: 3, solve: 7 });
    s = runSessionEvent(s, { type: 'manual_work', lines: ['Đồ thị có 2 đỉnh.'] }, now);
    expect(s.timings.grade).toBe(7);
    const pure = sessionReducer(fresh(), { type: 'manual_spec', spec }); expect(pure.timings).toEqual({});
    const confirmed = runSessionEvent(s, { type: 'spec_confirmed', spec }, now);
    expect(confirmed.timings.solve).toBe(7); expect(confirmed.timings.grade).toBe(7);
    const html = renderToStaticMarkup(createElement(SessionTimings, { timings: s.timings }));
    for (const label of Object.values(m.timings)) expect(html).toContain(label);
    expect(html).toContain('7.0 ms'); expect(html).toContain(m.pending);
    expect(runSessionEvent(s, { type: 'retake', target: 'work' }).timings).toEqual({ problemRead: 18, figureDraft: 3, solve: 7 });
    expect(runSessionEvent(s, { type: 'retake', target: 'problem' }).timings).toEqual({});
    const data = resultView(s); if (data.verdict !== 'dung') throw new Error('Expected confirmed manual work');
    const result = renderToStaticMarkup(createElement(ResultScreen, { state: 'rong', data, actions: emptyProductActions, onBack: noop }));
    expect(result).toContain('Xem bài đã gõ'); expect(result).not.toContain('Xem bài máy đọc'); expect(result).not.toContain('internal-');
  });
  it('solve + grade stays below 1 second per confirmed core fixture (all 60)', () => {
    const root = new URL('../../../testdata/core/', import.meta.url);
    const fixtures = readdirSync(root, { withFileTypes: true }).filter((e) => e.isDirectory());
    expect(fixtures).toHaveLength(60); let maximum = 0;
    for (const fixture of fixtures) {
      const spec = JSON.parse(readFileSync(new URL(`${fixture.name}/spec.json`, root), 'utf8')) as ProblemSpec;
      const claims = JSON.parse(readFileSync(new URL(`${fixture.name}/claims.json`, root), 'utf8')) as Claim[];
      const started = performance.now(); solve(spec); grade(spec, claims); const ms = performance.now() - started;
      maximum = Math.max(maximum, ms); expect(ms, fixture.name).toBeLessThan(1000);
    }
    console.info(`4.6 core solve + grade: 60 fixtures, max ${maximum.toFixed(2)} ms`);
  });
});
