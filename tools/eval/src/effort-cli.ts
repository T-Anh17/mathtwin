import { fileURLToPath } from 'node:url';
import { evaluateFigureEffort } from './figure-effort.js';

// npm run eval:effort -- --split test|dev [--limit n]
const root = fileURLToPath(new URL('../../../', import.meta.url));
const args = process.argv.slice(2);
const value = (name: string) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
try {
  const split = value('--split');
  if (split !== 'dev' && split !== 'test') throw new Error('Chọn --split dev hoặc --split test.');
  const limit = value('--limit') === undefined ? undefined : Number(value('--limit'));
  if (limit !== undefined && (!Number.isSafeInteger(limit) || limit < 1)) throw new Error('--limit phải là số nguyên dương.');
  const report = await evaluateFigureEffort(root, new Date().toISOString().slice(0, 10), split, limit);
  console.log(`Báo cáo: ${report}`);
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Không đo được công sửa.');
  process.exitCode = 1;
}
