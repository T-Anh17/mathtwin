import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, open, rename, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import type { ModelFile } from './manifest.js';

async function size(path: string): Promise<number> {
  try { return (await stat(path)).size; }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return 0; throw error; }
}
async function verified(path: string, file: ModelFile): Promise<boolean> {
  if (await size(path) !== file.bytes) return false;
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest('hex') === file.sha256;
}

/** Only the CLI's confirmed branch calls this function. Interrupted .part files are resumable. */
export async function downloadFile(file: ModelFile, root: string, fetcher: typeof fetch = fetch, signal?: AbortSignal): Promise<void> {
  signal?.throwIfAborted();
  const directory = join(root, file.model);
  const target = join(directory, file.filename);
  const partial = `${target}.part`;
  await mkdir(directory, { recursive: true });
  if (await size(target) > 0) {
    if (await verified(target, file)) return;
    await rm(target, { force: true });
    throw new Error(`SHA-256/size mismatch; deleted ${file.filename}. Retry to download again.`);
  }
  let offset = await size(partial);
  if (offset > file.bytes) {
    await rm(partial, { force: true });
    throw new Error(`Oversized partial file deleted: ${file.filename}.`);
  }
  if (offset < file.bytes) {
    const response = await fetcher(file.url, { headers: offset ? { Range: `bytes=${offset}-` } : {},
      ...(signal === undefined ? {} : { signal }) });
    if (response.status === 200) offset = 0; // Server ignored Range: replace, never append a whole second copy.
    else if (response.status === 206) {
      const range = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(response.headers.get('content-range') ?? '');
      if (!range || Number(range[1]) !== offset || Number(range[2]) !== file.bytes - 1 || Number(range[3]) !== file.bytes) {
        await response.body?.cancel();
        throw new Error(`Invalid Content-Range for ${file.filename}.`);
      }
    } else { await response.body?.cancel(); throw new Error(`Download failed (${response.status}): ${file.filename}.`); }
    if (!response.body) throw new Error('Missing download body.');
    const handle = await open(partial, offset === 0 ? 'w' : 'a');
    const reader = response.body.getReader();
    try {
      while (true) {
        signal?.throwIfAborted();
        const { done, value } = await reader.read();
        if (done) break;
        offset += value.byteLength;
        if (offset > file.bytes) throw new Error('Download exceeds manifest size.');
        await handle.writeFile(value);
      }
    } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); await handle.close(); }
  }
  signal?.throwIfAborted();
  if (await size(partial) < file.bytes) throw new Error(`Incomplete download; resume on retry: ${file.filename}.`);
  if (!await verified(partial, file)) {
    await rm(partial, { force: true });
    throw new Error(`SHA-256 mismatch; deleted ${file.filename}.`);
  }
  await rename(partial, target);
}
