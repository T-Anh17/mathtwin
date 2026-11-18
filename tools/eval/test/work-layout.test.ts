import { expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { detectMissingLines, gradeWork, parseWork, vocabularyOf } from '@mathtwin/work';
import type { ProblemSpec } from '@mathtwin/core';
import { readFile } from 'node:fs/promises';
import { syntheticWorkPage } from '../src/work-layout.js';
import type { WorkLine } from '@mathtwin/work';

const root = fileURLToPath(new URL('../../../', import.meta.url));
it('synthetic-hw: removing the erroneous multigraph line creates a reading question, complete page has none', async () => {
  const id = '01-elements-multigraph-dancing-perspective';
  const { image, lines, region } = await syntheticWorkPage(root, id);
  expect(detectMissingLines(image, lines, region)).toEqual([]);
  const error = lines.find((l) => l.text === 'Đồ thị có 3 cạnh.')!;
  const missing = detectMissingLines(image, lines.filter((l) => l.index !== error.index), region);
  expect(missing.some((m) => m.box[1] < error.box[3] && m.box[3] > error.box[1])).toBe(true);
  const spec = JSON.parse(await readFile(new URL(`../../../testdata/images-synthetic-hw/${id}/truth.json`, import.meta.url), 'utf8')) as ProblemSpec;
  const incomplete: WorkLine[] = [...lines.filter((l) => l.index !== error.index), ...missing.map((m, i): WorkLine => ({ text: '', index: 100 + i, page: 0, conf: 0, alternatives: [], region: 'solution', box: m.box, missing: true }))];
  const grade = gradeWork(spec, parseWork(incomplete, vocabularyOf(spec)));
  expect(grade.questions.some((q) => q.reason === 'missing')).toBe(true); expect(grade.result.verdict).toBe('CAN_XAC_NHAN');
});
