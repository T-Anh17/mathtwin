import { readIssue } from './messages.vi.js';
import { normalizeDraft } from './normalize.js';
import { reconcile } from './reconcile.js';
import { ReadDraftSchema } from './schema.js';
import type { ReadDraft } from './schema.js';
import type { PreparedImage, ReadOutcome, ReadUsage, VisionReader } from './types.js';

function aborted(signal?: AbortSignal): void { signal?.throwIfAborted(); }

/** Race an adapter that ignores AbortSignal, while also forwarding the signal to cooperative adapters. */
async function cancellable<T>(action: () => Promise<T>, signal?: AbortSignal): Promise<T> {
  aborted(signal);
  if (signal === undefined) return action();
  return new Promise<T>((resolve, reject) => {
    const onAbort = (): void => { reject(signal.reason); };
    signal.addEventListener('abort', onAbort, { once: true });
    Promise.resolve().then(() => { aborted(signal); return action(); }).then(resolve, reject)
      .finally(() => signal.removeEventListener('abort', onAbort));
  });
}

export async function readProblem(images: PreparedImage[], deps: { reader: VisionReader; passes?: 1 | 2; signal?: AbortSignal }): Promise<ReadOutcome> {
  const { reader, signal } = deps;
  const drafts: ReadDraft[] = [];
  const usage: ReadUsage = { passes: 0, latencyMs: 0, engine: reader.engine };
  let completeServerTimings = true;
  const failure = (code: 'read_failed' | 'invalid_spec' = 'read_failed'): ReadOutcome => {
    const retained = drafts.length === 0 ? { graph: null, graphUncertain: [] } : normalizeDraft(drafts[0]!);
    return { spec: null, graph: retained.graph, graphUncertain: retained.graphUncertain,
      drafts, usage, issues: [readIssue(code, 'blocking')] };
  };
  aborted(signal);
  if ((deps.passes !== undefined && deps.passes !== 1 && deps.passes !== 2) || images.length === 0
    || images.some(({ pixels, width, height }) => !(pixels instanceof Uint8ClampedArray) || !Number.isInteger(width) || !Number.isInteger(height)
      || width <= 0 || height <= 0 || pixels.length !== width * height * 4)) return failure();
  try {
    for (const pass of (deps.passes === 1 ? ['edges'] : ['edges', 'neighbors']) as ('edges' | 'neighbors')[]) {
      aborted(signal);
      const result = await cancellable(() => reader.read(images, pass, signal), signal);
      aborted(signal);
      usage.passes++;
      if (!Number.isFinite(result.usage.latencyMs) || result.usage.latencyMs < 0
        || (result.usage.peakMemoryMb !== undefined && (!Number.isFinite(result.usage.peakMemoryMb) || result.usage.peakMemoryMb < 0))) return failure();
      usage.latencyMs += result.usage.latencyMs;
      if (result.usage.serverTimings) {
        const t = result.usage.serverTimings;
        if (![t.promptMs, t.predictedMs, t.promptTokens, t.predictedTokens].every((n) => Number.isFinite(n) && n >= 0)) return failure();
        const prior = usage.serverTimings ?? { promptMs: 0, predictedMs: 0, promptTokens: 0, predictedTokens: 0 };
        if (completeServerTimings) usage.serverTimings = { promptMs: prior.promptMs + t.promptMs, predictedMs: prior.predictedMs + t.predictedMs,
          promptTokens: prior.promptTokens + t.promptTokens, predictedTokens: prior.predictedTokens + t.predictedTokens };
      } else { completeServerTimings = false; delete usage.serverTimings; }
      if (result.usage.sentImages) usage.sentImages = [...(usage.sentImages ?? []), ...result.usage.sentImages];
      if (result.usage.finish_reason) usage.finish_reason = [...(usage.finish_reason ?? []), ...result.usage.finish_reason];
      if (result.usage.peakMemoryMb !== undefined) usage.peakMemoryMb = Math.max(usage.peakMemoryMb ?? 0, result.usage.peakMemoryMb);
      const parsed = ReadDraftSchema.safeParse(result.draft);
      if (!parsed.success) return failure('invalid_spec');
      drafts.push(parsed.data);
    }
    const normalized = drafts.length === 2 ? reconcile(drafts[0]!, drafts[1]!) : normalizeDraft(drafts[0]!);
    return { ...normalized, drafts, usage };
  } catch {
    aborted(signal);
    // Adapter errors may contain image contents or question prose. Do not propagate/log them.
    return failure();
  }
}
