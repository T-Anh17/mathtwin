import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { grade } from '@mathtwin/core';
import type { Claim, ProblemSpec } from '@mathtwin/core';
import { vocabularyOf } from '@mathtwin/work';
import type { WorkTruth } from '@mathtwin/work';
import { readJson } from './dataset.js';
import { buildHandwritingCase, handwritingStyles } from './handwriting.js';
import { syntheticFixtures } from './synthetic.js';
import { devFamilies, sampleWordingFamily } from './work-wording-dev.js';
import { testFamilies } from './work-wording-test.js';
import { renderClaims } from './work-wording.js';
import { measureConfusions, noisyLines } from './work-noise.js';
import type { ConfusionTable } from './work-noise.js';
export interface WorkSampleMeta { id: string; coreFixture: string; family: string; split: 'dev' | 'test'; variant: 'a' | 'b' | 'c' | 'd'; seed: number; noiseEngine: 'B' | 'C'; solveOnly: boolean; tableFallback: boolean }
export const jsonText = (value: unknown): string => JSON.stringify(value, null, 2) + '\n';
export async function generateWork(root: string, measure = false) {
  const target = join(root, 'testdata/work-text'); await mkdir(target, { recursive: true });
  const confusionFile = join(target, 'confusions.json');
  const confusions = measure ? await measureConfusions(root) : await readJson(confusionFile) as ConfusionTable;
  if (measure) await writeFile(confusionFile, jsonText(confusions));
  // Add labels without rasterizing or changing the existing photos/transcriptions.
  for (const fixture of syntheticFixtures) for (const style of handwritingStyles) {
    const folder = join(root, 'testdata/images-synthetic-hw', `${fixture}-${style}`);
    const spec = await readJson(join(folder, 'truth.json')) as ProblemSpec;
    const built = buildHandwritingCase(spec, style);
    const existing = await readJson(join(folder, 'lines.json')) as { text: string | null; box?: number[] }[];
    if (existing.length !== built.lines.length || existing.some((line, i) => line.text !== built.lines[i]!.text)) throw new Error('Chữ ảnh đã thay đổi; không được sinh truth lệch ảnh.');
    const work = jsonText(built.work); await writeFile(join(folder, 'work.json'), work);
    const meta = await readJson(join(folder, 'meta.json')) as { handwritingHashes: Record<string, string> };
    meta.handwritingHashes['work.json'] = createHash('sha256').update(work).digest('hex');
    await writeFile(join(folder, 'meta.json'), jsonText(meta));
  }
  const fixtures = (await readdir(join(root, 'testdata/core'), { withFileTypes: true })).filter((e) => e.isDirectory()).map((e) => e.name).sort();
  const manifest: WorkSampleMeta[] = [];
  for (const [fixtureIndex, fixture] of fixtures.entries()) {
    const folder = join(root, 'testdata/core', fixture);
    const spec = await readJson(join(folder, 'spec.json')) as ProblemSpec;
    const claims = await readJson(join(folder, 'claims.json')) as Claim[];
    const expected = await readJson(join(folder, 'expected.json')) as { grade?: WorkTruth['expected'] };
    for (const [familyIndex, family] of [...devFamilies.slice(0, 3), ...testFamilies, ...devFamilies.slice(3)].entries()) {
      const clean = renderClaims(claims, spec, sampleWordingFamily(family, `${fixture}-${family.id}`), family.split === 'dev' ? devFamilies[0] : testFamilies[0]);
      const expectedGrade = grade(spec, clean.claims);
      const work: WorkTruth = { claims: clean.claims, lineOf: clean.lineOf, prose: [], expected: { verdict: expectedGrade.verdict, firstErrorStep: expectedGrade.firstErrorStep ?? null, errorCode: expectedGrade.errorCode ?? null } };
      const seed = 310000 + fixtureIndex * 100 + familyIndex;
      const noiseEngine = (fixtureIndex + familyIndex) % 2 ? 'B' : 'C';
      for (const variant of ['a', 'b', 'c', 'd'] as const) {
        const id = `${fixture}-${family.id}-${variant}`; const directory = join(target, family.split, id);
        await mkdir(directory, { recursive: true });
        for (const [file, value] of Object.entries({ 'lines.json': noisyLines(clean.lines, variant, seed, confusions, noiseEngine), 'work.json': work, 'vocab.json': vocabularyOf(spec) })) await writeFile(join(directory, file), jsonText(value));
        manifest.push({ id, coreFixture: fixture, family: family.id, split: family.split, variant, seed, noiseEngine, solveOnly: !expected.grade, tableFallback: clean.tableFallback });
      }
    }
  }
  await writeFile(join(target, 'manifest.json'), jsonText(manifest));
  // Remove only obsolete generated dev samples, never the held-out split or other files.
  const devRoot = resolve(target, 'dev');
  const active = new Set(manifest.filter((m) => m.split === 'dev').map((m) => m.id));
  const stale = (await readdir(devRoot, { withFileTypes: true })).filter((e) =>
    e.isDirectory() && !e.isSymbolicLink() && !active.has(e.name)
    && /^\d+-.+-dev-paraphrase-(select|topic|final|label)-\d+-[abcd]$/u.test(e.name));
  for (let offset = 0; offset < stale.length; offset += 16) await Promise.all(stale.slice(offset, offset + 16).map(async (entry) => {
    const directory = resolve(devRoot, entry.name);
    if (dirname(directory) !== devRoot) throw new Error('Unexpected generated dev path.');
    const files = await readdir(directory, { withFileTypes: true });
    if (files.length !== 3 || files.some((f) => !f.isFile() || !['lines.json', 'work.json', 'vocab.json'].includes(f.name)))
      throw new Error('Refusing to remove non-generated dev contents.');
    await rm(directory, { recursive: true });
  }));
  return { handwriting: syntheticFixtures.length * handwritingStyles.length, text: manifest.length };
}
