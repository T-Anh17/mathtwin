import type { ReadIssue, ReadIssueCode } from './types.js';

const messages: Record<ReadIssueCode, string> = {
  directed_graph: 'Đồ thị có hướng nằm ngoài phạm vi hỗ trợ.',
  too_many_vertices: 'Đồ thị có hơn 20 đỉnh, vượt phạm vi hỗ trợ.',
  missing_weight: 'Không đọc được trọng số cạnh. Hãy xác nhận hoặc nhập lại.',
  nonpositive_weight: 'Trọng số phải dương. Dijkstra không áp dụng cho trọng số không dương.',
  count_mismatch: 'Số đỉnh hoặc số cạnh đọc được không khớp số liệu ghi trong đề.',
  unmapped_option: 'Chưa ánh xạ được ý này thành mệnh đề kiểm chứng độc lập.',
  unsupported_task: 'Dạng bài này nằm ngoài phạm vi hỗ trợ.',
  unreadable_region: 'Có vùng ảnh chưa đọc được. Hãy kiểm tra lại đề.',
  missing_question: 'Chưa đọc được yêu cầu đề. Hãy nhập hoặc chọn lại dạng bài.',
  needs_postprocessing: 'Bài có phép đổi đơn vị hoặc tính toán kèm theo cần xử lý riêng; giữ nguyên số liệu đã đọc.',
  invalid_spec: 'Dữ liệu đề không hợp lệ. Hãy kiểm tra và sửa lại.',
  read_failed: 'Không hoàn tất được việc đọc ảnh. Hãy thử lại hoặc nhập tay.',
};
export function readIssue(code: ReadIssueCode, severity: ReadIssue['severity'], item?: string): ReadIssue {
  return { code, severity, ...(item === undefined ? {} : { item }), message: messages[code] };
}
export const confirmationMessages = {
  invalid: 'Xác nhận tạo ra đề không hợp lệ.',
  unknown: 'Mục xác nhận không tồn tại hoặc không có định dạng được hỗ trợ.',
};
export const localReaderMessages = {
  failed: 'Không thể đọc ảnh; hãy kiểm tra model, kết nối llama-server và xác suất token.',
  textOnly: 'PaddleOCR hiện chỉ hỗ trợ đọc chữ theo dòng; chưa hỗ trợ dựng cấu trúc đồ thị.',
  busy: 'Bộ đọc đang xử lý một lượt khác; hãy chờ lượt đó kết thúc.',
};
