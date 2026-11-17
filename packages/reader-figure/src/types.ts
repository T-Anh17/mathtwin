import type { PreparedImage, QuestionDraft, ReadDraft } from '@mathtwin/reader';
/** Input-image pixels; right/bottom exclusive. */
export type Box = [number, number, number, number];
export type Point = [number, number];
export type GlyphRole = 'label' | 'weight' | 'name';
export interface GlyphCandidate { text: string; probability: number }
export interface GlyphRequest { image: PreparedImage; box: Box; role: GlyphRole }
export interface GlyphReader {
  readonly engine: string;
  readGlyph(request: GlyphRequest, signal?: AbortSignal): Promise<GlyphCandidate[]>;
}
export interface FigureOptions { glyphReader: GlyphReader; figureBox?: Box; question?: QuestionDraft; glyphThreshold?: number }
export interface BinaryImage { width: number; height: number; ink: Uint8Array; gray: Float32Array }
export interface Component { pixels: number[]; box: Box; attached?: boolean }
export interface FigureVertex { center: Point; rx: number; ry: number; score: number; kind: 'ring' | 'dot' | 'label' }
export interface FigurePath { points: Point[]; u: number; v: number; score: number; uScore: number; vScore: number; uAlternatives: number[]; vAlternatives: number[] }
/** Observation in original image pixels; subclasses used by the dev evaluator collect this. */
export interface FigureObservation { box: Box; vertices: FigureVertex[]; labels: string[]; paths: FigurePath[]; edges: ReadDraft['edges'] }
