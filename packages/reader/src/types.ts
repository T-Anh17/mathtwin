import type { Graph, ProblemSpec } from '@mathtwin/core';
import type { ReadDraft } from './schema.js';

export interface PreparedImage { pixels: Uint8ClampedArray; width: number; height: number; source?: string }
export type ReadIssueCode =
  | 'directed_graph' | 'too_many_vertices' | 'missing_weight' | 'nonpositive_weight'
  | 'count_mismatch' | 'unmapped_option' | 'unsupported_task' | 'unreadable_region'
  | 'missing_question' | 'needs_postprocessing' | 'invalid_spec' | 'read_failed';
export interface ReadIssue { code: ReadIssueCode; severity: 'blocking' | 'warning'; item?: string; message: string }
export interface ReadUsage { passes: number; latencyMs: number; engine: string; peakMemoryMb?: number }
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
export type NormalizedRead = Pick<ReadOutcome, 'spec' | 'graph' | 'graphUncertain' | 'issues'>;
