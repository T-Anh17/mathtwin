import type { WorkQuestion } from '@mathtwin/work';

export const workVi = {
  previewLine: 'Đường đi ngắn nhất từ A đến C dài 5.',
  capture: 'Ảnh bài làm', manual: 'Gõ bài làm', manualHint: 'Mỗi dòng một bước, giữ đúng thứ tự em đã viết.',
  submit: 'Đọc các bước đã gõ', add: 'Chụp thêm trang', choose: 'Chọn ảnh bài làm', read: 'Đọc bài làm',
  remove: 'Xóa trang', up: 'Đưa trang lên trước', down: 'Đưa trang xuống sau',
  page: (page: number) => `Trang bài làm ${page + 1}`,
  progress: (page: number, total: number) => `Đang đọc trang bài làm ${page + 1}/${total}`,
  missingReader: 'Bộ đọc B chưa tải. Tải trong Cài đặt hoặc gõ bài làm.',
  cancel: 'Hủy đọc', resume: 'Tiếp tục đọc', failed: 'Phần đã đọc vẫn được lưu. Hãy thử lại hoặc gõ bài làm.',
  region: 'Chưa xác định được vùng bài làm. Kéo trên ảnh để khoanh phần lời giải, gồm cả các dòng máy có thể bỏ sót.',
  regionLabel: 'Khoanh vùng bài làm trên ảnh', applyRegion: 'Dùng vùng bài làm này',
  suggestedRegion: 'Kiểm tra khung vùng bài làm. Nếu thiếu dòng, kéo trên ảnh hoặc chỉnh các mép để bao đủ bài làm.',
  confirmRegion: 'Đúng vùng này', ignored: 'Máy bỏ qua vì coi là đề/hình', restore: 'Đây là bài làm',
  retryPage: 'Đọc lại trang này', manualPage: 'Gõ tay trang này',
  failedPage: (page: number) => `Không đọc được trang ${page + 1}. Các trang khác vẫn được giữ.`,
  missingLineCheckUnavailable: 'Máy không kiểm được dòng bị sót trên trang này',
  left: 'Trái (%)', top: 'Trên (%)', right: 'Phải (%)', bottom: 'Dưới (%)',
  nothing: 'Không có gì ở đây', uncertain: 'chưa chắc', ask: 'Kiểm tra chỗ tiếp theo', ack: 'Đúng như bài em viết',
  solution: 'Bài làm', questionOrFigure: 'Đề, hình',
  review: 'Xem các dòng đã đọc và vùng ảnh trước khi xác nhận.',
  status: (q: WorkQuestion) => q.reason === 'missing' ? 'Có thể sót dòng.' : q.kind === 'struck' ? 'Dòng này có thể bị gạch.'
    : q.kind === 'region' ? 'Dòng này là bài làm hay đề/hình?' : q.kind === 'reading' ? 'Máy đọc chưa chắc.' : 'Máy chưa hiểu dòng này.',
} as const;
