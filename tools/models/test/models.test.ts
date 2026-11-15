import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, expect, it, vi } from 'vitest';
import { downloadFile } from '../src/download.js';
import { fetchModels } from '../src/cli.js';
import { loadManifest, loadLlamaCppSource } from '../src/manifest.js';
import type { ModelFile } from '../src/manifest.js';

const directories: string[] = [];
async function directory(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'mathtwin-models-'));
  directories.push(root); return root;
}
afterEach(async () => {
  for (const root of directories.splice(0)) {
    if (!resolve(root).startsWith(resolve(tmpdir(), 'mathtwin-models-'))) throw new Error('Unsafe cleanup path.');
    await rm(root, { recursive: true, force: true });
  }
});
const payload = 'local test weight';
const file: ModelFile = { model: 'a', repository: 'test/fixture', revision: 'fixed', filename: 'fixture.gguf',
  bytes: Buffer.byteLength(payload), sha256: createHash('sha256').update(payload).digest('hex'), license: 'MIT',
  licenseUrl: 'https://example.invalid/LICENSE', url: 'https://example.invalid/fixture' };
const target = (root: string) => join(root, 'a', file.filename);

it('pins four approved weights and llama.cpp source tag + commit, without a Windows binary', async () => {
  const files = await loadManifest();
  expect(files).toHaveLength(4);
  expect(files.filter((f) => f.model === 'a').reduce((n, f) => n + f.bytes, 0)).toBe(1_817_539_488);
  expect(files.filter((f) => f.model === 'b').reduce((n, f) => n + f.bytes, 0)).toBe(1_926_804_800);
  expect(await loadLlamaCppSource()).toMatchObject({ revision: 'b12388', commit: '1c2adc75f619d05efc5d49ce08eaaa96272ebfa2', license: 'MIT' });
  for (const f of files) { expect(f.url).toContain(f.revision); expect(f.licenseUrl).toContain(f.revision); }
});

it.each(['a', 'b'])('without --confirm only lists %s; no network or files', async (model) => {
  const root = await directory();
  const fetcher = vi.fn<typeof fetch>();
  const logs: string[] = [];
  await fetchModels(['--model', model], { root, fetcher, log: (line) => logs.push(line) });
  expect(fetcher).not.toHaveBeenCalled();
  expect(await readdir(root)).toEqual([]);
  expect(logs.join('\n')).toContain('Tổng dung lượng:');
  expect(logs.join('\n')).toContain('SHA-256');
});

it('rejects missing, unknown, misspelled and positional options before downloading', async () => {
  const fetcher = vi.fn<typeof fetch>();
  for (const args of [[], ['--model', 'c', '--confirm'], ['--model', 'a', '--comfirm'], ['a', '--confirm']]) {
    await expect(fetchModels(args, { fetcher })).rejects.toThrow();
  }
  expect(fetcher).not.toHaveBeenCalled();
});

it('llama selection prints only pinned source metadata; no Windows binary download', async () => {
  const root = await directory(), fetcher = vi.fn<typeof fetch>(), log = vi.fn();
  await fetchModels(['--model', 'llama'], { root, fetcher, log });
  expect(log.mock.calls.flat().join('\n')).toContain('1c2adc75f619d05efc5d49ce08eaaa96272ebfa2');
  expect(log.mock.calls.flat().join('\n')).toContain('0 byte');
  expect(fetcher).not.toHaveBeenCalled(); expect(await readdir(root)).toEqual([]);
  await expect(fetchModels(['--model', 'llama', '--confirm'], { root, fetcher, log })).rejects.toThrow('Android build');
  expect(fetcher).not.toHaveBeenCalled();
});

it('confirmed branch prints size before fetching and renames only the verified result', async () => {
  const root = await directory(); const log = vi.fn();
  const fetcher = vi.fn<typeof fetch>(async () => { expect(log).toHaveBeenCalledWith(`Tổng dung lượng: ${file.bytes} byte.`); return new Response(payload); });
  await fetchModels(['--model', 'a', '--confirm'], { root, files: [file], fetcher, log });
  expect(await readFile(target(root), 'utf8')).toBe(payload);
  expect(await readdir(join(root, 'a'))).toEqual([file.filename]);
});

it('resumes only a matching Content-Range and verifies the complete SHA-256', async () => {
  const root = await directory(); await mkdir(join(root, 'a'));
  await writeFile(`${target(root)}.part`, payload.slice(0, 5));
  const fetcher = vi.fn<typeof fetch>(async (_, init) => {
    expect(init?.headers).toEqual({ Range: 'bytes=5-' });
    return new Response(payload.slice(5), { status: 206, headers: { 'Content-Range': `bytes 5-${file.bytes - 1}/${file.bytes}` } });
  });
  await downloadFile(file, root, fetcher);
  expect(await readFile(target(root), 'utf8')).toBe(payload);
});

it('restarts a partial file when the server ignores Range', async () => {
  const root = await directory(); await mkdir(join(root, 'a'));
  await writeFile(`${target(root)}.part`, 'bad prefix');
  await downloadFile(file, root, async () => new Response(payload));
  expect(await readFile(target(root), 'utf8')).toBe(payload);
});

it('refuses a mismatched Content-Range without changing the partial data', async () => {
  const root = await directory(); await mkdir(join(root, 'a'));
  await writeFile(`${target(root)}.part`, 'local');
  await expect(downloadFile(file, root, async () => new Response('bad', {
    status: 206, headers: { 'Content-Range': `bytes 0-${file.bytes - 1}/${file.bytes}` },
  }))).rejects.toThrow('Content-Range');
  expect(await readFile(`${target(root)}.part`, 'utf8')).toBe('local');
});

it('deletes a complete download with the wrong hash', async () => {
  const root = await directory();
  await expect(downloadFile({ ...file, sha256: '0'.repeat(64) }, root, async () => new Response(payload))).rejects.toThrow('SHA-256');
  expect(await readdir(join(root, 'a'))).toEqual([]);
});

it('deletes an already finalized corrupt file and reports failure without fetching', async () => {
  const root = await directory(); await mkdir(join(root, 'a')); await writeFile(target(root), 'corrupt');
  const fetcher = vi.fn<typeof fetch>();
  await expect(downloadFile(file, root, fetcher)).rejects.toThrow('deleted');
  expect(await readdir(join(root, 'a'))).toEqual([]); expect(fetcher).not.toHaveBeenCalled();
});

it('does not refetch a verified existing file or a complete verified partial', async () => {
  const root = await directory(); await mkdir(join(root, 'a')); await writeFile(`${target(root)}.part`, payload);
  const fetcher = vi.fn<typeof fetch>();
  await downloadFile(file, root, fetcher); await downloadFile(file, root, fetcher);
  expect(fetcher).not.toHaveBeenCalled(); expect(await readFile(target(root), 'utf8')).toBe(payload);
});

it('keeps an incomplete response resumable and does not publish it', async () => {
  const root = await directory();
  await expect(downloadFile(file, root, async () => new Response(payload.slice(0, 5)))).rejects.toThrow('Incomplete');
  expect(await readdir(join(root, 'a'))).toEqual([`${file.filename}.part`]);
});

it('preserves a partial file after cancellation and resumes it on retry', async () => {
  const root = await directory(); const controller = new AbortController();
  let reads = 0;
  const stream = new ReadableStream<Uint8Array>({ pull(c) {
    if (reads++ === 0) c.enqueue(Buffer.from(payload.slice(0, 5)));
    else { controller.abort(); c.error(new DOMException('Aborted', 'AbortError')); }
  } });
  await expect(downloadFile(file, root, async () => new Response(stream), controller.signal)).rejects.toThrow();
  expect(await readFile(`${target(root)}.part`, 'utf8')).toBe(payload.slice(0, 5));
  await downloadFile(file, root, async () => new Response(payload));
  expect(await readFile(target(root), 'utf8')).toBe(payload);
});
