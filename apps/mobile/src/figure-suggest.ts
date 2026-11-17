import type { PreparedImage, ReadDraft } from '@mathtwin/reader';
import { emptyEditorGraph, fromDraft } from './graph-editor.js';
import type { EditorGraph } from './graph-editor.js';

export interface FigureRequest { width: number; height: number; pixels: Uint8ClampedArray }
export type FigureResponse = { ok: true; draft: ReadDraft } | { ok: false };
/** Reads a figure draft from an already decoded image; rejects with `{ code }` on failure or cancel. */
export type FigureRunner = (image: PreparedImage, signal: AbortSignal) => Promise<ReadDraft>;

/** Production runner: one short-lived module worker per suggestion, terminated on cancel. */
export const workerRunner: FigureRunner = (image, signal) => new Promise<ReadDraft>((resolve, reject) => {
  if (signal.aborted) { reject({ code: 'aborted' }); return; }
  const worker = new Worker(new URL('./figure.worker.ts', import.meta.url), { type: 'module' });
  const finish = (): void => { signal.removeEventListener('abort', cancel); worker.terminate(); };
  const cancel = (): void => { finish(); reject({ code: 'aborted' }); };
  signal.addEventListener('abort', cancel, { once: true });
  worker.onmessage = (event: MessageEvent<FigureResponse>) => { finish(); event.data.ok ? resolve(event.data.draft) : reject({ code: 'figure_failed' }); };
  worker.onerror = () => { finish(); reject({ code: 'figure_failed' }); };
  // Copy the pixels so the caller's image stays usable after the buffer is transferred.
  const pixels = new Uint8ClampedArray(image.pixels);
  const request: FigureRequest = { width: image.width, height: image.height, pixels };
  worker.postMessage(request, [pixels.buffer]);
});

/**
 * Experimental suggestion only: the result is a draft the user must review. An image without a
 * detectable figure yields `empty: true` so the screen can ask for manual input instead.
 */
export async function suggestGraph(image: PreparedImage, runner: FigureRunner, signal: AbortSignal): Promise<{ graph: EditorGraph; empty: boolean }> {
  const draft = await runner(image, signal);
  if (signal.aborted) throw { code: 'aborted' };
  if (!draft.vertices.length) return { graph: emptyEditorGraph(), empty: true };
  return { graph: fromDraft(draft), empty: false };
}
