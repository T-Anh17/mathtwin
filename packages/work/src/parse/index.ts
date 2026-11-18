import type { ClaimBody } from '@mathtwin/core';
import type { ParsedStep, ParsedWork, WorkLine, WorkVocabulary } from '../types.js';
import { workMessages } from '../messages.vi.js';
import { parsePrimary } from './primary.js';
import { tableLike, validTableReading } from './table.js';

const bodyOf = ({ step: _step, raw: _raw, conf: _conf, box: _box, ...body }: ParsedStep['claim']): ClaimBody => body;
const key = (step: ParsedStep): string => step.lines.join(',');
const equalBody = (a: ClaimBody, b: ClaimBody): boolean => JSON.stringify(a) === JSON.stringify(b);

export function parseWork(lines: WorkLine[], vocab: WorkVocabulary, opts?: { confThreshold?: number }): ParsedWork {
  const threshold = opts?.confThreshold ?? 0.85;
  const selected = lines.map((line) => ({ ...line, text: line.text.normalize('NFC') }));
  const protectedLines = new Set(lines.some((line) => line.alternatives.length)
    ? parsePrimary(selected, vocab, opts).ignored.filter((item) => ['question', 'figure', 'struck'].includes(item.reason)).map((item) => item.line) : []);
  const replace = (position: number, text: string): WorkLine[] => selected.map((line, i) => i === position ? { ...line, text } : line);
  const eligible = (line: WorkLine): boolean => !protectedLines.has(line.index) && !line.skipped && !line.struck && line.region !== 'question' && line.region !== 'figure';
  for (let i = 0; i < selected.length; i++) {
    const line = selected[i]!;
    if (!eligible(line) || !line.alternatives.length) continue;
    const table = line.region === 'table' || tableLike(line, vocab);
    for (const text of [line.text, ...line.alternatives].map((s) => s.normalize('NFC'))) {
      const trialLine = { ...line, text };
      let valid: boolean;
      if (table) valid = validTableReading(trialLine, vocab);
      else {
        const trial = parsePrimary(replace(i, text), vocab, opts);
        valid = trial.steps.some((s) => s.lines.includes(line.index)) && !trial.unchecked.includes(line.index);
      }
      if (!valid) continue;
      if (text !== line.text) {
        const { charConf: _charConf, ...withoutScores } = line;
        selected[i] = { ...withoutScores, text, conf: Math.min(line.conf, threshold - 0.01) };
      }
      break;
    }
  }
  const parsed = parsePrimary(selected, vocab, opts);
  parsed.sourceLines = selected;
  for (const step of parsed.steps) step.candidateTexts = [step.claim.raw];
  // Change one transcription at a time with the already selected context. No cartesian search.
  for (let i = 0; i < selected.length; i++) {
    const line = selected[i]!;
    if (!eligible(line)) continue;
    for (const text of [...new Set([lines[i]!.text, ...line.alternatives])]) {
      if (text.normalize('NFC') === line.text) continue;
      const trial = parsePrimary(replace(i, text.normalize('NFC')), vocab, opts);
      if (trial.unchecked.includes(line.index)) continue;
      const counts = new Map<string, number>();
      for (const step of parsed.steps) {
        const source = key(step), index = counts.get(source) ?? 0;
        counts.set(source, index + 1);
        const other = trial.steps.filter((s) => key(s) === source)[index];
        if (!other) continue;
        const body = bodyOf(other.claim);
        if (step.candidates.some((candidate) => equalBody(candidate, body))) continue;
        step.candidates.push(body); step.candidateTexts!.push(other.claim.raw);
        if (!parsed.issues.some((issue) => issue.code === 'ambiguous_line' && issue.lines?.includes(line.index))) {
          parsed.issues.push({ code: 'ambiguous_line', severity: 'warning', lines: [line.index], message: workMessages.ambiguous_line });
        }
      }
    }
  }
  return parsed;
}
