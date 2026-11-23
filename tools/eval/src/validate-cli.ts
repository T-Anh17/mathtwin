import { readdir } from 'node:fs/promises';
import type { WorkTruth } from '@mathtwin/work';
import { validateWork, workLines } from './work-data.js';
import { join } from 'node:path';
import { repositoryRoot } from './cli.js';
import { loadCases, readJson, setFolders } from './dataset.js';
import type { DatasetSet } from './dataset.js';
import { graphKey, graphSplit } from './figures.js';
import sharp from 'sharp';
import { loadPairs } from './pair-data.js';

try {
  const [folder, ...args] = process.argv.slice(2);
  if (folder === 'real-pairs') {
    if (args.length !== 2 || args[0] !== '--dir') throw new Error('Dùng eval:validate -- real-pairs --dir <thư mục>.');
    const pairs = await loadPairs(args[1]!, undefined);
    console.log(`Nhãn cặp hợp lệ: ${pairs.length} cặp.`);
    process.exit(0);
  }
  if (!folder || !Object.hasOwn(setFolders, folder) || args.length) throw new Error('Chọn synthetic, synthetic-hw, synthetic-fig, real hoặc real-pairs --dir <thư mục>.');
  const cases = await loadCases(join(repositoryRoot, 'testdata', setFolders[folder as DatasetSet]));
  for (const sample of cases) {
    if ((await readdir(sample.directory)).includes('work.json')) {
      const image = await sharp(join(sample.directory, sample.files[0]!)).metadata();
      const rotated = (image.orientation ?? 0) >= 5;
      validateWork(sample.truth, await readJson(join(sample.directory, 'work.json')) as WorkTruth,
        workLines(sample.lines ?? [], (rotated ? image.height : image.width)!, (rotated ? image.width : image.height)!), folder === 'synthetic-hw');
    }
    else if (folder === 'synthetic-hw') throw new Error('Thiếu work.json.');
  }
  if (folder === 'synthetic-fig') for (const sample of cases) {
    if (!sample.figure || sample.meta.originalGraph !== graphKey(sample.truth.graph) || sample.meta.split !== graphSplit(sample.truth.graph)) throw new Error('Chia tập hoặc chú thích hình không hợp lệ.');
    const image = await sharp(join(sample.directory, sample.files[0]!)).metadata();
    if (image.width !== sample.figure.width || image.height !== sample.figure.height) throw new Error('Tọa độ hình không cùng kích thước ảnh.');
  }
  console.log(`Nhãn hợp lệ: ${cases.length} đề (${folder}).`);
} catch { console.error('Bộ nhãn không hợp lệ; xem testdata/images/README.md.'); process.exitCode = 1; }
