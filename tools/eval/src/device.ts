import { mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { compareRead, compareText, ReadDraftSchema } from '@mathtwin/reader';
import type { ReadOutcome, ReadUsage, TextLine } from '@mathtwin/reader';
import { validateSpec } from '@mathtwin/core';
import type { ProblemSpec } from '@mathtwin/core';
import { loadCases, readJson, setFolders } from './dataset.js';
import type { DatasetSet, ImageCase } from './dataset.js';
import { makeReport, renderReport } from './report.js';
import type { EvaluationRow } from './report.js';

const invalid = (): never => { throw new Error('File xuất thiết bị không hợp lệ; kiểm tra version, id, cấu hình và dữ liệu kết quả.'); };
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return invalid();
  return value as Record<string, unknown>;
}
function string(value: unknown): string { return typeof value === 'string' && value.length > 0 ? value : invalid(); }
function number(value: unknown): number { return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : invalid(); }
function bool(value: unknown): boolean { return typeof value === 'boolean' ? value : invalid(); }
function list(value: unknown): unknown[] { return Array.isArray(value) ? value : invalid(); }
function usage(value: unknown, engine: string): ReadUsage {
  const u = record(value);
  if (u.engine !== engine || !Number.isInteger(u.passes) || number(u.passes) > 2) invalid();
  const result: ReadUsage = { engine, passes: number(u.passes), latencyMs: number(u.latencyMs) };
  if (u.peakMemoryMb !== undefined) result.peakMemoryMb = number(u.peakMemoryMb);
  if (u.finish_reason !== undefined) result.finish_reason = list(u.finish_reason).map(string);
  if (u.sentImages !== undefined) result.sentImages = list(u.sentImages).map((value) => {
    const image = record(value);
    const size = { originalWidth: number(image.originalWidth), originalHeight: number(image.originalHeight),
      width: number(image.width), height: number(image.height), ...(image.maxImageSide === undefined ? {} : { maxImageSide: number(image.maxImageSide) }) };
    if (![size.originalWidth, size.originalHeight, size.width, size.height].every((n) => Number.isSafeInteger(n) && n > 0)
      || (size.maxImageSide !== undefined && (!Number.isSafeInteger(size.maxImageSide) || size.maxImageSide <= 0 || Math.max(size.width, size.height) > size.maxImageSide))) invalid();
    return size;
  });
  if (u.serverTimings !== undefined) {
    const t = record(u.serverTimings);
    result.serverTimings = { promptMs: number(t.promptMs), predictedMs: number(t.predictedMs), promptTokens: number(t.promptTokens), predictedTokens: number(t.predictedTokens) };
  }
  return result;
}
function textLine(value: unknown): TextLine {
  const line = record(value); const conf = number(line.conf); if (conf > 1 || typeof line.text !== 'string') invalid();
  if (line.region !== undefined && !['question', 'figure', 'table', 'solution'].includes(String(line.region))) invalid();
  if (line.struck !== undefined && typeof line.struck !== 'boolean') invalid();
  let box: TextLine['box'];
  if (line.box !== undefined) {
    const values = list(line.box).map(number);
    if (values.length !== 4 || values[2]! <= values[0]! || values[3]! <= values[1]!) invalid();
    box = values as NonNullable<TextLine['box']>;
  }
  return { text: (line.text as string).normalize('NFC'), conf, alternatives: list(line.alternatives).map(string),
    ...(line.region === undefined ? {} : { region: line.region as TextLine['region'] & string }),
    ...(line.struck === undefined ? {} : { struck: line.struck as boolean }), ...(box ? { box } : {}) };
}
function outcome(value: unknown, engine: string): ReadOutcome {
  const o = record(value);
  if (o.spec !== null && !validateSpec(o.spec as ProblemSpec).ok) invalid();
  if (o.graph !== null && !validateSpec({ graph: o.graph, task: { type: 'elements' }, questionFormat: 'tu_luan' } as ProblemSpec).ok) invalid();
  const uncertain = list(o.graphUncertain);
  if (uncertain.some((u) => typeof record(u).item !== 'string' || !Array.isArray(record(u).candidates))) invalid();
  const issues = list(o.issues).map((value) => {
    const issue = record(value);
    if (!['warning', 'blocking'].includes(String(issue.severity))) invalid();
    return { code: string(issue.code) as ReadOutcome['issues'][number]['code'], severity: issue.severity as 'warning' | 'blocking',
      message: string(issue.message), ...(issue.item === undefined ? {} : { item: string(issue.item) }) };
  });
  return { spec: o.spec as ReadOutcome['spec'], graph: o.graph as ReadOutcome['graph'],
    graphUncertain: uncertain as ReadOutcome['graphUncertain'], issues,
    drafts: list(o.drafts).map((draft) => ReadDraftSchema.parse(draft)), usage: usage(o.usage, engine) };
}
function failedOutcome(u: ReadUsage): ReadOutcome {
  return { spec: null, graph: null, graphUncertain: [], drafts: [], usage: u,
    issues: ['graph', 'spec', 'questionFormat'].map((item) => ({ code: 'read_failed', severity: 'blocking', item, message: 'Lượt đọc trên thiết bị thất bại.' })) };
}
export interface DeviceEvaluationOptions { set?: DatasetSet; mode: 'graph' | 'lines' | 'both'; limit?: number; threshold: number }
export async function evaluateDevice(file: string, root: string, date: string, options: DeviceEvaluationOptions) {
  const data = record(await readJson(file)); if (data.version !== 1) invalid();
  const rawDevice = record(data.device); const rawRuntime = record(data.runtime);
  const runtime = Object.fromEntries(Object.entries(rawRuntime).filter(([key, value]) =>
    ['backend', 'contextSize', 'maxTokens', 'maxLongEdge', 'maxImageSide', 'readTimeout', 'alternativesThreshold', 'mmprojOffload'].includes(key)
      && ['string', 'number', 'boolean'].includes(typeof value)));
  const llamaCpp = record(rawRuntime.llamaCpp);
  runtime.llamaCpp = Object.fromEntries(Object.entries(llamaCpp).filter(([key, value]) =>
    ['repository', 'tag', 'commit', 'revision', 'license', 'url', 'licenseUrl'].includes(key) && typeof value === 'string'));
  const device = { manufacturer: string(rawDevice.manufacturer), model: string(rawDevice.model), android: string(rawDevice.android),
    sdk: number(rawDevice.sdk), cores: number(rawDevice.cores), totalRamBytes: number(rawDevice.totalRamBytes),
    availableRamBytes: number(rawDevice.availableRamBytes), freeStorageBytes: number(rawDevice.freeStorageBytes) };
  const phoneMeasurements = { device, runtime, targetEligible: device.totalRamBytes >= 6e9 };
  const catalog = new Map<string, ImageCase>();
  const sourceSets = new Map<string, DatasetSet>();
  for (const set of Object.keys(setFolders) as DatasetSet[]) {
    let samples: ImageCase[];
    try { samples = await loadCases(join(root, 'testdata', setFolders[set])); }
    catch (e) { if ((e as NodeJS.ErrnoException).code === 'ENOENT') continue; throw e; }
    for (const sample of samples) { if (catalog.has(sample.id)) throw new Error('Id trùng giữa các bộ truth.'); catalog.set(sample.id, sample); sourceSets.set(sample.id, set); }
  }
  const groups = new Map<string, { engine: string; config: Record<string, unknown>; rows: EvaluationRow[]; ids: Set<string>; passes: 1 | 2 }>();
  const results = list(data.results); if (!results.length) invalid();
  for (const raw of results) {
    const result = record(raw); const id = string(result.id); const config = record(result.config);
    const engine = string(result.engine);
    if ((config.passes !== 1 && config.passes !== 2) || !['graph', 'lines'].includes(String(config.mode))
      || !['a', 'b'].includes(String(config.model)) || engine !== (config.model === 'a' ? 'offline:paddleocr-vl-1.5' : 'offline:qwen3-vl-2b')) invalid();
    const passes = config.passes as 1 | 2;
    if (options.mode !== 'both' && config.mode !== options.mode) continue;
    const sample = catalog.get(id); if (!sample) throw new Error('Không tìm thấy id thiết bị trong bộ truth đã chọn.');
    if (options.set && sourceSets.get(id) !== options.set) continue;
    let dry: Record<string, number> | undefined;
    if (config.dry !== undefined) {
      const d = record(config.dry);
      dry = { dry_multiplier: number(d.dry_multiplier), dry_base: number(d.dry_base), dry_allowed_length: number(d.dry_allowed_length),
        dry_penalty_last_n: d.dry_penalty_last_n === -1 ? -1 : number(d.dry_penalty_last_n) };
      if (dry.dry_base! < 1 || !Number.isSafeInteger(dry.dry_allowed_length) || !Number.isSafeInteger(dry.dry_penalty_last_n)) invalid();
    }
    if (config.maxImageSide !== undefined && ![512, 768, 1024].includes(number(config.maxImageSide))) invalid();
    if (config.readTimeout !== undefined && (!Number.isSafeInteger(config.readTimeout) || number(config.readTimeout) < 1000 || number(config.readTimeout) > 3_600_000)) invalid();
    const configuration = { model: config.model, passes, mode: config.mode, threads: number(config.threads), minRamGb: number(config.minRamGb),
      ...(config.maxImageSide === undefined ? {} : { maxImageSide: number(config.maxImageSide) }),
      ...(config.readTimeout === undefined ? {} : { readTimeout: number(config.readTimeout) }), ...(dry ? { dry } : {}),
      allowLowRam: bool(config.allowLowRam), backgroundIdleMinutes: number(config.backgroundIdleMinutes),
      backend: config.backend === 'CPU' ? 'CPU' : invalid(), ...(config.cpuVariant === undefined ? {} : { cpuVariant: string(config.cpuVariant) }) };
    const key = JSON.stringify({ engine, configuration });
    const group: NonNullable<ReturnType<typeof groups.get>> = groups.get(key) ?? { engine, config: configuration, rows: [], ids: new Set<string>(), passes };
    if (group.ids.has(id)) throw new Error('Id kết quả bị lặp trong cùng cấu hình; xuất riêng từng lần đo.');
    group.ids.add(id); groups.set(key, group);
    if (options.limit && group.rows.length >= options.limit) continue;
    const u = usage(result.usage, engine);
    const errorCode = result.errorCode === undefined ? undefined : string(result.errorCode);
    if (!errorCode && u.passes !== passes) invalid();
    const row: EvaluationRow = { id, meta: sample.meta, usage: u, issueCodes: [],
      deviceTiming: { totalMs: number(result.totalMs), modelLoadMs: number(result.modelLoadMs), modelVerifyMs: number(result.modelVerifyMs), reusedModel: bool(result.reusedModel) },
      ...(errorCode === undefined ? {} : { errorCode }) };
    if (errorCode === 'memory_pressure') {
      const pressure = record(record(result.memory).memoryPressure);
      if (pressure.callback !== 'onTrimMemory' && pressure.callback !== 'onLowMemory') return invalid();
      if (pressure.callback === 'onLowMemory' ? pressure.trimLevel !== null : !Number.isInteger(pressure.trimLevel)) invalid();
      row.memoryPressure = { callback: pressure.callback, trimLevel: pressure.trimLevel === null ? null : number(pressure.trimLevel) };
    }
    if (config.mode === 'graph') {
      // A late process failure can leave a previous/partial outcome on the app result.
      // Keep the run failed rather than counting that payload as an accepted graph.
      const read = errorCode ? failedOutcome(u) : outcome(result.outcome, engine);
      row.comparison = compareRead(read, sample.truth); row.issueCodes = read.issues.map((issue) => issue.code);
    } else {
      if (!sample.lines) throw new Error('Đánh giá chữ cần lines.json cho từng id.');
      const allPasses = result.linePasses === undefined && errorCode ? [] : list(result.linePasses);
      if (allPasses.length > passes || (!errorCode && allPasses.length !== passes)) invalid();
      row.textComparisons = Array.from({ length: passes }, (_, i) => {
        let lines: TextLine[] = [];
        if (allPasses[i] !== undefined) {
          const pass = record(allPasses[i]); if (usage(pass.usage, engine).passes !== 1) invalid();
          lines = list(pass.lines).map(textLine);
        }
        return compareText(lines, sample.lines!, sample.truth.graph.vertices.map((v) => v.label), options.threshold);
      });
    }
    group.rows.push(row);
  }
  if (!groups.size) throw new Error('Không có kết quả khớp --mode.');
  const directory = join(root, 'reports'); await mkdir(directory, { recursive: true });
  const reports = [];
  for (const [key, group] of groups) {
    const report = makeReport(group.engine, options.set ?? 'device-mixed', group.passes, date, group.rows,
      { mode: group.config.mode as 'graph' | 'lines', configuration: group.config, phoneMeasurements: {
        ...phoneMeasurements, ...(options.set ? { notExportedIds: [...catalog.keys()].filter((id) => sourceSets.get(id) === options.set && !group.ids.has(id)) } : {}) } });
    const basename = `read-device-${date}-${createHash('sha256').update(JSON.stringify({ key, set: options.set, threshold: options.threshold, limit: options.limit, export: data })).digest('hex').slice(0, 12)}`;
    await writeFile(join(directory, `${basename}.json`), `${JSON.stringify(report, null, 2)}\n`);
    await writeFile(join(directory, `${basename}.md`), renderReport(report));
    reports.push({ report, basename, reportDirectory: 'reports' });
  }
  return reports;
}
