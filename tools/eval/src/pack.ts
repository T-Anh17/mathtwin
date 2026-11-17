import { copyFile, mkdir, readdir, unlink, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { loadCases, setFolders } from './dataset.js';
import type { DatasetSet } from './dataset.js';
import { repositoryRoot } from './cli.js';

/** App protocol v1 accepts a single image per id. Fail rather than silently dropping pages. */
export async function packDataset(set: DatasetSet, root = repositoryRoot, split?: 'dev' | 'test'): Promise<string> {
  const cases = (await loadCases(join(root, 'testdata', setFolders[set]))).filter(c => set !== 'synthetic-fig' || c.meta.hasFigure !== false).filter((c) => !split || c.meta.split === split);
  if (!cases.length || cases.some((c) => c.files.length !== 1 || !/^[a-zA-Z0-9_.-]+$/.test(c.id))) throw new Error('Bộ đo cần id an toàn và đúng một ảnh mỗi đề; không bỏ trang.');
  const output = join(root, '.build-cache/datasets', split ? `${set}-${split}` : set);
  await mkdir(output, { recursive: true });
  // Only remove generated flat files in the fixed output directory; never touch corpus or images from users.
  for (const entry of await readdir(output, { withFileTypes: true })) {
    if (!entry.isFile() || !(entry.name === 'ids.json' || /^sample-\d+\.(png|jpg|jpeg)$/i.test(entry.name))) throw new Error('Thư mục xuất có file lạ.');
  }
  for (const name of await readdir(output)) await unlink(join(output, name));
  const ids: { id: string; file: string }[] = [];
  for (const [i, sample] of cases.entries()) {
    const source = sample.files[0]!; const extension = source.split('.').at(-1)!.toLowerCase();
    const file = `sample-${String(i + 1).padStart(3, '0')}.${extension}`;
    await copyFile(join(sample.directory, source), join(output, file));
    ids.push({ id: sample.id, file });
  }
  await writeFile(join(output, 'ids.json'), `${JSON.stringify(ids, null, 2)}\n`);
  return output;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { values } = parseArgs({ options: { set: { type: 'string', default: 'synthetic-hw' }, split: { type: 'string' } } });
  if (!Object.hasOwn(setFolders, values.set!)) throw new Error('Chọn synthetic, synthetic-hw, synthetic-fig hoặc real.');
  if (values.split !== undefined && (!['dev', 'test'].includes(values.split) || values.set !== 'synthetic-fig')) throw new Error('--split dev|test cần --set synthetic-fig.');
  packDataset(values.set as DatasetSet, repositoryRoot, values.split as 'dev' | 'test' | undefined).then((directory) => console.log(`Bộ đo cho app: ${directory}`))
    .catch(() => { console.error('Không đóng gói được bộ đo; kiểm tra id, trang và thư mục xuất.'); process.exitCode = 1; });
}
