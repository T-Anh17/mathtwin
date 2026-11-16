import type { TextLine } from '@mathtwin/reader';

/** Structural subset of ORT. The host owns the runtime and execution provider. */
export interface OrtTensor {
  readonly data: unknown;
  readonly dims: readonly number[];
  readonly type: string;
  dispose(): void;
}
export interface OrtSession {
  readonly inputNames: readonly string[];
  readonly outputNames: readonly string[];
  run(feeds: Record<string, OrtTensor>): Promise<Record<string, OrtTensor>>;
  release(): Promise<void>;
}
export interface OrtLike {
  createSession(model: string | Uint8Array): Promise<OrtSession>;
  tensor(type: 'float32', data: Float32Array, dims: readonly number[]): OrtTensor;
  tensor(type: 'int64', data: BigInt64Array, dims: readonly number[]): OrtTensor;
}
export interface VietOcrConfig {
  vocab: string; image_height: number; image_min_width: number; image_max_width: number;
  max_seq_length: number; sos: number; eos: number; offset: number;
}
export type Box = [number, number, number, number]; // pixels, exclusive right/bottom
export interface OcrTextLine extends TextLine {
  charConf: number[]; logProbs: number[];
  truncated?: boolean;
  truncationReason?: 'decode_limit' | 'invalid_output';
}
export interface LineMergeOptions { maxHorizontalGapRatio?: number }
export interface OcrModels { detector: string | Uint8Array; encoder: string | Uint8Array; decoder: string | Uint8Array }
