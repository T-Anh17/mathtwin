import { normalizeDraft } from '@mathtwin/reader';
import type { PreparedImage, ReadDraft, ReadOutcome, TextReader } from '@mathtwin/reader';

export type FigureDraftRunner = (image: PreparedImage, signal: AbortSignal) => Promise<ReadDraft>;
export interface Readers {
  text: TextReader;
  problem: (photos: PreparedImage[], signal?: AbortSignal) => Promise<ReadOutcome>;
  figure?: FigureDraftRunner;
  /** Caller holds this lease across decoding, OCR, drafts and durable checkpoints. */
  activity?: (running: boolean) => Promise<void>;
}
export interface ProblemPageRead { page: number; outcome: ReadOutcome; figure?: ReadDraft; ms: number; figureMs: number }
export interface ReadingProgress { page: number; total: number; phase: 'problem' | 'figure' }

/** A cancelled or non-cooperative adapter must never publish a late result. */
export function cancellable<T>(work: () => Promise<T>, signal: AbortSignal): Promise<T> {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason);
    signal.addEventListener('abort', abort, { once: true });
    Promise.resolve().then(() => { signal.throwIfAborted(); return work(); }).then(resolve, reject)
      .finally(() => signal.removeEventListener('abort', abort));
  });
}

/** Bound even a non-cooperative fake/worker, and propagate the deadline to native cancellation. */
export async function readingTask<T>(work: (signal: AbortSignal) => Promise<T>, parent: AbortSignal, timeoutMs = 180_000): Promise<T> {
  parent.throwIfAborted();
  const controller = new AbortController();
  const abort = () => controller.abort(parent.reason);
  parent.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(() => controller.abort({ code: 'timeout' }), timeoutMs);
  try { return await cancellable(() => work(controller.signal), controller.signal); }
  finally { clearTimeout(timer); parent.removeEventListener('abort', abort); }
}

export function checkImage(image: PreparedImage): PreparedImage {
  if (!Number.isInteger(image.width) || !Number.isInteger(image.height) || image.width < 1 || image.height < 1
    || image.width * image.height > 40_000_000 || image.pixels.length !== image.width * image.height * 4) throw { code: 'image_invalid' };
  return image;
}

/** One page in memory, one durable checkpoint at a time. Callers supply all platform operations. */
export async function readProblemPages(options: {
  count: number; load: (page: number) => Promise<PreparedImage>; readers: Readers; signal: AbortSignal;
  saved?: ProblemPageRead[]; progress: (value: ReadingProgress) => void;
  checkpoint: (value: ProblemPageRead) => Promise<void>; now?: () => number; timeoutMs?: number;
}): Promise<ReadOutcome> {
  const { readers, signal } = options, now = options.now ?? (() => performance.now());
  if (!Number.isInteger(options.count) || options.count < 1) throw { code: 'image_invalid' };
  const pages = [...(options.saved ?? [])];
  for (let page = 0; page < options.count; page++) {
    signal.throwIfAborted();
    if (pages.some((p) => p.page === page)) continue;
    options.progress({ page, total: options.count, phase: 'problem' });
    const image = checkImage(await readingTask(() => options.load(page), signal, options.timeoutMs));
    const began = now();
    const outcome = await readingTask((signal) => readers.problem([image], signal), signal, options.timeoutMs);
    const ms = now() - began;
    const result: ProblemPageRead = { page, outcome, ms, figureMs: 0 };
    signal.throwIfAborted();
    await options.checkpoint(result);
    let figure: ReadDraft | undefined, figureMs = 0;
    if (readers.figure) {
      options.progress({ page, total: options.count, phase: 'figure' });
      const started = now();
      try { figure = await readingTask((signal) => readers.figure!(image, signal), signal, options.timeoutMs); }
      catch { signal.throwIfAborted(); /* D is optional; B's result and manual editing survive. */ }
      figureMs = now() - started;
    }
    signal.throwIfAborted();
    const completed: ProblemPageRead = { ...result, figureMs, ...(figure ? { figure } : {}) };
    if (readers.figure) await options.checkpoint(completed);
    pages.push(completed);
  }
  signal.throwIfAborted();
  return combineProblemPages(pages);
}

/** Pages describe one graph. Overlaps/contradictions require explicit graph and task review. */
export function combineProblemPages(pages: ProblemPageRead[]): ReadOutcome {
  const ordered = [...pages].sort((a, b) => a.page - b.page);
  if (!ordered.length) throw { code: 'read_failed' };
  if (ordered.length === 1) return structuredClone(ordered[0]!.outcome);
  const outcomes = ordered.map((p) => p.outcome), drafts = outcomes.flatMap((p) => p.drafts.slice(0, 1));
  const first = drafts[0];
  if (!first) return structuredClone(outcomes[0]!);
  const merged = structuredClone(first);
  const vertices = new Map<string, ReadDraft['vertices'][number]>();
  for (const vertex of drafts.flatMap((d) => d.vertices)) {
    const prior = vertices.get(vertex.label);
    vertices.set(vertex.label, prior ? { ...prior, conf: Math.min(prior.conf, vertex.conf),
      alternatives: [...new Set([...(prior.alternatives ?? []), ...(vertex.alternatives ?? [])])] } : structuredClone(vertex));
  }
  merged.vertices = [...vertices.values()];
  merged.edges = drafts.flatMap((d) => d.edges);
  merged.question = [...drafts].reverse().find((d) => d.question !== null)?.question ?? null;
  merged.directed = drafts.some((d) => d.directed);
  merged.statedFacts = { vertexCount: null, edgeCount: null, weightUnit: first.statedFacts.weightUnit };
  merged.unreadable = drafts.flatMap((d) => d.unreadable);
  const normalized = normalizeDraft(merged);
  const flags = [{ item: 'graph', candidates: normalized.graph ? [normalized.graph] : [] }];
  if (normalized.spec) {
    normalized.spec.uncertain = [...(normalized.spec.uncertain ?? []).filter((u) => u.item !== 'graph'), ...flags,
      { item: 'task.type', candidates: [normalized.spec.task.type] }];
  }
  if (outcomes.some((o) => o.issues.some((i) => i.code === 'read_failed'))) normalized.spec = null;
  return { ...normalized, graphUncertain: [...normalized.graphUncertain.filter((u) => u.item !== 'graph'), ...flags],
    issues: [...normalized.issues, ...outcomes.flatMap((o) => o.issues.filter((i) => i.code === 'read_failed'))],
    drafts, usage: { engine: outcomes[0]!.usage.engine,
      passes: outcomes.reduce((n, o) => n + o.usage.passes, 0), latencyMs: outcomes.reduce((n, o) => n + o.usage.latencyMs, 0) } };
}
