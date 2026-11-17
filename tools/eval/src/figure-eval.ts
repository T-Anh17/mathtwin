import { access, mkdir, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { cpus, platform, release, totalmem } from 'node:os';
import { FigureReader, VietOcrGlyphReader, LlamaGlyphReader, OracleGlyphReader } from '@mathtwin/reader-figure';
import type { GlyphReader, OracleGlyph } from '@mathtwin/reader-figure';
import { compareRead, readProblem } from '@mathtwin/reader';
import type { ReadOutcome } from '@mathtwin/reader';
import type { ProblemSpec } from '@mathtwin/core';
import { loadCases, prepareImages } from './dataset.js';
import type { ImageCase } from './dataset.js';
import { makeReport, renderReport, summarize } from './report.js';
import type { EvaluationRow } from './report.js';
import { DevFigureReader, measureStages, summarizeStages } from './figure-diagnostics.js';
import { classifyFigureErrors, summarizeFigureErrors } from './figure-errors.js';

export interface FigureEvalOptions { glyph: 'oracle' | 'c' | 'b'; geometry?: 'oracle'; split?: 'dev' | 'test'; limit?: number; serverPath?: string }
export function oracleFor(sample: ImageCase): OracleGlyphReader {
  if (!sample.figure) throw new Error('Missing figure.json.');
  const glyphs: OracleGlyph[] = sample.figure.vertices.map(v => ({ box: v.labelBox, text: v.label, role: 'label' }));
  for (const e of sample.figure.edges) {
    if (e.weightBox && e.w !== null) glyphs.push({ box: e.weightBox, text: String(e.w), role: 'weight' });
    if (e.nameBox && e.name !== null) glyphs.push({ box: e.nameBox, text: e.name, role: 'name' });
  }
  return new OracleGlyphReader(glyphs);
}
function topology(spec: ProblemSpec): ProblemSpec {
  return { ...spec, graph: { ...spec.graph, edges: spec.graph.edges.map(({ id, u, v }) => ({ id, u, v })) } };
}
function structureOutcome(outcome: ReadOutcome): ReadOutcome {
  return { ...outcome, spec: outcome.spec ? topology(outcome.spec) : null,
    graph: outcome.graph ? { ...outcome.graph, edges: outcome.graph.edges.map(({ id, u, v }) => ({ id, u, v })) } : null };
}
export async function evaluateFigure(root: string, date: string, options: FigureEvalOptions, deps: {
  createGlyph?: () => Promise<{ reader: GlyphReader; close(): Promise<void> }>;
} = {}) {
  if (!options.split) throw new Error('Figure evaluation requires explicit dev or test split.');
  if (options.geometry && (options.split !== 'dev' || options.glyph !== 'oracle')) throw new Error('Geometry oracle is dev-only and requires glyph oracle.');
  const selected = (await loadCases(join(root, 'testdata/images-synthetic-fig'))).filter(c => !options.split || c.meta.split === options.split);
  const cases = selected.filter(c => c.meta.hasFigure !== false).slice(0, options.limit);
  const stages: ReturnType<typeof measureStages>[] = [];
  const negatives: { id: string; vertices: number; edges: number; issues: string[] }[] = [];
  if (!cases.length) throw new Error('No selected figure cases.');
  const resources = options.glyph === 'oracle' ? undefined : await (deps.createGlyph ?? (async () => {
    if (options.glyph === 'c') {
      const { createNodeOcrReader } = await import('@mathtwin/reader-ocr');
      const ocr = await createNodeOcrReader({ modelRoot: join(root, '.models/c') });
      const reader = new VietOcrGlyphReader(ocr);
      return { reader, close: () => ocr.close() };
    }
    if (!options.serverPath) throw new Error('B requires an existing desktop llama-server: --llama-server PATH. No download is performed.');
    await access(options.serverPath);
    const { LlamaCppReader } = await import('@mathtwin/reader-llamacpp');
    const llama = new LlamaCppReader({ model: 'b', serverPath: options.serverPath, modelsDirectory: join(root, '.models'), maxTokens: 32, maxImageSide: 256, threads: Math.max(1, Math.min(6, cpus().length)) });
    return { reader: new LlamaGlyphReader(llama), close: async () => {} };
  }))();
  const rows: EvaluationRow[] = [], structureRows: EvaluationRow[] = [], outputs: { id: string; outcome: ReadOutcome }[] = [];
  const reportDirectory = options.split === 'dev' ? 'reports/.debug' : 'reports';
  const directory = join(root, reportDirectory); await mkdir(directory, { recursive: true });
  const basename = `read-eval-offline-figure-cv-${options.glyph}-synthetic-fig-${options.split ?? 'all'}${options.geometry ? '-geometry-oracle' : ''}-${date}`;
  try {
    for (const sample of cases) {
      const images = await prepareImages(sample);
      const reader = options.split === 'dev' ? new DevFigureReader({ glyphReader: resources?.reader ?? oracleFor(sample) }) : new FigureReader({ glyphReader: resources?.reader ?? oracleFor(sample) });
      if (reader instanceof DevFigureReader && options.geometry) reader.annotation = sample.figure!;
      const start = performance.now(), outcome = await readProblem(images, { reader, passes: 1 });
      const row: EvaluationRow = { id: sample.id, meta: sample.meta, comparison: compareRead(outcome, sample.truth), usage: outcome.usage,
        nodeLatencyMs: performance.now() - start, issueCodes: outcome.issues.map(i => i.code),
        ...(outcome.issues.some(i => i.code === 'read_failed') ? { errorCode: 'read_failed' } : {}) };
      if (reader instanceof DevFigureReader) stages.push(measureStages(sample.figure!, reader.observation ?? { box: [0,0,0,0], vertices: [], labels: [], paths: [], edges: [] }));
      rows.push(row); structureRows.push({ ...row, comparison: compareRead(structureOutcome(outcome), topology(sample.truth)) });
      outputs.push({ id: sample.id, outcome });
      // Preserve completed rows even if the process is interrupted during a later model call.
      await writeFile(join(directory, `${basename}.checkpoint.json`), JSON.stringify({ glyph: options.glyph, rows, outputs, stages }, null, 2) + '\n');
      console.log(`${rows.length}/${cases.length} ${sample.id}: vertices=${outcome.graph?.vertices.length ?? 0}, edges=${outcome.graph?.edges.length ?? 0}, ${row.nodeLatencyMs!.toFixed(0)} ms`);
    }
    if (options.split === 'dev' && !options.geometry) for (const sample of selected.filter(c => c.meta.hasFigure === false)) {
      const outcome = await readProblem(await prepareImages(sample), { reader: new FigureReader({ glyphReader: resources?.reader ?? oracleFor(sample) }), passes: 1 });
      negatives.push({ id: sample.id, vertices: outcome.graph?.vertices.length ?? 0, edges: outcome.graph?.edges.length ?? 0, issues: outcome.issues.map(i => i.code) });
    }
  } finally { await resources?.close(); }
  const configuration = { glyph: options.glyph, split: options.split ?? 'all', maxImageSide: 1000, glyphThreshold: 0.85,
    externalFigureBox: false, oracleGeometry: options.geometry === 'oracle', questionReading: false, referenceOnlyTimings: true,
    host: { platform: platform(), release: release(), cpu: cpus()[0]?.model, logicalCpus: cpus().length, totalMemoryBytes: totalmem(), node: process.version } };
  const errorRows = stages.map((s,i)=>({id:cases[i]!.id,...classifyFigureErrors(cases[i]!.figure!,s.detail.observation)}));
  const report = { ...makeReport('offline:figure-cv', 'synthetic-fig', 1, date, rows, { mode: 'graph', configuration }),
    downloadBytes: 0, ...(options.split === 'dev' ? { diagnostics: summarizeStages(stages), errors: { summary:summarizeFigureErrors(errorRows), rows:errorRows }, negatives, stages } : {}), structure: summarize(structureRows), structureGroups: makeReport('offline:figure-cv', 'synthetic-fig', 1, date, structureRows).groups, outputs };
  const summary = report.structure;
  const intro = `# Lô 2.11 — D + glyph ${options.glyph}

Ảnh tổng hợp, split ${options.split}; tự tìm vùng hình. ${options.geometry ? 'CHẨN ĐOÁN: cấp tâm/bán kính đỉnh thật; không dùng trong reader thật hay split test.' : 'Không dùng truth để chọn vùng, đỉnh hay cạnh. Oracle chỉ trả chữ cho crop CV đề xuất.'}

Cấu trúc (nhãn + multiset {u,v}, bỏ trọng số/tên cạnh): ${summary.graphCorrect}/${summary.total}; F1 cạnh ${summary.graphMetrics.edges.f1?.toFixed(4) ?? 'N/A'}.

Bảng dưới chấm toàn bộ đồ thị, gồm trọng số/tên cạnh. D không đọc câu hỏi; missing_question không che lỗi đồ thị. Thời gian Node chỉ tham khảo.

`;
  const diagnostics = options.split === 'dev' ? `## Chẩn đoán theo khâu

Xem quy tắc ghép và mẫu số trong tools/eval/README.md.

\`\`\`json
${JSON.stringify(summarizeStages(stages), null, 2)}
\`\`\`

Âm tính không có hình: ${negatives.filter(n => n.vertices === 0 && n.edges === 0).length}/${negatives.length}.

` : '';
  await writeFile(join(directory, `${basename}.json`), JSON.stringify(report, null, 2) + '\n');
  await writeFile(join(directory, `${basename}.md`), intro + diagnostics + renderReport(report));
  await unlink(join(directory, `${basename}.checkpoint.json`));
  return { report, basename, reportDirectory };
}
