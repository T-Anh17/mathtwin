import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { readProblem } from '@mathtwin/reader';
import type { ProblemSpec } from '@mathtwin/core';
import { exportReport } from '../src/benchmark.js';
import type { DeviceInfo, ImageResult } from '../src/contracts.js';
import { evaluateDevice } from '../../../tools/eval/src/device.js';
import { fakeReader } from '../../../tools/eval/src/fake-reader.js';

const device: DeviceInfo = { manufacturer: 'fixture', model: 'test phone', android: '16', sdk: 36, cores: 8, totalRamBytes: 8e9, availableRamBytes: 6e9, freeStorageBytes: 20e9 };
const engine = 'offline:qwen3-vl-2b';
const spec: ProblemSpec = { graph: { directed: false, vertices: [{ id: 'A', label: 'A' }, { id: 'B', label: 'B' }], edges: [{ id: 'e1', u: 'A', v: 'B', w: 7 }] }, task: { type: 'shortest_path', from: 'A', to: 'B' }, questionFormat: 'tu_luan' };
const temporary: string[] = [];
afterEach(async () => { for (const root of temporary.splice(0)) await rm(root, { recursive: true, force: true }); });
async function setup() {
  const root = await mkdtemp(join(tmpdir(), 'mathtwin-device-')); temporary.push(root);
  for (const [folder, id, source, synthetic] of [['images-synthetic-hw', 'hw', 'synthetic_handwriting', true], ['images-synthetic', 'print', 'printed', true], ['images', 'real', 'handwritten', false]] as const) {
    const path = join(root, 'testdata', folder, id); await mkdir(path, { recursive: true });
    for (const [file, value] of Object.entries({ 'truth.json': spec, 'lines.json': [{ text: 'Đường đi A → B dài 7.', region: 'solution' }],
      'meta.json': { source, synthetic, capture: 'straight', blurred: false, questionFormat: 'tu_luan', notes: 'fixture' } })) await writeFile(join(path, file), JSON.stringify(value));
    // Device import must not read image pixels or invoke an OCR/model.
    await writeFile(join(path, '1.png'), 'not decoded');
  }
  const usage = { engine, passes: 1, latencyMs: 12, peakMemoryMb: 700, serverTimings: { promptMs: 8, predictedMs: 3, promptTokens: 100, predictedTokens: 20 } };
  const result: ImageResult = { id: 'hw', engine, config: { model: 'b', mode: 'lines', passes: 2, threads: 4, minRamGb: 6, allowLowRam: false, backgroundIdleMinutes: 5 },
    imageSource: 'dataset', usage: { ...usage, passes: 2 }, totalMs: 100, modelLoadMs: 30, modelVerifyMs: 5, reusedModel: false,
    memory: { alive: true, cpuVariant: 'armv8.2-dotprod', peakMemoryMb: 700 },
    linePasses: [{ usage, lines: [{ text: 'Đường đi A → B dài 7.', conf: 0.9, alternatives: [] }] },
      { usage, lines: [{ text: 'Duong di A → B dai 1.', conf: 0.9, alternatives: ['Đường đi A → B dài 7.'] }] }] };
  const file = join(root, 'device.json');
  const save = async (results: ImageResult[], ram = 8e9) => { await writeFile(file, exportReport({ version: 1, device: { ...device, totalRamBytes: ram }, results })); };
  return { root, file, result, save };
}
const options = { mode: 'both', threshold: 0.85 } as const;
describe('app export to desktop evaluation', () => {
  it('separates token limits and retains the actual runtime and restart marker in each report', async () => {
    const { root, file, result, save } = await setup();
    await save([1536, 1024].map((maxTokens) => ({ ...result, serverRestarted: true, config: { ...result.config, maxTokens } })));
    expect(JSON.parse(await readFile(file, 'utf8'))).toMatchObject({ runtime: { maxTokens: null } });
    const reports = await evaluateDevice(file, root, '2026-11-17', options);
    expect(reports).toHaveLength(2);
    expect(reports.map(({ report }) => report.configuration!.maxTokens)).toEqual([1536, 1024]);
    for (const { report } of reports) {
      expect(report.rows[0]!.serverRestarted).toBe(true);
      expect(report.phoneMeasurements).toMatchObject({ runtime: { maxTokens: report.configuration!.maxTokens } });
    }
  });
  it('uses the runtime limit of a legacy export instead of assuming the new default', async () => {
    const { root, file, result, save } = await setup(); await save([result]);
    const legacy = JSON.parse(await readFile(file, 'utf8')) as { runtime: { maxTokens: number }; results: { config: { maxTokens?: number } }[] };
    legacy.runtime.maxTokens = 4096; delete legacy.results[0]!.config.maxTokens;
    await writeFile(file, JSON.stringify(legacy));
    const reports = await evaluateDevice(file, root, '2026-11-17', options);
    expect(reports[0]!.report.configuration!.maxTokens).toBe(4096);
  });
  it.each([0, -1, 1.5, 8193, null])('rejects invalid maxTokens=%s in a device export', async (maxTokens) => {
    const { root, file, result, save } = await setup(); await save([result]);
    const data = JSON.parse(await readFile(file, 'utf8')) as { results: { config: Record<string, unknown> }[] };
    data.results[0]!.config.maxTokens = maxTokens;
    await writeFile(file, JSON.stringify(data));
    await expect(evaluateDevice(file, root, '2026-11-17', options)).rejects.toThrow();
  });
  it('keeps image size/timeout/DRY configurations separate and retains sent dimensions and finish reasons', async () => {
    const { root, file, result, save } = await setup();
    const dry = { dry_multiplier: 0.8, dry_base: 1.75, dry_allowed_length: 2, dry_penalty_last_n: 64 };
    const results = [
      { ...result, config: { ...result.config, maxImageSide: 512, readTimeout: 300_000, dry } },
      { ...result, config: { ...result.config, maxImageSide: 768, readTimeout: 450_000, dry } },
      { ...result, config: { ...result.config, maxImageSide: 768, readTimeout: 450_000, dry: { ...dry, dry_multiplier: 0 } } },
    ].map((r) => ({ ...r, usage: { ...r.usage, finish_reason: ['stop', 'stop'], sentImages: [
      { originalWidth: 2000, originalHeight: 1000, width: r.config.maxImageSide, height: r.config.maxImageSide / 2, maxImageSide: r.config.maxImageSide },
    ] } }));
    await save(results);
    const reports = await evaluateDevice(file, root, '2026-11-16', options);
    expect(reports).toHaveLength(3);
    for (const { report, basename } of reports) {
      expect(report.configuration).toMatchObject({ maxImageSide: expect.any(Number), readTimeout: expect.any(Number), dry: expect.any(Object) });
      expect(report.rows[0]?.usage).toMatchObject({ finish_reason: ['stop', 'stop'], sentImages: [{ maxImageSide: report.configuration!.maxImageSide }] });
      expect(await readFile(join(root, 'reports', `${basename}.md`), 'utf8')).toContain('maxImageSide');
    }
  });
  it('joins by id, keeps both passes independently, preserves timings/configuration and separates true/synthetic handwriting', async () => {
    const { root, file, result, save } = await setup();
    await save([result, { ...result, id: 'real' }, { ...result, id: 'print', reusedModel: true, modelLoadMs: 0 }]);
    const { report, basename } = (await evaluateDevice(file, root, '2026-11-15', options))[0]!;
    expect(report!.summary.total).toBe(0); expect(report!.summary.evaluatedImages).toBe(3);
    expect(report!.summary.textByPass['1']!.cer.rate).toBe(0);
    expect(report!.summary.textByPass['2']!.cer.rate).toBeGreaterThan(0);
    expect(report!.summary.textByPass['2']!.silentLineRate).toBe(1);
    expect(report!.groups.synthetic_handwriting.evaluatedImages).toBe(1);
    expect(report!.groups.handwritten.evaluatedImages).toBe(1);
    expect(report!.groups.printed.evaluatedImages).toBe(1);
    expect(report!.summary.nodeLatencyMs.p50).toBeNull(); expect(report!.summary.deviceTotalMs.p50).toBe(100);
    expect(report!.configuration).toMatchObject({ cpuVariant: 'armv8.2-dotprod', threads: 4, passes: 2 });
    const json = await readFile(join(root, 'reports', `${basename}.json`), 'utf8');
    expect(json).not.toMatch(/not decoded|pixels|dataUrl|apiKey/);
    const filtered = await evaluateDevice(file, root, '2026-11-15', { ...options, set: 'synthetic-hw' });
    expect(filtered[0]!.report.summary.evaluatedImages).toBe(1);
  });
  it('groups engine configuration/mode/pass count rather than pooling runs', async () => {
    const { root, file, result, save } = await setup();
    const read = await readProblem([{ width: 1, height: 1, pixels: new Uint8ClampedArray([255, 255, 255, 255]) }], { reader: fakeReader(spec), passes: 1 });
    read.usage.engine = engine;
    const graph: ImageResult = { ...result, config: { ...result.config, mode: 'graph', passes: 1 }, outcome: read, usage: { ...result.usage, passes: 1 } };
    delete graph.linePasses;
    await save([result, graph, { ...result, config: { ...result.config, threads: 2 } }]);
    const reports = await evaluateDevice(file, root, '2026-11-15', options);
    expect(reports).toHaveLength(3);
    expect(reports.find((r) => r.report.mode === 'graph')!.report.summary.completeRate).toBe(1);
    expect(reports.find((r) => r.report.mode === 'graph')!.report.summary.textByPass).toEqual({});
  });
  it('keeps boxes and strike diagnostics through app export/import and reports text by region', async () => {
    const { root, file, result, save } = await setup();
    await writeFile(join(root, 'testdata/images-synthetic-hw/hw/lines.json'), JSON.stringify([
      { text: 'Đường đi A → B dài 7.', region: 'solution' },
      { text: null, struck: true, region: 'solution', box: [10, 10, 210, 50] },
    ]));
    result.linePasses![0]!.lines.push({ text: '7', conf: 0.99, alternatives: [], box: [20, 15, 200, 45] });
    await save([result]);
    const { report, basename } = (await evaluateDevice(file, root, '2026-11-15', options))[0]!;
    const first = report.summary.textByPass['1']!;
    expect(first.struckReadAsContent).toBe(1);
    expect(first.byRegion.solution!.struckReadAsContent).toBe(1);
    expect(first.byRegion.solution!.lineRecall).toBe(1);
    expect(report.summary.textByPass['2']!.struckUnassessable).toBe(1);
    const markdown = await readFile(join(root, 'reports', `${basename}.md`), 'utf8');
    expect(markdown).toContain('| all | 1 | solution |');
    expect(markdown).toContain('Gạch xóa chép thành nội dung');
  });
  it('retains failed text runs in denominators and marks low RAM as non-target evidence', async () => {
    const { root, file, result, save } = await setup();
    const failed: ImageResult = { ...result, errorCode: 'server_killed', usage: { engine, passes: 0, latencyMs: 0 } };
    delete failed.linePasses;
    await save([failed], 4e9);
    const { report } = (await evaluateDevice(file, root, '2026-11-15', options))[0]!;
    expect(report!.summary.textByPass['1']!.cer.rate).toBe(1);
    expect(report!.summary.textByPass['2']!.lineRecall).toBe(0);
    expect(report!.summary.failedImages).toEqual([{ id: 'hw', code: 'server_killed' }]);
    expect(report!.phoneMeasurements).toMatchObject({ targetEligible: false });
  });
  it.each(['graph', 'lines'] as const)('counts memory_pressure separately in %s reports and preserves callback/trim and actual CPU variant', async (mode) => {
    const { root, file, result, save } = await setup();
    const failed: ImageResult = { ...result, config: { ...result.config, mode }, errorCode: 'memory_pressure',
      usage: { engine, passes: 0, latencyMs: 0 },
      memory: { alive: false, cpuVariant: 'android_armv8.6_1', memoryPressure: { callback: 'onTrimMemory', trimLevel: 15 } } };
    delete failed.linePasses;
    await save([failed, { ...failed, id: 'real', memory: { ...failed.memory!, memoryPressure: { callback: 'onLowMemory', trimLevel: null } } },
      { ...failed, id: 'print', errorCode: 'server_exit', memory: { alive: false, cpuVariant: 'android_armv8.6_1' } }]);
    const { report, basename } = (await evaluateDevice(file, root, '2026-11-15', options))[0]!;
    expect(report.summary).toMatchObject({ evaluatedImages: 3, memoryPressureCount: 2 });
    expect(report.summary.failedImages.map((r) => r.code)).toEqual(['memory_pressure', 'memory_pressure', 'server_exit']);
    expect(report.groups.synthetic_handwriting.memoryPressureCount).toBe(1);
    expect(report.groups.handwritten.memoryPressureCount).toBe(1);
    expect(report.groups.printed.memoryPressureCount).toBe(0);
    expect(report.rows[0]?.memoryPressure).toEqual({ callback: 'onTrimMemory', trimLevel: 15 });
    expect(report.rows[1]?.memoryPressure).toEqual({ callback: 'onLowMemory', trimLevel: null });
    if (mode === 'graph') expect(report.summary).toMatchObject({ correct: 0, fullyFlagged: 3 });
    else expect(report.summary.textByPass['1']!.lineRecall).toBe(0);
    const markdown = await readFile(join(root, 'reports', `${basename}.md`), 'utf8');
    expect(markdown).toContain('Biến thể CPU thực nạp (cpuVariant): android_armv8.6_1.');
    expect(markdown).toContain('Số ảnh dừng do memory_pressure: 2.');
    expect(markdown).toContain('hw: onTrimMemory; trimLevel: 15.');
    expect(markdown).toContain('real: onLowMemory; trimLevel: không có (onLowMemory).');
    const json = JSON.parse(await readFile(join(root, 'reports', `${basename}.json`), 'utf8')) as unknown;
    expect(json).toMatchObject({ configuration: { cpuVariant: 'android_armv8.6_1' }, summary: { memoryPressureCount: 2 },
      rows: [{ memoryPressure: { callback: 'onTrimMemory', trimLevel: 15 } }, { memoryPressure: { callback: 'onLowMemory', trimLevel: null } }, {}] });
  });
  it('rejects pressure metadata with a missing, invalid or invented trim level', async () => {
    const { root, file, result, save } = await setup();
    await save([{ ...result, errorCode: 'memory_pressure' }]);
    const json = JSON.parse(await readFile(file, 'utf8')) as { results: Record<string, unknown>[] };
    for (const memoryPressure of [undefined, {}, { callback: 'other', trimLevel: 15 }, { callback: 'onTrimMemory', trimLevel: null },
      { callback: 'onTrimMemory', trimLevel: -1 }, { callback: 'onTrimMemory', trimLevel: 1.5 }, { callback: 'onLowMemory', trimLevel: 80 }]) {
      json.results[0]!.memory = { memoryPressure };
      await writeFile(file, JSON.stringify(json));
      await expect(evaluateDevice(file, root, '2026-11-15', options)).rejects.toThrow('không hợp lệ');
    }
  });
  it('preserves a Dijkstra statement source through export and graph comparison', async () => {
    const { root, file, result, save } = await setup();
    const statementSpec: ProblemSpec = { ...spec, questionFormat: 'dung_sai', task: { type: 'statements', items: Array.from({ length: 4 }, (_, i) =>
      ({ id: String(i + 1), text: 'Nhãn B bằng 7 khi bắt đầu ở A.', check: { type: 'dijkstra_label', source: 'A', v: 'B', value: 7 } })) } };
    await writeFile(join(root, 'testdata/images-synthetic-hw/hw/truth.json'), JSON.stringify(statementSpec));
    const metaFile = join(root, 'testdata/images-synthetic-hw/hw/meta.json');
    const meta = JSON.parse(await readFile(metaFile, 'utf8')) as Record<string, unknown>;
    await writeFile(metaFile, JSON.stringify({ ...meta, questionFormat: 'dung_sai' }));
    const read = await readProblem([{ width: 1, height: 1, pixels: new Uint8ClampedArray([0, 0, 0, 255]) }], { reader: fakeReader(statementSpec), passes: 1 });
    read.usage.engine = engine;
    const graph: ImageResult = { ...result, config: { ...result.config, mode: 'graph', passes: 1 }, outcome: read, usage: { ...result.usage, passes: 1 } };
    delete graph.linePasses;
    await save([graph]);
    const { report } = (await evaluateDevice(file, root, '2026-11-15', options))[0]!;
    expect(report!.summary.completeRate).toBe(1);
    expect(await readFile(file, 'utf8')).toContain('"source": "A"');
  });
  it('retains failed graph runs as incorrect, flagged processing failures', async () => {
    const { root, file, result, save } = await setup();
    const failed: ImageResult = { ...result, config: { ...result.config, mode: 'graph' }, errorCode: 'http_error', usage: { engine, passes: 0, latencyMs: 0 } };
    delete failed.linePasses;
    await save([failed]);
    const { report } = (await evaluateDevice(file, root, '2026-11-15', options))[0]!;
    expect(report!.summary).toMatchObject({ total: 1, correct: 0, fullyFlagged: 1 });
    const previous = await readProblem([{ width: 1, height: 1, pixels: new Uint8ClampedArray([0, 0, 0, 255]) }], { reader: fakeReader(spec), passes: 1 });
    previous.usage.engine = engine;
    await save([{ ...failed, outcome: previous }]);
    const lateFailure = (await evaluateDevice(file, root, '2026-11-15', options))[0]!;
    expect(lateFailure.report.summary.correct).toBe(0);
  });
  it('rejects unknown ids, duplicate same-configuration results and missing line truth', async () => {
    const { root, file, result, save } = await setup();
    await save([{ ...result, id: 'unknown' }]); await expect(evaluateDevice(file, root, '2026-11-15', options)).rejects.toThrow('id');
    await save([result, result]); await expect(evaluateDevice(file, root, '2026-11-15', options)).rejects.toThrow('lặp');
    await save([{ ...result, id: 'real' }]); await rm(join(root, 'testdata/images/real/lines.json'));
    await expect(evaluateDevice(file, root, '2026-11-15', options)).rejects.toThrow('lines.json');
  });
  it.each(['version', 'passes', 'confidence', 'usage', 'engine', 'mode'] as const)('rejects malformed %s before writing reports', async (field) => {
    const { root, file, result, save } = await setup(); await save([result]);
    const json = JSON.parse(await readFile(file, 'utf8')) as { version: number; results: Record<string, unknown>[] };
    const first = json.results[0]!;
    if (field === 'version') json.version = 2;
    else if (field === 'passes') first.config = { ...result.config, passes: 3 };
    else if (field === 'confidence') first.linePasses = [{ usage: result.linePasses![0]!.usage, lines: [{ text: 'x', conf: 5, alternatives: [] }] }, result.linePasses![1]];
    else if (field === 'usage') first.usage = { ...result.usage, latencyMs: -1 };
    else if (field === 'engine') first.engine = 'wrong-engine';
    else first.config = { ...result.config, mode: 'both' };
    await writeFile(file, JSON.stringify(json));
    await expect(evaluateDevice(file, root, '2026-11-15', options)).rejects.toThrow();
  });
});
