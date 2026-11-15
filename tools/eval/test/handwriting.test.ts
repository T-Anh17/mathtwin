import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile, copyFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { validateSpec } from '@mathtwin/core';
import { compareText } from '@mathtwin/reader';
import { checkedLines, loadCases, readJson } from '../src/dataset.js';
import { buildHandwritingCase, handwritingStyles } from '../src/handwriting.js';
import type { CancellationGeometry } from '../src/handwriting.js';
import { handwritingSolution } from '../src/handwriting-solutions.js';
import { repositoryRoot, evaluate, readOptions } from '../src/cli.js';
import { packDataset } from '../src/pack.js';
import { syntheticFixtures } from '../src/synthetic.js';

const temporary: string[] = [];
afterEach(async () => { for (const path of temporary.splice(0)) await rm(path, { recursive: true, force: true }); });
async function temp(): Promise<string> { const root = await mkdtemp(join(tmpdir(), 'mathtwin-hw-')); temporary.push(root); return root; }
describe('handwritten corpus', () => {
  it('contains 40 labeled pages, two fonts, all formats, loops, parallel edges and actual solution text', async () => {
    const cases = await loadCases(join(repositoryRoot, 'testdata/images-synthetic-hw'));
    expect(cases).toHaveLength(40);
    expect(new Set(cases.map((c) => c.truth.questionFormat)).size).toBe(4);
    expect(new Set(cases.map((c) => c.meta.variant)).size).toBe(4);
    expect(cases.every((c) => c.meta.source === 'synthetic_handwriting' && c.meta.synthetic && validateSpec(c.truth).ok && c.lines!.length > 0)).toBe(true);
    expect(cases.some((c) => c.truth.graph.edges.some((e) => e.u === e.v))).toBe(true);
    const sample = cases.find((c) => c.truth.task.type === 'shortest_path')!;
    expect(sample.lines!.some((l) => l.region === 'table' && l.text?.includes('∞'))).toBe(true);
    expect(sample.lines!.some((l) => l.text?.includes('→'))).toBe(true);
    expect(cases.filter((c) => c.meta.hasSolution)).toHaveLength(40);
    expect(cases.filter((c) => c.meta.studentErrors!.length > 0)).toHaveLength(20);
    for (const fixture of syntheticFixtures) {
      const variants = cases.filter((c) => c.meta.coreFixture === fixture);
      expect(variants.every((c) => c.meta.hasSolution && c.lines!.some((l) => l.region === 'solution' && !l.struck))).toBe(true);
      expect(variants.filter((c) => c.meta.studentErrors!.length > 0)).toHaveLength(2);
    }
    expect(new Set(cases.map((c) => c.lines!.filter((l) => l.region === 'solution' && !l.struck).map((l) => l.text).join('\n'))).size).toBe(20);
  });
  it.each(syntheticFixtures.flatMap((fixture) => handwritingStyles.map((style) => ({ fixture, style }))))('$fixture/$style preserves renderer/truth/text provenance and raster hashes', async ({ fixture, style }) => {
    const directory = join(repositoryRoot, 'testdata/images-synthetic-hw', `${fixture}-${style}`);
    const cases = await loadCases(join(repositoryRoot, 'testdata/images-synthetic-hw'));
    const sample = cases.find((c) => c.directory === directory)!;
    const input = (await loadCases(join(repositoryRoot, 'testdata/images-synthetic'))).find((c) => c.meta.coreFixture === fixture)!.truth;
    const built = buildHandwritingCase(input, style);
    expect(sample.truth).toEqual(built.truth);
    // Strike boxes are measured from the exact font raster, not guessed in the pure layout builder.
    expect(sample.lines!.map(({ box: _box, ...line }) => line)).toEqual(built.lines);
    expect(sample.meta.hasSolution).toBe(true); expect(sample.meta.studentErrors).toEqual(built.studentErrors);
    expect(await readFile(join(directory, 'source.svg'), 'utf8')).toBe(built.svg);
    expect(await readJson(join(directory, 'layout.json'))).toEqual(built.placements);
    expect((built.svg.match(/data-edge=/g) ?? []).length).toBe(input.graph.edges.length);
    expect((built.svg.match(/data-vertex=/g) ?? []).length).toBe(input.graph.vertices.length);
    const metadata = await readJson(join(directory, 'meta.json')) as { handwritingHashes: Record<string, string> };
    for (const [file, hash] of Object.entries(metadata.handwritingHashes)) expect(createHash('sha256').update(await readFile(join(directory, file))).digest('hex')).toBe(hash);
    const raster = await sharp(join(directory, '1.png')).metadata();
    expect([raster.width, raster.height, raster.format]).toEqual([1000, 1440, 'png']);
  });
  it('loads and validates NFC line truth, including an explicitly empty transcription', () => {
    expect(checkedLines([])).toEqual([]);
    expect(checkedLines([{ text: null, region: 'solution', struck: true, box: [1, 2, 3, 4] }])[0]!.text).toBeNull();
    for (const invalid of [{}, [{ text: 'đường'.normalize('NFD'), region: 'solution' }], [{ text: '', region: 'question' }], [{ text: 'x', region: 'bad' }],
      [{ text: null, region: 'solution' }], [{ text: 'x', struck: 'true', region: 'solution' }], [{ text: null, struck: true, region: 'solution', box: [1, 2, 1, 4] }]]) expect(() => checkedLines(invalid)).toThrow();
  });
  it('keeps deliberately incorrect arithmetic in rendered commands and line truth instead of repairing it', async () => {
    const sample = (await loadCases(join(repositoryRoot, 'testdata/images-synthetic-hw'))).find((c) => c.meta.coreFixture === '18-short-answer-degree' && c.meta.studentErrors!.length > 0)!;
    const error = sample.meta.studentErrors![0]!;
    const total = sample.truth.graph.edges.length * 2;
    expect(error.written).toBe(`Tổng bậc = 2 × số cạnh = 2 × ${sample.truth.graph.edges.length} = ${total + 1}.`);
    expect(sample.lines!.some((l) => l.text === error.written && !l.struck)).toBe(true);
    expect(sample.lines!.some((l) => l.text === error.expected)).toBe(false);
    const commands = await readJson(join(sample.directory, 'layout.json')) as { text: string }[];
    expect(commands.some((p) => p.text === error.written)).toBe(true);
    const literal = sample.lines!.flatMap((line) => line.struck ? [] : [{ text: line.text!, region: line.region, conf: 0.9, alternatives: [] }]);
    expect(compareText(literal, sample.lines!).cer.errors).toBe(0);
    const repaired = literal.map((line) => ({ ...line, text: line.text === error.written ? error.expected : line.text }));
    const result = compareText(repaired, sample.lines!);
    expect(result.byRegion.solution.digits.errors).toBe(1);
    expect(result.byRegion.solution.silentLines).toBe(1);
  });
  it('has both readable and opaque cancellations with their own truth lines and image-coordinate boxes', async () => {
    const cases = await loadCases(join(repositoryRoot, 'testdata/images-synthetic-hw'));
    expect(cases.filter((c) => c.lines!.some((l) => l.struck && l.text === null))).toHaveLength(20);
    expect(cases.filter((c) => c.lines!.some((l) => l.struck && l.text !== null))).toHaveLength(20);
    expect(cases.every((c) => c.lines!.filter((l) => l.struck).length === 1 && c.lines!.find((l) => l.struck)!.box !== undefined)).toBe(true);
  });
  it('removes boilerplate and never repeats a prose solution line across distinct fixtures', async () => {
    const cases = await loadCases(join(repositoryRoot, 'testdata/images-synthetic-hw'));
    const fixturesByLine = new Map<string, Set<string>>();
    const banned = ['Cạnh AB nối cặp đỉnh (A, B).', 'Dòng nháp đã gạch bỏ không tính vào bài làm.', 'Bài làm của học sinh', 'Nháp: 7'];
    for (const sample of cases) for (const line of sample.lines!) {
      expect(banned).not.toContain(line.text);
      if (line.region !== 'solution' || line.text === null) continue;
      // Vertex sequences / bare calculations may legitimately recur across graphs.
      if (/^[\p{Lu}\d\s→+×=(),.∞]+$/u.test(line.text)) continue;
      const fixtures = fixturesByLine.get(line.text) ?? new Set<string>();
      fixtures.add(sample.meta.coreFixture!); fixturesByLine.set(line.text, fixtures);
    }
    expect([...fixturesByLine].filter(([, fixtures]) => fixtures.size > 1)).toEqual([]);
    for (const sample of cases) {
      const commands = await readJson(join(sample.directory, 'layout.json')) as { text: string }[];
      expect(commands.some((command) => banned.includes(command.text))).toBe(false);
    }
  });
  it('varies Vietnamese wording beyond the deliberate error in every fixture', async () => {
    const cases = await loadCases(join(repositoryRoot, 'testdata/images-synthetic-hw'));
    for (const fixture of syntheticFixtures) {
      const input = cases.find((sample) => sample.meta.coreFixture === fixture)!.truth;
      const correct = handwritingSolution(input, false); const incorrect = handwritingSolution(input, true);
      const nonErrorProse = (solution: typeof correct): Set<string> => new Set(solution.prose.filter((text, i) =>
        i !== solution.correction.before && /\p{Ll}{2}/u.test(text)));
      const a = nonErrorProse(correct); const b = nonErrorProse(incorrect);
      expect([...a].some((text) => !b.has(text)), fixture).toBe(true);
      expect([...b].some((text) => !a.has(text)), fixture).toBe(true);
    }
  });
  it('strikes through measured mid-height ink, spans its full width and immediately writes a contextual correction', async () => {
    const cases = await loadCases(join(repositoryRoot, 'testdata/images-synthetic-hw'));
    const discarded = new Set<string>(); const heights = new Set<number>();
    for (const sample of cases) {
      const geometry = await readJson(join(sample.directory, 'cancellation.json')) as CancellationGeometry[];
      expect(geometry).toHaveLength(1);
      const stroke = geometry[0]!; const [left, top, right, bottom] = stroke.textBox;
      const build = buildHandwritingCase(sample.truth, sample.meta.variant as typeof handwritingStyles[number]);
      const placement = build.placements.find((p) => p.struck)!;
      const solution = handwritingSolution(sample.truth, sample.meta.studentErrors!.length > 0);
      discarded.add(placement.text); heights.add(top);
      expect(placement.text).toBe(solution.correction.discarded);
      expect(sample.lines![stroke.lineIndex + 1]!.text).toBe(solution.correction.replacement);
      const nextPlacement = build.placements.find((p) => p.y === placement.y + 44 && !p.struck)!;
      expect(nextPlacement.text).toBe(solution.correction.replacement);
      expect(sample.lines![stroke.lineIndex]!.box).toEqual(stroke.imageBox);
      expect(bottom - top).toBeGreaterThan(5); expect(right - left).toBeGreaterThan(10);
      if (stroke.kind === 'single') {
        // Every segment stays in the central ink band, never at the baseline/bottom edge.
        for (const [, y] of stroke.points) {
          expect(y).toBeGreaterThan(top + (bottom - top) * 0.3);
          expect(y).toBeLessThan(top + (bottom - top) * 0.7);
        }
        expect(stroke.strokeBox[1]).toBeLessThan(top + (bottom - top) * 0.6);
        expect(stroke.strokeBox[3]).toBeGreaterThan(top + (bottom - top) * 0.4);
        expect(stroke.points[0]![0]).toBeLessThan(left);
        expect(stroke.points.at(-1)![0]).toBeGreaterThan(right);
        expect(stroke.points[0]![1]).not.toBe(stroke.points.at(-1)![1]);
      } else {
        expect(stroke.strokeBox[0]).toBeLessThan(left); expect(stroke.strokeBox[1]).toBeLessThan(top);
        expect(stroke.strokeBox[2]).toBeGreaterThan(right); expect(stroke.strokeBox[3]).toBeGreaterThan(bottom);
      }
    }
    expect(discarded.size).toBe(10); expect(heights.size).toBeGreaterThan(3);
  });
  it('packs only images and ids in app format, preserving id and image bytes', async () => {
    const root = await temp(); const sample = (await loadCases(join(repositoryRoot, 'testdata/images-synthetic-hw'), 1))[0]!;
    const folder = join(root, 'testdata/images-synthetic-hw', sample.id); await mkdir(folder, { recursive: true });
    for (const file of ['truth.json', 'meta.json', 'lines.json', '1.png']) await copyFile(join(sample.directory, file), join(folder, file));
    const output = await packDataset('synthetic-hw', root);
    expect(await readdir(output)).toEqual(['ids.json', 'sample-001.png']);
    expect(await readJson(join(output, 'ids.json'))).toEqual([{ id: sample.id, file: 'sample-001.png' }]);
    expect(await readFile(join(output, 'sample-001.png'))).toEqual(await readFile(join(sample.directory, '1.png')));
    await copyFile(join(sample.directory, '1.png'), join(folder, '2.png'));
    await expect(packDataset('synthetic-hw', root)).rejects.toThrow('đúng một ảnh');
    await writeFile(join(output, 'keep.txt'), 'user content');
    await rm(join(folder, '2.png'));
    await expect(packDataset('synthetic-hw', root)).rejects.toThrow('file lạ');
  });
  it('supports lines/both fake pipeline without counting text-only samples as graph successes', async () => {
    const root = await temp(); const sample = (await loadCases(join(repositoryRoot, 'testdata/images-synthetic-hw'), 1))[0]!;
    const folder = join(root, 'testdata/images-synthetic-hw', sample.id); await mkdir(folder, { recursive: true });
    for (const file of ['truth.json', 'meta.json', 'lines.json', '1.png']) await copyFile(join(sample.directory, file), join(folder, file));
    for (const mode of ['lines', 'both']) {
      const { report } = await evaluate(['--engine', 'fake', '--set', 'synthetic-hw', '--mode', mode], root, '2026-11-15');
      expect(report.summary.total).toBe(mode === 'both' ? 1 : 0);
      expect(report.summary.textByPass['1']!.cer.rate).toBe(0);
      expect(report.summary.textByPass['2']!.lineRecall).toBe(1);
      expect(report.groups.synthetic_handwriting.evaluatedImages).toBe(1);
      expect(report.groups.handwritten.evaluatedImages).toBe(0);
    }
    expect(readOptions(['--from-device', 'result.json'])).toMatchObject({ mode: 'both', fromDevice: 'result.json' });
    for (const args of [['--engine', 'fake', '--mode', 'bad'], ['--engine', 'fake', '--threshold', 'NaN'], ['--from-device', 'x', '--passes=1'], ['--from-device', 'x', '--engine', 'fake']]) expect(() => readOptions(args)).toThrow();
  });
});
