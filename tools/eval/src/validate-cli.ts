import { join } from 'node:path';
import { repositoryRoot } from './cli.js';
import { loadCases, setFolders } from './dataset.js';
import type { DatasetSet } from './dataset.js';

try {
  const folder = process.argv[2];
  if (!folder || !Object.hasOwn(setFolders, folder)) throw new Error('Chọn synthetic, synthetic-hw hoặc real.');
  const cases = await loadCases(join(repositoryRoot, 'testdata', setFolders[folder as DatasetSet]));
  console.log(`Nhãn hợp lệ: ${cases.length} đề (${folder}).`);
} catch { console.error('Bộ nhãn không hợp lệ; xem testdata/images/README.md.'); process.exitCode = 1; }
