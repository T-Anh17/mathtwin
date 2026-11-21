import { expect, it } from 'vitest';
import type { WorkLine } from '../src/index.js';
import { applyWorkAnswers, detectMissingLines, filterWorkRegions, gradeWork, parseWork, vocabularyOf, suggestWorkRegion } from '../src/index.js';
import type { PreparedImage } from '@mathtwin/reader';
import type { ProblemSpec } from '@mathtwin/core';
import { readFileSync } from 'node:fs';

const spec: ProblemSpec = { graph: { directed: false, vertices: [{ id: 'v3', label: 'A' }], edges: [] }, task: { type: 'elements' }, questionFormat: 'tu_luan' };
const line = (text: string, index: number, x: number, y: number): WorkLine => ({ text, index, page: 0, conf: 1, alternatives: [], box: [x, y, x + 20, y + 20] });
it('removes A, I, a in a spatial cluster, keeps a full solution and does not classify a lone label', () => {
  const lines = [line('A', 0, 100, 200), line('I', 1, 180, 220), line('a', 2, 130, 260), line('Đồ thị có 1 đỉnh.', 3, 100, 500), line('B', 4, 800, 900)];
  lines[3]!.region = 'solution';
  const before = structuredClone(lines), filtered = filterWorkRegions(lines);
  expect(filtered.lines.slice(0, 3).map((l) => l.region)).toEqual(['figure', 'figure', 'figure']);
  expect(filtered.lines[3]?.region).toBe('solution'); expect(filtered.lines[4]?.region).toBeUndefined(); expect(filtered.needsRegion).toBe(true);
  expect(lines).toEqual(before);
  const table = lines.slice(0, 3).map((l): WorkLine => ({ ...l, region: 'table', regionConf: 1 }));
  expect(filterWorkRegions(table).lines.every((l) => l.region === 'table')).toBe(true);
});
it('uses supplied figure boxes, rejects doubtful regions and honors an explicit solution selection', () => {
  const lines = [line('khuyên m', 0, 100, 200), { ...line('Đồ thị có 1 đỉnh.', 1, 100, 500), region: 'solution' as const, regionConf: .4 }];
  const filtered = filterWorkRegions(lines, { figures: [[50, 150, 300, 300]] });
  expect(filtered.lines[0]?.region).toBe('figure'); expect(filtered.needsRegion).toBe(true);
  const chosen = filterWorkRegions(lines, { solution: [0, 450, 1000, 1000] });
  expect(chosen.needsRegion).toBe(false); expect(chosen.lines.map((l) => l.region)).toEqual(['question', 'solution']);
});
it('confirmed regions override model and clustered figure labels, but preserve strikes and exclude outside lines', () => {
  const lines: WorkLine[] = [line('A', 0, 100, 500), line('I', 1, 180, 520), line('a', 2, 130, 560),
    { ...line('Đồ thị có 8 đỉnh.', 3, 100, 600), region: 'question', struck: true },
    { ...line('Đồ thị có 1 đỉnh.', 4, 100, 200), region: 'solution' }];
  const result = filterWorkRegions(lines, { figures: [[0, 400, 1000, 1000]], solution: [0, 450, 1000, 1000] });
  expect(result.lines.map((l) => l.region)).toEqual(['solution', 'solution', 'solution', 'solution', 'question']);
  expect(result.lines[3]?.struck).toBe(true); expect(result.needsRegion).toBe(false);
});
it('proposes only the padded envelope of valid solution/table boxes, leaving confirmation to the caller', () => {
  const lines: WorkLine[] = [{ ...line('Đồ thị có 1 đỉnh.', 0, 100, 500), region: 'solution', regionConf: .4 },
    { ...line('0', 1, 900, 800), region: 'table' }, { ...line('Đề', 2, 10, 10), region: 'question' }];
  expect(suggestWorkRegion(lines)).toEqual([76, 476, 944, 844]);
  expect(suggestWorkRegion([{ ...lines[0]!, box: [0, 0, 1000, 1000] }, lines[2]!])).toBeUndefined();
  expect(filterWorkRegions(lines).needsRegion).toBe(true);
});
it('asks for the region before excluding question-labelled working on a continuation page', () => {
  const lines: WorkLine[] = [
    { ...line('(Tiếp Bài 9)', 0, 100, 100), page: 1, region: 'question', regionConf: 1 },
    { ...line('Đổi nhãn B thành 7', 1, 100, 300), page: 1, region: 'question', regionConf: 1 },
    { ...line('Kết luận', 2, 100, 700), page: 1, region: 'solution', regionConf: 1 },
  ];
  expect(filterWorkRegions(lines).needsRegion).toBe(true);
  expect(suggestWorkRegion(lines)).toBeUndefined();
  expect(filterWorkRegions([lines[0]!, lines[2]!]).needsRegion).toBe(false);
  expect(filterWorkRegions(lines.map((row) => ({ ...row, page: 0 }))).needsRegion).toBe(false);
  const confirmed = filterWorkRegions(lines, { solution: [0, 250, 900, 850] });
  expect(confirmed.needsRegion).toBe(false);
  expect(confirmed.lines.map((row) => row.region)).toEqual(['question', 'solution', 'solution']);
});

it('Bài 26 page 2: blocks a truncated region proposal for the saved 11/15 misclassified working lines', () => {
  const fixture = JSON.parse(readFileSync(new URL('./fixtures/bai-26-page-2-ocr.json', import.meta.url), 'utf8')) as { lines: WorkLine[] };
  const lines = fixture.lines;
  expect(lines).toHaveLength(16);
  expect(lines.slice(1).filter((l) => l.region === 'question')).toHaveLength(11);
  // Isolate region safety from the separate missing-box/low-confidence guards.
  const boxed = lines.map((l, i) => ({ ...l, regionConf: 1, box: [40, 20 + i * 50, 900, 50 + i * 50] as [number, number, number, number] }));
  const before = structuredClone(boxed);
  expect(filterWorkRegions(boxed).needsRegion).toBe(true);
  expect(suggestWorkRegion(boxed)).toBeUndefined();
  const confirmed = filterWorkRegions(boxed, { solution: [0, 60, 1000, 1000] });
  expect(confirmed.needsRegion).toBe(false);
  expect(confirmed.lines[0]?.region).toBe('question');
  expect(confirmed.lines.slice(1).every((l) => l.region === 'solution')).toBe(true);
  expect(boxed).toEqual(before);
  // The actual saved OCR lacks boxes: a region alone cannot restore it.
  expect(filterWorkRegions(lines, { solution: [0, 85, 1000, 1000] }).needsRegion).toBe(true);
});

it('leaves the region unselected when continued working lacks boxes even with correct region labels', () => {
  const lines: WorkLine[] = [
    { ...line('Đổi nhãn B thành 7', 0, 100, 300), page: 1, region: 'solution' },
    { text: 'Khoanh đỉnh B', index: 1, page: 1, conf: 1, alternatives: [], region: 'solution' },
  ];
  expect(filterWorkRegions(lines).needsRegion).toBe(true);
  expect(suggestWorkRegion(lines)).toBeUndefined();
  expect(suggestWorkRegion([lines[0]!])).toEqual([76, 276, 144, 344]);
});

function image(): PreparedImage {
  const width = 200, height = 200, pixels = new Uint8ClampedArray(width * height * 4).fill(255);
  for (const y0 of [40, 90]) for (let y = y0; y < y0 + 12; y++) for (let x = 20; x < 160; x += 10) for (let dx = 0; dx < 5; dx++)
    pixels.set([0, 0, 0, 255], (y * width + x + dx) * 4);
  return { width, height, pixels };
}
it('detects uncovered ink, ignores empty image and notebook ruling, creates a blocking reading question until answered', () => {
  const img = image();
  const first: WorkLine = { text: 'Đồ thị có 1 đỉnh.', index: 0, page: 0, conf: 1, alternatives: [], region: 'solution', box: [90, 190, 810, 270] };
  const second = { ...first, index: 1, box: [90, 440, 810, 520] as WorkLine['box'] } as WorkLine;
  expect(detectMissingLines(img, [first, second])).toEqual([]);
  const missing = detectMissingLines(img, [first]); expect(missing).toHaveLength(1);
  const lines: WorkLine[] = [first, { text: '', conf: 0, alternatives: [], page: 0, index: 1, missing: true, region: 'solution', box: missing[0]!.box }];
  const check = (ls: WorkLine[]) => gradeWork(spec, parseWork(ls, vocabularyOf(spec)));
  expect(check(lines).questions[0]).toMatchObject({ kind: 'reading', reason: 'missing', lines: [1] });
  expect(check(lines).result.verdict).toBe('CAN_XAC_NHAN');
  expect(check(applyWorkAnswers(lines, [{ line: 1, skip: true }])).questions).toEqual([]);
  expect(check(applyWorkAnswers(lines, [{ line: 1, text: 'Đồ thị có 8 đỉnh.' }])).result.verdict).toBe('SAI');
  const blank = image(); blank.pixels.fill(255);
  for (const y of [20, 40, 60, 80, 100]) for (let x = 0; x < blank.width; x++) blank.pixels.set([0, 0, 0, 255], (y * blank.width + x) * 4);
  expect(detectMissingLines(blank, [])).toEqual([]);
});
