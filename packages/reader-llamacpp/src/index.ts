import { randomBytes } from 'node:crypto';
import { isAbsolute, join, resolve } from 'node:path';
import { availableParallelism } from 'node:os';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { resizeImage } from '@mathtwin/reader';
import type { PreparedImage, ReadDraft, ReadUsage, ServerTimings, TextLine, TextReadOptions, TextReader, VisionReader } from '@mathtwin/reader';
import { completionRequest, defaultDry, defaultMaxImageSide, defaultReadTimeout, defaultMaxTokens, imageTimeout, validateDry, graphResult, glyphResult, lineResult, parseCompletion, plainLines, spottingLines, LlamaCppReadError } from '@mathtwin/reader-llamacpp-shared';
import type { Completion, DryConfig, ReadMode } from '@mathtwin/reader-llamacpp-shared';
import { imageDataUrl } from './image.js';
import { nodeRuntime } from './runtime.js';
import type { LlamaRuntime } from './runtime.js';
export { LlamaCppReadError } from '@mathtwin/reader-llamacpp-shared';
export type { LlamaFailureReason } from '@mathtwin/reader-llamacpp-shared';
export type { LlamaRuntime, ServerProcess } from './runtime.js';

interface CommonOptions {
  model: 'a' | 'b'; modelsDirectory?: string; gpuLayers?: number; mmprojGpu?: boolean;
  contextSize?: number; maxTokens?: number; timeoutMs?: number; startupTimeoutMs?: number;
  threads?: number; maxImageSide?: number; maxLongEdge?: number; readTimeout?: number; dry?: DryConfig; alternativesThreshold?: number;
  paddleTextMode?: 'spotting' | 'ocr';
  diagnostics?: (event: LlamaDiagnosticEvent) => void;
}
export type LlamaDiagnosticEvent =
  | { type: 'server_stderr'; elapsedMs: number; text: string }
  | { type: 'server_exit'; elapsedMs: number }
  | { type: 'request_start'; elapsedMs: number; path: string }
  | { type: 'response'; elapsedMs: number; path: string; status: number }
  | { type: 'request_error'; elapsedMs: number; path: string; name: string; message: string; code?: string }
  | { type: 'internal_error'; elapsedMs: number; name: string; message: string; code?: string };
export type LlamaCppOptions = CommonOptions & (
  { serverPath: string; serverUrl?: never; apiKey?: never }
  | { serverUrl: string; apiKey: string; serverPath?: never }
);

/** Literal private IPv4 or loopback only: no DNS, proxy names, credentials, query or URL rewriting. */
export function privateServerUrl(value: string): string {
  const authority = /^http:\/\/(\[[^\]]+\]|[^/:?#]+)(?::([0-9]+))?\/?$/.exec(value);
  if (!authority) throw new Error('serverUrl must be an HTTP private IP or loopback origin.');
  const host = authority[1]!;
  let allowed = host === '[::1]';
  if (!allowed && /^(?:\d{1,3}\.){3}\d{1,3}$/.test(host)) {
    const parts = host.split('.'), n = parts.map(Number);
    if (parts.every((p, i) => String(n[i]) === p && n[i]! <= 255)) {
      allowed = n[0] === 127 || n[0] === 10 || (n[0] === 172 && n[1]! >= 16 && n[1]! <= 31) || (n[0] === 192 && n[1] === 168);
    }
  }
  if (!allowed || (authority[2] !== undefined && (Number(authority[2]) < 1 || Number(authority[2]) > 65535))) throw new Error('serverUrl is outside private IP ranges.');
  return new URL(value).origin;
}
function abortError(): LlamaCppReadError { return new LlamaCppReadError('read_failed', 'aborted'); }
function checkAbort(signal?: AbortSignal): void { if (signal?.aborted) throw abortError(); }
function errorDiagnostic(error: unknown): { name: string; message: string; code?: string } {
  if (!(error instanceof Error)) return { name: 'Error', message: String(error) };
  const code = 'code' in error && typeof error.code === 'string' ? error.code : undefined;
  return { name: error.name, message: error.message, ...(code === undefined ? {} : { code }) };
}
function retryableStartupError(error: unknown): boolean {
  return error instanceof TypeError || (error !== null && typeof error === 'object' && 'code' in error
    && (error.code === 'ECONNREFUSED' || error.code === 'ECONNRESET' || error.code === 'EPIPE'));
}
async function cancellable<T>(action: () => Promise<T>, signal: AbortSignal): Promise<T> {
  let listener: (() => void) | undefined;
  try {
    return await Promise.race([Promise.resolve().then(() => { signal.throwIfAborted(); return action(); }), new Promise<never>((_, reject) => {
      listener = () => reject(signal.reason);
      signal.addEventListener('abort', listener, { once: true });
      if (signal.aborted) listener();
    })]);
  } finally { if (listener) signal.removeEventListener('abort', listener); }
}

/** Node development adapter; Android reuses only reader + reader-llamacpp-shared. */
export class LlamaCppReader implements VisionReader, TextReader {
  readonly engine: 'offline:paddleocr-vl-1.5' | 'offline:qwen3-vl-2b';
  private active = false;
  private readonly options: Required<CommonOptions>;
  private readonly endpoint: { serverUrl: string; apiKey: string } | { serverPath: string };
  constructor(options: LlamaCppOptions, private readonly runtime: LlamaRuntime = nodeRuntime) {
    if (options.model !== 'a' && options.model !== 'b') throw new Error('Invalid model.');
    if (options.serverUrl !== undefined) {
      if (options.serverPath !== undefined || typeof options.apiKey !== 'string' || !/^[\x21-\x7e]{1,256}$/.test(options.apiKey)) throw new Error('serverUrl requires an apiKey and excludes serverPath.');
      this.endpoint = { serverUrl: privateServerUrl(options.serverUrl), apiKey: options.apiKey };
    } else {
      if (!options.serverPath || !isAbsolute(options.serverPath) || options.apiKey !== undefined) throw new Error('serverPath must be absolute.');
      this.endpoint = { serverPath: resolve(options.serverPath) };
    }
    this.engine = options.model === 'a' ? 'offline:paddleocr-vl-1.5' : 'offline:qwen3-vl-2b';
    const readTimeout = options.readTimeout ?? Math.min(defaultReadTimeout, (options.timeoutMs ?? Infinity) - 1);
    const maxImageSide = options.maxImageSide ?? options.maxLongEdge ?? defaultMaxImageSide;
    this.options = { modelsDirectory: fileURLToPath(new URL('../../../.models/', import.meta.url)),
      gpuLayers: 0, mmprojGpu: false, contextSize: 8192, maxTokens: defaultMaxTokens, timeoutMs: imageTimeout(readTimeout), startupTimeoutMs: 120_000,
      threads: availableParallelism(), alternativesThreshold: 0.1, paddleTextMode: 'spotting', ...options,
      readTimeout, maxImageSide, maxLongEdge: maxImageSide, dry: { ...(options.dry ?? defaultDry) }, diagnostics: options.diagnostics ?? (() => {}) };
    const o = this.options;
    validateDry(o.dry);
    if (![o.contextSize, o.maxTokens, o.timeoutMs, o.readTimeout, o.startupTimeoutMs, o.threads, o.maxImageSide].every((n) => Number.isSafeInteger(n) && n > 0 && n <= 2_147_483_647)
      || o.timeoutMs <= o.readTimeout
      || o.maxLongEdge > 16384 || !Number.isSafeInteger(o.gpuLayers) || o.gpuLayers < 0 || o.maxTokens > o.contextSize
      || !Number.isFinite(o.alternativesThreshold) || o.alternativesThreshold < 0 || o.alternativesThreshold > 1
      || !['ocr', 'spotting'].includes(o.paddleTextMode)) throw new Error('Invalid runtime limits.');
  }
  async read(images: PreparedImage[], pass: 'edges' | 'neighbors', signal?: AbortSignal): Promise<{ draft: ReadDraft; usage: ReadUsage }> {
    checkAbort(signal);
    if (this.options.model === 'a') throw new LlamaCppReadError('text_only');
    if (pass !== 'edges' && pass !== 'neighbors') throw new LlamaCppReadError('read_failed', 'invalid_json');
    return this.run(images, signal, async (complete) => ({ draft: graphResult(await complete(images, pass), this.options.alternativesThreshold, images) }));
  }
  /** Scalar glyph recognition on a CV-supplied crop; no graph or question prompt. */
  async readCrop(image: PreparedImage, signal?: AbortSignal, role?: 'label' | 'weight' | 'name'): Promise<{ text: string; probability: number }[]> {
    if (this.options.model !== 'b') throw new LlamaCppReadError('text_only');
    const result = await this.run([image], signal, async complete => ({ candidates: glyphResult(await complete([image], role ? `glyph-${role}` : 'glyph')) }));
    return result.candidates;
  }
  async readLines(images: PreparedImage[], signal?: AbortSignal, options?: TextReadOptions): Promise<{ lines: TextLine[]; usage: ReadUsage }> {
    return this.run(images, signal, async (complete) => {
      const lines: TextLine[] = [];
      for (const image of images) {
        const mode = this.options.model === 'a' ? this.options.paddleTextMode : options?.continuation ? 'continuation-lines' : 'lines';
        const c = await complete([image], mode), t = this.options.alternativesThreshold;
        lines.push(...(mode === 'ocr' ? plainLines(c, t) : mode === 'spotting'
          ? spottingLines(c, image.width, image.height, t) : lineResult(c, image.width, image.height, t)));
      }
      return { lines };
    });
  }
  private async run<T>(images: PreparedImage[], signal: AbortSignal | undefined,
    action: (complete: (pages: PreparedImage[], mode: ReadMode) => Promise<Completion>) => Promise<T>,
  ): Promise<T & { usage: ReadUsage }> {
    checkAbort(signal);
    if (this.active) throw new LlamaCppReadError('busy');
    this.active = true;
    const start = performance.now(), timeout = AbortSignal.timeout(this.options.timeoutMs + this.options.readTimeout * Math.max(0, images.length - 1)), lifetime = new AbortController();
    const combined = AbortSignal.any([timeout, lifetime.signal, ...(signal ? [signal] : [])]);
    let child: ReturnType<LlamaRuntime['start']> | undefined;
    let unsubscribeStderr: (() => void) | undefined;
    let startup: AbortSignal | undefined;
    try {
      if (!images.length) throw new LlamaCppReadError('read_failed', 'invalid_json');
      const sized = images.map((image) => resizeImage(image, this.options.maxImageSide));
      const encoded = new Map(images.map((image, i) => [image, imageDataUrl(sized[i]!)]));
      let base: string, apiKey: string;
      if ('serverUrl' in this.endpoint) ({ serverUrl: base, apiKey } = this.endpoint);
      else {
        const serverPath = this.endpoint.serverPath;
        const names = this.options.model === 'a' ? ['PaddleOCR-VL-1.5.gguf', 'PaddleOCR-VL-1.5-mmproj.gguf']
          : ['Qwen3VL-2B-Instruct-Q4_K_M.gguf', 'mmproj-Qwen3VL-2B-Instruct-F16.gguf'];
        const model = join(this.options.modelsDirectory, this.options.model, names[0]!);
        const mmproj = join(this.options.modelsDirectory, this.options.model, names[1]!);
        await cancellable(() => this.runtime.checkFiles([serverPath, model, mmproj]), combined);
        const port = await cancellable(() => this.runtime.freePort(), combined);
        if (!Number.isInteger(port) || port < 1 || port > 65535) throw new LlamaCppReadError('read_failed', 'http_error');
        apiKey = randomBytes(32).toString('hex');
        child = this.runtime.start(serverPath, ['--model', model, '--mmproj', mmproj,
          '--host', '127.0.0.1', '--port', String(port), '--gpu-layers', String(this.options.gpuLayers),
          '--ctx-size', String(this.options.contextSize), '--parallel', '1', '--threads', String(this.options.threads),
          '--offline', '--no-webui', '--api-key', apiKey, ...(this.options.mmprojGpu ? [] : ['--no-mmproj-offload'])]);
        unsubscribeStderr = child.onStderr?.((text) => this.options.diagnostics({ type: 'server_stderr', elapsedMs: performance.now() - start, text }));
        void child.exited.then(() => this.options.diagnostics({ type: 'server_exit', elapsedMs: performance.now() - start }));
        base = `http://127.0.0.1:${port}`;
      }
      const request = async (path: string, body?: unknown, requestSignal = combined): Promise<Response> => {
        this.options.diagnostics({ type: 'request_start', elapsedMs: performance.now() - start, path });
        try {
          const response = await cancellable(() => this.runtime.fetch(`${base}${path}`, { method: body === undefined ? 'GET' : 'POST',
          headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
          ...(body === undefined ? {} : { body: JSON.stringify(body), keepalive: false,
            headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', Connection: 'close' } }),
          signal: requestSignal, redirect: 'error' }), requestSignal);
          this.options.diagnostics({ type: 'response', elapsedMs: performance.now() - start, path, status: response.status });
          return response;
        } catch (error) {
          this.options.diagnostics({ type: 'request_error', elapsedMs: performance.now() - start, path, ...errorDiagnostic(error) });
          throw error;
        }
      };
      const metrics: (ServerTimings | undefined)[] = [];
      const finishes: string[] = [];
      const work = async (): Promise<T> => {
        startup = AbortSignal.timeout(this.options.startupTimeoutMs);
        const readiness = AbortSignal.any([combined, startup]);
        while (true) {
          readiness.throwIfAborted();
          try {
            const response = await request('/health', undefined, readiness);
            const ready = response.ok; await response.body?.cancel();
            if (ready) break;
            if (response.status !== 503) throw new LlamaCppReadError('read_failed', 'http_error');
          } catch (error) {
            readiness.throwIfAborted();
            if (!retryableStartupError(error)) throw error;
          }
          await delay(100, undefined, { signal: readiness });
        }
        startup = undefined;
        return action(async (pages, mode) => {
          const readLimit = AbortSignal.timeout(this.options.readTimeout);
          const requestSignal = AbortSignal.any([combined, readLimit]);
          let response: Response;
          try { response = await request('/v1/chat/completions', completionRequest(this.options.model, mode,
            pages.map((image) => encoded.get(image)!), this.options.maxTokens, this.options.dry), requestSignal); }
          catch (error) { if (combined.aborted) throw error; throw new LlamaCppReadError('read_failed', readLimit.aborted ? 'timeout' : 'http_error'); }
          if (!response.ok) { await response.body?.cancel(); throw new LlamaCppReadError('read_failed', 'http_error'); }
          let raw: unknown;
          try { raw = await cancellable(() => response.json() as Promise<unknown>, requestSignal); }
          catch (error) { if (combined.aborted) throw error; throw new LlamaCppReadError('read_failed', readLimit.aborted ? 'timeout' : 'invalid_json'); }
          const result = parseCompletion(raw, this.options.model === 'b'); metrics.push(result.timings);
          if (result.finish_reason) finishes.push(result.finish_reason); return result;
        });
      };
      const result = await cancellable(() => {
        const races: Promise<T>[] = [work()];
        if (child) races.push(child.exited.then(() => { throw new LlamaCppReadError('read_failed', 'server_exit'); }));
        return Promise.race(races);
      }, combined);
      const usage: ReadUsage = { passes: 1, latencyMs: performance.now() - start, engine: this.engine,
        finish_reason: finishes,
        sentImages: images.map((image, i) => ({ originalWidth: image.width, originalHeight: image.height, width: sized[i]!.width, height: sized[i]!.height, maxImageSide: this.options.maxImageSide })) };
      if (metrics.length && metrics.every((t) => t !== undefined)) {
        usage.serverTimings = metrics.reduce<ServerTimings>((sum, t) => ({ promptMs: sum.promptMs + t!.promptMs, predictedMs: sum.predictedMs + t!.predictedMs,
          promptTokens: sum.promptTokens + t!.promptTokens, predictedTokens: sum.predictedTokens + t!.predictedTokens }),
        { promptMs: 0, predictedMs: 0, promptTokens: 0, predictedTokens: 0 });
      }
      return { ...result, usage };
    } catch (error) {
      this.options.diagnostics({ type: 'internal_error', elapsedMs: performance.now() - start, ...errorDiagnostic(error) });
      if (signal?.aborted) throw abortError();
      if (timeout.aborted || startup?.aborted) throw new LlamaCppReadError('read_failed', 'timeout');
      if (error instanceof LlamaCppReadError) throw error;
      throw new LlamaCppReadError('read_failed');
    } finally {
      lifetime.abort();
      unsubscribeStderr?.();
      try { await child?.stop(); }
      catch { throw new LlamaCppReadError('read_failed', 'server_exit'); }
      finally { this.active = false; }
    }
  }
}
