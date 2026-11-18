import type { Claim, ClaimBody, GradeResult, ProblemSpec, Task } from '@mathtwin/core';
import type { TextLine } from '@mathtwin/reader';

export interface WorkLine extends TextLine {
  /** An ink band without a transcription; cleared only by an explicit user answer. */
  missing?: boolean;
  page: number; index: number; skipped?: boolean;
  /** Pixel cancellation evidence; user struck answers clear this score. */
  strikeScore?: number;
}
export interface WorkVocabulary {
  vertexLabels: string[]; edgeNames: string[]; task: Task['type'];
  questionFormat: ProblemSpec['questionFormat']; statementIds: string[]; questionText: string[];
}
export interface ParsedStep {
  claim: Claim; lines: number[]; page: number; box?: [number, number, number, number];
  candidates: ClaimBody[]; origin: 'text' | 'table' | 'inferred';
  /** Transcriptions aligned with candidates, for reading question options. */
  candidateTexts?: string[];
}
export type WorkIssueCode = 'no_solution_lines' | 'unparsed_line' | 'ambiguous_line' | 'unknown_label'
  | 'struck_uncertain' | 'table_unrecognized' | 'figure_annotations' | 'page_order' | 'read_failed';
export interface WorkIssue { code: WorkIssueCode; severity: 'blocking' | 'warning'; lines?: number[]; message: string }
export interface ParsedWork {
  /** Selected transcriptions, also retained for lines without a parsed step. */
  sourceLines?: WorkLine[];
  steps: ParsedStep[];
  ignored: { line: number; reason: 'struck' | 'question' | 'figure' | 'prose' | 'empty' }[];
  unchecked: number[]; issues: WorkIssue[];
}
export interface WorkQuestion {
  reason?: 'missing';
  kind: 'reading' | 'unparsed' | 'struck'; lines: number[]; page: number;
  box?: [number, number, number, number]; shownText: string; options: string[];
}
export interface WorkGrade {
  result: GradeResult; firstErrorLines?: number[]; questions: WorkQuestion[]; readingCheck?: WorkQuestion;
}
export type WorkAnswer = { line: number; text: string } | { line: number; struck: boolean } | { line: number; skip: true };
export interface WorkTruth {
  claims: Claim[]; lineOf: Record<string, number[]>;
  expected: { verdict: GradeResult['verdict']; firstErrorStep?: number | null; errorCode?: GradeResult['errorCode'] | null };
  /** Optional source transcription, needed to distinguish reading errors from grading errors. */
  lines?: WorkLine[];
  /** Required in generated synthetic-hw/work-text truth; optional for real annotations. */
  prose?: number[];
}
export interface WorkComparison {
  completeCorrect: boolean;
  claims: { matched: number; predicted: number; reference: number; precision: number; recall: number };
  sourceLines: { correct: number; matched: number; accuracy: number };
  verdictCorrect: boolean | null; confirmation: boolean;
  firstErrorCorrect: boolean | null;
  silentFalseCorrect: boolean; silentFalseWrongParse: boolean; silentFalseWrongReading: boolean; readingMismatch: boolean | null;
  proseAsUnchecked: number;
  contentAsProse: { lowConfidence: number; highConfidence: number };
  struckAsContent: number; insufficient: boolean; insufficientReasons: string[]; questions: number;
}
