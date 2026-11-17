import type { Graph, ProblemSpec } from '@mathtwin/core';
import type { ReadDraft } from './schema.js';

export interface PreparedImage { pixels: Uint8ClampedArray; width: number; height: number; source?: string }
export type ReadIssueCode =
  | 'directed_graph' | 'too_many_vertices' | 'missing_weight' | 'nonpositive_weight'
  | 'count_mismatch' | 'unmapped_option' | 'unsupported_task' | 'unreadable_region'
  | 'missing_question' | 'needs_postprocessing' | 'invalid_spec' | 'read_failed';
export interface ReadIssue { code: ReadIssueCode; severity: 'blocking' | 'warning'; item?: string; message: string }
export interface ServerTimings { promptMs: number; predictedMs: number; promptTokens: number; predictedTokens: number }
export interface SentImageSize { originalWidth: number; originalHeight: number; width: number; height: number; maxImageSide?: number }
export interface ReadUsage {
  passes: number; latencyMs: number; engine: string; peakMemoryMb?: number;
  serverTimings?: ServerTimings;
  sentImages?: SentImageSize[];
  finish_reason?: string[];
  lineCount?: number;
  detectionMs?: number;
  recognitionMs?: number;
}
export type ReadUncertainty = NonNullable<ProblemSpec['uncertain']>[number];
export interface ReadOutcome {
  spec: ProblemSpec | null;
  graph: Graph | null;
  graphUncertain: ReadUncertainty[];
  issues: ReadIssue[];
  drafts: ReadDraft[];
  usage: ReadUsage;
}
export interface VisionReader {
  readonly engine: string;
  read(images: PreparedImage[], pass: 'edges' | 'neighbors', signal?: AbortSignal): Promise<{ draft: ReadDraft; usage: ReadUsage }>;
}
export interface TextLine {
  text: string;
  struck?: boolean;
  box?: [number, number, number, number];
  conf: number;
  alternatives: string[];
  region?: 'question' | 'figure' | 'solution' | 'table';
}
export interface TextReader {
  readonly engine: string;
  readLines(images: PreparedImage[], signal?: AbortSignal): Promise<{ lines: TextLine[]; usage: ReadUsage }>;
}
export type NormalizedRead = Pick<ReadOutcome, 'spec' | 'graph' | 'graphUncertain' | 'issues'>;

export type ReadErrorType = 'weight' | 'missing_edge' | 'extra_edge' | 'loop' | 'parallel_edge'
  | 'vertex_label' | 'edge_name' | 'task' | 'question_format' | 'graph';
export interface ReadDifference {
  item: string;
  type: ReadErrorType;
  predicted: unknown;
  expected: unknown;
  tags?: ReadErrorType[];
}
export interface ReadComparison {
  completeCorrect: boolean;
  graphCorrect: boolean;
  fullyFlagged: boolean;
  silentError: boolean;
  graphSilentError: boolean;
  coverage: { precise: number; coarse: number; none: number };
  extraFlags: number;
  differences: ReadDifference[];
  errorCounts: Partial<Record<ReadErrorType, number>>;
}
