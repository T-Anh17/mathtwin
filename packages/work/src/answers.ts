import type { WorkAnswer, WorkLine } from './types.js';

/** User confirmation supersedes OCR evidence; the last answer to each line wins. */
export function applyWorkAnswers(lines: WorkLine[], answers: WorkAnswer[]): WorkLine[] {
  const byLine = new Map(answers.map((answer) => [answer.line, answer]));
  return lines.map((line) => {
    const answer = byLine.get(line.index);
    if (!answer) return { ...line, alternatives: [...line.alternatives], ...(line.charConf ? { charConf: [...line.charConf] } : {}) };
    if ('skip' in answer) return { ...line, skipped: true };
    if ('struck' in answer) return { ...line, struck: answer.struck };
    const { charConf: _charConf, skipped: _skipped, ...rest } = line;
    return { ...rest, text: answer.text.normalize('NFC'), conf: 1, alternatives: [] };
  });
}
