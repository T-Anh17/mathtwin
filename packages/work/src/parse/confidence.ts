import type { ClaimBody } from '@mathtwin/core';
import type { WorkLine, WorkVocabulary } from '../types.js';
import { fold, labelKey, language } from './text.js';
import { splitLabels } from './labels.js';

function characterScores(line: WorkLine): number[] | undefined {
  const scores = line.charConf;
  return scores?.length === [...line.text.normalize('NFC')].length
    && scores.every((p) => Number.isFinite(p) && p >= 0 && p <= 1) ? scores : undefined;
}

/** Unknown text can have lost any grading token, so every character matters. */
export function readingConfidence(line: WorkLine): number {
  const scores = characterScores(line);
  return scores?.length ? Math.min(...scores) : line.conf;
}

// Grammatical subjects, actions, predicates and notation used to select claim types.
const decisionWords = new Set(('so luong dinh diem canh khuyen bac deg d n l w v e tong le thanh phan nhom lien thong '
  + 'cac tap hop rong co khong chua thoa dieu kien dirac ore bat buoc tim thay '
  + 'chu trinh duong di euler hamilton ve duoc bang mot net '
  + 'do dai quang khoang cach ngan nhat tu den gan nho '
  + 'gan nhan khoi tao khoanh tron chon danh dau co dinh ghi doi qua tai thanh khac con lai '
  + 'lap lai them nguoi du lich tsp hanh trinh dua thu '
  + 'vay kl dap so an ket luan qua cuoi cung dung sai true false').split(' '));

/** Keep source indices separately; these slices are only probability evidence. */
export function evidenceSlice(line: WorkLine, start: number, end: number): WorkLine {
  const text = line.text.normalize('NFC');
  const { charConf, ...rest } = line;
  const valid = charConf?.length === [...text].length;
  return { ...rest, text: text.slice(start, end), ...(valid ? { charConf: charConf.slice([...text.slice(0, start)].length, [...text.slice(0, end)].length) } : {}) };
}

export function clauseEvidence(sources: WorkLine[], clause: string, body: ClaimBody): WorkLine[] {
  const raw = sources.map((line) => line.text).join(' ');
  let start = raw.indexOf(clause), end = start + clause.length;
  // A single source clause can contain several independently judged answers.
  if (body.type === 'statement') {
    const matches = [...raw.matchAll(/([\p{L}\p{N}_]+)[).:]\s*(?:Đúng|Dung|Sai|Đ|D|S)(?=$|[\s.;,])/giu)];
    const match = matches.find((m) => labelKey(m[1]!) === labelKey(body.id));
    if (match) { start = match.index; end = start + match[0].length; }
  } else if (body.type === 'degree' && /\bbac\s*:/u.test(fold(raw))) {
    const matches = [...raw.matchAll(/([\p{L}\p{N}_]+)\s*[:=]\s*[+-]?\d+(?:[.,]\d+)?/gu)];
    const match = matches.find((m) => labelKey(m[1]!) === labelKey(body.v));
    if (match) { start = match.index; end = start + match[0].length; }
  }
  if (start < 0) return sources;
  let offset = 0;
  const result: WorkLine[] = body.type === 'degree' && /\bbac\s*:/u.test(fold(raw))
    ? [evidenceSlice(sources[0]!, 0, sources[0]!.text.indexOf(':') + 1)] : [];
  for (const line of sources) {
    const a = Math.max(0, start - offset), b = Math.min(line.text.length, end - offset);
    if (a < b) result.push(evidenceSlice(line, a, b));
    offset += line.text.length + 1;
  }
  return result.length ? result : sources;
}

/** Orthographic evidence only: never consult graph structure or claim correctness. */
export function stepConfidence(line: WorkLine, body: ClaimBody, vocab: WorkVocabulary, threshold = 0.85): number {
  const text = line.text.normalize('NFC');
  const scores = characterScores(line);
  const approximate = language(text, vocab.vertexLabels) !== fold(text);
  const cap = Math.min(line.conf < 0.5 ? line.conf : 1, approximate ? threshold - 0.01 : 1);
  if (!scores) return Math.min(line.conf, cap);
  const selected: number[] = [];
  for (const match of text.matchAll(/[+-]?\d+(?:[.,]\d+)?|[\p{L}\p{N}_]+|->|[∞*✓=→⟶⟹–—-]/gu)) {
    const word = match[0];
    let label = vocab.edgeNames.some((name) => labelKey(name) === labelKey(word));
    try { label ||= splitLabels(word, vocab.vertexLabels).length > 0; } catch { /* Not a vertex token. */ }
    const decision = /\p{N}|[∞*✓=→⟶⟹–—-]/u.test(word) || label || decisionWords.has(language(word, vocab.vertexLabels))
      || (body.type === 'statement' && ['d', 's', 'dung', 'sai', ...vocab.statementIds.map(fold)].includes(fold(word)))
      || (body.type === 'choice' && labelKey(word) === labelKey(body.option));
    if (!decision) continue;
    const start = [...text.slice(0, match.index)].length;
    selected.push(...scores.slice(start, start + [...word].length));
  }
  // Claims without any literal decision token still require the line's reading confidence.
  return Math.min(selected.length ? Math.min(...selected) : line.conf, cap);
}
