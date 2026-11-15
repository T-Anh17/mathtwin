import { ReadDraftSchema } from '@mathtwin/reader';
import type { ReadDraft, ServerTimings, TextLine } from '@mathtwin/reader';
import { failed } from './errors.js';
import { jsonValues } from './json-spans.js';
import type { ValueSpan } from './json-spans.js';

export interface TokenAlternative { bytes: Uint8Array; probability: number }
export interface ScoredToken { start: number; end: number; probability: number; alternatives: TokenAlternative[] }
export interface Completion { text: string; bytes: Uint8Array; tokens: ScoredToken[]; timings?: ServerTimings }
export function object(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return failed('invalid_json');
  return value as Record<string, unknown>;
}
function byteArray(value: unknown): Uint8Array {
  if (!Array.isArray(value) || !value.every((n: unknown) => typeof n === 'number' && Number.isInteger(n) && n >= 0 && n <= 255)) return failed('missing_probs');
  return Uint8Array.from(value as number[]);
}
function scoreObject(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return failed('missing_probs');
  return value as Record<string, unknown>;
}
function probability(logprob: unknown): number {
  if (typeof logprob !== 'number' || !Number.isFinite(logprob) || logprob > 0) return failed('missing_probs');
  return Math.exp(logprob);
}
function equal(a: Uint8Array, b: Uint8Array): boolean { return a.length === b.length && a.every((v, i) => v === b[i]); }
export function parseCompletion(raw: unknown): Completion {
  const body = object(raw);
  if (!Array.isArray(body.choices) || body.choices.length !== 1) return failed('invalid_json');
  const choice = object(body.choices[0]);
  if (choice.finish_reason !== 'stop') return failed('truncated');
  const text = object(choice.message).content;
  if (typeof text !== 'string' || !text.trim()) return failed('invalid_json');
  if (!choice.logprobs || typeof choice.logprobs !== 'object') return failed('missing_probs');
  const scores = scoreObject(choice.logprobs).content;
  if (!Array.isArray(scores) || !scores.length) return failed('missing_probs');
  const tokens: ScoredToken[] = [];
  const chunks: Uint8Array[] = [];
  let offset = 0;
  for (const score of scores as unknown[]) {
    const t = scoreObject(score), bytes = byteArray(t.bytes), p = probability(t.logprob);
    if ('prob' in t || 'top_probs' in t) return failed('missing_probs');
    const alternatives: TokenAlternative[] = [];
    if (t.top_logprobs !== undefined) {
      if (!Array.isArray(t.top_logprobs)) return failed('missing_probs');
      for (const top of t.top_logprobs as unknown[]) {
        const a = scoreObject(top);
        alternatives.push({ bytes: byteArray(a.bytes), probability: probability(a.logprob) });
      }
    }
    if (bytes.length) {
      tokens.push({ start: offset, end: offset + bytes.length, probability: p, alternatives });
      chunks.push(bytes); offset += bytes.length;
    }
  }
  const bytes = new Uint8Array(offset); let cursor = 0;
  for (const chunk of chunks) { bytes.set(chunk, cursor); cursor += chunk.length; }
  if (!tokens.length || !equal(bytes, new TextEncoder().encode(text))) return failed('missing_probs');
  const result: Completion = { text, bytes, tokens };
  if (body.timings !== undefined) {
    const t = object(body.timings);
    if (![t.prompt_ms, t.predicted_ms].every((n) => typeof n === 'number' && Number.isFinite(n) && n >= 0)
      || ![t.prompt_n, t.predicted_n].every((n) => typeof n === 'number' && Number.isSafeInteger(n) && n >= 0)) return failed('invalid_json');
    result.timings = { promptMs: t.prompt_ms as number, predictedMs: t.predicted_ms as number,
      promptTokens: t.prompt_n as number, predictedTokens: t.predicted_n as number };
  }
  return result;
}

function covering(c: Completion, span: Pick<ValueSpan, 'start' | 'end'>): ScoredToken[] {
  return c.tokens.filter((t) => t.start < span.end && t.end > span.start);
}
export function valueConfidence(c: Completion, span: Pick<ValueSpan, 'start' | 'end'>): number {
  if (span.start === span.end) return 0; // No textual evidence in an empty value.
  const scores = covering(c, span);
  if (!scores.length) return failed('missing_probs');
  return Math.min(...scores.map((t) => t.probability));
}

/** Replace ONE token, requiring any part outside this value to stay byte-identical. */
function replacements(c: Completion, span: Pick<ValueSpan, 'start' | 'end'>, threshold: number): Uint8Array[] {
  const results: Uint8Array[] = [];
  for (const t of covering(c, span)) for (const alt of t.alternatives) {
    if (alt.probability + Number.EPSILON < threshold || equal(alt.bytes, c.bytes.subarray(t.start, t.end))) continue;
    const prefixLength = Math.max(0, span.start - t.start), suffixLength = Math.max(0, t.end - span.end);
    if (alt.bytes.length < prefixLength + suffixLength
      || !equal(alt.bytes.subarray(0, prefixLength), c.bytes.subarray(t.start, t.start + prefixLength))
      || !equal(alt.bytes.subarray(alt.bytes.length - suffixLength), c.bytes.subarray(t.end - suffixLength, t.end))) continue;
    const before = c.bytes.subarray(span.start, Math.max(span.start, t.start));
    const middle = alt.bytes.subarray(prefixLength, alt.bytes.length - suffixLength);
    const after = c.bytes.subarray(Math.min(span.end, t.end), span.end);
    const result = new Uint8Array(before.length + middle.length + after.length);
    result.set(before); result.set(middle, before.length); result.set(after, before.length + middle.length);
    results.push(result);
  }
  return results;
}
function alternatives(c: Completion, span: ValueSpan, threshold: number): unknown[] {
  const values: unknown[] = [];
  for (const bytes of replacements(c, span, threshold)) {
    try {
      const raw = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
      values.push(JSON.parse(span.kind === 'string' ? `"${raw}"` : raw) as unknown);
    } catch { /* Invalid UTF-8 or invalid scalar after one-token substitution: discard. */ }
  }
  return values;
}
function strings(values: unknown[], selected: string): string[] {
  return [...new Set(values.filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
    .map((v) => v.normalize('NFC')).filter((v) => v !== selected.normalize('NFC')))];
}
function thresholdValue(threshold: number): void {
  if (!Number.isFinite(threshold) || threshold < 0 || threshold > 1) throw new Error('Invalid top-k threshold.');
}
export function graphResult(c: Completion, threshold = 0.1, images: { width: number; height: number }[] = []): ReadDraft {
  thresholdValue(threshold);
  const { value, spans } = jsonValues(c.text);
  const input = object(value);
  if (Array.isArray(input.vertices)) input.vertices = (input.vertices as unknown[]).map((v) => {
    const vertex = { ...object(v) };
    if (!normalizedBox(vertex.box, 1, 1)) delete vertex.box;
    return vertex;
  });
  const parsed = ReadDraftSchema.safeParse(input);
  if (!parsed.success) return failed('invalid_json');
  const span = (path: string): ValueSpan => spans.get(path) ?? failed('invalid_json');
  const conf = (...paths: string[]): number => Math.min(...paths.map((path) => valueConfidence(c, span(path))));
  const fromString = (path: string, selected: string): string[] => strings(alternatives(c, span(path), threshold), selected);
  const d = parsed.data;
  return { ...d,
    vertices: d.vertices.map((v, i) => {
      const box = images.length === 1 ? normalizedBox(v.box, images[0]!.width, images[0]!.height) : undefined;
      const { box: _box, ...rest } = v;
      return { ...rest, label: v.label.normalize('NFC'), conf: conf(`/vertices/${i}/label`),
        alternatives: fromString(`/vertices/${i}/label`, v.label), ...(box ? { box } : {}) };
    }),
    edges: d.edges.map((e, i) => ({ ...e,
      uConf: conf(`/edges/${i}/u`), vConf: conf(`/edges/${i}/v`), wConf: conf(`/edges/${i}/w`),
      conf: conf(...(e.name === null ? ['u', 'v'] : ['u', 'v', 'name']).map((k) => `/edges/${i}/${k}`)),
      wAlternatives: [...new Set([...e.wAlternatives, ...alternatives(c, span(`/edges/${i}/w`), threshold)
        .filter((v): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0)].filter((n) => n !== e.w))],
      uAlternatives: fromString(`/edges/${i}/u`, e.u), vAlternatives: fromString(`/edges/${i}/v`, e.v),
    })),
    question: d.question === null ? null : { ...d.question,
      conf: conf('/question/rawText', '/question/format', ...[...spans.keys()].filter((p) => p.startsWith('/question/task/'))),
      rawText: d.question.rawText.normalize('NFC'),
      options: d.question.options.map((o, i) => ({ ...o, text: o.text.normalize('NFC'), conf: conf(`/question/options/${i}/text`,
        ...[...spans.keys()].filter((p) => p.startsWith(`/question/options/${i}/check/`))) })),
    },
  };
}

/** Qwen3-VL and Paddle LOC use normalized 0..1000 positions; invalid boxes are simply omitted. */
export function normalizedBox(raw: unknown, width: number, height: number): [number, number, number, number] | undefined {
  if (!Array.isArray(raw) || raw.length !== 4 || !raw.every((n: unknown) => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 1000)) return;
  const [x1, y1, x2, y2] = raw as [number, number, number, number];
  if (x2 <= x1 || y2 <= y1) return;
  return [x1 * width / 1000, y1 * height / 1000, x2 * width / 1000, y2 * height / 1000];
}
export function lineResult(c: Completion, width: number, height: number, threshold = 0.1): TextLine[] {
  thresholdValue(threshold);
  const { value, spans } = jsonValues(c.text), data = object(value);
  if (Object.keys(data).some((k) => k !== 'lines') || !Array.isArray(data.lines) || data.lines.length === 0) return failed('invalid_json');
  return (data.lines as unknown[]).map((entry, i) => {
    const l = object(entry), s = spans.get(`/lines/${i}/text`) ?? failed('invalid_json');
    if (Object.keys(l).some((k) => !['text', 'box', 'region'].includes(k)) || typeof l.text !== 'string' || !l.text.trim()) return failed('invalid_json');
    const line: TextLine = { text: l.text.normalize('NFC'), conf: valueConfidence(c, s), alternatives: strings(alternatives(c, s, threshold), l.text) };
    if (l.region !== undefined) {
      if (l.region !== 'question' && l.region !== 'figure' && l.region !== 'solution' && l.region !== 'table') return failed('invalid_json');
      line.region = l.region;
    }
    const box = normalizedBox(l.box, width, height);
    if (box) line.box = box;
    return line;
  });
}
export function plainLines(c: Completion, threshold = 0.1): TextLine[] {
  thresholdValue(threshold);
  const encoder = new TextEncoder(); let offset = 0;
  const lines: TextLine[] = [];
  for (const match of c.text.matchAll(/([^\r\n]*)(\r\n|\r|\n|$)/g)) {
    const text = match[1]!, length = encoder.encode(text).length;
    if (text.trim()) {
      const span = { start: offset, end: offset + length };
      const candidates: string[] = [];
      for (const bytes of replacements(c, span, threshold)) {
        try { const v = new TextDecoder('utf-8', { fatal: true }).decode(bytes); if (!/[\r\n]/.test(v)) candidates.push(v); } catch { /* Invalid UTF-8. */ }
      }
      lines.push({ text: text.normalize('NFC'), conf: valueConfidence(c, span), alternatives: strings(candidates, text) });
    }
    offset += length + encoder.encode(match[2]!).length;
  }
  if (!lines.length) return failed('invalid_json');
  return lines;
}

/** Paddle's documented text/LOC blocks and legacy text + eight LOC-token representation. */
export function spottingLines(c: Completion, width: number, height: number, threshold = 0.1): TextLine[] {
  thresholdValue(threshold);
  const lines: TextLine[] = [];
  const encoder = new TextEncoder();
  const append = (text: string, charStart: number, loc: string): void => {
    if (!text.trim()) return;
    const start = encoder.encode(c.text.slice(0, charStart)).length;
    const end = start + encoder.encode(text).length;
    const partial: Completion = { text, bytes: c.bytes.subarray(start, end),
      tokens: covering(c, { start, end }).map((t) => ({ ...t, start: t.start - start, end: t.end - start })) };
    // Compute candidates against the original span so a token crossing a LOC/text boundary is safe.
    const candidates: string[] = [];
    for (const bytes of replacements(c, { start, end }, threshold)) {
      try { candidates.push(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); } catch { /* Invalid UTF-8. */ }
    }
    const values = [...loc.matchAll(/<\|LOC_(\d+)\|>/g)].map((m) => Number(m[1]));
    const xs = values.filter((_, i) => i % 2 === 0), ys = values.filter((_, i) => i % 2 === 1);
    const box = values.length === 8 && values.every((n) => n >= 0 && n <= 1000)
      ? normalizedBox([Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)], width, height) : undefined;
    lines.push({ text: text.normalize('NFC'), conf: valueConfidence(partial, { start: 0, end: partial.bytes.length }),
      alternatives: strings(candidates, text), ...(box ? { box } : {}) });
  };
  const annotated = [...c.text.matchAll(/<\|TEXT_START\|>([\s\S]*?)<\|TEXT_END\|>\s*<\|LOC_BEGIN\|>([\s\S]*?)<\|LOC_END\|>/g)];
  if (annotated.length) {
    for (const m of annotated) append(m[1]!, m.index + '<|TEXT_START|>'.length, m[2]!);
    if (c.text.replace(/<\|TEXT_START\|>[\s\S]*?<\|TEXT_END\|>\s*<\|LOC_BEGIN\|>[\s\S]*?<\|LOC_END\|>/g, '').trim()) return failed('invalid_json');
  } else {
    let end = 0;
    for (const m of c.text.matchAll(/([^<>]+?)((?:<\|LOC_\d+\|>){8})/g)) {
      if (c.text.slice(end, m.index).trim()) return failed('invalid_json');
      append(m[1]!, m.index, m[2]!); end = m.index + m[0].length;
    }
    if (c.text.slice(end).trim()) return failed('invalid_json');
  }
  if (!lines.length) return failed('invalid_json');
  return lines;
}
