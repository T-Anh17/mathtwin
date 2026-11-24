import { cp, mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
import type { ProblemSpec } from '@mathtwin/core';
import type { ReadOutcome } from '@mathtwin/reader';
import type { Readers } from '../../../apps/mobile/src/flow/reading.js';
import { generatePairs } from '../src/generated-pairs.js';
import { loadPairs } from '../src/pair-data.js';
import { runMvpPair } from '../src/mvp-pairs.js';

const temporary: string[] = [];
async function temp(): Promise<string> { const folder = await mkdtemp(join(tmpdir(), 'mathtwin-pairs-')); temporary.push(folder); return folder; }
afterEach(async () => { await Promise.all(temporary.splice(0).map((folder) => rm(folder, { recursive: true, force: true }))); });
const spec: ProblemSpec = { graph: { directed: false, vertices: [{ id: 'A', label: 'A' }, { id: 'B', label: 'B' }], edges: [{ id: 'e1', u: 'A', v: 'B', w: 3 }] }, task: { type: 'elements' }, questionFormat: 'tu_luan' };
const text = (value: unknown): string => JSON.stringify(value, null, 2) + '\n';

describe('image pairs', () => {
  it('converts reviewed generated labels, keeps pages separate and skips labels without a task', async () => {
    const root = await temp(), images = join(root, 'images'), output = join(root, 'pairs'); await mkdir(images);
    const source = resolve('testdata/images-synthetic-hw/01-elements-multigraph-dancing-perspective/1.png');
    await cp(source, join(images, 'bai_01_p1.png'));
    await cp(source, join(images, 'bai_02_p1.png'));
    const labels = [{ image: 'bai_01_p1.png', bai_id: 1, page: 1, total_pages: 1, text: 'Đề bài\n\nGiải\nA | B', graph: spec.graph, task: spec.task, question_format: spec.questionFormat },
      { image: 'bai_02_p1.png', bai_id: 2, page: 1, total_pages: 1, text: 'Thiếu nhãn' }];
    const labelFile = join(root, 'labels.json'); await writeFile(labelFile, text(labels));
    await expect(generatePairs(images, labelFile, output)).resolves.toEqual({ created: 1, skipped: [{ baiId: 2, reason: 'Thiếu graph, task hoặc question_format trong labels.json.' }] });
    const pairs = await loadPairs(output, 'generated');
    expect(pairs).toHaveLength(1); expect(pairs[0]!.problemFiles).toEqual(['de-1.png']); expect(pairs[0]!.workFiles).toEqual(['bai-1.png']);
    expect(pairs[0]!.lines).toMatchObject([{ text: 'Đề bài', region: 'question', page: 0 }, { text: 'A | B', region: 'table', page: 0 }]);
  });

  it('runs a pair through the MVP adapter without rereading an unboxed page after its configured bands', async () => {
    const root = await temp(), pairFolder = join(root, 'generated-01'); await mkdir(pairFolder);
    const source = resolve('testdata/images-synthetic-hw/01-elements-multigraph-dancing-perspective/1.png');
    await cp(source, join(pairFolder, 'de-1.png')); await cp(source, join(pairFolder, 'bai-1.png'));
    await Promise.all([
      writeFile(join(pairFolder, 'truth.json'), text(spec)),
      writeFile(join(pairFolder, 'lines.json'), text([{ text: 'Có 2 đỉnh.', region: 'solution', page: 0 }])),
      writeFile(join(pairFolder, 'ket-qua-giao-vien.json'), text({ verdict: 'DUNG', dongSaiDau: null, lyDo: 'Đúng.' })),
      writeFile(join(pairFolder, 'meta.json'), text({ source: 'generated', capture: 'test', labeler: 'test', independentlyChecked: true })),
    ]);
    const pair = (await loadPairs(root, 'generated'))[0]!;
    let problemReads = 0, workReads = 0;
    const outcome: ReadOutcome = { spec, graph: spec.graph, graphUncertain: [], drafts: [], issues: [], usage: { engine: 'fake', passes: 1, latencyMs: 1 } };
    const readers: Readers = { problem: async () => { problemReads++; return structuredClone(outcome); }, text: { engine: 'fake', readLines: async () => { workReads++; return { lines: [{ text: 'Có 2 đỉnh.', conf: 1, alternatives: [], region: 'solution' }], usage: { engine: 'fake', passes: 1, latencyMs: 1 } }; } } };
    const row = await runMvpPair(pair, '2026-11-23', readers, new AbortController().signal, async () => {});
    expect(problemReads).toBe(1); expect(workReads).toBe(2); expect(row.manualRegionPages).toEqual([0]);
    expect(row.session.problemPhotos).toHaveLength(1); expect(row.session.workPhotos).toHaveLength(1);
  });
});
