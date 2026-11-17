import { readProblem } from '@mathtwin/reader';
import type { ReadUsage, TextLine, VisionReader } from '@mathtwin/reader';
import { completionRequest, completionFinishReason, defaultMaxImageSide, defaultReadTimeout, defaultMaxTokens, defaultDry, validateDry, imageTimeout, graphResult, lineResult, parseCompletion, spottingLines } from '@mathtwin/reader-llamacpp-shared';
import type { ReadMode } from '@mathtwin/reader-llamacpp-shared';
import { FigureReader, NoGlyphReader } from '@mathtwin/reader-figure';
import type { BenchImage, BenchModel, BenchmarkConfig, Model, BenchmarkReport, HttpTransport, ImageResult, MobilePlugin, ServerState, Session } from './contracts.js';
import type { DecodedImage } from './images.js';
import { errorCode } from './messages.vi.js';
import manifest from '../../../tools/models/manifest.json';

export const engineFor = (model: BenchModel): string => model === 'a' ? 'offline:paddleocr-vl-1.5' : model === 'd' ? 'offline:figure-cv' : 'offline:qwen3-vl-2b';
/** Parse failures happen after a complete HTTP response; the server is healthy and stays warm. */
const parseFailures = ['repetition_loop', 'logprob_alignment', 'invalid_json', 'truncated', 'missing_probs'];
let requestSequence = 0;
function check(signal: AbortSignal): void { if (signal.aborted) throw { code: 'aborted' }; }
function serverFailure(state: ServerState): string | undefined {
  if (state.memoryPressure) return 'memory_pressure';
  if (state.errorCode) return state.errorCode;
  if (!state.alive) return state.exitCode === 137 || state.exitCode === 9 ? 'server_killed' : 'server_exit';
  return undefined;
}
function validateConfig(c: BenchmarkConfig): void {
  try { validateDry(c.dry ?? defaultDry); } catch { throw { code: 'native_error' }; }
  if (!['a', 'b', 'd'].includes(c.model) || ![1, 2].includes(c.passes) || !['graph', 'lines'].includes(c.mode)
    || ![512, 768, 1024].includes(c.maxImageSide ?? defaultMaxImageSide)
    || !Number.isSafeInteger(c.maxTokens ?? defaultMaxTokens) || (c.maxTokens ?? defaultMaxTokens) < 1 || (c.maxTokens ?? defaultMaxTokens) > 8192
    || !Number.isSafeInteger(c.readTimeout ?? defaultReadTimeout) || (c.readTimeout ?? defaultReadTimeout) < 1000 || (c.readTimeout ?? defaultReadTimeout) > 3_600_000
    || !Number.isInteger(c.threads) || c.threads < 1 || c.threads > 256 || !Number.isFinite(c.minRamGb) || c.minRamGb < 1 || c.minRamGb > 64
    || !Number.isFinite(c.backgroundIdleMinutes) || c.backgroundIdleMinutes < 1 || c.backgroundIdleMinutes > 60) throw { code: 'native_error' };
}
/** Orchestrates the same flow used by the screen. No native dependencies: tests inject plugin/HTTP/decoder. */
export class Benchmark {
  private active = false;
  constructor(private readonly plugin: MobilePlugin, private readonly http: HttpTransport,
    private readonly decode: (dataUrl: string, maxImageSide: number) => Promise<DecodedImage>, private readonly now = () => performance.now()) {}

  async run(image: BenchImage, config: BenchmarkConfig, signal: AbortSignal): Promise<ImageResult> {
    if (this.active) throw { code: 'busy' };
    if (config.model === 'd') return this.runFigure(image, config, signal);
    config = { ...config, maxImageSide: config.maxImageSide ?? defaultMaxImageSide,
      readTimeout: config.readTimeout ?? defaultReadTimeout, maxTokens: config.maxTokens ?? defaultMaxTokens, dry: { ...(config.dry ?? defaultDry) } };
    this.active = true;
    const start = this.now(), engine = engineFor(config.model);
    const result: ImageResult = { id: image.id, imageSource: image.imageSource, ...(image.captureMethod ? { captureMethod: image.captureMethod } : {}),
      config: { ...config }, engine, usage: { engine, passes: 0, latencyMs: 0 }, totalMs: 0, modelLoadMs: 0, modelVerifyMs: 0, reusedModel: false, serverRestarted: false };
    let timer: ReturnType<typeof setInterval> | undefined;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    let onAbort: (() => void) | undefined;
    let failure: string | undefined;
    let startAttempted = false;
    let session: Session | undefined;
    let pendingRequest: string | undefined;
    let readTimer: ReturnType<typeof setTimeout> | undefined;
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
      const interrupt = (code: string): void => {
        fail(code);
        // During startup there is no HTTP connection to cancel yet. Native stop cancels start too.
        if (!session) void this.plugin.stop().catch(() => {});
      };
      onAbort = () => interrupt('aborted');
      signal.addEventListener('abort', onAbort, { once: true }); check(signal);
      timeout = setTimeout(() => interrupt('timeout'), imageTimeout(config.readTimeout!, config.passes));
      if (config.model === 'a' && config.mode === 'graph') throw { code: 'text_only' };
      const device = await guard(this.plugin.device());
      if (device.totalRamBytes < config.minRamGb * 1e9 && !config.allowLowRam) throw { code: 'low_ram' };
      const decoded = await guard(this.decode(image.dataUrl, config.maxImageSide!)); check(signal);
      startAttempted = true;
      session = await guard(this.plugin.start({ ...config, model: llm(config.model) }));
      validateSession(session);
      const currentSession = session;
      result.modelLoadMs = session.loadMs; result.reusedModel = session.reused;
      result.modelVerifyMs = session.verifyMs ?? 0;
      await updateMemory();
      if (failure) throw { code: failure };
      timer = setInterval(() => { void updateMemory(); }, 250);
      const complete = async (mode: ReadMode): Promise<{ completion: ReturnType<typeof parseCompletion>; usage: ReadUsage }> => {
        check(signal); if (failure) throw { code: failure }; const began = this.now();
        const sentImage = { originalWidth: decoded.original.width, originalHeight: decoded.original.height,
          width: decoded.resized.width, height: decoded.resized.height, maxImageSide: config.maxImageSide! };
        result.usage.sentImages = [...(result.usage.sentImages ?? []), sentImage];
        let response: { status: number; data: unknown };
        pendingRequest = `read-${Date.now()}-${++requestSequence}`;
        readTimer = setTimeout(() => fail('timeout'), config.readTimeout!);
        try {
          response = await guard(this.http.post({ requestId: pendingRequest, url: `http://127.0.0.1:${currentSession.port}/v1/chat/completions`,
            headers: { Authorization: `Bearer ${currentSession.apiKey}`, 'Content-Type': 'application/json' },
            data: completionRequest(llm(config.model), mode, [decoded.encoded], config.maxTokens, config.dry), connectTimeout: 5000, readTimeout: config.readTimeout!, disableRedirects: true }));
          if (response.status !== 200) throw { code: 'http_error' };
        } catch (e) {
          if (failure || signal.aborted) throw e;
          // A killed process often rejects HTTP before the next polling tick. Preserve the real cause.
          currentMemory = await guard(this.plugin.status());
          const code = serverFailure(currentMemory); if (code) throw { code };
          const nativeCode = errorCode(e);
          throw { code: ['timeout', 'aborted', 'invalid_json'].includes(nativeCode) ? nativeCode : 'http_error' };
        } finally { if (readTimer) clearTimeout(readTimer); }
        pendingRequest = undefined;
        const finish = completionFinishReason(response.data);
        result.usage.finish_reason = [...(result.usage.finish_reason ?? []), ...(finish ? [finish] : [])];
        const completion = parseCompletion(response.data, config.model === 'b');
        const usage: ReadUsage = { engine, passes: 1, latencyMs: this.now() - began,
          finish_reason: finish ? [finish] : [],
          sentImages: [sentImage],
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
        result.usage = { ...result.outcome.usage, sentImages: result.usage.sentImages ?? [], finish_reason: result.usage.finish_reason ?? [] };
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
      if (timer) clearInterval(timer);
      if (timeout) clearTimeout(timeout);
      if (readTimer) clearTimeout(readTimer);
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
      if (pendingRequest) await this.plugin.cancelRequest({ requestId: pendingRequest }).catch(() => {});
      if (session && pendingRequest && ['timeout', 'aborted'].includes(result.errorCode)) {
        if (!await waitForIdle(this.plugin, session)) {
          await this.plugin.stop().catch(() => {}); result.serverRestarted = true;
        }
      } else if (!(session && !pendingRequest && parseFailures.includes(result.errorCode))) await this.plugin.stop().catch(() => {});
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

  /** Engine D: pure-TS figure reader in this thread, no model file or server. Graph drafts only. */
  private async runFigure(image: BenchImage, config: BenchmarkConfig, signal: AbortSignal): Promise<ImageResult> {
    this.active = true;
    const start = this.now(), engine = engineFor('d');
    const result: ImageResult = { id: image.id, imageSource: image.imageSource, ...(image.captureMethod ? { captureMethod: image.captureMethod } : {}),
      config: { ...config, passes: 1 }, engine, usage: { engine, passes: 0, latencyMs: 0 }, totalMs: 0, modelLoadMs: 0, modelVerifyMs: 0, reusedModel: false, serverRestarted: false };
    try {
      if (config.mode !== 'graph') throw { code: 'graph_only' };
      check(signal);
      const decoded = await this.decode(image.dataUrl, config.maxImageSide ?? defaultMaxImageSide); check(signal);
      const reader = new FigureReader({ glyphReader: new NoGlyphReader() });
      result.outcome = await readProblem([decoded.original], { reader, passes: 1, signal });
      result.usage = result.outcome.usage;
      check(signal);
    } catch (e) { result.errorCode = signal.aborted ? 'aborted' : errorCode(e); }
    finally { result.totalMs = this.now() - start; this.active = false; }
    return result;
  }
}
/** A/B go through llama-server; D never reaches these paths (see runFigure). */
function llm(model: BenchModel): Model { if (model === 'd') throw { code: 'native_error' }; return model; }
function validateSession(s: Session): void {
  if (!Number.isInteger(s.port) || s.port < 1 || s.port > 65535 || !/^[a-f0-9]{64}$/.test(s.apiKey)
    || !Number.isFinite(s.loadMs) || s.loadMs < 0) throw { code: 'native_error' };
}
function addUsage(all: ReadUsage[], engine: string): ReadUsage {
  const usage: ReadUsage = { engine, passes: all.length, latencyMs: all.reduce((sum, u) => sum + u.latencyMs, 0), sentImages: all.flatMap((u) => u.sentImages ?? []) };
  usage.finish_reason = all.flatMap((u) => u.finish_reason ?? []);
  if (all.every((u) => u.serverTimings)) usage.serverTimings = all.reduce((sum, u) => ({ promptMs: sum.promptMs + u.serverTimings!.promptMs,
    predictedMs: sum.predictedMs + u.serverTimings!.predictedMs, promptTokens: sum.promptTokens + u.serverTimings!.promptTokens, predictedTokens: sum.predictedTokens + u.serverTimings!.predictedTokens }),
  { promptMs: 0, predictedMs: 0, promptTokens: 0, predictedTokens: 0 });
  return usage;
}

/** Explicit allowlist. Pixel buffers, data URLs, file paths, server key and source are never serialized. */
export function exportReport(report: BenchmarkReport): string {
  const tokenLimits = [...new Set(report.results.map((r) => r.config.maxTokens ?? defaultMaxTokens))];
  return JSON.stringify({ version: 1, runtime: { llamaCpp: manifest.llamaCppSource, backend: 'CPU', contextSize: 8192,
    maxTokens: tokenLimits.length === 1 ? tokenLimits[0] : null, alternativesThreshold: 0.1, mmprojOffload: false },
  device: { manufacturer: report.device.manufacturer, model: report.device.model,
    android: report.device.android, sdk: report.device.sdk, cores: report.device.cores,
    totalRamBytes: report.device.totalRamBytes, availableRamBytes: report.device.availableRamBytes, freeStorageBytes: report.device.freeStorageBytes },
  results: report.results.map((r) => ({ id: r.id, engine: r.engine, config: { model: r.config.model, passes: r.config.passes,
    mode: r.config.mode, threads: r.config.threads, minRamGb: r.config.minRamGb, allowLowRam: r.config.allowLowRam,
    maxImageSide: r.config.maxImageSide ?? defaultMaxImageSide, readTimeout: r.config.readTimeout ?? defaultReadTimeout, maxTokens: r.config.maxTokens ?? defaultMaxTokens, dry: r.config.dry ?? defaultDry,
    backgroundIdleMinutes: r.config.backgroundIdleMinutes, backend: 'CPU', cpuVariant: r.memory?.cpuVariant, cpuVariantSource: r.memory?.cpuVariantSource },
    imageSource: r.imageSource, captureMethod: r.captureMethod,
    outcome: r.outcome, linePasses: r.linePasses, usage: r.usage, totalMs: r.totalMs, modelLoadMs: r.modelLoadMs,
    modelVerifyMs: r.modelVerifyMs, reusedModel: r.reusedModel, memory: r.memory, errorCode: r.errorCode, serverRestarted: r.serverRestarted ?? false })) }, function (this: unknown, key, value: unknown) {
      // StatementCheck.source is a semantic vertex reference, required for desktop comparison.
      if (key === 'source' && !(this !== null && typeof this === 'object' && 'type' in this && this.type === 'dijkstra_label')) return undefined;
      if (['pixels', 'dataUrl', 'encoded', 'apiKey', 'port', 'image', 'images'].includes(key)) return undefined;
      return value;
    }, 2);
}

/** A missing/unreachable slots endpoint is inconclusive: stop before accepting another image. */
async function waitForIdle(plugin: MobilePlugin, session: Session): Promise<boolean> {
  let finished = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      new Promise<boolean>((resolve) => { timer = setTimeout(() => resolve(false), 5000); }),
      (async () => {
        while (!finished) {
          try {
            const slots = await plugin.slots({ url: `http://127.0.0.1:${session.port}/slots`,
              headers: { Authorization: `Bearer ${session.apiKey}` }, timeout: 500 });
            if (slots.idle === true) return true;
          } catch { /* Retry within the shared five-second budget. */ }
          if (!finished) await new Promise<void>((resolve) => setTimeout(resolve, 100));
        }
        return false;
      })(),
    ]);
  } finally { finished = true; if (timer) clearTimeout(timer); }
}
