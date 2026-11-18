import { resolve } from 'node:path';
import { inflateSync } from 'node:zlib';
import { expect, it, vi } from 'vitest';
import { readProblem } from '@mathtwin/reader';
import { LlamaCppReader } from '../src/index.js';
import type { LlamaRuntime, ServerProcess } from '../src/index.js';
import { graphPrompt, parseCompletion, valueConfidence } from '@mathtwin/reader-llamacpp-shared';
import { imageDataUrl } from '../src/image.js';
import { draft, image } from '../../reader/test/fixtures.js';

function completion(text: string, logprob = Math.log(0.92)): unknown {
  return { choices: [{ finish_reason: 'stop', message: { content: text },
    logprobs: { content: [{ bytes: [...Buffer.from(text)], logprob }] } }] };
}
function harness(response: unknown = completion(JSON.stringify(draft()))) {
  let exit!: () => void;
  const process: ServerProcess = { exited: new Promise<void>((r) => { exit = r; }), stop: vi.fn(async () => { exit(); }) };
  const fetcher = vi.fn<typeof fetch>(async (url) => String(url).endsWith('/health')
    ? new Response('{}') : Response.json(response));
  const runtime: LlamaRuntime = { checkFiles: vi.fn(async () => {}), freePort: vi.fn(async () => 43210),
    start: vi.fn(() => process), fetch: fetcher };
  const options = { model: 'b' as const, serverPath: resolve('fixture/llama-server.exe'), timeoutMs: 5000, startupTimeoutMs: 2000 };
  return { reader: new LlamaCppReader(options, runtime), runtime, fetcher, process, options, exit };
}

it('owns a loopback-only server with projector, offline flag, GPU configuration and cleanup', async () => {
  const h = harness(); const reader = new LlamaCppReader({ ...h.options, gpuLayers: 12, mmprojGpu: true, threads: 3 }, h.runtime);
  const result = await reader.read([{ ...image, source: 'https://external.invalid/private' }], 'edges');
  expect(reader.engine).toBe('offline:qwen3-vl-2b');
  expect(h.runtime.start).toHaveBeenCalledWith(h.options.serverPath, expect.arrayContaining([
    '--host', '127.0.0.1', '--port', '43210', '--mmproj', '--gpu-layers', '12', '--offline', '--api-key', '--threads', '3',
  ]));
  expect(result.draft.vertices[0]?.conf).toBeCloseTo(0.92);
  expect(result.draft.edges[0]?.conf).toBeCloseTo(0.92);
  expect(result.draft.question?.conf).toBeCloseTo(0.92);
  expect(result.usage).toMatchObject({ passes: 1, engine: reader.engine });
  expect(h.process.stop).toHaveBeenCalledOnce();
  for (const [url, init] of h.fetcher.mock.calls) {
    expect(String(url)).toMatch(/^http:\/\/127\.0\.0\.1:43210\//);
    expect(init?.redirect).toBe('error');
  }
  const request = JSON.parse(String(h.fetcher.mock.calls[1]?.[1]?.body)) as Record<string, unknown>;
  expect(request).toMatchObject({ logprobs: true, post_sampling_probs: false, temperature: 0, stream: false, cache_prompt: false });
  expect(request).not.toHaveProperty('grammar'); expect(request).toHaveProperty('response_format.type', 'json_schema');
  expect(request).not.toHaveProperty('json_schema');
  expect(String(h.fetcher.mock.calls[1]?.[1]?.body)).not.toContain('https://external.invalid/private');
});

it('uses independent edges/neighbors prompts without previous results', async () => {
  const h = harness();
  await h.reader.read([image], 'edges');
  const next = harness(); await next.reader.read([image], 'neighbors');
  const first = String(h.fetcher.mock.calls[1]?.[1]?.body), second = String(next.fetcher.mock.calls[1]?.[1]?.body);
  expect(first).toContain('Trace every drawn edge'); expect(second).toContain('Start afresh at each vertex');
  expect(first).not.toContain('Tìm đường đi ngắn nhất'); expect(second).not.toContain('Tìm đường đi ngắn nhất');
  expect(graphPrompt('edges')).not.toEqual(graphPrompt('neighbors'));
});

it('malformed graph JSON becomes read_failed through readProblem and stops the child', async () => {
  const h = harness(completion('{bad JSON with private question'));
  const result = await readProblem([image], { reader: h.reader, passes: 1 });
  expect(result.spec).toBeNull(); expect(result.issues[0]?.code).toBe('read_failed');
  expect(JSON.stringify(result)).not.toContain('private question'); expect(h.process.stop).toHaveBeenCalledOnce();
});

it('missing token probabilities is an error instead of conf:1', async () => {
  const h = harness({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(draft()) } }] });
  await expect(h.reader.read([image], 'edges')).rejects.toMatchObject({ code: 'read_failed' });
  expect(h.process.stop).toHaveBeenCalledOnce();
});

it.each([
  { bytes: [65], logprob: -0.1 },
  { bytes: [65, 66], prob: 1 },
  { bytes: [65, 66], logprob: 0.1 },
  { bytes: [65, 66], logprob: Number.NaN },
  { bytes: [65, 66], logprob: -0.1, top_probs: [] },
])('rejects incomplete, post-sampling or invalid probabilities %#', (token) => {
  expect(() => parseCompletion({ choices: [{ finish_reason: 'stop', message: { content: 'AB' }, logprobs: { content: [token] } }] })).toThrow();
});

it('takes the minimum measured probability, including low-scoring tokens and UTF-8 byte fragments', () => {
  const bytes = [...Buffer.from('Đề')];
  const result = parseCompletion({ choices: [{ finish_reason: 'stop', message: { content: 'Đề' },
    logprobs: { content: bytes.map((byte, i) => ({ bytes: [byte], logprob: Math.log(i === 1 ? 0.4 : 0.99) })) } }] });
  expect(valueConfidence(result, { start: 0, end: result.bytes.length })).toBeCloseTo(0.4);
});

it('rejects a length-truncated completion even if its content happens to be valid JSON', async () => {
  const response = { choices: [{ finish_reason: 'length', message: { content: '{}' } }] };
  const h = harness(response); await expect(h.reader.readLines([image])).rejects.toMatchObject({ code: 'read_failed' });
  expect(h.process.stop).toHaveBeenCalledOnce();
});

it('returns NFC lines, measured confidence and valid page-local coordinates from Qwen', async () => {
  const h = harness(completion(JSON.stringify({ lines: [{ text: 'Đề sai 7', region: 'solution', box: [100, 200, 900, 300] }] }), Math.log(0.7)));
  const result = await h.reader.readLines([image]);
  expect(result.lines).toEqual([{ text: 'Đề sai 7', region: 'solution', regionConf: 0.7, box: [0.1, 0.2, 0.9, 0.3], conf: 0.7, alternatives: [], charConf: Array(8).fill(0.7) }]);
});

it('reads Paddle text with OCR: in page order and refuses graph extraction without fabricating edges', async () => {
  const h = harness(completion('Đề\nA → B\n\n7'));
  const reader = new LlamaCppReader({ ...h.options, model: 'a', paddleTextMode: 'ocr' }, h.runtime);
  expect(reader.engine).toBe('offline:paddleocr-vl-1.5');
  const result = await reader.readLines([image, image]);
  expect(result.lines.map((line) => line.text)).toEqual(['Đề', 'A → B', '7', 'Đề', 'A → B', '7']);
  expect(result.lines.every((line) => line.conf < 1 && line.box === undefined)).toBe(true);
  expect(String(h.fetcher.mock.calls[1]?.[1]?.body)).toContain('OCR:');
  await expect(reader.read([image], 'edges')).rejects.toMatchObject({ code: 'text_only' });
  expect(h.runtime.start).toHaveBeenCalledOnce();
});

it('rejects missing text logprobs and malformed line JSON for either engine', async () => {
  for (const model of ['a', 'b'] as const) {
    const h = harness({ choices: [{ finish_reason: 'stop', message: { content: 'text' } }] });
    await expect(new LlamaCppReader({ ...h.options, model }, h.runtime).readLines([image])).rejects.toMatchObject({ code: 'read_failed' });
    expect(h.process.stop).toHaveBeenCalledOnce();
  }
  const h = harness(completion('{bad')); await expect(h.reader.readLines([image])).rejects.toMatchObject({ code: 'read_failed' });
});

it.each([{ lines: [] }, { lines: [{ text: '' }] },
  { lines: [{ text: 'A', region: 'invented' }] }, { lines: [{ text: 'A', conf: 1 }] }])('fails closed on invalid line output %#', async (data) => {
  const h = harness(completion(JSON.stringify(data)));
  await expect(h.reader.readLines([image])).rejects.toMatchObject({ code: 'read_failed', reason: 'invalid_json' });
});

it('cancellation during inference stops the owned server even if fake HTTP ignores AbortSignal', async () => {
  const h = harness(); const controller = new AbortController();
  let started!: () => void; const requestStarted = new Promise<void>((r) => { started = r; });
  h.fetcher.mockImplementation(async (url) => {
    if (String(url).endsWith('/health')) return new Response('{}');
    started(); return new Promise<Response>(() => {});
  });
  const result = h.reader.readLines([image], controller.signal);
  await requestStarted; controller.abort();
  await expect(result).rejects.toMatchObject({ name: 'AbortError' });
  expect(h.process.stop).toHaveBeenCalledOnce();
});

it('pre-cancelled work neither spawns nor reads files', async () => {
  const h = harness(); const signal = AbortSignal.abort();
  await expect(h.reader.readLines([image], signal)).rejects.toThrow();
  expect(h.runtime.start).not.toHaveBeenCalled(); expect(h.runtime.checkFiles).not.toHaveBeenCalled();
});

it('timeouts stop a hung inference', async () => {
  const h = harness(); const reader = new LlamaCppReader({ ...h.options, timeoutMs: 30 }, h.runtime);
  h.fetcher.mockImplementation(async (url) => String(url).endsWith('/health') ? new Response('{}') : new Promise<Response>(() => {}));
  await expect(reader.readLines([image])).rejects.toMatchObject({ code: 'read_failed' });
  expect(h.process.stop).toHaveBeenCalledOnce();
});

it('startup timeout and cancellation during startup stop the child', async () => {
  for (const cancel of [false, true]) {
    const h = harness(); const controller = new AbortController();
    const reader = new LlamaCppReader({ ...h.options, startupTimeoutMs: 25 }, h.runtime);
    h.fetcher.mockImplementation(async (_, init) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(init.signal?.reason), { once: true });
      if (cancel) controller.abort();
    }));
    await expect(reader.readLines([image], controller.signal)).rejects.toThrow();
    expect(h.process.stop).toHaveBeenCalledOnce();
  }
});

it('rejects overlapping calls on one reader while keeping the first call cancellable', async () => {
  const h = harness(); const controller = new AbortController();
  h.fetcher.mockImplementation(async () => new Promise<Response>(() => {}));
  const first = h.reader.readLines([image], controller.signal);
  await expect(h.reader.readLines([image])).rejects.toMatchObject({ code: 'busy' });
  controller.abort(); await expect(first).rejects.toThrow();
  expect(h.runtime.start).toHaveBeenCalledOnce();
  expect(h.process.stop).toHaveBeenCalledOnce();
});

it('server exit and HTTP redirects/errors fail without leaking response bodies', async () => {
  const h = harness();
  h.fetcher.mockImplementation(async () => { h.exit(); return new Promise<Response>(() => {}); });
  await expect(h.reader.readLines([image])).rejects.toMatchObject({ code: 'read_failed', reason: 'server_exit' });
  expect(h.process.stop).toHaveBeenCalledOnce();
  const other = harness(); other.fetcher.mockResolvedValue(new Response('private question', { status: 302 }));
  await expect(other.reader.readLines([image])).rejects.toMatchObject({ code: 'read_failed' });
  expect(other.process.stop).toHaveBeenCalledOnce();
});

it('missing local files do not start a process or fetch a model', async () => {
  const h = harness(); h.runtime.checkFiles = vi.fn(async () => { throw new Error('ENOENT'); });
  await expect(h.reader.readLines([image])).rejects.toMatchObject({ code: 'read_failed' });
  expect(h.runtime.start).not.toHaveBeenCalled(); expect(h.fetcher).not.toHaveBeenCalled();
});

it('encodes a valid in-memory RGBA PNG without reading the image source', () => {
  const encoded = imageDataUrl({ ...image, source: 'https://external.invalid/private' });
  const png = Buffer.from(encoded.split(',')[1]!, 'base64');
  expect([...png.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  expect(png.readUInt32BE(16)).toBe(1); expect(png.readUInt32BE(20)).toBe(1);
  expect(inflateSync(png.subarray(41, 41 + png.readUInt32BE(33)))).toEqual(Buffer.from([0, 0, 0, 0, 255]));
  expect(() => imageDataUrl({ ...image, width: 2 })).toThrow();
});
it('B direct glyph crop stops its local server and sends a scalar schema', async () => {
  const h=harness(completion('"7"'));const result=await h.reader.readCrop(image,undefined,'weight');
  expect(result[0]!.text).toBe('7');expect(result[0]!.probability).toBeCloseTo(.92);expect(h.process.stop).toHaveBeenCalledOnce();
  expect(JSON.parse(String(h.fetcher.mock.calls[1]?.[1]?.body))).toMatchObject({response_format:{schema:{type:'string'}}});
});
