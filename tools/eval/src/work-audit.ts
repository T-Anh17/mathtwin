import type { ProblemSpec } from '@mathtwin/core';
import { stripDiacritics } from '@mathtwin/reader';
import { claimKey } from '@mathtwin/work';
import type { ParsedWork, WorkComparison, WorkGrade, WorkLine, WorkTruth } from '@mathtwin/work';
import { indexedWorkLines, joinedText, readingText, truthIndices } from './work-alignment.js';
import type { WorkAlignment } from './work-alignment.js';

/** Post-inference diagnostics only. Never used to choose text, claims or grades. */
export function auditWork(spec: ProblemSpec, observed: WorkLine[], truth: WorkTruth, reference: WorkLine[], prediction: { parsed: ParsedWork; grade: WorkGrade }, alignment: WorkAlignment = indexedWorkLines(observed, reference), comparison?: WorkComparison) {
  const content = new Set(Object.values(truth.lineOf).flat());
  const numbers = (s: string) => JSON.stringify(s.match(/\d+(?:[.,]\d+)?/gu) ?? []);
  const labels = new Set(spec.graph.vertices.map((v) => v.label));
  const labelTokens = (s: string) => JSON.stringify((s.match(/[\p{L}\p{N}_]+/gu) ?? []).filter((t) => labels.has(t) || /^[A-Z](?:\d+)?$/u.test(t)));
  const failed = new Set(truthIndices(alignment, prediction.parsed.unchecked));
  const missing = truth.claims.filter((claim) => !prediction.parsed.steps.some((step) => claimKey(step.claim) === claimKey(claim)))
    .flatMap((claim) => truth.lineOf[String(claim.step)] ?? []);
  missing.forEach((line) => failed.add(line));
  const active = observed.filter((l) => !l.skipped);
  const diagnostics = { numberMismatch: 0, labelMismatch: 0, accentDamage: 0, tableFailure: 0, struckAsContent: 0, unsupportedWording: 0 };
  for (const group of alignment.groups) {
    const refs = reference.filter((l) => group.truth.includes(l.index) && content.has(l.index) && !l.struck);
    if (!refs.length) continue;
    const actual = readingText(joinedText(active, group.observed));
    const expected = readingText(refs.map((l) => l.text).join('\n'));
    // Missing lines are reported separately, not mislabeled as token errors.
    if (!group.observed.length) continue;
    if (numbers(actual) !== numbers(expected)) diagnostics.numberMismatch++;
    if (labelTokens(actual) !== labelTokens(expected)) diagnostics.labelMismatch++;
    const failure = refs.some((l) => failed.has(l.index));
    if (actual !== expected && stripDiacritics(actual) === stripDiacritics(expected) && failure) diagnostics.accentDamage++;
    if (refs.some((l) => l.region === 'table') && failure) diagnostics.tableFailure++;
    if (actual === expected && failure) diagnostics.unsupportedWording++;
  }
  diagnostics.struckAsContent = prediction.parsed.steps.filter((step) => truthIndices(alignment, step.lines).some((i) => reference.some((l) => l.index === i && l.struck))).length;
  const missingClaimLines = [...content].filter((i) => !alignment.groups.some((g) => g.truth.includes(i) && g.observed.length));
  const intrusionLines = observed.filter((line) => {
    if (line.skipped || line.struck || line.region === 'question' || line.region === 'figure') return false;
    const group = alignment.groups.find((g) => g.observed.includes(line.index));
    if (group?.truth.length) return group.truth.some((i) => reference.some((l) => l.index === i && (l.region === 'figure' || l.region === 'question')));
    // Readers can emit diagram labels after the solution (non-monotone order).
    // Exact region-text evidence identifies those extras without guessing that
    // every unmatched OCR line belongs to the diagram.
    return reference.some((l) => (l.region === 'figure' || l.region === 'question') && readingText(l.text) === readingText(line.text));
  }).map((l) => l.index);
  const used = new Set([...prediction.parsed.steps.flatMap((s) => s.lines), ...prediction.parsed.unchecked]);
  const intrusionUsed = intrusionLines.filter((i) => used.has(i));
  const highConfidenceMisreads = alignment.groups.filter((g) => g.truth.some((i) => reference.some((l) => l.index === i && (content.has(i) || l.struck)))
    && active.some((l) => g.observed.includes(l.index) && l.conf >= .85)
    && readingText(joinedText(active, g.observed)) !== readingText(joinedText(reference, g.truth))).flatMap((g) => g.observed);
  const silent = comparison && (comparison.silentFalseCorrect || comparison.silentFalseWrongParse || comparison.silentFalseWrongReading);
  const errorTruth = truth.lineOf[String(truth.expected.firstErrorStep)] ?? [];
  const lastError = Math.max(...(prediction.grade.firstErrorLines ?? []));
  const relevant = (g: { observed: number[]; truth: number[] }) => comparison?.silentFalseCorrect
    ? g.truth.some((i) => errorTruth.includes(i)) : g.observed.some((i) => i <= lastError);
  const causalMisreads = highConfidenceMisreads.filter((i) => relevant(alignment.groups.find((g) => g.observed.includes(i))!));
  const causalIntrusions = intrusionUsed.filter((i) => comparison?.silentFalseCorrect || i <= lastError);
  // Mutually exclusive operational attribution, with evidence retained for review.
  const cause = !silent ? null : missingClaimLines.some((i) => errorTruth.includes(i)) ? 'a'
    : causalIntrusions.length ? 'c' : causalMisreads.length ? 'b' : missingClaimLines.length ? 'a' : 'd';
  const causeTruth = new Set([...missing, ...truthIndices(alignment, [...prediction.parsed.unchecked, ...(prediction.grade.firstErrorLines ?? [])]), ...errorTruth]);
  const evidence = alignment.groups.filter((g) => g.truth.some((i) => causeTruth.has(i)) || g.observed.some((i) => used.has(i) && !g.truth.length)).map((g) => ({
    index: g.truth[0] ?? null, observedIndices: g.observed, truthIndices: g.truth,
    observed: g.observed.length ? joinedText(active, g.observed) : null,
    truth: g.truth.length ? joinedText(reference, g.truth) : null,
  }));
  const figureLines = intrusionLines.filter((i) => {
    const group = alignment.groups.find((g) => g.observed.includes(i));
    return group?.truth.some((t) => reference.some((l) => l.index === t && l.region === 'figure'))
      || !group?.truth.length && reference.some((l) => l.region === 'figure' && readingText(l.text) === readingText(observed.find((l) => l.index === i)!.text));
  });
  return { diagnostics, evidence, cause, missingClaimLines, highConfidenceMisreads, causalMisreads, causalIntrusions, intrusionLines, intrusionUsed, figureLines,
    figureUsed: figureLines.filter((i) => used.has(i)),
    unmatchedLines: alignment.groups.filter((g) => !g.truth.length).flatMap((g) => g.observed),
    region: { present: observed.filter((l) => l.region !== undefined).length, total: observed.length,
      values: Object.fromEntries([...new Set(observed.map((l) => l.region ?? 'absent'))].map((r) => [r, observed.filter((l) => (l.region ?? 'absent') === r).length])) } };
}
