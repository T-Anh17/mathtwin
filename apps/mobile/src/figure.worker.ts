/// <reference lib="webworker" />
import { FigureReader, NoGlyphReader } from '@mathtwin/reader-figure';
import type { FigureRequest, FigureResponse } from './figure-suggest.js';

// Runs the pure-TS figure reader off the UI thread. The page cancels by terminating this worker.
self.onmessage = async (event: MessageEvent<FigureRequest>) => {
  const { width, height, pixels } = event.data;
  let response: FigureResponse;
  try {
    const reader = new FigureReader({ glyphReader: new NoGlyphReader() });
    const { draft } = await reader.read([{ width, height, pixels }], 'edges');
    response = { ok: true, draft };
  } catch { response = { ok: false }; }
  self.postMessage(response);
};
