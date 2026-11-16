import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { downloadFile } from './download.js';
import { loadManifest, loadLlamaCppSource } from './manifest.js';
import type { ModelFile } from './manifest.js';

export async function fetchModels(args: string[], deps: {
  files?: ModelFile[];
  root?: string;
  fetcher?: typeof fetch;
  log?: (message: string) => void;
  signal?: AbortSignal;
} = {}): Promise<void> {
  const { values } = parseArgs({ args, options: { model: { type: 'string' }, confirm: { type: 'boolean', default: false } } });
  if (values.model !== 'a' && values.model !== 'b' && values.model !== 'c' && values.model !== 'llama') throw new Error('Use --model a|b|c|llama [--confirm].');
  const log = deps.log ?? console.log;
  if (values.model === 'llama') {
    const source = await loadLlamaCppSource();
    log(`Mã nguồn ${source.repository}: tag ${source.revision}; commit ${source.commit}; ${source.url}`);
    log('Tổng dung lượng file sẽ tải bằng CLI này: 0 byte. Không còn binary Windows; build Android ở Lô 2.5.');
    if (values.confirm) throw new Error('Source builds belong to the Android build workflow; this CLI does not clone/build source.');
    return;
  }
  const files = (deps.files ?? await loadManifest()).filter((file) => file.model === values.model);
  if (files.length === 0) throw new Error('No files for this model.');
  for (const file of files) log(`${file.model}/${file.filename}: ${file.bytes} byte; SHA-256 ${file.sha256}`);
  if (files.some((file) => file.licenseStatus === 'weights-unverified')) log('C: trọng số VietOCR chưa xác minh điều khoản riêng; chỉ dùng để đo, chưa đưa vào sản phẩm.');
  log(`Tổng dung lượng: ${files.reduce((total, file) => total + file.bytes, 0)} byte.`);
  if (!values.confirm) { log('Chỉ xem danh sách; chưa tải. Cần --confirm để tải.'); return; }
  const root = deps.root ?? fileURLToPath(new URL('../../../.models/', import.meta.url));
  for (const file of files) await downloadFile(file, root, deps.fetcher, deps.signal);
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const controller = new AbortController();
  const abort = (): void => controller.abort();
  process.once('SIGINT', abort);
  fetchModels(process.argv.slice(2), { signal: controller.signal }).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : 'Tải thất bại.'); process.exitCode = 1;
  }).finally(() => process.removeListener('SIGINT', abort));
}
