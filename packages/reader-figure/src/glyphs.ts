import type { PreparedImage } from '@mathtwin/reader';
import type { Box, GlyphCandidate, GlyphReader, GlyphRequest, GlyphRole } from './types.js';
export function allowedGlyph(text: string, role: GlyphRole): boolean {
  return role === 'weight' ? /^[1-9]\d*$/.test(text) && Number.isSafeInteger(Number(text))
    : role === 'name' ? /^[abm]$/.test(text) : /^(?:\p{L}|[vV][0-9₀₁₂₃₄₅₆₇₈₉]+)$/u.test(text);
}
export function rankGlyphs(candidates: GlyphCandidate[], role: GlyphRole): GlyphCandidate[] {
  const seen = new Set<string>();
  return candidates.map(c => ({ text: c.text.trim().normalize('NFC'), probability: c.probability }))
    .filter(c => Number.isFinite(c.probability) && c.probability >= 0 && c.probability <= 1 && allowedGlyph(c.text, role))
    .sort((a, b) => b.probability - a.probability || (a.text < b.text ? -1 : a.text > b.text ? 1 : 0))
    .filter(c => { if (seen.has(c.text)) return false; seen.add(c.text); return true; }).slice(0, 3);
}
/** Host-supplied direct line recognizer. Probabilities must be measured for each candidate. */
export class CropGlyphReader implements GlyphReader {
  constructor(readonly engine: string, private readonly recognize: (image: PreparedImage, role: GlyphRole, signal?: AbortSignal) => Promise<GlyphCandidate[]>) {}
  async readGlyph(request: GlyphRequest, signal?: AbortSignal): Promise<GlyphCandidate[]> {
    signal?.throwIfAborted();
    const result = rankGlyphs(await this.recognize(request.image, request.role, signal), request.role);
    signal?.throwIfAborted(); return result;
  }
}
export interface OracleGlyph { box: Box; text: string; role: GlyphRole }
/** Benchmark only: lookup a CV-proposed crop, never seed geometry or propose missing crops. */
export class OracleGlyphReader implements GlyphReader {
  readonly engine = 'oracle';
  constructor(private readonly glyphs: readonly OracleGlyph[]) {}
  async readGlyph(request: GlyphRequest, signal?: AbortSignal): Promise<GlyphCandidate[]> {
    signal?.throwIfAborted();
    const b = request.box, area = (b[2] - b[0]) * (b[3] - b[1]);
    const matches = this.glyphs.filter(g => g.role === request.role).map(g => {
      const a = g.box, truthArea = (a[2] - a[0]) * (a[3] - a[1]);
      const overlap = Math.max(0, Math.min(a[2], b[2]) - Math.max(a[0], b[0])) * Math.max(0, Math.min(a[3], b[3]) - Math.max(a[1], b[1]));
      const iou = overlap / (area + truthArea - overlap || 1);
      const scale = a[3] - a[1];
      const distance = Math.hypot((a[0] + a[2] - b[0] - b[2]) / 2, (a[1] + a[3] - b[1] - b[3]) / 2);
      // A whole loop/edge component is not a glyph crop just because a label
      // lies near one end. Keep generous tolerances for shifted/partial letters,
      // but measure displacement against the annotated text size, not the crop.
      const plausibleSize = b[3] - b[1] <= scale * 2.5 && b[2] - b[0] <= (a[2] - a[0]) * 3;
      return { g, valid: plausibleSize && (iou >= 0.05 || distance <= scale * 0.75), score: iou + 0.3 / (1 + distance / scale) };
    }).filter(g => g.valid).sort((a, b) => b.score - a.score);
    if (!matches[0] || (matches[1] && matches[1].score >= matches[0].score * 0.8)) return [];
    return [{ text: matches[0]!.g.text, probability: 1 }];
  }
}

/** C host can be the shared VietOcrReader with either Node ORT or WebView ORT. */
export class VietOcrGlyphReader extends CropGlyphReader {
  constructor(host: { readCrop(image: PreparedImage, signal?: AbortSignal): Promise<GlyphCandidate[]> }) {
    super('c', (image, _role, signal) => host.readCrop(image, signal));
  }
}
/** B host owns llama-server transport and lifecycle; CV never imports a platform API. */
export class LlamaGlyphReader extends CropGlyphReader {
  constructor(host: { readCrop(image: PreparedImage, signal?: AbortSignal, role?: GlyphRole): Promise<GlyphCandidate[]> }) {
    super('b', (image, role, signal) => host.readCrop(image, signal, role));
  }
}
