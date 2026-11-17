import { createHash } from 'node:crypto';
import { copyFile, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { validateSpec } from '@mathtwin/core';
import { compareRead } from '@mathtwin/reader';
import type { ReadOutcome } from '@mathtwin/reader';
import { loadCases, readJson } from '../src/dataset.js';
import { buildFigureScene, figureParameters, graphKey, graphSplit, graphOnly, randomFigureGraph, renderFigure } from '../src/figures.js';
import { validateFigure, distanceToPolyline } from '../src/figure-geometry.js';
import { evaluate, readOptions, repositoryRoot } from '../src/cli.js';
import { evaluateDevice } from '../src/device.js';
import { packDataset } from '../src/pack.js';

const temporary: string[] = [];
afterEach(async () => { for (const path of temporary.splice(0)) await rm(path, { recursive: true, force: true }); });
async function temp(): Promise<string> { const root = await mkdtemp(join(tmpdir(), 'mathtwin-fig-')); temporary.push(root); return root; }
const directory = join(repositoryRoot, 'testdata/images-synthetic-fig');
describe('difficult synthetic figure corpus', () => {
  it('covers all 60 core sources, seeded extra graphs, variants and leakage-free original-graph splits', async () => {
    const cases = await loadCases(directory);
    expect(cases.filter((c) => c.meta.form === 'crop').length).toBeGreaterThanOrEqual(200);
    expect(cases.filter((c) => c.meta.form === 'page').length).toBeGreaterThanOrEqual(60);
    const fixtures = (await readdir(join(repositoryRoot, 'testdata/core'), { withFileTypes: true })).filter((e) => e.isDirectory()).map((e) => e.name);
    expect(fixtures).toHaveLength(60);
    for (const fixture of fixtures) {
      const input = await readJson(join(repositoryRoot, 'testdata/core', fixture, 'spec.json')) as Parameters<typeof buildFigureScene>[0];
      const variants = cases.filter((c) => c.meta.coreFixture === fixture);
      expect(variants.length).toBe(4);
      for (const c of variants) expect(c.truth.graph).toEqual(input.graph);
    }
    const keys = new Map<string, Set<string>>(); const variants = new Set(cases.flatMap((c) => c.meta.variants!));
    for (const sample of cases) {
      expect(validateSpec(sample.truth).ok).toBe(true); expect(sample.truth.uncertain).toBeUndefined();
      expect(sample.truth.task).toEqual({ type: 'elements' });
      expect(sample.meta.synthetic).toBe(true); expect(sample.meta.originalGraph).toBe(graphKey(sample.truth.graph));
      expect(sample.meta.split).toBe(graphSplit(sample.truth.graph));
      const splits = keys.get(sample.meta.originalGraph!) ?? new Set<string>(); splits.add(sample.meta.split!); keys.set(sample.meta.originalGraph!, splits);
      validateFigure(sample.figure!, sample.truth);
      expect(sample.figure!.edges.filter((e) => e.u === e.v).length).toBe(sample.truth.graph.edges.filter((e) => e.u === e.v).length);
      const multiplicities = (edges: { u: string; v: string }[]) => {
        const counts = new Map<string, number>();
        for (const e of edges) { const key = JSON.stringify([e.u, e.v].sort()); counts.set(key, (counts.get(key) ?? 0) + 1); }
        return [...counts].filter(([, count]) => count > 1).sort();
      };
      expect(multiplicities(sample.figure!.edges)).toEqual(multiplicities(sample.truth.graph.edges));
      const scene = buildFigureScene(sample.truth, sample.meta.parameters!);
      expect(scene.figure.edges.map((e) => e.polyline)).toEqual(sample.figure!.edges.map((e) => e.polyline));
      expect(scene.figure.vertices.map((v) => [v.center, v.contours])).toEqual(sample.figure!.vertices.map((v) => [v.center, v.contours]));
      for (const [file, hash] of Object.entries(sample.meta.figureHashes!)) expect(createHash('sha256').update(await readFile(join(sample.directory, file))).digest('hex')).toBe(hash);
      const raster = await sharp(join(sample.directory, '1.jpg')).metadata();
      expect([raster.width, raster.height]).toEqual([sample.figure!.width, sample.figure!.height]);
      expect(raster.format).toBe('jpeg');
      for (const edge of sample.figure!.edges) if (edge.weightBox) {
        const b = edge.weightBox;
        expect(distanceToPolyline([(b[0] + b[2]) / 2, (b[1] + b[3]) / 2], edge.polyline)).toBeLessThan(100);
      }
    }
    expect([...keys.values()].every((s) => s.size === 1)).toBe(true);
    expect(new Set(cases.map((c) => c.meta.split))).toEqual(new Set(['dev', 'test']));
    for (const variant of ['grid-light', 'grid-dark', 'ruled', 'white', 'curved', 'open', 'double', 'dot', 'label-only', 'gap', 'overshoot', 'touch', 'crossing-dot', 'crossing-no-dot', 'near-other-label']) expect(variants.has(variant), variant).toBe(true);
    const random = cases.filter((c) => c.meta.coreFixture!.startsWith('random-'));
    expect(random.length).toBeGreaterThan(0); expect(random.some((c) => c.truth.graph.vertices.length === 20)).toBe(true);
    expect(random.some((c) => c.truth.graph.edges.some((e) => e.w !== undefined && e.w >= 10 && e.w <= 99))).toBe(true);
    expect(random.some((c) => c.truth.graph.edges.every((e) => e.w === undefined))).toBe(true);
    for (const label of ['v1', 'v₁', 'Đ']) expect(random.some((c) => c.truth.graph.vertices.some((v) => v.label === label))).toBe(true);
    expect(cases.filter((c) => c.meta.form === 'page').every((c) => c.lines!.some((l) => l.region === 'question') && c.lines!.some((l) => l.region === 'solution'))).toBe(true);
  }, 60000);
  it('renders deterministically from the recorded seed without model, network or installed fonts', async () => {
    const truth = graphOnly(randomFigureGraph(2)); const p = figureParameters(210202611, 'crop', 2);
    const a = await renderFigure(truth, p, repositoryRoot); const b = await renderFigure(truth, p, repositoryRoot);
    expect(a.figure).toEqual(b.figure); expect(a.svg).toBe(b.svg); expect(a.jpeg.equals(b.jpeg)).toBe(true);
    const malformed = structuredClone(a.figure); malformed.edges[0]!.w = 0;
    expect(() => validateFigure(malformed, truth)).toThrow();
    const outside = structuredClone(a.figure); outside.edges[0]!.weightBox = [-1, 0, 10, 10];
    expect(() => validateFigure(outside, truth)).toThrow();
    const missing = structuredClone(a.figure); missing.edges.pop();
    expect(() => validateFigure(missing, truth)).toThrow();
    const crossing = structuredClone(a.figure); crossing.crossings.push({ point: [20, 20], edges: ['e1', 'e2'], notVertex: true, dot: false });
    expect(() => validateFigure(crossing, truth)).toThrow();
  });
  it('supports generation-set arguments, evaluation split filters, variant reports and an app pack containing only images/ids', async () => {
    const root = await temp();
    const samples = (await loadCases(directory));
    for (const split of ['dev', 'test'] as const) {
      const sample = samples.find((c) => c.meta.split === split)!;
      const destination = join(root, 'testdata/images-synthetic-fig', sample.id); await mkdir(destination, { recursive: true });
      for (const file of ['1.jpg', 'truth.json', 'figure.json', 'lines.json', 'meta.json']) await copyFile(join(sample.directory, file), join(destination, file));
    }
    expect(readOptions(['--engine', 'fake', '--set', 'synthetic-fig', '--split', 'test'])).toMatchObject({ split: 'test' });
    expect(() => readOptions(['--engine', 'fake', '--split', 'test'])).toThrow();
    const { report } = await evaluate(['--engine', 'fake', '--set', 'synthetic-fig', '--split', 'test', '--limit', '1'], root, '2026-11-17');
    expect(report.rows).toHaveLength(1); expect(report.rows[0]!.meta.split).toBe('test');
    expect(report.groups['split:test']!.total).toBe(1);
    expect(Object.keys(report.groups).some((key) => key.startsWith('variant:'))).toBe(true);
    expect(report.summary.graphMetrics.edges.f1).toBe(1);
    const pack = await packDataset('synthetic-fig', root, 'test');
    expect((await readdir(pack)).sort()).toEqual(['ids.json', 'sample-001.jpg']);
    const ids = await readJson(join(pack, 'ids.json')) as { id: string }[];
    expect(ids[0]!.id).toBe(report.rows[0]!.id);
  }, 30000);
});

describe('real vivo w:0 export regression', () => {
  it('accepts the unmodified result shape and scores zero as wrong, preserving structural matches', async () => {
    const root = await temp(); const file = join(repositoryRoot, 'tools/eval/test/fixtures/device-vivo-w0.json');
    const data = await readJson(file) as { results: { id: string; outcome: ReadOutcome }[] };
    const result = data.results[0]!;
    const source = join(repositoryRoot, 'testdata/images-synthetic-hw', result.id);
    const destination = join(root, 'testdata/images-synthetic-hw', result.id); await mkdir(destination, { recursive: true });
    for (const name of ['truth.json', 'meta.json', 'lines.json']) await copyFile(join(source, name), join(destination, name));
    await writeFile(join(destination, '1.png'), 'Importer must not decode images.');
    expect(result.outcome.graph!.edges.some((e) => e.w === 0)).toBe(true);
    const { report } = (await evaluateDevice(file, root, '2026-11-17', { mode: 'graph', threshold: 0.85 }))[0]!;
    expect(report.summary.total).toBe(1); expect(report.summary.graphRate).toBe(0);
    expect(report.summary.graphMetrics.edges.f1).toBe(1); expect(report.summary.graphMetrics.weights.accuracy).toBe(0);
    const truth = await readJson(join(source, 'truth.json')) as Parameters<typeof compareRead>[1];
    expect(report.rows[0]!.comparison).toEqual(compareRead(result.outcome, truth));
    expect(report.rows[0]!.issueCodes).toContain('nonpositive_weight');
    const negative = structuredClone(data);
    for (const edge of negative.results[0]!.outcome.graph!.edges) edge.w = -2;
    const negativeFile = join(root, 'negative.json'); await writeFile(negativeFile, JSON.stringify(negative));
    const negativeReport = (await evaluateDevice(negativeFile, root, '2026-11-17', { mode: 'graph', threshold: 0.85 }))[0]!.report;
    expect(negativeReport.summary.graphMetrics.weights.accuracy).toBe(0);
    expect(negativeReport.rows[0]!.comparison!.differences.filter((d) => d.type === 'weight').every((d) => d.predicted === -2)).toBe(true);
    for (const mutation of ['duplicate', 'endpoint', 'nan'] as const) {
      const malformed = structuredClone(data); const graph = malformed.results[0]!.outcome.graph!;
      if (mutation === 'duplicate') graph.edges[1]!.id = graph.edges[0]!.id;
      if (mutation === 'endpoint') graph.edges[0]!.u = 'absent';
      if (mutation === 'nan') graph.edges[0]!.w = Infinity;
      const altered = join(root, 'malformed.json'); await writeFile(altered, JSON.stringify(malformed));
      await expect(evaluateDevice(altered, root, '2026-11-17', { mode: 'graph', threshold: 0.85 })).rejects.toThrow();
    }
  });
});
