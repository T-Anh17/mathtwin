import type { WorkAnswer, WorkLine } from './types.js';

/** User confirmation supersedes OCR evidence; the last answer to each line wins. */
export function applyWorkAnswers(lines: WorkLine[], answers: WorkAnswer[]): WorkLine[] {
  const byLine = new Map(answers.map((answer) => [answer.line, answer]));
  return lines.map((line) => {
    const answer = byLine.get(line.index);
    if (!answer) return { ...line, alternatives: [...line.alternatives], ...(line.charConf ? { charConf: [...line.charConf] } : {}) };
    if ('skip' in answer) return { ...line, skipped: true, missing: false };
    if ('struck' in answer) {
      const { strikeScore: _strikeScore, ...rest } = line;
      return { ...rest, struck: answer.struck };
    }
    const { charConf: _charConf, skipped: _skipped, ...rest } = line;
    return { ...rest, missing: false, text: answer.text.normalize('NFC'), conf: 1, alternatives: [], textConfirmed: true };
  });
}
