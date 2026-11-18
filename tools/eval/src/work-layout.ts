import { readFile, readdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import type { TextLine, TruthLine, PreparedImage } from '@mathtwin/reader';
import { LlamaCppReader } from '@mathtwin/reader-llamacpp';
import { detectMissingLines, filterWorkRegions, inspectMissingLines, validWorkLineBox, suggestWorkRegion } from '@mathtwin/work';
import type { WorkBox, WorkLine } from '@mathtwin/work';
import { workLines } from './work-data.js';
import { alignWorkLines } from './work-alignment.js';
import { layoutBoxes } from './work-strikes.js';

const json = async <T>(path: string): Promise<T> => JSON.parse(await readFile(path, 'utf8')) as T;
export async function syntheticWorkPage(root: string, id: string) {
  const folder = join(root, 'testdata/images-synthetic-hw', id);
  const { data, info } = await sharp(join(folder, '1.png')).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const image: PreparedImage = { pixels: new Uint8ClampedArray(data), width: info.width, height: info.height };
  const placements = await json<Parameters<typeof layoutBoxes>[0]>(join(folder, 'layout.json'));
  const truth = await json<TruthLine[]>(join(folder, 'lines.json'));
  const boxes = layoutBoxes(placements, id.endsWith('perspective'), info.width, info.height);
  const lines = workLines(truth, image.width, image.height).map((l, i) => ({ ...l, box: boxes[i]! }));
  const selected = lines.filter((l) => l.region === 'solution' || l.region === 'table');
  const region: WorkBox = [0, Math.max(0, Math.min(...selected.map((l) => l.box[1])) - 4), 1000, 1000];
  return { image, lines, region };
}

/** Truth is used only for scoring, after filtering observed lines. No truth geometry fills OCR gaps. */
export function figureLeakage(observed: WorkLine[], reference: WorkLine[], region?: WorkBox) {
  const after = filterWorkRegions(observed, region ? { solution: region } : {}).lines;
  const alignment = alignWorkLines(observed, reference);
  const figureIndices = new Set(alignment.groups.filter((g) => g.truth.length && g.truth.every((i) => reference.find((l) => l.index === i)?.region === 'figure')).flatMap((g) => g.observed));
  const solutionIndices = new Set(alignment.groups.filter((g) => g.truth.some((i) => ['solution', 'table'].includes(reference.find((l) => l.index === i)?.region ?? ''))).flatMap((g) => g.observed));
  const eligible = (l: WorkLine) => l.region !== 'question' && l.region !== 'figure';
  return { before: observed.filter((l) => figureIndices.has(l.index) && eligible(l)).length,
    after: after.filter((l) => figureIndices.has(l.index) && eligible(l)).length,
    solutionRemoved: after.filter((l) => solutionIndices.has(l.index) && !eligible(l)).length,
    removedIndices: after.filter((l) => solutionIndices.has(l.index) && !eligible(l)).map((l) => l.index),
    boxes: observed.filter((l) => l.box && validWorkLineBox(l.box)).length, lines: observed.length,
    unmatched: alignment.groups.filter((g) => !g.truth.length).reduce((n, g) => n + g.observed.length, 0) };
}

/** Component evaluation: OCR-only proposals and a separately labelled simulated user selection. */
export async function measureSavedRegionReview(root: string) {
  const saved = await json<{ node: { pages: { id: string; observed?: WorkLine[] }[] } }>(join(root, 'reports/.debug/mvp-batch-4.4-measurement.json'));
  const totals = { pages: 0, needsRegion: 0, missingBoxOnly: 0, lowRegionConfOnly: 0, both: 0, other: 0,
    suggested: 0, drawFromScratch: 0, solutionRemovedBefore: 0, solutionRemovedAfter: 0, figureLeakageAfter: 0,
    originalRemovedRecovered: 0, originalRemovedRemaining: 0, newlyExcluded: 0, cropRereadRequired: 0,
    userRegionRemoved: 0, userRegionOriginalRemaining: 0, userRegionFigureLeakage: 0,
    originalRemovedWithoutBox: 0, userRegionRemainingWithoutBox: 0, userRegionRemainingOutside: 0 };
  const pages = [];
  for (const p of saved.node.pages) {
    if (!p.observed) continue;
    const folder = join(root, 'testdata/images-synthetic-hw', p.id), meta = await sharp(join(folder, '1.png')).metadata();
    const reference = workLines(await json<TruthLine[]>(join(folder, 'lines.json')), meta.width!, meta.height!);
    const filtered = filterWorkRegions(p.observed), region = suggestWorkRegion(p.observed);
    const before = figureLeakage(p.observed, reference), after = figureLeakage(p.observed, reference, region);
    // Reference geometry simulates a user selecting the full solution area only here in eval.
    // No observed box/text/region is repaired from truth, and there is no simulated crop OCR.
    const { region: userRegion } = await syntheticWorkPage(root, p.id);
    const confirmed = figureLeakage(p.observed, reference, userRegion);
    totals.userRegionRemoved += confirmed.solutionRemoved;
    totals.userRegionOriginalRemaining += before.removedIndices.filter((i) => confirmed.removedIndices.includes(i)).length;
    totals.userRegionFigureLeakage += confirmed.after;
    for (const i of before.removedIndices) {
      const line = filtered.lines.find((l) => l.index === i)!;
      if (!line.box) totals.originalRemovedWithoutBox++;
      if (confirmed.removedIndices.includes(i)) totals[line.box ? 'userRegionRemainingOutside' : 'userRegionRemainingWithoutBox']++;
    }
    const missingBox = filtered.lines.some((l) => !l.box), lowRegionConf = filtered.lines.some((l) => !l.region || (l.regionConf ?? 1) < .85);
    totals.pages++; totals.solutionRemovedBefore += before.solutionRemoved; totals.solutionRemovedAfter += after.solutionRemoved;
    totals.figureLeakageAfter += after.after;
    const recovered = before.removedIndices.filter((i) => !after.removedIndices.includes(i)).length;
    const newlyExcluded = after.removedIndices.filter((i) => !before.removedIndices.includes(i)).length;
    totals.originalRemovedRecovered += recovered; totals.originalRemovedRemaining += before.solutionRemoved - recovered;
    totals.newlyExcluded += newlyExcluded;
    if (filtered.needsRegion && missingBox) totals.cropRereadRequired++;
    if (filtered.needsRegion) {
      totals.needsRegion++;
      totals[missingBox && lowRegionConf ? 'both' : missingBox ? 'missingBoxOnly' : lowRegionConf ? 'lowRegionConfOnly' : 'other']++;
      totals[region ? 'suggested' : 'drawFromScratch']++;
    }
    pages.push({ id: p.id, needsRegion: filtered.needsRegion, missingBox, lowRegionConf, region,
      solutionRemovedBefore: before.solutionRemoved, solutionRemovedAfter: after.solutionRemoved, recovered, newlyExcluded, figureLeakageAfter: after.after,
      userRegion, userRegionRemoved: confirmed.solutionRemoved, userRegionOriginalRemaining: before.removedIndices.filter((i) => confirmed.removedIndices.includes(i)).length });
  }
  return { assumption: 'Proposal-only: user confirms the OCR-only envelope unchanged; pages without a proposal keep old classification. userRegion: a separate simulated user selection of the reference solution area. Neither path fills missing OCR geometry or simulates crop rereads; neither is a final app grade.', totals, pages };
}

export async function measureWorkLayout(root: string) {
  const device = await json<{ results: { id: string; linePasses?: { lines: TextLine[] }[] }[] }>(join(root, 'reports/.debug/device-vivo-app-b768-2026-11-17-40.json'));
  const total = { pages: 0, before: 0, after: 0, solutionRemoved: 0, boxes: 0, lines: 0, unmatched: 0 };
  for (const row of device.results) {
    const folder = join(root, 'testdata/images-synthetic-hw', row.id), meta = await sharp(join(folder, '1.png')).metadata();
    const reference = workLines(await json<TruthLine[]>(join(folder, 'lines.json')), meta.width!, meta.height!);
    const observed = (row.linePasses?.[0]?.lines ?? []).map((line, index): WorkLine => ({ ...line, index, page: 0,
      ...(line.box ? { box: line.box.map((n, axis) => n * 1000 / (axis % 2 ? meta.height! : meta.width!)) as WorkBox } : {}) }));
    const score = figureLeakage(observed, reference); total.pages++;
    for (const k of ['before', 'after', 'solutionRemoved', 'boxes', 'lines', 'unmatched'] as const) total[k] += score[k];
  }
  let missingDetected = 0, deleted = 0, cleanPages = 0, falseBands = 0;
  const misses: { id: string; index: number; box: WorkBox; cause: string; bands: ReturnType<typeof inspectMissingLines> }[] = [];
  const names = (await readdir(join(root, 'testdata/images-synthetic-hw'), { withFileTypes: true })).filter((d) => d.isDirectory()).map((d) => d.name).sort();
  for (const id of names) {
    const { image, lines, region } = await syntheticWorkPage(root, id);
    const clean = detectMissingLines(image, lines, region); falseBands += clean.length; if (!clean.length) cleanPages++;
    for (const line of lines.filter((l) => (l.region === 'solution' || l.region === 'table') && !l.struck)) {
      deleted++;
      const bands = inspectMissingLines(image, lines.filter((l) => l.index !== line.index), region);
      const overlaps = bands.filter((b) => b.box[1] < line.box[3] && b.box[3] > line.box[1]);
      if (overlaps.some((b) => !b.rejectedBy)) missingDetected++;
      else {
        const covered = overlaps.filter((b) => b.rejectedBy === 'covered');
        const merged = covered.some((b) => b.box[1] < line.box[1] - 2 || b.box[3] > line.box[3] + 2);
        const cause = covered.length ? merged ? 'merged_band' : 'neighbor_box_overlap'
          : overlaps.length ? `below_${overlaps[0]!.rejectedBy}_threshold` : 'no_ink_band_in_line';
        misses.push({ id, index: line.index, box: line.box, cause, bands: overlaps });
      }
    }
  }
  const causes: Record<string, number> = {};
  for (const miss of misses) causes[miss.cause] = (causes[miss.cause] ?? 0) + 1;
  return { geometry: total, missing: { pages: names.length, deleted, missingDetected, cleanPages, falseBands, causes, misses } };
}

/** Explicit CLI only; no download and no subprocess during npm test. */
async function main() {
  const root = resolve(fileURLToPath(new URL('../../../', import.meta.url)));
  if (process.argv[2] === '--review-saved') {
    const result = await measureSavedRegionReview(root);
    await writeFile(join(root, 'reports/.debug/4.4-r2-region-review.json'), JSON.stringify(result, null, 2) + '\n');
    console.log(JSON.stringify(result.totals)); return;
  }
  const measured = await measureWorkLayout(root);
  let node: Record<string, unknown> = { status: 'pending' };
  const serverPath = resolve(process.argv[2] ?? join(root, '.build-cache/llama-win/bin/llama-server.exe'));
  const deadline = AbortSignal.timeout(3_600_000);
  const reader = new LlamaCppReader({ model: 'b', serverPath, modelsDirectory: join(root, '.models'), threads: 4, maxImageSide: 768,
    readTimeout: 180_000, timeoutMs: 300_000 });
  const started = performance.now();
  const nodeScore = { pages: 0, before: 0, after: 0, solutionRemoved: 0, lines: 0, boxes: 0, unmatched: 0 };
  const regions: Record<string, number> = {}, regionConf = { missing: 0, below085: 0, from085to095: 0, atLeast095: 0 };
  const pages: Record<string, unknown>[] = [];
  let needsRegion = 0;
  const output = join(root, 'reports/.debug/mvp-batch-4.4-measurement.json');
  const save = async () => {
    node = { status: nodeScore.pages === 40 ? 'ran' : 'partial', ...nodeScore, needsRegion, regions, regionConf, pages, serverPath, ms: performance.now() - started };
    await writeFile(output, JSON.stringify({ ...measured, node }, null, 2) + '\n');
  };
  await save();
  try {
    const ids = (await readdir(join(root, 'testdata/images-synthetic-hw'), { withFileTypes: true })).filter((d) => d.isDirectory()).map((d) => d.name).sort();
    for (const id of ids) {
      deadline.throwIfAborted();
      const pageStarted = performance.now();
      try {
      const { image } = await syntheticWorkPage(root, id);
      const read = await reader.readLines([image], deadline);
      const observed = read.lines.map((l, index): WorkLine => ({ ...l, index, page: 0, ...(l.box ? { box: l.box.map((n, axis) => n * 1000 / (axis % 2 ? image.height : image.width)) as WorkBox } : {}) }));
      const reference = workLines(await json<TruthLine[]>(join(root, 'testdata/images-synthetic-hw', id, 'lines.json')), image.width, image.height);
      const score = figureLeakage(observed, reference); nodeScore.pages++;
      for (const k of ['before', 'after', 'solutionRemoved', 'lines', 'boxes', 'unmatched'] as const) nodeScore[k] += score[k];
      const filtered = filterWorkRegions(observed); if (filtered.needsRegion) needsRegion++;
      for (const line of observed) {
        const region = line.region ?? 'missing'; regions[region] = (regions[region] ?? 0) + 1;
        regionConf[line.regionConf === undefined ? 'missing' : line.regionConf < .85 ? 'below085' : line.regionConf < .95 ? 'from085to095' : 'atLeast095']++;
      }
      pages.push({ id, ms: performance.now() - pageStarted, needsRegion: filtered.needsRegion, ...score, observed });
      } catch (error) { pages.push({ id, ms: performance.now() - pageStarted, error: error instanceof Error ? error.message : String(error),
        ...(error instanceof Error && 'reason' in error ? { reason: String(error.reason) } : {}),
        ...(error instanceof Error && 'finish_reason' in error ? { finish_reason: String(error.finish_reason) } : {}) }); }
      console.log(JSON.stringify({ ...pages.at(-1), observed: undefined }));
      await save();
    }
    await save();
  } catch (e) { node = { ...node, status: nodeScore.pages ? 'partial' : 'unavailable', error: e instanceof Error ? e.message : String(e), ms: performance.now() - started }; }
  const result = { ...measured, node };
  await writeFile(output, JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify({ ...result, missing: { ...measured.missing, misses: undefined }, node: { ...node, pages: undefined } }, null, 2));
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
