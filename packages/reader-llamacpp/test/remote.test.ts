import { expect, it, vi } from 'vitest';
import { readProblem } from '@mathtwin/reader';
import { LlamaCppReader, privateServerUrl } from '../src/index.js';
import type { LlamaRuntime } from '../src/index.js';
import { draft, image } from '../../reader/test/fixtures.js';

function response(text: string, timings: unknown = { prompt_ms: 100, predicted_ms: 80, prompt_n: 300, predicted_n: 20 }) {
  return { choices: [{ finish_reason: 'stop', message: { content: text }, logprobs: { content: [
    { bytes: [...Buffer.from(text)], logprob: Math.log(0.95) },
  ] } }], ...(timings === undefined ? {} : { timings }) };
}
function remote(raw: unknown = response('{"lines":[{"text":"7"}]}')) {
  const fetcher = vi.fn<typeof fetch>(async (url) => String(url).endsWith('/health') ? new Response('{}') : Response.json(raw));
  const runtime: LlamaRuntime = { checkFiles: vi.fn(async () => { throw new Error('No local files permitted'); }),
    freePort: vi.fn(async () => { throw new Error('No local port permitted'); }), start: vi.fn(() => { throw new Error('No spawn permitted'); }), fetch: fetcher };
  const options = { model: 'b' as const, serverUrl: 'http://192.168.1.23:8080', apiKey: 'test-only-private-key' };
  return { runtime, fetcher, options, reader: new LlamaCppReader(options, runtime) };
}

it.each(['http://10.0.0.1:8080', 'http://172.16.0.1', 'http://172.31.255.254', 'http://192.168.0.1/',
  'http://127.0.0.1', 'http://127.3.2.1:65535', 'http://[::1]:8080'])('accepts literal private/loopback origin %s', (url) => {
  expect(privateServerUrl(url)).toBe(new URL(url).origin);
});
it.each(['https://192.168.1.1', 'http://8.8.8.8', 'http://172.15.0.1', 'http://172.32.0.1', 'http://169.254.169.254',
  'http://100.64.0.1', 'http://192.169.0.1', 'http://0.0.0.0', 'http://localhost:8080', 'http://example.com',
  'http://192.168.1.1.evil.com', 'http://192.168.1.1@8.8.8.8', 'http://user@192.168.1.1', 'http://192.168.1.1/a',
  'http://192.168.1.1?redirect=evil', 'http://192.168.1.1#frag', 'http://2130706433', 'http://0177.0.0.1',
  'http://0x7f000001', 'http://127.1', 'http://192.168.001.1', 'http://10.1.1.999', 'http://[::ffff:192.168.1.1]',
  'http://[2001:4860:4860::8888]', 'http://10.0.0.1:0', 'http://10.0.0.1:65536'])('rejects public, ambiguous or redirected origin %s', (url) => {
  expect(() => privateServerUrl(url)).toThrow();
});

it('calls only the configured private origin with API key, without local model checks or spawn', async () => {
  const h = remote(); const result = await h.reader.readLines([image]);
  expect(result.lines[0]?.text).toBe('7');
  expect(result.usage.serverTimings).toEqual({ promptMs: 100, predictedMs: 80, promptTokens: 300, predictedTokens: 20 });
  expect(result.usage.latencyMs).toBeGreaterThanOrEqual(0);
  expect(h.runtime.start).not.toHaveBeenCalled(); expect(h.runtime.checkFiles).not.toHaveBeenCalled(); expect(h.runtime.freePort).not.toHaveBeenCalled();
  for (const [url, init] of h.fetcher.mock.calls) {
    expect(String(url)).toMatch(/^http:\/\/192\.168\.1\.23:8080\//);
    expect(init?.headers).toMatchObject({ Authorization: 'Bearer test-only-private-key' }); expect(init?.redirect).toBe('error');
  }
});

it('sums multi-page server timings and preserves them through readProblem passes separately from total time', async () => {
  const lines = remote(); const result = await lines.reader.readLines([image, image]);
  expect(result.usage.serverTimings).toEqual({ promptMs: 200, predictedMs: 160, promptTokens: 600, predictedTokens: 40 });
  const graph = remote(response(JSON.stringify(draft())));
  const outcome = await readProblem([image], { reader: graph.reader, passes: 2 });
  expect(outcome.usage.serverTimings).toEqual({ promptMs: 200, predictedMs: 160, promptTokens: 600, predictedTokens: 40 });
  expect(outcome.usage.sentImages).toHaveLength(2);
});

it('sends resized dimensions in usage and converts normalized boxes back to the original photograph', async () => {
  const h = remote(response('{"lines":[{"text":"7","box":[100,200,900,800]}]}'));
  const photo = { width: 2000, height: 1000, pixels: new Uint8ClampedArray(2000 * 1000 * 4) };
  const result = await h.reader.readLines([photo]);
  expect(result.usage.sentImages).toEqual([{ originalWidth: 2000, originalHeight: 1000, width: 1536, height: 768 }]);
  expect(result.lines[0]?.box).toEqual([200, 200, 1800, 800]);
  const body = JSON.parse(String(h.fetcher.mock.calls[1]?.[1]?.body)) as { messages: { content: { image_url?: { url: string } }[] }[] };
  const dataUrl = body.messages[1]!.content[0]!.image_url!.url;
  const png = Buffer.from(dataUrl.split(',')[1]!, 'base64');
  expect(png.readUInt32BE(16)).toBe(1536); expect(png.readUInt32BE(20)).toBe(768);
});

it('omits incomplete timing aggregates rather than claiming unmeasured server work took zero time', async () => {
  const raw = response(JSON.stringify(draft()));
  Reflect.deleteProperty(raw, 'timings');
  const h = remote(raw);
  const result = await h.reader.read([image], 'edges');
  expect(result.usage.serverTimings).toBeUndefined();
  h.fetcher.mockImplementation(async (url) => {
    if (String(url).endsWith('/health')) return new Response('{}');
    return Response.json(h.fetcher.mock.calls.filter(([u]) => String(u).endsWith('/v1/chat/completions')).length % 2
      ? response(JSON.stringify(draft())) : raw);
  });
  const outcome = await readProblem([image], { reader: h.reader, passes: 2 });
  expect(outcome.spec).not.toBeNull(); expect(outcome.usage.serverTimings).toBeUndefined();
});

it('remote cancellation has a data-free aborted reason and never stops a server it does not own', async () => {
  const h = remote(), controller = new AbortController();
  let started!: () => void; const ready = new Promise<void>((r) => { started = r; });
  h.fetcher.mockImplementation(async (url) => {
    if (String(url).endsWith('/health')) return new Response('{}');
    started(); return new Promise<Response>(() => {});
  });
  const pending = h.reader.readLines([image], controller.signal);
  await ready; controller.abort(new Error('private user text'));
  await expect(pending).rejects.toMatchObject({ code: 'read_failed', reason: 'aborted', name: 'AbortError' });
  expect(h.runtime.start).not.toHaveBeenCalled();
});

it('classifies truncated, invalid JSON, missing scores, HTTP failure and timeout without response contents', async () => {
  for (const [raw, reason] of [
    [{ choices: [{ finish_reason: 'length' }] }, 'truncated'],
    [response('{private text'), 'invalid_json'],
    [{ choices: [{ finish_reason: 'stop', message: { content: 'private text' } }] }, 'missing_probs'],
  ] as const) {
    const h = remote(raw); await expect(h.reader.readLines([image])).rejects.toMatchObject({ code: 'read_failed', reason });
  }
  const h = remote(); h.fetcher.mockResolvedValue(new Response('private error', { status: 500 }));
  await expect(h.reader.readLines([image])).rejects.toMatchObject({ code: 'read_failed', reason: 'http_error' });
  const hanging = remote(); hanging.fetcher.mockImplementation(async () => new Promise<Response>(() => {}));
  const reader = new LlamaCppReader({ ...hanging.options, startupTimeoutMs: 20 }, hanging.runtime);
  await expect(reader.readLines([image])).rejects.toMatchObject({ code: 'read_failed', reason: 'timeout' });
});

it('Paddle spotting uses a real LOC prompt by default, keeping text even if polygon is outside image range', async () => {
  const loc = '<|LOC_1001|><|LOC_0|><|LOC_100|><|LOC_0|><|LOC_100|><|LOC_100|><|LOC_0|><|LOC_100|>';
  const h = remote(response(`7${loc}`)), reader = new LlamaCppReader({ ...h.options, model: 'a' }, h.runtime);
  const result = await reader.readLines([image]);
  expect(result.lines).toEqual([{ text: '7', conf: 0.95, alternatives: [] }]);
  expect(String(h.fetcher.mock.calls[1]?.[1]?.body)).toContain('Spotting:');
});
