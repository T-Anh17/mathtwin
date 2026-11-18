import { mkdir, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { advanceDijkstra, createDijkstraState, dijkstraCandidates, solveDijkstra } from '@mathtwin/core';
import type { DijkstraTraceStep, ProblemSpec } from '@mathtwin/core';
import { vocabularyOf } from '@mathtwin/work';
import { readJson } from './dataset.js';
import { noisyLines, seededRandom } from './work-noise.js';
import type { ConfusionTable } from './work-noise.js';
import { devTableFamilies } from './work-table-dev.js';
import { testTableFamilies } from './work-table-test.js';
import { renderTable } from './work-table-render.js';
import type { WrittenRow } from './work-table-render.js';
const json = (value: unknown): string => JSON.stringify(value, null, 2) + '\n';
export function randomTableSpec(seed: number, count: number): ProblemSpec {
  const random = seededRandom(seed);
  const vertices = Array.from({ length: count }, (_, i) => ({ id: `v${i}`, label: String.fromCharCode(65 + i) }));
  const edges: ProblemSpec['graph']['edges'] = [];
  for (let i = 0; i < count; i++) for (let j = i + 1; j < count; j++) {
    const w = i === 0 && (j === 1 || j === 2) ? 2 : i === 1 && j === 3 ? 1 : i === 0 && j === 3 ? 9 : 4 + Math.floor(random() * 12);
    edges.push({ id: `e${i}-${j}`, u: vertices[i]!.id, v: vertices[j]!.id, w });
  }
  return { graph: { directed: false, vertices, edges }, task: { type: 'shortest_path', from: 'v0', to: `v${count - 1}` }, questionFormat: 'tu_luan' };
}
function traceRows(trace: DijkstraTraceStep[]): WrittenRow[] {
  const via: Record<string, string | undefined> = {};
  return trace.map((row) => {
    for (const update of row.updates) if (update.old !== update.new) via[update.v] = update.via;
    return { selected: row.selected, labels: { ...row.labels }, via: { ...via } };
  });
}
export function tableScenarios(spec: ProblemSpec): { mode: string; rows: WrittenRow[] }[] {
  if (spec.task.type !== 'shortest_path') return [];
  const trace = solveDijkstra(spec.graph, spec.task).trace;
  const base = traceRows(trace);
  const result = [{ mode: 'correct', rows: base }];
  let state = createDijkstraState(spec.graph, spec.task.from, spec.task.to);
  const alternate: DijkstraTraceStep[] = [];
  let changedTie = false;
  while (dijkstraCandidates(spec.graph, state).length) {
    const choices = dijkstraCandidates(spec.graph, state);
    if (choices.length > 1) changedTie = true;
    const next = advanceDijkstra(spec.graph, state, choices.at(-1)!); state = next.state; alternate.push(next.trace);
  }
  if (changedTie) result.push({ mode: 'alternate-tie', rows: traceRows(alternate) });
  const arithmetic = trace.findIndex((r) => r.updates.some((u) => u.old !== u.new));
  if (arithmetic >= 0) {
    const rows = structuredClone(base); const u = trace[arithmetic]!.updates.find((u) => u.old !== u.new)!;
    rows[arithmetic]!.labels[u.v] = u.new + 1; rows[arithmetic]!.via[u.v] = u.via;
    result.push({ mode: 'arithmetic', rows });
  }
  const stale = trace.findIndex((r) => r.updates.some((u) => u.old !== null && u.old !== u.new));
  if (stale >= 0) {
    const rows = structuredClone(base); const u = trace[stale]!.updates.find((u) => u.old !== null && u.old !== u.new)!;
    // Keep the written old number; core must classify this missed update as BO_SOT.
    rows[stale]!.labels[u.v] = u.old; delete rows[stale]!.via[u.v];
    result.push({ mode: 'stale', rows });
  }
  // Stop at the single incorrect selection: no invented downstream student errors.
  for (let i = 1; i < trace.length; i++) {
    const candidates = spec.graph.vertices.filter((v) => !trace[i - 1]!.settled.includes(v.id) && !trace[i]!.tied.includes(v.id));
    for (const candidate of candidates) {
      const rows = structuredClone(base.slice(0, i + 1)); rows[i]!.selected = candidate.id;
      // Avoid invalid '-' columns caused by copying a later settled set.
      const expected = renderTable(spec, rows, devTableFamilies[0]!).work.expected.errorCode;
      const visited = new Set<string>();
      const prim = rows.every((row, index) => {
        if (!index) { visited.add(row.selected); return true; }
        const crossing = spec.graph.edges.filter((edge) => visited.has(edge.u) !== visited.has(edge.v));
        const minimum = Math.min(...crossing.map((edge) => edge.w!));
        const valid = crossing.some((edge) => edge.w === minimum && (visited.has(edge.u) ? edge.v : edge.u) === row.selected);
        visited.add(row.selected); return valid;
      });
      const mode = expected === 'NHAM_THUAT_TOAN' && prim ? 'prim' : expected === 'SAI_LUA_CHON' ? 'selection' : undefined;
      if (mode && !result.some((r) => r.mode === mode)) result.push({ mode, rows });
    }
  }
  return result;
}
export async function generateWorkTables(root: string) {
  const target = join(root, 'testdata/work-text-tables');
  const confusions = await readJson(join(root, 'testdata/work-text/confusions.json')) as ConfusionTable;
  const specs: { id: string; spec: ProblemSpec; seed: number }[] = [];
  for (const entry of (await readdir(join(root, 'testdata/core'), { withFileTypes: true })).filter((e) => e.isDirectory()).sort((a,b) => a.name.localeCompare(b.name))) {
    const spec = await readJson(join(root, 'testdata/core', entry.name, 'spec.json')) as ProblemSpec;
    if (spec.task.type === 'shortest_path') specs.push({ id: entry.name, spec, seed: 330000 + specs.length });
  }
  for (let i = 0; i < 10; i++) specs.push({ id: `random-${i}`, spec: randomTableSpec(330100 + i, 4 + i % 5), seed: 330100 + i });
  const manifest = [];
  for (const item of specs) for (const scenario of tableScenarios(item.spec)) for (const family of [...devTableFamilies, ...testTableFamilies]) {
    const clean = renderTable(item.spec, scenario.rows, family);
    if (scenario.mode === 'stale' && clean.work.expected.errorCode !== 'BO_SOT') throw new Error('Nhãn cũ không cập nhật phải được chấm BO_SOT.');
    for (const variant of ['a', 'b', 'c', 'd'] as const) {
      const id = `${item.id}-${scenario.mode}-${family.id}-${variant}`; const folder = join(target, family.split, id);
      await mkdir(folder, { recursive: true });
      const engine = item.seed % 2 ? 'B' : 'C';
      for (const [file, value] of Object.entries({ 'lines.json': noisyLines(clean.lines, variant, item.seed, confusions, engine), 'work.json': clean.work, 'vocab.json': vocabularyOf(item.spec), 'spec.json': item.spec })) await writeFile(join(folder, file), json(value));
      manifest.push({ id, coreFixture: `${item.id}-${scenario.mode}`, family: family.id, split: family.split, variant, seed: item.seed, noiseEngine: engine, solveOnly: false, tableFallback: false, mode: scenario.mode });
    }
  }
  await writeFile(join(target, 'manifest.json'), json(manifest));
  return { specs: specs.length, samples: manifest.length };
}
