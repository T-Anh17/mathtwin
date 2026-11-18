import { validateSpec } from '@mathtwin/core';
import type { ProblemSpec } from '@mathtwin/core';
import { detectStrikes } from '@mathtwin/work';
import type { PreparedImage, TextLine } from '@mathtwin/reader';
import type { WorkLine } from '@mathtwin/work';
import { productVi as m } from './product-messages.vi.js';
import { reviewWork } from './work-session.js';

/** JSON boundary: use the existing core validator, never silently substitute a sample spec. */
export function readWorkSpecs(json: string): Record<string, ProblemSpec> {
  const value: unknown = JSON.parse(json);
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(m.work.invalidSpecs);
  const entries = Object.entries(value);
  if (!entries.length || entries.some(([id, spec]) => !id.trim() || !validateSpec(spec as ProblemSpec).ok)) throw new Error(m.work.invalidSpecs);
  return Object.fromEntries(entries) as Record<string, ProblemSpec>;
}

/** B emits original-image pixels; C already emits normalized 0–1000 boxes. */
export function normalizedWorkLines(text: TextLine[], image: PreparedImage, model: 'b' | 'c'): TextLine[] {
  return text.map((line) => ({ ...line, ...(model === 'b' && line.box ? {
    box: line.box.map((value, axis) => value / (axis % 2 === 0 ? image.width : image.height) * 1000) as [number, number, number, number],
  } : {}) }));
}
export function benchmarkWork(spec: ProblemSpec, text: TextLine[], image: PreparedImage) {
  const lines: WorkLine[] = text.map((line, index) => ({ ...line, index, page: 0 }));
  const strikes = detectStrikes(image, lines);
  return reviewWork(spec, lines.map((line, index) => ({ ...line, struck: strikes[index]!.struck, strikeScore: strikes[index]!.score })));
}
