import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { WorkLine } from '@mathtwin/work';
import type { TextLine, TruthLine } from '@mathtwin/reader';
import { stripDiacritics } from '@mathtwin/reader';
import { readJson } from './dataset.js';
export interface Confusion { from: string; to: string; count: number }
export interface ConfusionTable {
  version: 1; alignment: string;
  sources: { engine: 'B' | 'C'; path: string; sha256: string; report?: string; reportSha256?: string; pages: number; failedIds: string[]; referenceCharacters: number; edits: number; referenceSha256: string }[];
  confidence: {
    threshold: number; lineMatching: string; formula: string;
    engines: Record<'B' | 'C', { correctLines: number; wrongLines: number; wrongHighLines: number; silentRate: number;
      correctHigh: number[]; wrongLow: number[]; wrongHigh: number[] }>;
  };
  engines: Record<'B' | 'C', { occurrences: Record<string, number>; confusions: Confusion[] }>;

}
/** Deterministic Unicode Levenshtein backtrace: diagonal, deletion, insertion in that order. */
function characterAlignment(reference: string, predicted: string): { from: string; to: string; toIndex: number }[] {
  const a = [...reference.normalize('NFC')]; const b = [...predicted.normalize('NFC')];
  const d = Array.from({ length: a.length + 1 }, () => new Uint32Array(b.length + 1));
  for (let i = 0; i <= a.length; i++) d[i]![0] = i;
  for (let j = 0; j <= b.length; j++) d[0]![j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i]![j] = Math.min(
    d[i - 1]![j - 1]! + Number(a[i - 1] !== b[j - 1]), d[i - 1]![j]! + 1, d[i]![j - 1]! + 1);
  const edits: { from: string; to: string; toIndex: number }[] = [];
  let i = a.length; let j = b.length;
  while (i || j) {
    if (i && j && d[i]![j] === d[i - 1]![j - 1]! + Number(a[i - 1] !== b[j - 1])) {
      edits.push({ from: a[i - 1]!, to: b[j - 1]!, toIndex: j - 1 }); i--; j--;
    } else if (i && d[i]![j] === d[i - 1]![j]! + 1) { edits.push({ from: a[--i]!, to: '', toIndex: j }); }
    else { j--; edits.push({ from: '', to: b[j]!, toIndex: j }); }
  }
  return edits.reverse();
}
export function characterEdits(reference: string, predicted: string): { from: string; to: string }[] {
  return characterAlignment(reference, predicted).filter((e) => e.from !== e.to).map(({ from, to }) => ({ from, to }));
}
export async function measureConfusions(root: string): Promise<ConfusionTable> {
  const bPath = 'reports/.debug/device-vivo-app-b768-2026-11-17-40.json';
  const cPath = 'reports/.debug/read-eval-offline-vietocr-onnx-2026-11-16-synthetic-hw.json';
  const report = 'reports/read-eval-offline-vietocr-onnx-2026-11-16.json';
  const digest = async (path: string): Promise<string> => createHash('sha256').update(await readFile(join(root, path))).digest('hex');
  const b = await readJson(join(root, bPath)) as { results: { id: string; linePasses: { lines: TextLine[] }[] }[] };
  const c = await readJson(join(root, cPath)) as (TextLine & { id: string; pass: number })[];
  const cReport = await readJson(join(root, report)) as { rows: { id: string; textComparisons: unknown[] }[] };
  const result: ConfusionTable = { version: 1,
    alignment: 'NFC; whole-page code-point Levenshtein, active truth lines joined by spaces; pass 1; diagonal/deletion/insertion ties; newline edits excluded; includes question/figure/table/solution',
    confidence: { threshold: 0.85,
      lineMatching: 'Pass 1, active predicted lines; NFC trimmed exact match to any active truth line on the same page; unmatched = wrong; failed pages excluded',
      formula: 'High = empirical correct-line conf >= 0.85, capped at 0.999999; low = empirical wrong-line conf < 0.85. Per changed line draw silent with P = wrongHighLines/wrongLines for its engine; changed characters use wrongHigh (silent) or wrongLow. Unchanged characters use correctHigh. Deletion transfers confidence to nearest surviving character (next, else previous). conf = min(charConf), empty text conf = 0. NFC code-point Levenshtein locates changed characters. Confidence RNG = xorshift32(seed XOR 0x434f4e46), independent of text noise.',
      engines: { B: { correctLines: 0, wrongLines: 0, wrongHighLines: 0, silentRate: 0, correctHigh: [], wrongLow: [], wrongHigh: [] },
        C: { correctLines: 0, wrongLines: 0, wrongHighLines: 0, silentRate: 0, correctHigh: [], wrongLow: [], wrongHigh: [] } } },
    sources: [], engines: { B: { occurrences: {}, confusions: [] }, C: { occurrences: {}, confusions: [] } } };
  for (const engine of ['B', 'C'] as const) {
    const rows = engine === 'B' ? b.results.map((r) => ({ id: r.id, lines: r.linePasses[0]?.lines ?? [] }))
      : cReport.rows.map((r) => ({ id: r.id, lines: c.filter((line) => line.id === r.id && line.pass === 1) }));
    if (rows.length !== 40 || new Set(rows.map((r) => r.id)).size !== 40) throw new Error('Cần chữ đọc thật của đủ 40 trang B/C.');
    const referenceHash = createHash('sha256');
    const counts = new Map<string, Confusion>(); let referenceCharacters = 0; let edits = 0;
    const occurrences = result.engines[engine].occurrences;
    for (const row of rows.filter((r) => r.lines.length > 0)) {
      const referenceBytes = await readFile(join(root, 'testdata/images-synthetic-hw', row.id, 'lines.json'));
      referenceHash.update(row.id + '\n').update(referenceBytes);
      const truth = JSON.parse(referenceBytes.toString('utf8')) as TruthLine[];
      const confidence = result.confidence.engines[engine];
      const truthTexts = new Set(truth.filter((l) => !l.struck).map((l) => (l.text ?? '').normalize('NFC').trim()));
      for (const line of row.lines.filter((l) => !l.struck)) {
        if (!Number.isFinite(line.conf) || line.conf < 0 || line.conf > 1) throw new Error('Confidence B/C không hợp lệ.');
        const correct = truthTexts.has(line.text.normalize('NFC').trim());
        if (correct) {
          confidence.correctLines++;
          if (line.conf >= 0.85) confidence.correctHigh.push(Math.min(0.999999, line.conf));
        } else {
          confidence.wrongLines++;
          if (line.conf >= 0.85) { confidence.wrongHighLines++; confidence.wrongHigh.push(Math.min(0.999999, line.conf)); }
          else confidence.wrongLow.push(line.conf);
        }
      }
      const text = truth.filter((l) => !l.struck).map((l) => l.text).join(' ').normalize('NFC');
      referenceCharacters += [...text].length;
      for (const ch of text) occurrences[ch] = (occurrences[ch] ?? 0) + 1;
      for (const edit of characterEdits(text, row.lines.filter((l) => !l.struck).map((l) => l.text).join(' '))) {
        const key = JSON.stringify(edit); const entry = counts.get(key) ?? { ...edit, count: 0 }; entry.count++; counts.set(key, entry); edits++;
      }
    }
    const confidence = result.confidence.engines[engine];
    confidence.silentRate = confidence.wrongLines ? confidence.wrongHighLines / confidence.wrongLines : 0;
    for (const values of [confidence.correctHigh, confidence.wrongLow, confidence.wrongHigh]) values.sort((a, b) => a - b);
    if (!confidence.correctHigh.length || !confidence.wrongLow.length || confidence.silentRate > 0 && !confidence.wrongHigh.length) throw new Error('Không đủ mẫu confidence B/C.');
    result.engines[engine].confusions = [...counts.values()].sort((a, b) => b.count - a.count || JSON.stringify(a).localeCompare(JSON.stringify(b), 'en'));
    const path = engine === 'B' ? bPath : cPath;
    result.sources.push({ engine, path, sha256: await digest(path), pages: rows.filter((r) => r.lines.length > 0).length, failedIds: rows.filter((r) => !r.lines.length).map((r) => r.id), referenceCharacters, edits, referenceSha256: referenceHash.digest('hex'),
      ...(engine === 'C' ? { report, reportSha256: await digest(report) } : {}) });
  }
  return result;
}
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0 || 1;
  return () => { state ^= state << 13; state ^= state >>> 17; state ^= state << 5; return (state >>> 0) / 4294967296; };
}
export function noisyLines(lines: WorkLine[], variant: 'a' | 'b' | 'c' | 'd', seed: number, table: ConfusionTable, engine: 'B' | 'C'): WorkLine[] {
  const random = seededRandom(seed); const confidenceRandom = seededRandom(seed ^ 0x434f4e46);
  const confidence = table.confidence.engines[engine];
  const sample = (values: number[]): number => values[Math.floor(confidenceRandom() * values.length)]!;
  const measured = table.engines[engine];
  const options = new Map<string, Confusion[]>();
  for (const entry of measured.confusions) { const list = options.get(entry.from) ?? []; list.push(entry); options.set(entry.from, list); }
  const pick = (entries: Confusion[], denominator: number): string | undefined => {
    const target = random() * Math.max(1, denominator); let sum = 0;
    for (const entry of entries) { sum += entry.count; if (target < sum) return entry.to; }
    return undefined;
  };
  const reference = table.sources.find((s) => s.engine === engine)!.referenceCharacters;
  return lines.map((line) => {
    let text = '';
    for (const ch of line.text) {
      if (variant === 'c' || variant === 'd') {
        text += pick(options.get('') ?? [], reference) ?? '';
        text += pick(options.get(ch) ?? [], measured.occurrences[ch] ?? 1) ?? ch;
      } else text += variant === 'b' && random() < 0.5 ? stripDiacritics(ch) : ch;
    }
    text = text.normalize('NFC');
    const changed = new Set(characterAlignment(line.text, text).filter((e) => e.from !== e.to)
      .map((e) => Math.min(e.toIndex, [...text].length - 1)));
    // One draw per line preserves the measured silent-error fraction at line level.
    const silent = changed.size > 0 && confidenceRandom() < confidence.silentRate;
    const charConf = [...text].map((_, index) => sample(changed.has(index)
      ? silent ? confidence.wrongHigh : confidence.wrongLow : confidence.correctHigh));
    return { ...line, text, charConf, conf: charConf.length ? Math.min(...charConf) : 0,
      alternatives: variant === 'd' && text !== line.text ? [line.text] : [] };
  });
}
