import { join } from 'node:path';
import { repositoryRoot } from './cli.js';
import { loadCases } from './dataset.js';

try {
  const folder = process.argv[2];
  if (folder !== 'synthetic' && folder !== 'real') throw new Error('Chọn synthetic hoặc real.');
  const cases = await loadCases(join(repositoryRoot, 'testdata', folder === 'synthetic' ? 'images-synthetic' : 'images'));
  console.log(`Nhãn hợp lệ: ${cases.length} đề (${folder}).`);
} catch { console.error('Bộ nhãn không hợp lệ; xem testdata/images/README.md.'); process.exitCode = 1; }
