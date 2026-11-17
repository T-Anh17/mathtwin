import type { DatasetLocation } from './contracts.js';

export const vi = {
  title: 'MathTwin', subtitle: 'Đọc ảnh trên điện thoại', models: 'Model', bench: 'Đo',
  a: 'A · PaddleOCR-VL-1.5', b: 'B · Qwen3-VL-2B', d: 'D · Hình đồ thị (thử nghiệm, không cần model)',
  storage: 'Dung lượng trống', ram: 'RAM máy', download: 'Tải', importModel: 'Kiểm tra file adb push',
  ready: 'Đã kiểm tra', missing: 'Chưa đủ file', cancelDownload: 'Dừng tải',
  downloadNote: 'Bấm Tải để xác nhận tải model qua mạng. Ảnh được xử lý trên máy.',
  lowRam: 'RAM thấp hơn ngưỡng cấu hình. Máy có thể bị hệ điều hành dừng model khi thiếu bộ nhớ.',
  allowLowRam: 'Tôi đã đọc cảnh báo và muốn thử trên máy RAM thấp', minRam: 'Ngưỡng RAM (GB)', threads: 'Luồng CPU',
  passes: 'Số lượt', mode: 'Chế độ', graph: 'Đồ thị', lines: 'Dòng chữ',
  maxImageSide: 'Cạnh ảnh tối đa', readTimeout: 'Thời gian chờ mỗi lượt (giây)', maxTokens: 'Số token tối đa mỗi lượt', dry: 'Chống lặp DRY', enabled: 'Bật', disabled: 'Tắt',
  dry_multiplier: 'Hệ số DRY', dry_base: 'Cơ số DRY', dry_allowed_length: 'Độ dài được phép lặp', dry_penalty_last_n: 'Số token xét DRY (-1: toàn bộ)',
  camera: 'Chụp ảnh', gallery: 'Chọn ảnh', dataset: 'Nhập bộ đo', datasetName: 'Tên thư mục bộ đo',
  datasetSummary: (name: string, count: number, location: DatasetLocation): string =>
    `${name}: ${count} · ${location === 'internal' ? 'Bộ nhớ trong (internal)' : 'Bộ nhớ ngoài (external)'}`,
  webViewCamera: 'Chụp WebView (phụ)', backgroundIdle: 'Dừng khi rảnh ở nền (phút)', cpuVariant: 'Biến thể CPU',
  cancel: 'Hủy', clear: 'Xóa ảnh khỏi bộ nhớ', settings: 'Cấu hình đo', results: 'Kết quả',
  showImage: 'Xem ảnh và chỗ gắn cờ', hideImage: 'Đóng ảnh',
  run: 'Bắt đầu đo', stop: 'Dừng model', export: 'Xuất kết quả',
  empty: 'Chọn ảnh hoặc nhập bộ đo để bắt đầu.', queued: 'Ảnh đã chọn',
  running: 'Đang xử lý trên máy…', done: 'Đã đo xong.', saved: 'Đã lưu kết quả tại',
  textOnly: 'Model A chỉ đọc chữ; chế độ đồ thị trả lỗi text_only.',
  firstLoad: 'Nạp model', warm: 'Dùng model đã nạp', total: 'Tổng thời gian', prompt: 'Xử lý prompt', predicted: 'Sinh kết quả', peak: 'RAM đỉnh server',
  verify: 'Kiểm tra file model',
  flags: 'Chỗ cần xác nhận', noBox: 'Vị trí chưa xác định: xem phần kết quả bên dưới.',
  noTimings: 'Server không trả timings.', noMemory: 'Không đọc được RAM server.',
  linePass: 'Lượt', privacy: 'Ảnh chụp từ camera hệ thống được đọc vào bộ nhớ rồi xóa file tạm; không lưu thư viện. File xuất không chứa ảnh.',
  nativeOnly: 'Mở APK Android để tải model và đo. Trang web chỉ dùng xem giao diện.',
  datasetReasons: {
    ids_missing: 'Không tìm thấy file ids.json.',
    ids_too_large: 'File ids.json vượt quá 1 MB.',
    ids_parse: 'Không đọc hoặc phân tích được ids.json.',
    entry_count: 'Bộ đo phải có từ 1 đến 1000 mục.',
    entry_name: 'Tên bộ đo, id hoặc tên file ảnh không hợp lệ.',
    duplicate_id: 'Id ảnh bị trùng.',
    image_missing: 'Không tìm thấy file ảnh.',
    image_too_large: 'File ảnh vượt quá 10 MB.',
  } as Record<string, string>,
  errors: {
    read_failed: 'Không đọc được ảnh.', text_only: 'Model này chỉ đọc chữ.', busy: 'Đang có tác vụ khác.',
    aborted: 'Đã hủy.', timeout: 'Hết thời gian chờ.', server_exit: 'Tiến trình model đã dừng.',
    server_killed: 'Hệ điều hành đã giết tiến trình model (có thể thiếu RAM).',
    memory_pressure: 'Android báo thiếu bộ nhớ; đã dừng model và loạt đo.',
    exec_blocked: 'Android chặn chạy llama-server. Dừng thử nghiệm và báo reviewer để xem xét JNI.',
    invalid_json: 'Kết quả JSON không hợp lệ.', missing_probs: 'Thiếu xác suất token; không thể tính độ tin cậy.',
    truncated: 'Kết quả bị cắt ngắn.', http_error: 'Lỗi kết nối tới model trong máy.',
    logprob_alignment: 'Không căn được xác suất token với nội dung; không thể tính độ tin cậy.',
    repetition_loop: 'Model lặp nội dung hoặc hết token khi JSON chưa hoàn chỉnh; lượt đọc thất bại.',
    low_ram: 'RAM dưới ngưỡng; cần xác nhận cảnh báo trước khi chạy.', no_space: 'Máy không đủ dung lượng trống.',
    checksum: 'File sai số byte hoặc SHA-256; đã xóa file.', model_missing: 'Model chưa đủ file được kiểm tra.',
    download_failed: 'Tải gián đoạn; bấm Tải để tiếp tục.', dataset_invalid: 'Bộ đo hoặc ids.json không hợp lệ.',
    image_invalid: 'Ảnh không hợp lệ, quá 10 MB hoặc quá 40 triệu điểm ảnh.', native_error: 'Tác vụ trên Android thất bại.',
    graph_only: 'D chỉ dựng đồ thị nháp; chọn chế độ Đồ thị.', figure_failed: 'Không dò được hình đồ thị.',
    cpu_backend_unknown: 'Không xác định được biến thể CPU thực sự đã nạp; dừng để tránh ghi số đo thiếu căn cứ.',
  } as Record<string, string>,
};
export function errorCode(error: unknown): string {
  if (typeof error === 'object' && error !== null) {
    const e = error as { reason?: unknown; code?: unknown; name?: unknown };
    if (typeof e.reason === 'string' && e.reason in vi.errors) return e.reason;
    if (typeof e.code === 'string' && e.code in vi.errors) return e.code;
    if (e.name === 'AbortError') return 'aborted';
  }
  return 'read_failed';
}

export function messageFor(error: unknown): string {
  const code = errorCode(error);
  const message = vi.errors[code] ?? vi.errors.read_failed!;
  if (code !== 'dataset_invalid' || typeof error !== 'object' || error === null || !('data' in error)) return message;
  const data = error.data;
  if (typeof data !== 'object' || data === null || !('reason' in data) || typeof data.reason !== 'string'
    || !Object.hasOwn(vi.datasetReasons, data.reason)) return message;
  const details = [data.reason];
  if ('id' in data && typeof data.id === 'string') details.push(`id: ${data.id}`);
  if ('file' in data && typeof data.file === 'string') details.push(`file: ${data.file}`);
  if ('operation' in data && typeof data.operation === 'string') details.push(`bước: ${data.operation}`);
  return `${message} ${vi.datasetReasons[data.reason]} (${details.join('; ')})`;
}
