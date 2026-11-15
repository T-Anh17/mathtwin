import { describe, expect, it, vi as mock } from 'vitest';
import { Benchmark, exportReport } from '../src/benchmark.js';
import { flagOverlays } from '../src/overlays.js';
import { runBatch } from '../src/batch.js';
import type { BenchmarkConfig, DeviceInfo, HttpTransport, MobilePlugin, Session, ServerState } from '../src/contracts.js';
import type { DecodedImage } from '../src/images.js';

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
    device: mock.fn(async () => device), models: mock.fn(async () => ({ models: [] })),
    download: mock.fn(async () => {}), cancelDownload: mock.fn(async () => {}), importModel: mock.fn(async () => {}),
    start: mock.fn(async () => ({ ...session })), status: mock.fn(async () => ({ ...state })), stop: mock.fn(async () => {}),
    dataset: mock.fn(async () => ({ entries: [{ id: 'case-1', file: '1.png' }] })),
    datasetImage: mock.fn(async () => ({ dataUrl: decoded.encoded })), exportResult: mock.fn(async () => ({ path: '/private/results/read.json' })),
    setBenchmarkState: mock.fn(async () => {}), cleanupCameraTempFiles: mock.fn(async () => {}),
  };
  const http: HttpTransport = { post: mock.fn(async () => ({ status: 200, data: response(JSON.stringify(graph)) })) };
  const decode = mock.fn(async () => decoded);
  const runner = new Benchmark(plugin, http, decode);
  return { plugin, http, decode, runner, setState: (next: ServerState) => { state = next; } };
}
const image = { id: 'case-1', dataUrl: decoded.encoded, imageSource: 'gallery' as const };
const signal = () => new AbortController().signal;

describe('Android benchmark flow with fake native plugin (no device/model/network)', () => {
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
    expect(result.errorCode).toBe('invalid_json'); expect(plugin.stop).toHaveBeenCalled();
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
  it('cancels a hung CapacitorHttp request and stops the child', async () => {
    const { runner, http, plugin } = fake(); const abort = new AbortController();
    mock.mocked(http.post).mockImplementation(async () => { abort.abort(); return new Promise(() => {}); });
    expect((await runner.run(image, config, abort.signal)).errorCode).toBe('aborted'); expect(plugin.stop).toHaveBeenCalled();
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
  it('loads dataset entries lazily in order and stops the batch on execution refusal', async () => {
    const { runner, plugin, http } = fake(); const order: string[] = [];
    mock.mocked(plugin.datasetImage).mockImplementation(async ({ file }) => { order.push(file); return { dataUrl: decoded.encoded }; });
    const entries = [{ id: 'one', file: '1.png' }, { id: 'two', file: '2.jpg' }];
    await runBatch({ dataset: { name: 'set', entries } }, { ...config, passes: 1 }, plugin, runner, signal(), (r) => { order.push(r.id); });
    expect(order).toEqual(['1.png', 'one', '2.jpg', 'two']); expect(http.post).toHaveBeenCalledTimes(2);
    order.length = 0;
    mock.mocked(plugin.start).mockRejectedValue({ code: 'exec_blocked' });
    await runBatch({ dataset: { name: 'set', entries } }, config, plugin, runner, signal(), (r) => { order.push(r.errorCode!); });
    expect(order).toEqual(['1.png', 'exec_blocked']);
  });
  it('does not load the next dataset image after cancellation', async () => {
    const { runner, plugin } = fake(); const abort = new AbortController();
    await runBatch({ dataset: { name: 'set', entries: [{ id: 'one', file: '1.png' }, { id: 'two', file: '2.jpg' }] } },
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
    await runBatch({ dataset: { name: 'set', entries: [{ id: 'one', file: '1.png' }, { id: 'two', file: '2.png' }] } },
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
  it('exports camera method alongside image source without including photo data', async () => {
    const { runner } = fake();
    const result = await runner.run({ ...image, imageSource: 'camera', captureMethod: 'system' }, { ...config, passes: 1 }, signal());
    const raw = exportReport({ version: 1, device, results: [result] });
    expect(JSON.parse(raw)).toMatchObject({ results: [{ imageSource: 'camera', captureMethod: 'system' }] }); expect(raw).not.toContain('data:image');
  });
});
