import { readFile } from 'node:fs/promises';

export type Model = 'a' | 'b' | 'c';
export interface LlamaCppSource { repository: string; revision: string; commit: string; url: string; license: string; licenseUrl: string }
async function manifestData(): Promise<Record<string, unknown>> {
  const data: unknown = JSON.parse(await readFile(new URL('../manifest.json', import.meta.url), 'utf8'));
  if (typeof data !== 'object' || data === null || !('version' in data) || data.version !== 1) throw new Error('Invalid model manifest.');
  return data as Record<string, unknown>;
}
export async function loadLlamaCppSource(): Promise<LlamaCppSource> {
  const data = (await manifestData()).llamaCppSource;
  if (typeof data !== 'object' || data === null) throw new Error('Missing llama.cpp source.');
  const s = data as Record<string, unknown>;
  if (s.repository !== 'ggml-org/llama.cpp' || s.revision !== 'b12388' || typeof s.commit !== 'string' || !/^[a-f0-9]{40}$/.test(s.commit)
    || s.url !== 'https://github.com/ggml-org/llama.cpp.git' || s.license !== 'MIT' || typeof s.licenseUrl !== 'string'
    || !s.licenseUrl.includes(s.commit)) throw new Error('Invalid llama.cpp source.');
  return s as unknown as LlamaCppSource;
}
export interface ModelFile {
  model: Model;
  repository: string;
  revision: string;
  filename: string;
  bytes: number;
  sha256: string;
  license: string;
  licenseUrl: string;
  url: string;
  licenseStatus?: 'weights-unverified' | 'declared-apache-2.0';
  note?: string;
}
export async function loadManifest(): Promise<ModelFile[]> {
  const data = await manifestData();
  if (!Array.isArray(data.files)) throw new Error('Invalid model manifest.');
  const files: ModelFile[] = [];
  for (const entry of data.files as unknown[]) {
    if (typeof entry !== 'object' || entry === null) throw new Error('Invalid model file.');
    const e = entry as Record<string, unknown>;
    if ((e.model !== 'a' && e.model !== 'b' && e.model !== 'c')
      || typeof e.filename !== 'string' || !/^[\w.-]+$/.test(e.filename) || e.filename === '.' || e.filename === '..'
      || typeof e.bytes !== 'number' || !Number.isSafeInteger(e.bytes) || e.bytes <= 0
      || typeof e.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(e.sha256)
      || typeof e.repository !== 'string' || typeof e.revision !== 'string'
      || typeof e.license !== 'string' || typeof e.licenseUrl !== 'string'
      || typeof e.url !== 'string' || !e.url.startsWith('https://')) throw new Error('Invalid model file.');
    if (e.model === 'c' && (e.repository !== 'duchoa1297/vietocr-onnx' || e.revision !== 'ocr-v1'
      || !['weights-unverified', 'declared-apache-2.0'].includes(String(e.licenseStatus))
      || typeof e.note !== 'string' || !e.note)) throw new Error('Invalid OCR provenance.');
    files.push(e as unknown as ModelFile);
  }
  return files;
}
