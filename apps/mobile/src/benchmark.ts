import { readProblem } from '@mathtwin/reader';
import type { ReadUsage, TextLine, VisionReader } from '@mathtwin/reader';
import { completionRequest, graphResult, lineResult, parseCompletion, spottingLines } from '@mathtwin/reader-llamacpp-shared';
import type { ReadMode } from '@mathtwin/reader-llamacpp-shared';
import type { BenchImage, BenchmarkConfig, BenchmarkReport, HttpTransport, ImageResult, MobilePlugin, ServerState, Session } from './contracts.js';
import type { DecodedImage } from './images.js';
import { errorCode } from './messages.vi.js';
import manifest from '../../../tools/models/manifest.json';

const engineFor = (model: 'a' | 'b'): string => model === 'a' ? 'offline:paddleocr-vl-1.5' : 'offline:qwen3-vl-2b';
function check(signal: AbortSignal): void { if (signal.aborted) throw { code: 'aborted' }; }
function serverFailure(state: ServerState): string | undefined {
  if (state.memoryPressure) return 'memory_pressure';
  if (state.errorCode) return state.errorCode;
  if (!state.alive) return state.exitCode === 137 || state.exitCode === 9 ? 'server_killed' : 'server_exit';
  return undefined;
}
function validateConfig(c: BenchmarkConfig): void {
  if (!['a', 'b'].includes(c.model) || ![1, 2].includes(c.passes) || !['graph', 'lines'].includes(c.mode)
    || !Number.isInteger(c.threads) || c.threads < 1 || c.threads > 256 || !Number.isFinite(c.minRamGb) || c.minRamGb < 1 || c.minRamGb > 64
    || !Number.isFinite(c.backgroundIdleMinutes) || c.backgroundIdleMinutes < 1 || c.backgroundIdleMinutes > 60) throw { code: 'native_error' };
}
/** Orchestrates the same flow used by the screen. No native dependencies: tests inject plugin/HTTP/decoder. */
export class Benchmark {
  private active = false;
  constructor(private readonly plugin: MobilePlugin, private readonly http: HttpTransport,
    private readonly decode: (dataUrl: string) => Promise<DecodedImage>, private readonly now = () => performance.now()) {}

  async run(image: BenchImage, config: BenchmarkConfig, signal: AbortSignal): Promise<ImageResult> {
    if (this.active) throw { code: 'busy' };
    this.active = true;
    const start = this.now(), engine = engineFor(config.model);
    const result: ImageResult = { id: image.id, imageSource: image.imageSource, ...(image.captureMethod ? { captureMethod: image.captureMethod } : {}),
      config: { ...config }, engine, usage: { engine, passes: 0, latencyMs: 0 }, totalMs: 0, modelLoadMs: 0, modelVerifyMs: 0, reusedModel: false };
    let timer: ReturnType<typeof setInterval> | undefined;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    let onAbort: (() => void) | undefined;
    let failure: string | undefined;
    let startAttempted = false;
    let currentMemory: ServerState | undefined;
    let pendingPoll = false;
    let rejectFatal: (reason: unknown) => void = () => {};
    const fatal = new Promise<never>((_, reject) => { rejectFatal = reject; });
    // The rejection is always observed even if the native start is still pending.
    void fatal.catch(() => {});
    const guard = <T>(work: Promise<T>): Promise<T> => Promise.race([work, fatal]);
    const fail = (code: string): void => { failure ??= code; rejectFatal({ code }); };
    const updateMemory = async (): Promise<void> => {
      if (pendingPoll) return;
      pendingPoll = true;
      try {
        currentMemory = await this.plugin.status();
        const code = serverFailure(currentMemory); if (code) fail(code);
      } catch { fail('server_exit'); } finally { pendingPoll = false; }
    };
    try {
      validateConfig(config); check(signal);
      onAbort = () => { fail('aborted'); void this.plugin.stop().catch(() => {}); };
      signal.addEventListener('abort', onAbort, { once: true }); check(signal);
      timeout = setTimeout(() => { fail('timeout'); void this.plugin.stop().catch(() => {}); }, 300_000);
      if (config.model === 'a' && config.mode === 'graph') throw { code: 'text_only' };
      const device = await guard(this.plugin.device());
      if (device.totalRamBytes < config.minRamGb * 1e9 && !config.allowLowRam) throw { code: 'low_ram' };
      const decoded = await guard(this.decode(image.dataUrl)); check(signal);
      startAttempted = true;
      const session = await guard(this.plugin.start(config));
      validateSession(session);
      result.modelLoadMs = session.loadMs; result.reusedModel = session.reused;
      result.modelVerifyMs = session.verifyMs ?? 0;
      await updateMemory();
      if (failure) throw { code: failure };
      timer = setInterval(() => { void updateMemory(); }, 250);
      const complete = async (mode: ReadMode): Promise<{ completion: ReturnType<typeof parseCompletion>; usage: ReadUsage }> => {
        check(signal); if (failure) throw { code: failure }; const began = this.now();
        let response: { status: number; data: unknown };
        try {
          response = await guard(this.http.post({ url: `http://127.0.0.1:${session.port}/v1/chat/completions`,
            headers: { Authorization: `Bearer ${session.apiKey}`, 'Content-Type': 'application/json' },
            data: completionRequest(config.model, mode, [decoded.encoded]), connectTimeout: 5000, readTimeout: 180_000, disableRedirects: true }));
          if (response.status !== 200) throw { code: 'http_error' };
        } catch (e) {
          if (failure || signal.aborted) throw e;
          // A killed process often rejects HTTP before the next polling tick. Preserve the real cause.
          currentMemory = await guard(this.plugin.status());
          const code = serverFailure(currentMemory); if (code) throw { code };
          throw { code: 'http_error' };
        }
        const completion = parseCompletion(response.data);
        const usage: ReadUsage = { engine, passes: 1, latencyMs: this.now() - began,
          sentImages: [{ originalWidth: decoded.original.width, originalHeight: decoded.original.height, width: decoded.resized.width, height: decoded.resized.height }],
          ...(completion.timings ? { serverTimings: completion.timings } : {}) };
        return { completion, usage };
      };
      if (config.mode === 'graph') {
        const reader: VisionReader = { engine, read: async (_images, pass) => {
          try { const { completion, usage } = await complete(pass);
            return { draft: graphResult(completion, 0.1, [decoded.original]), usage };
          } catch (e) { failure ??= errorCode(e); throw e; }
        } };
        result.outcome = await guard(readProblem([decoded.original], { reader, passes: config.passes, signal }));
        result.usage = result.outcome.usage;
        if (failure) result.errorCode = failure;
      } else {
        result.linePasses = [];
        for (let pass = 0; pass < config.passes; pass++) {
          const { completion, usage } = await complete(config.model === 'a' ? 'spotting' : 'lines');
          const lines: TextLine[] = config.model === 'a' ? spottingLines(completion, decoded.original.width, decoded.original.height)
            : lineResult(completion, decoded.original.width, decoded.original.height);
          result.linePasses.push({ lines, usage });
          result.usage = addUsage(result.linePasses.map((p) => p.usage), engine);
        }
      }
      // Do not accept a late HTTP success from a server that died during the request.
      currentMemory = await guard(this.plugin.status());
      const code = serverFailure(currentMemory); if (code) throw { code };
      if (failure) throw { code: failure };
    } catch (e) {
      // Startup cancellation and HTTP can settle before a polling tick. Native pressure is latched
      // before teardown and survives stop(), so recover its cause/trim metadata before cleanup.
      if (startAttempted && !signal.aborted && failure !== 'timeout') {
        try {
          currentMemory = await this.plugin.status();
          if (currentMemory.memoryPressure) failure = 'memory_pressure';
          else if (currentMemory.errorCode) failure = currentMemory.errorCode;
        }
        catch { /* Preserve the already observed failure if status is unavailable. */ }
      }
      result.errorCode = signal.aborted ? 'aborted' : failure ?? errorCode(e);
      await this.plugin.stop().catch(() => {});
    } finally {
      if (timer) clearInterval(timer);
      if (timeout) clearTimeout(timeout);
      if (onAbort) signal.removeEventListener('abort', onAbort);
      if (currentMemory) { result.memory = currentMemory;
        if (currentMemory.peakMemoryMb !== undefined) result.usage.peakMemoryMb = currentMemory.peakMemoryMb; }
      result.totalMs = this.now() - start;
      this.active = false;
    }
    return result;
  }
}
function validateSession(s: Session): void {
  if (!Number.isInteger(s.port) || s.port < 1 || s.port > 65535 || !/^[a-f0-9]{64}$/.test(s.apiKey)
    || !Number.isFinite(s.loadMs) || s.loadMs < 0) throw { code: 'native_error' };
}
function addUsage(all: ReadUsage[], engine: string): ReadUsage {
  const usage: ReadUsage = { engine, passes: all.length, latencyMs: all.reduce((sum, u) => sum + u.latencyMs, 0), sentImages: all.flatMap((u) => u.sentImages ?? []) };
  if (all.every((u) => u.serverTimings)) usage.serverTimings = all.reduce((sum, u) => ({ promptMs: sum.promptMs + u.serverTimings!.promptMs,
    predictedMs: sum.predictedMs + u.serverTimings!.predictedMs, promptTokens: sum.promptTokens + u.serverTimings!.promptTokens, predictedTokens: sum.predictedTokens + u.serverTimings!.predictedTokens }),
  { promptMs: 0, predictedMs: 0, promptTokens: 0, predictedTokens: 0 });
  return usage;
}

/** Explicit allowlist. Pixel buffers, data URLs, file paths, server key and source are never serialized. */
export function exportReport(report: BenchmarkReport): string {
  return JSON.stringify({ version: 1, runtime: { llamaCpp: manifest.llamaCppSource, backend: 'CPU', contextSize: 8192,
    maxTokens: 4096, maxLongEdge: 1536, alternativesThreshold: 0.1, mmprojOffload: false },
  device: { manufacturer: report.device.manufacturer, model: report.device.model,
    android: report.device.android, sdk: report.device.sdk, cores: report.device.cores,
    totalRamBytes: report.device.totalRamBytes, availableRamBytes: report.device.availableRamBytes, freeStorageBytes: report.device.freeStorageBytes },
  results: report.results.map((r) => ({ id: r.id, engine: r.engine, config: { model: r.config.model, passes: r.config.passes,
    mode: r.config.mode, threads: r.config.threads, minRamGb: r.config.minRamGb, allowLowRam: r.config.allowLowRam,
    backgroundIdleMinutes: r.config.backgroundIdleMinutes, backend: 'CPU', cpuVariant: r.memory?.cpuVariant, cpuVariantSource: r.memory?.cpuVariantSource },
    imageSource: r.imageSource, captureMethod: r.captureMethod,
    outcome: r.outcome, linePasses: r.linePasses, usage: r.usage, totalMs: r.totalMs, modelLoadMs: r.modelLoadMs,
    modelVerifyMs: r.modelVerifyMs, reusedModel: r.reusedModel, memory: r.memory, errorCode: r.errorCode })) }, function (this: unknown, key, value: unknown) {
      // StatementCheck.source is a semantic vertex reference, required for desktop comparison.
      if (key === 'source' && !(this !== null && typeof this === 'object' && 'type' in this && this.type === 'dijkstra_label')) return undefined;
      if (['pixels', 'dataUrl', 'encoded', 'apiKey', 'port', 'image', 'images'].includes(key)) return undefined;
      return value;
    }, 2);
}
