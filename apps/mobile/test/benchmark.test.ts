import { describe, expect, it, vi as mock } from 'vitest';
import { Benchmark, exportReport } from '../src/benchmark.js';
import { flagOverlays } from '../src/overlays.js';
import { runBatch } from '../src/batch.js';
import type { BenchmarkConfig, DeviceInfo, HttpTransport, MobilePlugin, Session, ServerState } from '../src/contracts.js';
import type { DecodedImage } from '../src/images.js';
import { sampleWorkSpec } from '../src/work-sample.js';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { evaluateWork } from '../../../tools/eval/src/work-eval.js';

const device: DeviceInfo = { manufacturer: 'Test', model: 'Phone', android: '16', sdk: 36, cores: 8,
  totalRamBytes: 8e9, availableRamBytes: 5e9, freeStorageBytes: 20e9 };
const config: BenchmarkConfig = { model: 'b', passes: 2, mode: 'graph', threads: 4, minRamGb: 6, allowLowRam: false, backgroundIdleMinutes: 5 };
const session: Session = { port: 43210, apiKey: 'a'.repeat(64), reused: false, loadMs: 1000 };
const graph = { representation: 'figure', directed: false,
  vertices: [{ label: 'A', conf: 0, box: [0, 0, 200, 200] }, { label: 'B', conf: 0 }],
  edges: [{ u: 'A', v: 'B', w: 7, wAlternatives: [], name: null, conf: 0 }],
  statedFacts: { vertexCount: null, edgeCount: null, weightUnit: null },
  question: { rawText: 'Đếm cạnh.', format: 'tu_luan', task: { type: 'elements' }, options: [], conf: 0 }, unreadable: [] };
const decoded: DecodedImage = {
  original: { width: 200, height: 100, pixels: new Uint8ClampedArray(200 * 100 * 4), source: 'private.jpg' },
  resized: { width: 100, height: 50, pixels: new Uint8ClampedArray(100 * 50 * 4) }, encoded: 'data:image/png;base64,AQID',
};
function response(text: string, p = 0.95): unknown {
  return { choices: [{ finish_reason: 'stop', message: { content: text }, logprobs: { content: [...text].map((token) => ({
    bytes: [...new TextEncoder().encode(token)], logprob: Math.log(p), top_logprobs: [],
  })) } }], timings: { prompt_ms: 123, predicted_ms: 234, prompt_n: 10, predicted_n: 20 } };
}
function fake() {
  let state: ServerState = { alive: true, peakMemoryMb: 1500, rssMemoryMb: 1200, cpuVariant: 'android_armv8.6_1' };
  const plugin: MobilePlugin = {
    ocrModels: mock.fn(async () => ({ detector: '/det', encoder: '/enc', decoder: '/dec', config: {}, verifyMs: 10 })),
    appMemory: mock.fn(async () => ({ rssMemoryMb: 120, peakMemoryMb: 150 })),
    device: mock.fn(async () => device), models: mock.fn(async () => ({ models: [] })),
    download: mock.fn(async () => {}), deleteModel: mock.fn(async () => {}), cancelDownload: mock.fn(async () => {}), importModel: mock.fn(async () => {}),
    start: mock.fn(async () => ({ ...session })), status: mock.fn(async () => ({ ...state })), stop: mock.fn(async () => {}),
    dataset: mock.fn(async () => ({ entries: [{ id: 'case-1', file: '1.png' }], location: 'internal' as const })),
    datasetImage: mock.fn(async () => ({ dataUrl: decoded.encoded })), exportResult: mock.fn(async () => ({ path: '/private/results/read.json' })),
    saveProgress: mock.fn(async () => ({ path: '/private/results/run-x.json' })),
    setBenchmarkState: mock.fn(async () => {}), cleanupCameraTempFiles: mock.fn(async () => {}),
    post: mock.fn(async () => ({ status: 200, data: response(JSON.stringify(graph)) })),
    cancelRequest: mock.fn(async () => {}), slots: mock.fn(async () => ({ idle: true })),
  };
  const http: HttpTransport = { post: mock.fn(async () => ({ status: 200, data: response(JSON.stringify(graph)) })) };
  const decode = mock.fn(async () => decoded);
  const runner = new Benchmark(plugin, http, decode);
  return { plugin, http, decode, runner, setState: (next: ServerState) => { state = next; } };
}
const image = { id: 'case-1', dataUrl: decoded.encoded, imageSource: 'gallery' as const };
const signal = () => new AbortController().signal;

describe('work benchmark B/C (fake readers, no device or model)', () => {
  it.each(['b', 'c'] as const)('exports %s lines with charConf, parsed, grade and the device linePasses contract', async (model) => {
    const { plugin, http } = fake();
    const pixels = new Uint8ClampedArray(200 * 100 * 4).fill(255);
    const decode = mock.fn(async () => ({ ...decoded, original: { width: 200, height: 100, pixels } }));
    mock.mocked(http.post).mockResolvedValue({ status: 200, data: response('{"lines":[{"text":"Đồ thị có 3 đỉnh.","box":[100,200,900,600],"region":"solution"}]}') });
    const lines = [{ text: 'Đồ thị có 3 đỉnh.', conf: 0.99, charConf: Array.from('Đồ thị có 3 đỉnh.', () => 0.99),
      box: [100, 200, 900, 600] as [number, number, number, number], alternatives: [], region: 'solution' as const }];
    const ocr = mock.fn(async () => ({ linePasses: [{ lines, usage: { engine: 'offline:vietocr-onnx', passes: 1, latencyMs: 1 } }],
      loadMs: 0, wasm: { numThreads: 1, crossOriginIsolated: false, simd: true as const } }));
    const runner = new Benchmark(plugin, http, decode, undefined, ocr);
    const result = await runner.run(image, { ...config, model, mode: 'work', passes: 1, workSpecs: { [image.id]: sampleWorkSpec } }, signal());
    expect(result.errorCode).toBeUndefined(); expect(result.grade?.result.verdict).toBe('DUNG');
    expect(result.lines?.[0]).toMatchObject({ box: [100, 200, 900, 600], page: 0, index: 0 });
    const exported = JSON.parse(exportReport({ version: 1, device, results: [result] }));
    expect(exported.results[0]).toMatchObject({ config: { mode: 'work' }, lines: [{ charConf: expect.any(Array) }],
      parsed: { steps: [{ lines: [0] }] }, grade: { result: { verdict: 'DUNG' } } });
    expect(exported.results[0].linePasses[0].lines).toEqual(exported.results[0].lines);
    expect(exported.results[0].config.workSpecs).toBeUndefined();
    expect(JSON.stringify(exported)).not.toMatch(/data:image|apiKey|private\.jpg|pixels/);
    // Exercise the actual eval:work --lines device loader against a local fixture,
    // independent of the sealed work-text/work-text-tables datasets.
    const folder = await mkdtemp(join(tmpdir(), 'mathtwin-work-device-'));
    try {
      const sample = join(folder, 'testdata/images-synthetic-hw', image.id);
      await mkdir(sample, { recursive: true });
      await writeFile(join(sample, 'truth.json'), JSON.stringify(sampleWorkSpec));
      await writeFile(join(sample, 'meta.json'), JSON.stringify({ source: 'synthetic_handwriting', capture: 'straight',
        blurred: false, synthetic: true, notes: '', questionFormat: 'tu_luan' }));
      await writeFile(join(sample, 'lines.json'), JSON.stringify(result.lines));
      await writeFile(join(sample, 'work.json'), JSON.stringify({ claims: [{ type: 'vertex_count', value: 3, step: 1, raw: lines[0]!.text }],
        lineOf: { 1: [0] }, expected: { verdict: 'DUNG' }, prose: [] }));
      await sharp({ create: { width: 200, height: 100, channels: 4, background: '#fff' } }).png().toFile(join(sample, '1.png'));
      const file = join(folder, 'device.json'); await writeFile(file, JSON.stringify(exported));
      const report = await evaluateWork(['--set', 'synthetic-hw', '--lines', 'device', file, '--parser', 'real'], folder, 'test');
      expect(report.summary.total).toBe(1); expect(report.summary.completeCorrect).toBe(1);
      expect(report.summary.verdictCorrect).toBe(1);
    } finally {
      if (!folder.startsWith(join(tmpdir(), 'mathtwin-work-device-'))) throw new Error('Unexpected test directory');
      await rm(folder, { recursive: true, force: true });
    }
  });
  it('refuses a missing spec and unsupported models before touching native readers', async () => {
    const { runner, plugin, http } = fake();
    for (const model of ['a', 'b', 'c', 'd'] as const) {
      expect((await runner.run(image, { ...config, model, mode: 'work' }, signal())).errorCode).toBe('invalid_work_spec');
    }
    expect(plugin.start).not.toHaveBeenCalled(); expect(plugin.ocrModels).not.toHaveBeenCalled(); expect(http.post).not.toHaveBeenCalled();
  });
});

describe('Android benchmark flow with fake native plugin (no device/model/network)', () => {
  it('defaults to 768px, 300s and shared DRY, and exports the effective settings', async () => {
    const { runner, http, decode } = fake();
    const result = await runner.run(image, { ...config, passes: 1 }, signal());
    expect(decode).toHaveBeenCalledWith(image.dataUrl, 768);
    expect(http.post).toHaveBeenCalledWith(expect.objectContaining({ readTimeout: 300_000,
      data: expect.objectContaining({ max_tokens: 1536, dry_multiplier: 0.8, dry_base: 1.75, dry_allowed_length: 2, dry_penalty_last_n: 64 }) }));
    expect(result.usage).toMatchObject({ finish_reason: ['stop'], sentImages: [{ maxImageSide: 768 }] });
    expect(JSON.parse(exportReport({ version: 1, device, results: [result] }))).toMatchObject({ runtime: { maxTokens: 1536 }, results: [{ config: {
      maxTokens: 1536, maxImageSide: 768, readTimeout: 300_000, dry: { dry_multiplier: 0.8 } } }] });
  });
  it.each([512, 768, 1024])('propagates %dpx, a custom read timeout and disabled DRY to the request/export', async (maxImageSide) => {
    const { runner, http, decode } = fake();
    const result = await runner.run(image, { ...config, passes: 1, maxImageSide, readTimeout: 450_000, maxTokens: 1024,
      dry: { dry_multiplier: 0, dry_base: 2, dry_allowed_length: 3, dry_penalty_last_n: -1 } }, signal());
    expect(decode).toHaveBeenCalledWith(image.dataUrl, maxImageSide);
    expect(http.post).toHaveBeenCalledWith(expect.objectContaining({ readTimeout: 450_000,
      data: expect.objectContaining({ max_tokens: 1024, dry_multiplier: 0, dry_base: 2, dry_allowed_length: 3, dry_penalty_last_n: -1 }) }));
    expect(result.config).toMatchObject({ maxImageSide, readTimeout: 450_000, maxTokens: 1024 });
    expect(result.usage.sentImages?.[0]?.maxImageSide).toBe(maxImageSide);
  });
  it.each(['graph', 'lines'] as const)('retains repetition_loop and finish_reason through failed %s runs and export', async (mode) => {
    const { runner, http } = fake();
    mock.mocked(http.post).mockResolvedValue({ status: 200, data: { choices: [{ finish_reason: 'length', message: { content: '{"lines":[' } }] } });
    const result = await runner.run(image, { ...config, mode }, signal());
    expect(result.errorCode).toBe('repetition_loop'); expect(result.linePasses ?? []).toEqual([]);
    expect(result.usage).toMatchObject({ finish_reason: ['length'], sentImages: [{ maxImageSide: 768 }] });
    expect(JSON.parse(exportReport({ version: 1, device, results: [result] }))).toMatchObject({ results: [{ errorCode: 'repetition_loop', usage: { finish_reason: ['length'] } }] });
  });
  it('runs a stripped-fence response end-to-end with measured confidence', async () => {
    const { runner, http } = fake();
    const text = '{"lines":[{"text":"Đề sai 7"}]}';
    const raw = response('```json\n' + text + '\n```', 0.7) as { choices: { message: { content: string } }[] };
    raw.choices[0]!.message.content = text;
    mock.mocked(http.post).mockResolvedValue({ status: 200, data: raw });
    const result = await runner.run(image, { ...config, mode: 'lines', passes: 1 }, signal());
    expect(result.errorCode).toBeUndefined(); expect(result.linePasses?.[0]?.lines[0]?.conf).toBe(0.7);
  });
  it.each(['native', 'javascript'] as const)('cancels a %s read timeout, checks slots and allows the next image without the old response', async (source) => {
    mock.useFakeTimers();
    try {
      const { runner, http, plugin } = fake();
      if (source === 'native') mock.mocked(http.post).mockRejectedValueOnce({ code: 'timeout' });
      else mock.mocked(http.post).mockImplementationOnce(async () => new Promise(() => {}));
      const run = runner.run(image, { ...config, passes: 1, readTimeout: 1000 }, signal());
      await mock.advanceTimersByTimeAsync(source === 'native' ? 0 : 1000);
      const failed = await run;
      expect(failed.errorCode).toBe('timeout'); expect(failed.serverRestarted).toBe(false);
      const requestId = mock.mocked(http.post).mock.calls[0]![0].requestId;
      expect(plugin.cancelRequest).toHaveBeenCalledWith({ requestId });
      expect(plugin.slots).toHaveBeenCalledOnce(); expect(plugin.stop).not.toHaveBeenCalled();
      const next = await runner.run({ ...image, id: 'next' }, { ...config, passes: 1 }, signal());
      expect(next.errorCode).toBeUndefined();
      expect(mock.mocked(http.post).mock.calls[1]![0].requestId).not.toBe(requestId);
      expect(mock.mocked(plugin.cancelRequest).mock.invocationCallOrder[0]).toBeLessThan(mock.mocked(plugin.slots).mock.invocationCallOrder[0]!);
    } finally { mock.useRealTimers(); }
  });
  it.each(['busy', 'unreachable', 'hung'] as const)('stops a %s slot after five seconds and cold-starts the next image', async (state) => {
    mock.useFakeTimers();
    try {
      const { runner, plugin, http } = fake();
      mock.mocked(http.post).mockRejectedValueOnce({ code: 'timeout' });
      if (state === 'busy') mock.mocked(plugin.slots).mockResolvedValue({ idle: false });
      if (state === 'unreachable') mock.mocked(plugin.slots).mockRejectedValue({ code: 'http_error' });
      if (state === 'hung') mock.mocked(plugin.slots).mockImplementation(async () => new Promise(() => {}));
      let stopped = false;
      mock.mocked(plugin.stop).mockImplementation(async () => { stopped = true; });
      const run = runner.run(image, { ...config, passes: 1 }, signal());
      await mock.advanceTimersByTimeAsync(4999); expect(plugin.stop).not.toHaveBeenCalled();
      await mock.advanceTimersByTimeAsync(1);
      const failed = await run;
      expect(failed).toMatchObject({ errorCode: 'timeout', serverRestarted: true });
      expect(plugin.stop).toHaveBeenCalledOnce(); expect(plugin.cancelRequest).toHaveBeenCalledOnce();
      mock.mocked(plugin.start).mockImplementation(async () => {
        expect(stopped).toBe(true); return { ...session, reused: false, loadMs: 500 };
      });
      const next = await runner.run({ ...image, id: 'next' }, { ...config, passes: 1 }, signal());
      expect(next).toMatchObject({ reusedModel: false, modelLoadMs: 500, serverRestarted: false });
      expect(next.errorCode).toBeUndefined();
      expect(JSON.parse(exportReport({ version: 1, device, results: [failed, next] }))).toMatchObject({ results: [
        { serverRestarted: true }, { serverRestarted: false },
      ] });
    } finally { mock.useRealTimers(); }
  });
  it('waits for a temporarily busy slot before reusing the server', async () => {
    mock.useFakeTimers();
    try {
      const { runner, plugin, http } = fake();
      mock.mocked(http.post).mockRejectedValueOnce({ code: 'timeout' });
      mock.mocked(plugin.slots).mockResolvedValueOnce({ idle: false });
      const run = runner.run(image, { ...config, passes: 1 }, signal());
      await mock.advanceTimersByTimeAsync(100);
      expect(await run).toMatchObject({ errorCode: 'timeout', serverRestarted: false });
      expect(plugin.slots).toHaveBeenCalledTimes(2); expect(plugin.stop).not.toHaveBeenCalled();
    } finally { mock.useRealTimers(); }
  });
  it('preserves user cancellation when a busy slot requires stopping the server', async () => {
    mock.useFakeTimers();
    try {
      const { runner, plugin, http } = fake(); const abort = new AbortController();
      mock.mocked(http.post).mockImplementationOnce(async () => { abort.abort(); return new Promise(() => {}); });
      mock.mocked(plugin.slots).mockResolvedValue({ idle: false });
      const run = runner.run(image, { ...config, passes: 1 }, abort.signal);
      await mock.advanceTimersByTimeAsync(5000);
      expect(await run).toMatchObject({ errorCode: 'aborted', serverRestarted: true });
      expect(plugin.cancelRequest).toHaveBeenCalledOnce(); expect(plugin.stop).toHaveBeenCalledOnce();
    } finally { mock.useRealTimers(); }
  });
  it('keeps the total image deadline during a hung preparation before HTTP exists', async () => {
    mock.useFakeTimers();
    try {
      const { runner, plugin, http, decode } = fake();
      mock.mocked(decode).mockImplementationOnce(async () => new Promise(() => {}));
      const run = runner.run(image, { ...config, passes: 1, readTimeout: 1000 }, signal());
      await mock.advanceTimersByTimeAsync(181_000);
      expect(await run).toMatchObject({ errorCode: 'timeout', serverRestarted: false });
      expect(plugin.stop).toHaveBeenCalled(); expect(http.post).not.toHaveBeenCalled();
    } finally { mock.useRealTimers(); }
  });
  it.each([0, -1, 1.5, 8193, NaN])('rejects invalid maxTokens=%s before native startup', async (maxTokens) => {
    const { runner, plugin } = fake();
    expect((await runner.run(image, { ...config, maxTokens }, signal())).errorCode).toBe('native_error');
    expect(plugin.start).not.toHaveBeenCalled();
  });
  it('runs independent edges/neighbors requests on authenticated loopback and reuses common parser', async () => {
    const { runner, http } = fake();
    const result = await runner.run(image, config, signal());
    expect(result.errorCode).toBeUndefined();
    expect(result.outcome?.spec?.graph.edges).toHaveLength(1);
    expect(result.usage).toMatchObject({ passes: 2, peakMemoryMb: 1500, serverTimings: { promptMs: 246, predictedMs: 468 } });
    expect(result.modelLoadMs).toBe(1000);
    const calls = mock.mocked(http.post).mock.calls.map(([v]) => v);
    expect(calls).toHaveLength(2);
    expect(calls[0]).toMatchObject({ url: 'http://127.0.0.1:43210/v1/chat/completions', headers: { Authorization: `Bearer ${session.apiKey}` }, disableRedirects: true });
    expect(JSON.stringify(calls[0]!.data)).toContain('Trace every drawn edge');
    expect(JSON.stringify(calls[1]!.data)).toContain('Start afresh at each vertex');
    expect(JSON.stringify(calls[1]!.data)).not.toContain('Đếm cạnh');
    expect(result.outcome?.drafts[0]?.vertices[0]?.box).toEqual([0, 0, 40, 20]);
    expect(result.outcome?.drafts[0]?.vertices[0]?.conf).toBeCloseTo(0.95);
  });
  it('records cold load versus warm server reuse across images', async () => {
    const { runner, plugin } = fake();
    const cold = await runner.run(image, { ...config, passes: 1 }, signal());
    mock.mocked(plugin.start).mockResolvedValue({ ...session, reused: true, loadMs: 0 });
    const warm = await runner.run({ ...image, id: 'case-2' }, { ...config, passes: 1 }, signal());
    expect(cold.reusedModel).toBe(false); expect(warm.reusedModel).toBe(true); expect(warm.modelLoadMs).toBe(0);
    expect(plugin.stop).not.toHaveBeenCalled();
  });
  it('runs two independent line passes, keeps Vietnamese mistakes and flags measured low confidence', async () => {
    const { runner, http } = fake();
    mock.mocked(http.post).mockResolvedValue({ status: 200, data: response(JSON.stringify({ lines: [{ text: 'Bậc A = 9', box: [0, 0, 500, 500] }] }), 0.7) });
    const result = await runner.run(image, { ...config, mode: 'lines' }, signal());
    expect(result.linePasses).toHaveLength(2);
    expect(result.linePasses?.[0]?.lines[0]?.text).toBe('Bậc A = 9'.normalize('NFC'));
    expect(result.linePasses?.[0]?.lines[0]?.box).toEqual([0, 0, 100, 50]);
    expect(flagOverlays(result)).toHaveLength(2);
    expect(result.usage.serverTimings?.predictedTokens).toBe(40);
    expect(mock.mocked(http.post).mock.calls[0]?.[0].data).toEqual(mock.mocked(http.post).mock.calls[1]?.[0].data);
  });
  it('supports Paddle spotting and returns text_only without starting model for graph', async () => {
    const { runner, http, plugin } = fake();
    const unsupported = await runner.run(image, { ...config, model: 'a' }, signal());
    expect(unsupported.errorCode).toBe('text_only'); expect(plugin.start).not.toHaveBeenCalled();
    mock.mocked(http.post).mockResolvedValue({ status: 200, data: response('<|TEXT_START|>A = 8<|TEXT_END|><|LOC_BEGIN|><|LOC_0|><|LOC_0|><|LOC_500|><|LOC_0|><|LOC_500|><|LOC_500|><|LOC_0|><|LOC_500|><|LOC_END|>') });
    const result = await runner.run(image, { ...config, model: 'a', mode: 'lines', passes: 1 }, signal());
    expect(result.errorCode).toBeUndefined(); expect(result.linePasses?.[0]?.lines[0]?.text).toBe('A = 8');
    expect(JSON.stringify(mock.mocked(http.post).mock.calls[0]?.[0].data)).toContain('Spotting:');
  });
  it.each(['graph', 'lines'] as const)('rejects malformed completion in %s mode with explicit code', async (mode) => {
    const { runner, http, plugin } = fake();
    mock.mocked(http.post).mockResolvedValue({ status: 200, data: response('broken JSON') });
    const result = await runner.run(image, { ...config, mode }, signal());
    expect(result.errorCode).toBe('invalid_json'); // The HTTP request completed; a parse failure does not mean the server is unhealthy.
    expect(plugin.stop).not.toHaveBeenCalled();
    if (mode === 'graph') expect(result.outcome?.issues[0]?.code).toBe('read_failed');
  });
  it('does not invent confidence when token probabilities are missing', async () => {
    const { runner, http } = fake();
    mock.mocked(http.post).mockResolvedValue({ status: 200, data: { choices: [{ finish_reason: 'stop', message: { content: '{"lines":[]}' } }] } });
    expect((await runner.run(image, { ...config, mode: 'lines' }, signal())).errorCode).toBe('missing_probs');
  });
  it('blocks low RAM before starting and allows an explicitly acknowledged run', async () => {
    const { runner, plugin } = fake(); mock.mocked(plugin.device).mockResolvedValue({ ...device, totalRamBytes: 4e9 });
    expect((await runner.run(image, config, signal())).errorCode).toBe('low_ram'); expect(plugin.start).not.toHaveBeenCalled();
    expect((await runner.run(image, { ...config, allowLowRam: true }, signal())).errorCode).toBeUndefined();
  });
  it('surfaces native execution refusal without changing architecture', async () => {
    const { runner, plugin, http } = fake(); mock.mocked(plugin.start).mockRejectedValue({ code: 'exec_blocked' });
    expect((await runner.run(image, config, signal())).errorCode).toBe('exec_blocked'); expect(http.post).not.toHaveBeenCalled();
  });
  it('cancels native startup even if the native promise ignores AbortSignal', async () => {
    const { runner, plugin } = fake(); const abort = new AbortController();
    mock.mocked(plugin.start).mockImplementation(async () => { abort.abort(); return new Promise<Session>(() => {}); });
    const result = await runner.run(image, config, abort.signal);
    expect(result.errorCode).toBe('aborted'); expect(plugin.stop).toHaveBeenCalled();
  });
  it('cancels a hung native request and reuses the server only after its slot is idle', async () => {
    const { runner, http, plugin } = fake(); const abort = new AbortController();
    mock.mocked(http.post).mockImplementation(async () => { abort.abort(); return new Promise(() => {}); });
    expect((await runner.run(image, config, abort.signal)).errorCode).toBe('aborted');
    expect(plugin.cancelRequest).toHaveBeenCalledWith({ requestId: mock.mocked(http.post).mock.calls[0]![0].requestId });
    expect(plugin.slots).toHaveBeenCalledWith({ url: `http://127.0.0.1:${session.port}/slots`, headers: { Authorization: `Bearer ${session.apiKey}` }, timeout: 500 });
    expect(plugin.stop).not.toHaveBeenCalled();
  });
  it('detects a killed server despite a late successful HTTP result', async () => {
    const { runner, http, setState } = fake();
    mock.mocked(http.post).mockImplementation(async () => {
      setState({ alive: false, exitCode: 137, peakMemoryMb: 2100 });
      return { status: 200, data: response(JSON.stringify(graph)) };
    });
    const result = await runner.run(image, { ...config, passes: 1 }, signal());
    expect(result.errorCode).toBe('server_killed'); expect(result.memory?.peakMemoryMb).toBe(2100);
  });
  it('reports a killed child when native HTTP rejects before the next status poll', async () => {
    const { runner, http, setState } = fake();
    mock.mocked(http.post).mockImplementation(async () => {
      setState({ alive: false, exitCode: 137, peakMemoryMb: 2300 }); throw new Error('connection reset');
    });
    const result = await runner.run(image, { ...config, passes: 1 }, signal());
    expect(result.errorCode).toBe('server_killed'); expect(result.memory?.peakMemoryMb).toBe(2300);
  });
  it.each(['graph', 'lines'] as const)('recovers memory_pressure and trim level from cancelled native startup in %s mode', async (mode) => {
    const { runner, plugin, http, setState } = fake();
    mock.mocked(plugin.start).mockImplementation(async () => {
      setState({ alive: false, memoryPressure: { callback: 'onTrimMemory', trimLevel: 15 } });
      throw { code: 'aborted' };
    });
    const result = await runner.run(image, { ...config, mode }, signal());
    expect(result.errorCode).toBe('memory_pressure');
    expect(result.memory?.memoryPressure).toEqual({ callback: 'onTrimMemory', trimLevel: 15 });
    expect(http.post).not.toHaveBeenCalled(); expect(plugin.stop).toHaveBeenCalled();
  });
  it.each(['graph', 'lines'] as const)('detects pressure before sending any %s request, even while process teardown is pending', async (mode) => {
    const { runner, http, setState } = fake();
    setState({ alive: true, memoryPressure: { callback: 'onLowMemory', trimLevel: null } });
    const result = await runner.run(image, { ...config, mode }, signal());
    expect(result.errorCode).toBe('memory_pressure'); expect(http.post).not.toHaveBeenCalled();
  });
  it.each(['graph', 'lines'] as const)('preserves pressure metadata across HTTP rejection, non-200 and late success in %s mode', async (mode) => {
    for (const transport of ['reject', 'non-200', 'late-success']) {
      const { runner, http, setState } = fake();
      mock.mocked(http.post).mockImplementation(async () => {
        setState({ alive: false, exitCode: 137, peakMemoryMb: 2400, cpuVariant: 'android_armv8.6_1',
          memoryPressure: { callback: 'onTrimMemory', trimLevel: 80 } });
        if (transport === 'reject') throw new Error('connection reset');
        return { status: transport === 'non-200' ? 503 : 200, data: response(JSON.stringify(mode === 'graph' ? graph : { lines: [] })) };
      });
      const result = await runner.run(image, { ...config, mode, passes: 1 }, signal());
      expect(result.errorCode, transport).toBe('memory_pressure');
      expect(result.memory).toMatchObject({ peakMemoryMb: 2400, memoryPressure: { callback: 'onTrimMemory', trimLevel: 80 } });
      const exported = JSON.parse(exportReport({ version: 1, device, results: [result] })) as { results: unknown[] };
      expect(exported.results[0]).toMatchObject({ errorCode: 'memory_pressure', config: { cpuVariant: 'android_armv8.6_1' },
        memory: { memoryPressure: { callback: 'onTrimMemory', trimLevel: 80 } } });
    }
  });
  it.each(['graph', 'lines'] as const)('polls pressure during a hung %s request and ends the batch before loading the next image', async (mode) => {
    mock.useFakeTimers();
    try {
      const { runner, plugin, http, setState } = fake();
      mock.mocked(http.post).mockImplementation(async () => {
        setState({ alive: false, cpuVariant: 'android_armv8.6_1', memoryPressure: { callback: 'onLowMemory', trimLevel: null } });
        return new Promise(() => {});
      });
      const results: string[] = [];
      const run = runBatch({ dataset: { name: 'set', location: 'internal', entries: [{ id: 'one', file: '1.png' }, { id: 'two', file: '2.png' }] } },
        { ...config, mode }, plugin, runner, signal(), (result) => {
          results.push(result.errorCode!);
          expect(result.memory?.memoryPressure).toEqual({ callback: 'onLowMemory', trimLevel: null });
        });
      await mock.advanceTimersByTimeAsync(250); await run;
      expect(results).toEqual(['memory_pressure']); expect(plugin.datasetImage).toHaveBeenCalledTimes(1);
      expect(plugin.stop).toHaveBeenCalled();
      expect(plugin.setBenchmarkState).toHaveBeenLastCalledWith({ running: false, backgroundIdleMinutes: 5 });
    } finally { mock.useRealTimers(); }
  });
  it.each(['aborted', 'timeout'] as const)('keeps explicit %s distinct from a pressure-free server stop', async (cause) => {
    mock.useFakeTimers();
    try {
      const { runner, http, setState } = fake(); const abort = new AbortController();
      mock.mocked(http.post).mockImplementation(async () => {
        if (cause === 'aborted') abort.abort();
        return new Promise(() => {});
      });
      const run = runner.run(image, config, abort.signal);
      await mock.advanceTimersByTimeAsync(cause === 'timeout' ? 780_000 : 0);
      setState({ alive: false });
      expect((await run).errorCode).toBe(cause);
    } finally { mock.useRealTimers(); }
  });
  it.each(['reject', 'non-200', 'server-exit'] as const)('does not infer memory pressure from a pressure-free %s failure', async (transport) => {
    const { runner, http, setState } = fake();
    mock.mocked(http.post).mockImplementation(async () => {
      if (transport === 'server-exit') setState({ alive: false, exitCode: 1 });
      if (transport !== 'non-200') throw new Error('connection reset');
      return { status: 503, data: {} };
    });
    const result = await runner.run(image, { ...config, passes: 1 }, signal());
    expect(result.errorCode).toBe(transport === 'server-exit' ? 'server_exit' : 'http_error');
    expect(result.memory?.memoryPressure).toBeUndefined();
  });
  it('rejects invalid runtime/session configuration before sending an image', async () => {
    const { runner, http, plugin } = fake();
    expect((await runner.run(image, { ...config, threads: 0 }, signal())).errorCode).toBe('native_error');
    mock.mocked(plugin.start).mockResolvedValue({ ...session, port: 70000 });
    expect((await runner.run(image, config, signal())).errorCode).toBe('native_error'); expect(http.post).not.toHaveBeenCalled();
  });
  it('exports per-image config/usage/outcome and device data, excludes image bytes and keys', async () => {
    const { runner, plugin } = fake();
    const result = await runner.run(image, config, signal());
    const raw = exportReport({ version: 1, device, results: [Object.assign(result, { image, pixels: decoded.original.pixels, apiKey: session.apiKey })] });
    expect(raw).not.toContain('data:image'); expect(raw).not.toContain('private.jpg'); expect(raw).not.toContain('pixels'); expect(raw).not.toContain(session.apiKey);
    const out = JSON.parse(raw) as { device: DeviceInfo; results: { imageSource: string; config: BenchmarkConfig & { backend: string; cpuVariant: string } }[] };
    expect(out.device.model).toBe('Phone'); expect(out.results[0]?.config.backend).toBe('CPU');
    expect(out.results[0]?.imageSource).toBe('gallery'); expect(out.results[0]?.config.cpuVariant).toBe('android_armv8.6_1');
    expect(out.results[0]?.config.backgroundIdleMinutes).toBe(5);
    await plugin.exportResult({ json: raw }); expect(plugin.exportResult).toHaveBeenCalledWith({ json: raw });
  });
  it.each(['maps', 'log'] as const)('exports cpuVariantSource=%s for both cold and reused server runs', async (cpuVariantSource) => {
    const { runner, plugin, setState } = fake();
    setState({ alive: true, peakMemoryMb: 1884, cpuVariant: 'android_armv8.6_1', cpuVariantSource });
    const cold = await runner.run(image, { ...config, passes: 1 }, signal());
    mock.mocked(plugin.start).mockResolvedValue({ ...session, reused: true, loadMs: 0, verifyMs: 0 });
    const warm = await runner.run({ ...image, id: 'warm' }, { ...config, passes: 1 }, signal());
    const raw = exportReport({ version: 1, device, results: [cold, warm] });
    const exported = JSON.parse(raw) as { results: unknown[] };
    expect(exported.results).toHaveLength(2);
    for (const result of exported.results) expect(result).toMatchObject({
      config: { cpuVariant: 'android_armv8.6_1', cpuVariantSource },
      memory: { cpuVariant: 'android_armv8.6_1', cpuVariantSource },
    });
    expect(warm.reusedModel).toBe(true);
    expect(raw).not.toContain(session.apiKey);
    expect(raw).not.toContain('/proc/');
    expect(raw).not.toContain('data:image');
  });
  it('omits an unavailable CPU source from exports instead of inventing one', async () => {
    const { runner } = fake();
    const result = await runner.run(image, config, signal());
    expect(exportReport({ version: 1, device, results: [result] })).not.toContain('cpuVariantSource');
  });
  it.each(['success', 'invalid-json'])('stops the dataset on a late CPU maps/log conflict despite %s HTTP output', async (output) => {
    const { runner, plugin, http, setState } = fake();
    mock.mocked(http.post).mockImplementation(async () => {
      setState({ alive: true, peakMemoryMb: 1884, errorCode: 'cpu_backend_unknown' });
      return { status: 200, data: response(output === 'invalid-json' ? '{' : JSON.stringify({ lines: [{ text: 'A = 8', box: [0, 0, 500, 500] }] })) };
    });
    const results: string[] = [];
    await runBatch({ dataset: { name: 'set', location: 'internal', entries: [{ id: 'one', file: '1.png' }, { id: 'two', file: '2.png' }] } },
      { ...config, mode: 'lines', passes: 1 }, plugin, runner, signal(), (result) => {
        results.push(result.errorCode!);
        expect(result.memory?.peakMemoryMb).toBe(1884);
      });
    expect(results).toEqual(['cpu_backend_unknown']);
    expect(plugin.datasetImage).toHaveBeenCalledTimes(1);
    expect(plugin.stop).toHaveBeenCalled();
  });
  it('loads dataset entries lazily in order and stops the batch on execution refusal', async () => {
    const { runner, plugin, http } = fake(); const order: string[] = [];
    mock.mocked(plugin.datasetImage).mockImplementation(async ({ file }) => { order.push(file); return { dataUrl: decoded.encoded }; });
    const entries = [{ id: 'one', file: '1.png' }, { id: 'two', file: '2.jpg' }];
    await runBatch({ dataset: { name: 'set', location: 'internal', entries } }, { ...config, passes: 1 }, plugin, runner, signal(), (r) => { order.push(r.id); });
    expect(order).toEqual(['1.png', 'one', '2.jpg', 'two']); expect(http.post).toHaveBeenCalledTimes(2);
    order.length = 0;
    mock.mocked(plugin.start).mockRejectedValue({ code: 'exec_blocked' });
    await runBatch({ dataset: { name: 'set', location: 'internal', entries } }, config, plugin, runner, signal(), (r) => { order.push(r.errorCode!); });
    expect(order).toEqual(['1.png', 'exec_blocked']);
  });
  it('does not load the next dataset image after cancellation', async () => {
    const { runner, plugin } = fake(); const abort = new AbortController();
    await runBatch({ dataset: { name: 'set', location: 'internal', entries: [{ id: 'one', file: '1.png' }, { id: 'two', file: '2.jpg' }] } },
      { ...config, passes: 1 }, plugin, runner, abort.signal, () => abort.abort());
    expect(plugin.datasetImage).toHaveBeenCalledTimes(1);
    expect(mock.mocked(plugin.setBenchmarkState).mock.calls).toEqual([
      [{ running: true, backgroundIdleMinutes: 5 }], [{ running: false, backgroundIdleMinutes: 5 }],
    ]);
  });
  it('holds the screen-on/native measuring state for a complete batch without stopping a warm server between images', async () => {
    const { runner, plugin } = fake(); const order: string[] = [];
    mock.mocked(plugin.setBenchmarkState).mockImplementation(async ({ running }) => { order.push(running ? 'screen-on' : 'screen-off'); });
    const results: string[] = [];
    await runBatch({ dataset: { name: 'set', location: 'internal', entries: [{ id: 'one', file: '1.png' }, { id: 'two', file: '2.png' }] } },
      { ...config, passes: 1, backgroundIdleMinutes: 7 }, plugin, runner, signal(), (r) => { order.push(r.id); results.push(r.imageSource); });
    expect(order).toEqual(['screen-on', 'one', 'two', 'screen-off']); expect(results).toEqual(['dataset', 'dataset']);
    expect(plugin.stop).not.toHaveBeenCalled();
    expect(plugin.setBenchmarkState).toHaveBeenLastCalledWith({ running: false, backgroundIdleMinutes: 7 });
  });
  it('always clears native measuring/screen-on state if the screen callback throws', async () => {
    const { runner, plugin } = fake();
    await expect(runBatch({ images: [image] }, config, plugin, runner, signal(), () => { throw new Error('view closed'); })).rejects.toThrow('view closed');
    expect(plugin.setBenchmarkState).toHaveBeenLastCalledWith({ running: false, backgroundIdleMinutes: 5 });
  });
  it.each(['internal', 'external'] as const)('loads every dataset image from the selected %s location', async (location) => {
    const { runner, plugin } = fake();
    await runBatch({ dataset: { name: 'same-name', location, entries: [{ id: 'one', file: '1.png' }, { id: 'two', file: '2.jpg' }] } },
      { ...config, passes: 1 }, plugin, runner, signal(), () => {});
    expect(mock.mocked(plugin.datasetImage).mock.calls).toEqual([
      [{ name: 'same-name', file: '1.png', location }],
      [{ name: 'same-name', file: '2.jpg', location }],
    ]);
  });
  it('exports camera method alongside image source without including photo data', async () => {
    const { runner } = fake();
    const result = await runner.run({ ...image, imageSource: 'camera', captureMethod: 'system' }, { ...config, passes: 1 }, signal());
    const raw = exportReport({ version: 1, device, results: [result] });
    expect(JSON.parse(raw)).toMatchObject({ results: [{ imageSource: 'camera', captureMethod: 'system' }] }); expect(raw).not.toContain('data:image');
  });
  it('saves the cumulative run after every image so an interrupted run keeps its results', async () => {
    const { runner, plugin } = fake();
    await runBatch({ dataset: { name: 'set', location: 'internal', entries: [{ id: 'one', file: '1.png' }, { id: 'two', file: '2.png' }] } },
      { ...config, passes: 1 }, plugin, runner, signal(), () => {}, { runId: 'run-1', device });
    const calls = mock.mocked(plugin.saveProgress).mock.calls.map(([o]) => ({ runId: o.runId, ids: (JSON.parse(o.json) as { results: { id: string }[] }).results.map((r) => r.id) }));
    expect(calls).toEqual([{ runId: 'run-1', ids: ['one'] }, { runId: 'run-1', ids: ['one', 'two'] }]);
    expect(mock.mocked(plugin.saveProgress).mock.calls[0]![0].json).not.toContain('data:image');
  });
  it('keeps measuring when saving progress fails', async () => {
    const { runner, plugin } = fake(); const ids: string[] = [];
    mock.mocked(plugin.saveProgress).mockRejectedValue({ code: 'native_error' });
    await runBatch({ images: [image, { ...image, id: 'case-2' }] }, { ...config, passes: 1 }, plugin, runner, signal(), (r) => { ids.push(r.id); }, { runId: 'r', device });
    expect(ids).toEqual(['case-1', 'case-2']);
  });
  it('runs engine D without starting a server and refuses lines mode', async () => {
    const { runner, plugin, http } = fake();
    const result = await runner.run(image, { ...config, model: 'd', passes: 2 }, signal());
    expect(result.engine).toBe('offline:figure-cv'); expect(result.config.passes).toBe(1); expect(result.errorCode).toBeUndefined();
    expect(result.outcome?.graph?.vertices).toEqual([]);
    expect(plugin.start).not.toHaveBeenCalled(); expect(http.post).not.toHaveBeenCalled();
    const lines = await runner.run(image, { ...config, model: 'd', mode: 'lines' }, signal());
    expect(lines.errorCode).toBe('graph_only');
  });
});


describe('engine C benchmark with fake worker/plugin', () => {
  const c: BenchmarkConfig = { ...config, model: 'c', mode: 'lines', passes: 1, readTimeout: 1000 };
  const output = { linePasses: [{ lines: [{ text: 'ố', conf: 0.6, alternatives: ['ẹ'], charConf: [0.6] }],
    usage: { engine: 'offline:vietocr-onnx', passes: 1, latencyMs: 20, detectionMs: 5, recognitionMs: 15, lineCount: 1, lineMs: [15] } }],
    loadMs: 7, wasm: { numThreads: 1, crossOriginIsolated: false, simd: true as const } };
  it('verifies C, reads original pixels, collects app RAM and exports metadata without local paths', async () => {
    const { plugin, http, decode } = fake(), ocr = mock.fn(async () => output);
    const runner = new Benchmark(plugin, http, decode, undefined, ocr);
    const result = await runner.run(image, c, signal());
    expect(result.errorCode).toBeUndefined();
    expect(plugin.ocrModels).toHaveBeenCalledOnce(); expect(plugin.start).not.toHaveBeenCalled(); expect(http.post).not.toHaveBeenCalled();
    expect(ocr).toHaveBeenCalledWith(expect.objectContaining({ image: decoded.original, threads: 4, passes: 1 }), expect.any(AbortSignal));
    expect(result).toMatchObject({ engine: 'offline:vietocr-onnx', modelVerifyMs: 10, modelLoadMs: 7, totalMs: expect.any(Number),
      memory: { rssMemoryMb: 120, peakMemoryMb: 150 }, usage: { lineMs: [15], lineCount: 1 } });
    const json = exportReport({ version: 1, device, results: [result] });
    expect(JSON.parse(json)).toMatchObject({ results: [{ wasm: output.wasm, config: { backend: 'WASM' }, linePasses: output.linePasses }] });
    const oldResult = { ...result, linePasses: [{ ...output.linePasses[0]!, lines: [{ text: 'ố', conf: 0.6, alternatives: ['ẹ'] }] }] };
    expect(exportReport({ version: 1, device, results: [oldResult] })).not.toContain('charConf');
    expect(json).not.toContain('/det'); expect(json).not.toContain('pixels');
  });
  it('graph mode fails before model loading', async () => {
    const { plugin, http, decode } = fake(), ocr = mock.fn(async () => output);
    const result = await new Benchmark(plugin, http, decode, undefined, ocr).run(image, { ...c, mode: 'graph' }, signal());
    expect(result.errorCode).toBe('unsupported_mode'); expect(plugin.ocrModels).not.toHaveBeenCalled(); expect(ocr).not.toHaveBeenCalled();
  });
  it('checksum failure never invokes inference', async () => {
    const { plugin, http, decode } = fake(), ocr = mock.fn(async () => output);
    mock.mocked(plugin.ocrModels).mockRejectedValue({ code: 'checksum' });
    const result = await new Benchmark(plugin, http, decode, undefined, ocr).run(image, c, signal());
    expect(result.errorCode).toBe('checksum'); expect(ocr).not.toHaveBeenCalled();
  });
  it.each(['aborted', 'timeout'] as const)('%s cancels inference and permits the next image', async (code) => {
    mock.useFakeTimers();
    try {
      const { plugin, http, decode } = fake(), abort = new AbortController();
      let workerSignal: AbortSignal | undefined;
      const ocr = mock.fn(async (_request: unknown, s: AbortSignal) => { workerSignal = s; return new Promise<typeof output>(() => {}); });
      const runner = new Benchmark(plugin, http, decode, undefined, ocr);
      const pending = runner.run(image, c, abort.signal);
      for (let i = 0; i < 30 && !workerSignal; i++) await Promise.resolve();
      expect(workerSignal).toBeDefined();
      if (code === 'aborted') abort.abort(); else await mock.advanceTimersByTimeAsync(181001);
      expect((await pending).errorCode).toBe(code); expect(workerSignal!.aborted).toBe(true);
      ocr.mockResolvedValueOnce(output);
      expect((await runner.run(image, c, signal())).errorCode).toBeUndefined();
    } finally { mock.useRealTimers(); }
  });
  it('app memory pressure cancels inference and retains the callback', async () => {
    mock.useFakeTimers();
    try {
      const { plugin, http, decode } = fake(); let workerSignal: AbortSignal | undefined;
      const ocr = mock.fn(async (_request: unknown, s: AbortSignal) => { workerSignal = s; return new Promise<typeof output>(() => {}); });
      const pending = new Benchmark(plugin, http, decode, undefined, ocr).run(image, c, signal());
      for (let i = 0; i < 30 && !workerSignal; i++) await Promise.resolve();
      mock.mocked(plugin.appMemory).mockResolvedValue({ memoryPressure: { callback: 'onLowMemory', trimLevel: null } });
      await mock.advanceTimersByTimeAsync(251);
      expect(await pending).toMatchObject({ errorCode: 'memory_pressure', memory: { memoryPressure: { callback: 'onLowMemory' } } });
      expect(workerSignal!.aborted).toBe(true);
    } finally { mock.useRealTimers(); }
  });
});

it('C cancellation interrupts native SHA verification and waits for its exclusive slot', async () => {
  const { plugin, http, decode } = fake(), abort = new AbortController();
  let rejectVerify: (reason: unknown) => void = () => {};
  mock.mocked(plugin.ocrModels).mockImplementation(() => new Promise((_, reject) => { rejectVerify = reject; }));
  mock.mocked(plugin.cancelDownload).mockImplementation(async () => { rejectVerify({ code: 'aborted' }); });
  const ocr = mock.fn(async () => ({ linePasses: [], loadMs: 0, wasm: { numThreads: 1, crossOriginIsolated: false, simd: true as const } }));
  const runner = new Benchmark(plugin, http, decode, undefined, ocr);
  const pending = runner.run(image, { ...config, model: 'c', mode: 'lines' }, abort.signal);
  for (let i = 0; i < 30 && !mock.mocked(plugin.ocrModels).mock.calls.length; i++) await Promise.resolve();
  expect(plugin.ocrModels).toHaveBeenCalledOnce();
  abort.abort();
  expect((await pending).errorCode).toBe('aborted'); expect(plugin.cancelDownload).toHaveBeenCalledOnce();
  expect(ocr).not.toHaveBeenCalled();
});
