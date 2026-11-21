import type { PreparedImage, ReadUsage, TextReader } from '@mathtwin/reader';
import type { WorkLine, WorkVocabulary, ParsedWork } from './types.js';
import { detectStrikes } from './strikes.js';
import { parseWork } from './parse/index.js';

export async function readWork(pages: PreparedImage[], deps: { reader: TextReader; vocab: WorkVocabulary; signal?: AbortSignal; continuation?: boolean }):
Promise<{ lines: WorkLine[]; parsed: ParsedWork; usage: ReadUsage }> {
  const lines: WorkLine[] = [];
  const usage: ReadUsage = { passes: 0, latencyMs: 0, engine: deps.reader.engine, lineCount: 0 };
  // TextReader has no page field: one call per page preserves source coordinates.
  for (const [page, image] of pages.entries()) {
    deps.signal?.throwIfAborted();
    const read = await deps.reader.readLines([image], deps.signal, { continuation: deps.continuation === true || page > 0 });
    deps.signal?.throwIfAborted();
    const pageLines = read.lines.map((line, i): WorkLine => ({ ...line, page, index: lines.length + i }));
    const strikes = detectStrikes(image, pageLines);
    lines.push(...pageLines.map((line, i) => ({ ...line, struck: strikes[i]!.struck, strikeScore: strikes[i]!.score })));
    usage.passes += read.usage.passes; usage.latencyMs += read.usage.latencyMs;
    usage.lineCount! += read.lines.length;
    if (read.usage.peakMemoryMb !== undefined) usage.peakMemoryMb = Math.max(usage.peakMemoryMb ?? 0, read.usage.peakMemoryMb);
    for (const key of ['detectionMs', 'recognitionMs'] as const) if (read.usage[key] !== undefined) usage[key] = (usage[key] ?? 0) + read.usage[key];
    if (read.usage.lineMs) usage.lineMs = [...usage.lineMs ?? [], ...read.usage.lineMs];
    if (read.usage.sentImages) usage.sentImages = [...usage.sentImages ?? [], ...read.usage.sentImages];
    if (read.usage.finish_reason) usage.finish_reason = [...usage.finish_reason ?? [], ...read.usage.finish_reason];
    if (read.usage.serverTimings) {
      const total = usage.serverTimings ?? { promptMs: 0, predictedMs: 0, promptTokens: 0, predictedTokens: 0 };
      for (const key of ['promptMs', 'predictedMs', 'promptTokens', 'predictedTokens'] as const) total[key] += read.usage.serverTimings[key];
      usage.serverTimings = total;
    }
  }
  const parsed = parseWork(lines, deps.vocab);
  return { lines, parsed, usage };
}
