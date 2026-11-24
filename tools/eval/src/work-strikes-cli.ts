import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { measureStrikes } from './work-strikes.js';

const pages = await measureStrikes(resolve('.'));
const total = { pages: pages.length, lines: 0, positives: 0, tp: 0, fp: 0, fn: 0, asked: 0, uncertain: 0, struckAsContent: 0 };
for (const page of pages) for (const key of ['lines', 'positives', 'tp', 'fp', 'fn', 'asked', 'uncertain', 'struckAsContent'] as const) total[key] += page[key];
const precision = total.tp / Math.max(1, total.tp + total.fp), recall = total.tp / Math.max(1, total.tp + total.fn);
const report = { total, precision, recall, pages };
const target = 'reports/.debug/work-strikes-40.json';
await mkdir('reports/.debug', { recursive: true });
await writeFile(target, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ ...total, precision, recall, details: target }, null, 2));
