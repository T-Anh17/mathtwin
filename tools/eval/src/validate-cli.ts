import { join } from 'node:path';
import { repositoryRoot } from './cli.js';
import { loadCases, setFolders } from './dataset.js';
import type { DatasetSet } from './dataset.js';
import { graphKey, graphSplit } from './figures.js';
import sharp from 'sharp';

try {
  const folder = process.argv[2];
  if (!folder || !Object.hasOwn(setFolders, folder)) throw new Error('Chọn synthetic, synthetic-hw, synthetic-fig hoặc real.');
  const cases = await loadCases(join(repositoryRoot, 'testdata', setFolders[folder as DatasetSet]));
  if (folder === 'synthetic-fig') for (const sample of cases) {
    if (!sample.figure || sample.meta.originalGraph !== graphKey(sample.truth.graph) || sample.meta.split !== graphSplit(sample.truth.graph)) throw new Error('Chia tập hoặc chú thích hình không hợp lệ.');
    const image = await sharp(join(sample.directory, sample.files[0]!)).metadata();
    if (image.width !== sample.figure.width || image.height !== sample.figure.height) throw new Error('Tọa độ hình không cùng kích thước ảnh.');
  }
  console.log(`Nhãn hợp lệ: ${cases.length} đề (${folder}).`);
} catch { console.error('Bộ nhãn không hợp lệ; xem testdata/images/README.md.'); process.exitCode = 1; }
