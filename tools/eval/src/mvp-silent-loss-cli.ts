import { readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type { WorkTruth } from '@mathtwin/work';
import { syntheticWorkPage } from './work-layout.js';
import { lossReport, silentClaimLoss } from './mvp-silent-loss.js';
import type { LossReportInput, SilentLoss } from './mvp-silent-loss.js';
import type { MvpRow, MvpFailure } from './mvp-report.js';

// Usage (repo root, after `npm run build:mvp --workspace @mathtwin/eval`):
//   node tools/eval/dist/mvp/tools/eval/src/mvp-silent-loss-cli.js --before 2026-11-24 --after 2026-11-25
// Reads reports/mvp-eval-<date>.json (both from --rescore) and writes reports/mvp-lo53-<after>.md.
const root = resolve(process.cwd());
const args = process.argv.slice(2);
const flag = (name: string): string => {
  const value = args[args.indexOf(name) + 1];
  if (!args.includes(name) || !/^\d{4}-\d{2}-\d{2}$/u.test(value ?? '')) throw new Error('Dùng --before YYYY-MM-DD --after YYYY-MM-DD.');
  return value!;
};
const before = flag('--before'), after = flag('--after');
type Report = { planned: number; rows: MvpRow[]; failures: MvpFailure[]; fingerprint: string };
const load = async (date: string): Promise<Report> => JSON.parse(await readFile(join(root, 'reports', `mvp-eval-${date}.json`), 'utf8')) as Report;
const truths = new Map<string, { reference: Awaited<ReturnType<typeof syntheticWorkPage>>['lines']; workTruth: WorkTruth }>();
const input = async (date: string): Promise<LossReportInput> => {
  const report = await load(date), loss = new Map<string, SilentLoss>();
  for (const row of report.rows) {
    if (!truths.has(row.id)) {
      const page = await syntheticWorkPage(root, row.id);
      const workTruth = JSON.parse(await readFile(join(root, 'testdata/images-synthetic-hw', row.id, 'work.json'), 'utf8')) as WorkTruth;
      truths.set(row.id, { reference: page.lines, workTruth });
    }
    const truth = truths.get(row.id)!;
    loss.set(row.id, silentClaimLoss(row, truth.reference, truth.workTruth));
  }
  return { date, label: `reports/mvp-eval-${date}.json (fingerprint ${report.fingerprint.slice(0, 12)})`, planned: report.planned, rows: report.rows, failures: report.failures, loss };
};
// Compare like with like: a page that completed in only one run (e.g. a transient file-lock
// failure) is excluded from both sides and listed in the report.
const [x, y] = [await input(before), await input(after)];
const done = (r: LossReportInput) => new Set(r.rows.map((row) => row.id));
const excluded = [...new Set([...done(x), ...done(y)])].filter((id) => !done(x).has(id) || !done(y).has(id)).sort();
const restrict = (r: LossReportInput): LossReportInput => ({ ...r, planned: r.planned - excluded.length,
  rows: r.rows.filter((row) => !excluded.includes(row.id)), failures: r.failures.filter((f) => !excluded.includes(f.id)) });
const markdown = lossReport(restrict(x), restrict(y)) + (excluded.length ? `
Loại khỏi cả hai phía vì chỉ hoàn tất ở một lượt: ${excluded.map((id) => {
  const failed = [...x.failures, ...y.failures].find((f) => f.id === id);
  return `${id}${failed ? ` (lỗi: ${failed.error.split(':')[0]})` : ''}`;
}).join('; ')}.
` : '');
const target = join(root, 'reports', `mvp-lo53-${after}.md`);
await writeFile(target, markdown);
console.log(markdown);
