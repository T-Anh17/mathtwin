export const vi = {
  title: 'MathTwin', subtitle: 'Đọc ảnh trên điện thoại', models: 'Model', bench: 'Đo',
  a: 'A · PaddleOCR-VL-1.5', b: 'B · Qwen3-VL-2B',
  storage: 'Dung lượng trống', ram: 'RAM máy', download: 'Tải', importModel: 'Kiểm tra file adb push',
  ready: 'Đã kiểm tra', missing: 'Chưa đủ file', cancelDownload: 'Dừng tải',
  downloadNote: 'Bấm Tải để xác nhận tải model qua mạng. Ảnh được xử lý trên máy.',
  lowRam: 'RAM thấp hơn ngưỡng cấu hình. Máy có thể bị hệ điều hành dừng model khi thiếu bộ nhớ.',
  allowLowRam: 'Tôi đã đọc cảnh báo và muốn thử trên máy RAM thấp', minRam: 'Ngưỡng RAM (GB)', threads: 'Luồng CPU',
  passes: 'Số lượt', mode: 'Chế độ', graph: 'Đồ thị', lines: 'Dòng chữ',
  camera: 'Chụp ảnh', gallery: 'Chọn ảnh', dataset: 'Nhập bộ đo', datasetName: 'Tên thư mục bộ đo',
  webViewCamera: 'Chụp WebView (phụ)', backgroundIdle: 'Dừng khi rảnh ở nền (phút)', cpuVariant: 'Biến thể CPU',
  cancel: 'Hủy', clear: 'Xóa ảnh khỏi bộ nhớ', settings: 'Cấu hình đo', results: 'Kết quả',
  showImage: 'Xem ảnh và chỗ gắn cờ', hideImage: 'Đóng ảnh',
  run: 'Bắt đầu đo', stop: 'Hủy và dừng model', export: 'Xuất kết quả',
  empty: 'Chọn ảnh hoặc nhập bộ đo để bắt đầu.', queued: 'Ảnh đã chọn',
  running: 'Đang xử lý trên máy…', done: 'Đã đo xong.', saved: 'Đã lưu kết quả tại',
  textOnly: 'Model A chỉ đọc chữ; chế độ đồ thị trả lỗi text_only.',
  firstLoad: 'Nạp model', warm: 'Dùng model đã nạp', total: 'Tổng thời gian', prompt: 'Xử lý prompt', predicted: 'Sinh kết quả', peak: 'RAM đỉnh server',
  verify: 'Kiểm tra file model',
  flags: 'Chỗ cần xác nhận', noBox: 'Vị trí chưa xác định: xem phần kết quả bên dưới.',
  noTimings: 'Server không trả timings.', noMemory: 'Không đọc được RAM server.',
  linePass: 'Lượt', privacy: 'Ảnh chụp từ camera hệ thống được đọc vào bộ nhớ rồi xóa file tạm; không lưu thư viện. File xuất không chứa ảnh.',
  nativeOnly: 'Mở APK Android để tải model và đo. Trang web chỉ dùng xem giao diện.',
  errors: {
    read_failed: 'Không đọc được ảnh.', text_only: 'Model này chỉ đọc chữ.', busy: 'Đang có tác vụ khác.',
    aborted: 'Đã hủy.', timeout: 'Hết thời gian chờ.', server_exit: 'Tiến trình model đã dừng.',
    server_killed: 'Hệ điều hành đã giết tiến trình model (có thể thiếu RAM).',
    memory_pressure: 'Android báo thiếu bộ nhớ; đã dừng model và loạt đo.',
    exec_blocked: 'Android chặn chạy llama-server. Dừng thử nghiệm và báo reviewer để xem xét JNI.',
    invalid_json: 'Kết quả JSON không hợp lệ.', missing_probs: 'Thiếu xác suất token; không thể tính độ tin cậy.',
    truncated: 'Kết quả bị cắt ngắn.', http_error: 'Lỗi kết nối tới model trong máy.',
    low_ram: 'RAM dưới ngưỡng; cần xác nhận cảnh báo trước khi chạy.', no_space: 'Máy không đủ dung lượng trống.',
    checksum: 'File sai số byte hoặc SHA-256; đã xóa file.', model_missing: 'Model chưa đủ file được kiểm tra.',
    download_failed: 'Tải gián đoạn; bấm Tải để tiếp tục.', dataset_invalid: 'Bộ đo hoặc ids.json không hợp lệ.',
    image_invalid: 'Ảnh không hợp lệ, quá 10 MB hoặc quá 40 triệu điểm ảnh.', native_error: 'Tác vụ trên Android thất bại.',
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
