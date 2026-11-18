import type { ErrorCode, Highlight } from '@mathtwin/core';
import type { WorkQuestion } from '@mathtwin/work';

export type ScreenState = 'du-lieu' | 'dang-tai' | 'rong' | 'loi';
export type Verdict = 'dung' | 'sai' | 'can_xac_nhan' | 'khong_du_can_cu';
export type Tab = 'home' | 'history' | 'settings';
export interface ImageRegion { left: number; top: number; width: number; height: number }
export interface CropData { x: number; y: number; zoom: number; height: number; region: ImageRegion }
export interface HistoryItem { id: string; verdict: Verdict; title: string; meta: string; status?: string }
export interface ReaderStatus { ready: boolean; size: string }
export interface GraphDrawing {
  edges: readonly { x1: number; y1: number; x2: number; y2: number; uncertain?: boolean }[];
  weights: readonly { x: number; y: number; value: string; uncertainX?: number }[];
  vertices: readonly { x: number; y: number; label: string }[];
}
export interface ConfirmationData {
  current: number; total: number; question: string; explanation: string;
  options: readonly number[]; selected: number; image: string; crop: CropData; graph: GraphDrawing;
}
export type GraphHighlight = Highlight;
export interface ErrorMark { page: number; box: [number, number, number, number] }
interface ResultBase { title: string; message: string; notes: string[]; workSource?: 'photo' | 'manual' }
export interface WrongResult extends ResultBase {
  verdict: 'sai'; firstErrorStep: number; errorCode: ErrorCode; errorType: string;
  reason: string; correction?: string; nextStep: string; previousSteps: string;
  errorMarks: ErrorMark[]; graphHighlight: GraphHighlight; readingCheck?: WorkQuestion;
}
export interface CorrectResult extends ResultBase { verdict: 'dung'; graphHighlight: GraphHighlight }
export interface InsufficientResult extends ResultBase { verdict: 'khong_du_can_cu'; issues: string[] }
export interface PendingResult extends ResultBase { verdict: 'can_xac_nhan'; question?: WorkQuestion; requiresReview: boolean }
export type ResultData = WrongResult | CorrectResult | InsufficientResult | PendingResult;

// Product actions are integration points only. UI-1 supplies no-op handlers.
export interface ProductActions {
  onCapture: () => void; onDownloadReader: () => void; onManualInput: () => void;
  onChooseOption: (value: number) => void; onOtherNumber: () => void;
  onSkip: () => void; onConfirm: () => void; onEdit: () => void;
  onRetake: () => void; onAddPage: () => void; onRegrade: () => void;
  onHint: () => void; onSolution: () => void; onViewPage: () => void; onCancel: () => void;
}
