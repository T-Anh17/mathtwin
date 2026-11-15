import image from './assets/bai-lam.png';
import { productVi as m } from './product-messages.vi.js';
import type { ConfirmationData, GraphDrawing, HistoryItem, ReaderStatus, WrongResult, CorrectResult, InsufficientResult, PendingResult, ProductActions } from './product-types.js';

// DỮ LIỆU MẪU UI-1: chỉ để dựng giao diện, không phải kết quả đọc ảnh / giải / chấm thật.
export const sampleReader: ReaderStatus = { ready: true, size: m.readerSize };
const verdicts = ['sai', 'dung', 'can_xac_nhan', 'khong_du_can_cu'] as const;
export const sampleHistory: HistoryItem[] = m.historyItems.map((item, index) => ({
  ...item, id: `sample-${index + 1}`, verdict: verdicts[index]!,
}));
export const sampleGraph: GraphDrawing = {
  edges: [
    { x1: 110, y1: 22, x2: 30, y2: 100 }, { x1: 110, y1: 22, x2: 190, y2: 100 },
    { x1: 110, y1: 22, x2: 110, y2: 178 }, { x1: 30, y1: 100, x2: 190, y2: 100 },
    { x1: 30, y1: 100, x2: 110, y2: 178 }, { x1: 190, y1: 100, x2: 110, y2: 178, uncertain: true },
  ],
  weights: [{ x: 62, y: 52, value: '1' }, { x: 158, y: 52, value: '1' }, { x: 120, y: 70, value: '1' },
    { x: 150, y: 92, value: '1' }, { x: 62, y: 148, value: '1' }, { x: 158, y: 148, value: '1', uncertainX: 162 }],
  vertices: [{ x: 110, y: 22, label: 'A' }, { x: 30, y: 100, label: 'D' }, { x: 190, y: 100, label: 'B' }, { x: 110, y: 178, label: 'C' }],
};
export const sampleConfirmation: ConfirmationData = {
  current: 1, total: 2, question: m.question, explanation: m.numberExplanation,
  options: [1, 7], selected: 1, image, graph: sampleGraph,
  crop: { x: 72, y: 41, zoom: 330, height: 150, region: { left: 40, top: 30, width: 22, height: 40 } },
};
export const sampleWrong: WrongResult = {
  verdict: 'sai', title: m.resultTitle, image, firstErrorStep: 4, studentValue: 9, correctValue: 8,
  summary: m.wrongSummary, calculation: m.calculation, errorType: m.arithmeticError,
  reason: m.errorReason, previousSteps: m.previousSteps,
  crop: { x: 6, y: 74, zoom: 250, height: 150, region: { left: 9, top: 34, width: 66, height: 30 } },
};
export const sampleCorrect: CorrectResult = { verdict: 'dung', title: m.resultTitle, image, length: 8, note: m.correctNote };
export const sampleInsufficient: InsufficientResult = { verdict: 'khong_du_can_cu', title: m.resultTitle, image, reason: m.insufficientReason };
export const samplePending: PendingResult = { verdict: 'can_xac_nhan', title: m.resultTitle, image, confirmation: sampleConfirmation };
export const emptyProductActions: ProductActions = {
  onCapture() {}, onDownloadReader() {}, onManualInput() {}, onChooseOption(_value) {}, onOtherNumber() {},
  onSkip() {}, onConfirm() {}, onEdit() {}, onRetake() {}, onAddPage() {}, onRegrade() {},
  onHint() {}, onSolution() {}, onViewPage() {}, onCancel() {},
};
