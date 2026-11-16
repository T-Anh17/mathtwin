import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { expect, it, vi } from 'vitest';
import { createNodeOcrReader } from '../src/index.js';
import type { OrtLike } from '@mathtwin/reader-ocr-shared';

it('Node adapter requires local models, rejects corrupt files before creating sessions and never downloads', async () => {
  const root = await mkdtemp(join(tmpdir(), 'mathtwin-ocr-node-'));
  const createSession = vi.fn<OrtLike['createSession']>();
  const ort: OrtLike = { createSession, tensor: () => { throw new Error('Unexpected inference.'); } };
  const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
  try {
    await expect(createNodeOcrReader({ modelRoot: join(root, 'absent'), ort })).rejects.toMatchObject({ code: 'ENOENT' });
    await mkdir(join(root, 'corrupt')); await writeFile(join(root, 'corrupt/det.onnx'), 'tiny local test fixture');
    await expect(createNodeOcrReader({ modelRoot: join(root, 'corrupt'), ort })).rejects.toThrow('size mismatch');
    expect(createSession).not.toHaveBeenCalled(); expect(fetcher).not.toHaveBeenCalled();
  } finally {
    vi.unstubAllGlobals();
    if (!resolve(root).startsWith(resolve(tmpdir(), 'mathtwin-ocr-node-'))) throw new Error('Unsafe cleanup.');
    await rm(root, { recursive: true, force: true });
  }
});
