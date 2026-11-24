import type { PreparedImage, ReadUsage, TextReader } from '@mathtwin/reader';
import type { WorkLine, WorkVocabulary, ParsedWork } from './types.js';
import { detectStrikes, STRIKE_YES } from './strikes.js';
import { parseWork } from './parse/index.js';
import { lineCarriesClaim } from './grade.js';

const median = (values: number[]): number | undefined => {
  if (!values.length) return;
  const sorted = [...values].sort((a, b) => a - b), middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1]! + sorted[middle]!) / 2;
};

export type StrikeEvidence = ReturnType<typeof detectStrikes>[number];

/** Phase 5 rule 4 on one page: a high pixel score strikes a line silently only when its box and
 * stroke position are trustworthy and the line carries no claim; otherwise the user is asked. */
export function decideStrikes(lines: WorkLine[], evidence: StrikeEvidence[], vocab: WorkVocabulary): WorkLine[] {
  const base = lines.map((line, i): WorkLine => {
    const { strikeQuestion: _question, strokeBand: _band, ...rest } = line, mark = evidence[i]!;
    return { ...rest, struck: false, strikeScore: mark.score, ...(mark.strokeBand === undefined ? {} : { strokeBand: mark.strokeBand }) };
  });
  const typicalHeight = median(base.filter((line) => (line.region === 'solution' || line.region === 'table') && line.box)
    .map((line) => line.box![3] - line.box![1]));
  const silent = base.map((line, i) => {
    const mark = evidence[i]!;
    return mark.score >= STRIKE_YES && line.box !== undefined && typicalHeight !== undefined
      && line.box[3] - line.box[1] <= typicalHeight * 1.6
      && mark.strokeBand !== undefined && mark.strokeBand >= .3 && mark.strokeBand <= .7
      && !lineCarriesClaim(base, line.index, vocab);
  });
  // Striking must never remove every claim of the page without a question.
  const claimsBefore = parseWork(base, vocab).steps.length;
  const tentative = base.map((line, i) => silent[i] ? { ...line, struck: true } : line);
  const losesAll = claimsBefore > 0 && parseWork(tentative, vocab).steps.length === 0;
  return base.map((line, i) => {
    if (evidence[i]!.score < STRIKE_YES) return line;
    return silent[i] && !losesAll ? { ...line, struck: true } : { ...line, strikeQuestion: true };
  });
}

/** Pixel evidence plus rule 4; also used to rescore stored OCR without a new B pass. */
export function applyStrikeRule(lines: WorkLine[], image: PreparedImage, vocab: WorkVocabulary): WorkLine[] {
  return decideStrikes(lines, detectStrikes(image, lines), vocab);
}

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
    const modelLines = pageLines.map((line) => line.region ? { ...line, regionSource: line.regionSource ?? 'model' as const } : line);
    lines.push(...applyStrikeRule(modelLines, image, deps.vocab));
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
