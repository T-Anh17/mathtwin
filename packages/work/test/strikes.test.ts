import { describe, expect, it, vi } from 'vitest';
import type { PreparedImage, TextReader } from '@mathtwin/reader';
import type { ProblemSpec } from '@mathtwin/core';
import { applyStrikeRule, applyWorkAnswers, decideStrikes, detectStrikes, gradeWork, parseWork, readWork, STRIKE_NO, STRIKE_YES, vocabularyOf } from '../src/index.js';
import type { WorkLine } from '../src/index.js';

function canvas(width = 320, height = 120) {
  const image: PreparedImage = { width, height, pixels: new Uint8ClampedArray(width * height * 4).fill(255) };
  const rect = (x: number, y: number, w: number, h: number, shade = 30) => {
    for (let yy = Math.max(0, y); yy < Math.min(height, y + h); yy++) for (let xx = Math.max(0, x); xx < Math.min(width, x + w); xx++) {
      const p = (yy * width + xx) * 4; image.pixels[p] = image.pixels[p + 1] = image.pixels[p + 2] = shade;
    }
  };
  const stroke = (x: number, y: number, x1: number, y1: number) => {
    const length = Math.max(Math.abs(x1 - x), Math.abs(y1 - y));
    for (let i = 0; i <= length; i++) rect(Math.round(x + (x1 - x) * i / length), Math.round(y + (y1 - y) * i / length), 2, 2);
  };
  const glyphs = () => { for (let x = 40; x < 240; x += 20) { rect(x, 32, 2, 27); rect(x + 10, 32, 2, 27); rect(x, 32, 12, 2); rect(x, 57, 12, 2); } };
  const line = (box: WorkLine['box'] = [120, 250, 800, 510]): WorkLine => ({ index: 7, page: 0, text: 'Số cạnh = 5.', conf: 1, alternatives: [], region: 'solution', ...(box ? { box } : {}) });
  return { image, rect, stroke, glyphs, line };
}
const spec: ProblemSpec = { graph: { directed: false, vertices: [{ id: 'a', label: 'A' }], edges: [] }, task: { type: 'elements' }, questionFormat: 'tu_luan' };
const vocab = vocabularyOf(spec);

describe('pixel cancellation evidence', () => {
  it('finds a near-horizontal stroke through writing and an opaque fill', () => {
    const c = canvas(); c.glyphs(); c.stroke(36, 45, 256, 43);
    expect(detectStrikes(c.image, [c.line()])[0]).toMatchObject({ line: 7, struck: true });
    const filled = canvas(); filled.rect(40, 32, 214, 27);
    expect(detectStrikes(filled.image, [filled.line()])[0]!.score).toBeGreaterThanOrEqual(STRIKE_YES);
  });
  it.each(['ordinary', 'underline', 'equals', 'minus', 'arrow', 'arrow with labels', 'notebook', 'light grid'])(
    'does not cancel %s', (kind) => {
      const c = canvas();
      if (['ordinary', 'underline', 'notebook', 'light grid'].includes(kind)) c.glyphs();
      if (kind === 'underline') c.rect(36, 65, 220, 2);
      if (kind === 'equals') { c.rect(40, 38, 214, 2); c.rect(40, 50, 214, 2); }
      if (kind === 'minus') c.rect(40, 44, 214, 2);
      if (kind.startsWith('arrow')) { c.rect(40, 44, 214, 2); c.stroke(238, 32, 254, 44); c.stroke(238, 57, 254, 44); }
      if (kind === 'arrow with labels') { c.rect(40, 32, 2, 27); c.rect(55, 32, 2, 27); c.rect(250, 32, 2, 27); }
      if (kind === 'notebook' || kind === 'light grid') {
        for (let y = 5; y < 120; y += 20) c.rect(0, y, 320, 1, kind === 'notebook' ? 30 : 195);
        for (let x = 5; x < 320; x += 20) c.rect(x, 0, 1, 120, kind === 'notebook' ? 30 : 195);
      }
      const evidence = detectStrikes(c.image, [c.line()])[0]!;
      expect(evidence.struck).toBe(false); expect(evidence.score).toBeLessThanOrEqual(STRIKE_NO);
    });
  it('scores partial coverage as uncertain, independent of text, truth flags, page or index', () => {
    const c = canvas(); c.glyphs(); c.rect(40, 44, 125, 2);
    const a = detectStrikes(c.image, [c.line()])[0]!;
    expect(a.score).toBeGreaterThan(STRIKE_NO); expect(a.score).toBeLessThan(STRIKE_YES);
    expect(detectStrikes(c.image, [{ ...c.line(), text: 'khác', struck: true, index: 88, page: 99 }])[0]).toEqual({ ...a, line: 88 });
  });
  it('handles alpha, edge boxes, absent/invalid boxes, empty pixels, and invalid RGBA', () => {
    const c = canvas(); c.rect(40, 32, 214, 27); const original = c.image.pixels.slice();
    const scores = detectStrikes(c.image, [c.line(), { ...c.line(), box: [0, 0, 1000, 1000] }, { ...c.line(), box: [0, 0, 0, 1] }]);
    expect(scores.every((s) => s.score >= 0 && s.score <= 1)).toBe(true); expect(c.image.pixels).toEqual(original);
    const { box: _box, ...withoutBox } = c.line(); expect(detectStrikes(c.image, [withoutBox])[0]!.score).toBe(.5);
    for (let i = 3; i < c.image.pixels.length; i += 4) c.image.pixels[i] = 0;
    expect(detectStrikes(c.image, [c.line()])[0]!.score).toBe(0);
    expect(() => detectStrikes({ ...c.image, width: 0 }, [])).toThrow('Invalid RGBA');
  });
});

describe('strike confirmation and reading', () => {
  it('pixels: a normal box with a middle stroke strikes a non-claim silently, but a claim is asked', () => {
    const c = canvas(); c.glyphs(); c.stroke(36, 45, 256, 43);
    const prose = { ...c.line(), text: 'Bỏ dòng này.' };
    const struck = applyStrikeRule([prose], c.image, vocab)[0]!;
    expect(struck).toMatchObject({ struck: true }); expect(struck.strokeBand).toBeGreaterThanOrEqual(.3); expect(struck.strokeBand).toBeLessThanOrEqual(.7);
    const claim = { ...c.line(), text: 'Số cạnh = 5.' };
    expect(applyStrikeRule([claim], c.image, vocab)[0]).toMatchObject({ struck: false, strikeQuestion: true });
    const graded = gradeWork(spec, parseWork(applyStrikeRule([claim], c.image, vocab), vocab));
    expect(graded.result.verdict).toBe('CAN_XAC_NHAN'); expect(graded.questions).toEqual([expect.objectContaining({ kind: 'struck', lines: [7] })]);
  });
  describe('Lô 5.3 rule 4 (decideStrikes)', () => {
    // Four working rows of height 20 (median 20) on one page.
    const row = (index: number, text: string, height = 20): WorkLine => ({ index, page: 0, text, conf: 1, alternatives: [], region: 'solution',
      box: [50, 100 + index * 60, 900, 100 + index * 60 + height] });
    const rows = () => [row(0, 'Đồ thị có 1 đỉnh.'), row(1, 'Ta xét từng đỉnh.'), row(2, 'Bỏ dòng này.'), row(3, 'Số cạnh = 0.')];
    const mark = (line: number, score: number, strokeBand?: number) => ({ line, struck: score >= STRIKE_YES, score, ...(strokeBand === undefined ? {} : { strokeBand }) });
    const clean = (lines: WorkLine[]) => lines.map((l) => mark(l.index, 0, .5));
    it('box twice the median height with score 1.0 is asked, not struck', () => {
      const lines = rows(); lines[2] = row(2, 'Bỏ dòng này.', 40);
      const evidence = clean(lines); evidence[2] = mark(2, 1, .5);
      expect(decideStrikes(lines, evidence, vocab)[2]).toMatchObject({ struck: false, strikeQuestion: true, strikeScore: 1 });
    });
    it('normal box, stroke through the middle, non-claim line: struck silently', () => {
      const lines = rows(), evidence = clean(lines); evidence[2] = mark(2, 1, .5);
      const out = decideStrikes(lines, evidence, vocab);
      expect(out[2]).toMatchObject({ struck: true }); expect(out[2]!.strikeQuestion).toBeUndefined();
      expect(parseWork(out, vocab).issues.filter((i) => i.code === 'struck_uncertain')).toEqual([]);
    });
    it('stroke outside 30–70% of the box (underline position) is asked', () => {
      for (const band of [.15, .85]) {
        const lines = rows(), evidence = clean(lines); evidence[2] = mark(2, .95, band);
        expect(decideStrikes(lines, evidence, vocab)[2]).toMatchObject({ struck: false, strikeQuestion: true });
      }
    });
    it('a claim line with score 1.0 is asked', () => {
      const lines = rows(), evidence = clean(lines); evidence[0] = mark(0, 1, .5);
      const out = decideStrikes(lines, evidence, vocab);
      expect(out[0]).toMatchObject({ struck: false, strikeQuestion: true });
      expect(gradeWork(spec, parseWork(out, vocab)).questions).toContainEqual(expect.objectContaining({ kind: 'struck', lines: [0] }));
    });
    it('every claim line of the page marked struck: each one is asked, nothing is lost', () => {
      const lines = rows(), evidence = lines.map((l) => mark(l.index, 1, .5));
      const out = decideStrikes(lines, evidence, vocab);
      expect(out.filter((l) => l.index === 0 || l.index === 3).map((l) => [l.struck, l.strikeQuestion])).toEqual([[false, true], [false, true]]);
      const graded = gradeWork(spec, parseWork(out, vocab));
      expect(graded.result.verdict).toBe('CAN_XAC_NHAN');
      expect(graded.questions.filter((q) => q.kind === 'struck').flatMap((q) => q.lines)).toEqual(expect.arrayContaining([0, 3]));
    });
    it('missing box or stroke position is never struck silently', () => {
      const lines = rows(); const { box: _box, ...noBox } = lines[2]!; lines[2] = noBox;
      const evidence = clean(lines); evidence[2] = mark(2, 1);
      expect(decideStrikes(lines, evidence, vocab)[2]).toMatchObject({ struck: false, strikeQuestion: true });
    });
    it('a user struck answer clears the question flag', () => {
      const lines = rows(), evidence = clean(lines); evidence[0] = mark(0, 1, .5);
      const answered = applyWorkAnswers(decideStrikes(lines, evidence, vocab), [{ line: 0, struck: true }]);
      expect(answered[0]).toMatchObject({ struck: true }); expect(answered[0]!.strikeQuestion).toBeUndefined();
      expect(gradeWork(spec, parseWork(answered, vocab)).questions.filter((q) => q.kind === 'struck')).toEqual([]);
    });
  });
  it('asks once for uncertain lines, including blank and table rows; explicit answers clear evidence', () => {
    for (const text of ['Số cạnh = 5.', '']) {
      const c = canvas(); const line = { ...c.line(), text, strikeScore: .5, region: 'table' as const, alternatives: ['Số cạnh = 0.'] };
      const parsed = parseWork([line], vocab);
      expect(parsed.steps).toHaveLength(0); expect(parsed.issues.some((i) => i.code === 'struck_uncertain')).toBe(true);
      expect(gradeWork(spec, parsed)).toMatchObject({ result: { verdict: 'CAN_XAC_NHAN' }, questions: [{ kind: 'struck', lines: [7], page: 0 }] });
      const confirmed = applyWorkAnswers([line], [{ line: 7, struck: true }]);
      expect(confirmed[0]!.strikeScore).toBeUndefined(); expect(line.strikeScore).toBe(.5);
      expect(gradeWork(spec, parseWork(confirmed, vocab)).questions).toEqual([]);
      expect(parseWork(applyWorkAnswers([line], [{ line: 7, skip: true }]), vocab).unchecked).toEqual([]);
    }
    const line = { ...canvas().line(), text: 'Số cạnh = 0.', strikeScore: .5 };
    expect(gradeWork(spec, parseWork(applyWorkAnswers([line], [{ line: 7, struck: false }]), vocab)).result.verdict).toBe('DUNG');
  });
  it('does not join a wrapped claim across an uncertain line or restore it via alternatives', () => {
    const line = canvas().line();
    const lines = [{ ...line, index: 0, text: 'A →' }, { ...line, index: 1, text: 'A', strikeScore: .5, alternatives: ['A → A'] }];
    expect(parseWork(lines, vocab).steps.flatMap((s) => s.lines)).not.toContain(1);
  });
  it('readWork detects after each page, overrides OCR flags with pixels, preserves pages/indices and sums usage without Node globals', async () => {
    const c = canvas(); c.glyphs(); c.stroke(36, 45, 256, 43);
    const clean = canvas(); clean.glyphs();
    const reader: TextReader = { engine: 'fake', readLines: vi.fn(async () => ({ lines: [{ ...c.line(), struck: true }],
      usage: { engine: 'fake', passes: 1, latencyMs: 2, peakMemoryMb: 3, sentImages: [], finish_reason: ['stop'], lineMs: [1] } })) };
    const signal = new AbortController().signal;
    vi.stubGlobal('process', undefined); vi.stubGlobal('Buffer', undefined);
    let output: Awaited<ReturnType<typeof readWork>>;
    try { output = await readWork([c.image, clean.image], { reader, vocab, signal }); }
    finally { vi.unstubAllGlobals(); }
    expect(output.lines.map((l) => [l.page, l.index, l.struck, l.strikeQuestion])).toEqual([[0, 0, false, true], [1, 1, false, undefined]]);
    expect(output.parsed.issues).toContainEqual(expect.objectContaining({ code: 'struck_uncertain', lines: [0] }));
    expect(output.parsed.steps.every((s) => !s.lines.includes(0))).toBe(true);
    expect(output.usage).toMatchObject({ passes: 2, latencyMs: 4, lineCount: 2, peakMemoryMb: 3, lineMs: [1, 1], finish_reason: ['stop', 'stop'] });
    expect(reader.readLines).toHaveBeenNthCalledWith(2, [clean.image], signal, { continuation: true });
  });
  it('propagates abort and reader failures and accepts no pages', async () => {
    const readLines = vi.fn(async () => { throw new Error('read failed'); });
    const reader: TextReader = { engine: 'fake', readLines };
    const signal = AbortSignal.abort();
    await expect(readWork([canvas().image], { reader, vocab, signal })).rejects.toThrow(); expect(readLines).not.toHaveBeenCalled();
    await expect(readWork([canvas().image], { reader, vocab })).rejects.toThrow('read failed');
    expect((await readWork([], { reader, vocab })).parsed.issues).toContainEqual(expect.objectContaining({ code: 'no_solution_lines' }));
  });
});
