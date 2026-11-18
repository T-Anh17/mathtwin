import type { ErrorCode, GradeResult, ProblemSpec } from '@mathtwin/core';
import { graphLabels } from './graph-labels.vi.js';

export const resultVi = {
  title: 'Kết quả chấm bài', location: 'Chỗ sai', reason: 'Vì sao sai', correction: 'Bước đúng phải là gì', next: 'Hướng làm tiếp',
  previous: 'Các bước trước đó', previousCorrect: 'Các bước kiểm tra được trước bước này đều đúng.',
  noPrevious: 'Đây là bước sai đầu tiên; chưa có bước trước đó được xác nhận đúng.',
  solution: 'Xem lời giải chuẩn', review: 'Xem bài máy đọc', question: 'Trả lời câu hỏi còn lại',
  pending: 'Cần kiểm tra phần máy đọc trước khi kết luận.', unconfirmed: 'Cần xác nhận đề bài trước khi chấm.',
  incomplete: 'Chưa đọc xong các trang bài làm.', missing: 'Chưa có bài làm đủ dữ kiện để kiểm tra. Hãy bổ sung các bước giải.',
  retake: 'Chụp lại bài làm', addPage: 'Thêm trang bài làm', manual: 'Gõ tay bài làm',
  notes: 'Lưu ý của dạng bài', correct: 'Các bước kiểm tra được đều hợp lệ và đáp án đúng.',
  correctNames: { dung: 'ĐÚNG', sai: 'SAI', can_xac_nhan: 'CẦN XÁC NHẬN', khong_du_can_cu: 'KHÔNG ĐỦ CĂN CỨ' },
  wrongStep: (step: number) => `Sai ở bước ${step}`,
  readingCheck: (text: string) => {
    const compact = text.replace(/\s+/g, ' ').trim();
    const excerpt = compact.length > 160 ? `${compact.slice(0, 160).trimEnd()}…` : compact;
    return `Máy đọc dòng này là “${excerpt}” — đúng không?`;
  },
  errors: {
    SAI_PHEP_TINH: 'Sai phép tính', SAI_DIEU_KIEN: 'Sai điều kiện', BO_SOT: 'Bỏ sót',
    CANH_KHONG_TON_TAI: 'Cạnh không tồn tại', LAP: 'Lặp cạnh hoặc đỉnh', NHAM_THUAT_TOAN: 'Nhầm thuật toán',
    SAI_LUA_CHON: 'Sai lựa chọn', KET_LUAN_KHONG_SUY_RA: 'Kết luận không suy ra', HIEU_SAI_DE: 'Hiểu sai đề',
  } satisfies Record<ErrorCode, string>,
};

const rules: Record<ErrorCode, string> = {
  SAI_PHEP_TINH: 'Giá trị ghi trong bài không khớp phép tính trên dữ kiện đã xác nhận.',
  SAI_DIEU_KIEN: 'Bước này chưa thỏa điều kiện áp dụng. Cần kiểm tra đúng điều kiện của loại đường hoặc thuật toán đang xét.',
  BO_SOT: 'Cần kiểm đủ những đỉnh, cạnh hoặc nhãn mà bước đang làm yêu cầu, kể cả khuyên và cạnh song song.',
  CANH_KHONG_TON_TAI: 'Mỗi đoạn đi phải nối qua một cạnh có thật trong đồ thị.',
  LAP: 'Loại đường đang xét không cho phép lặp phần tử này.',
  NHAM_THUAT_TOAN: 'Dijkstra chọn nhãn nhỏ nhất trong các đỉnh chưa khoanh; chọn cạnh nhỏ nhất không thay thế được quy tắc này.',
  SAI_LUA_CHON: 'Lựa chọn phải hợp lệ với trạng thái hiện tại và quy tắc của thuật toán đang dùng.',
  KET_LUAN_KHONG_SUY_RA: 'Kết luận phải đi ra từ dữ kiện và các bước đã kiểm tra; đường truy vết phải khớp nhãn.',
  HIEU_SAI_DE: 'Đường đi, chu trình và đỉnh xuất phát hoặc kết thúc phải đúng yêu cầu đề.',
};

function valueText(value: unknown): string {
  if (value === null) return '∞';
  if (value === true) return 'đúng';
  if (value === false) return 'sai';
  if (Array.isArray(value)) {
    const items = value.map(valueText);
    return items.length && items.every(Boolean) ? items.join(', ') : '';
  }
  if (typeof value === 'object') {
    const route = value as Record<string, unknown>;
    const strings = (v: unknown): v is string[] => Array.isArray(v) && v.length > 0 && v.every((s) => typeof s === 'string');
    if (!Object.keys(route).every((key) => key === 'vertices' || key === 'edgeIds')) return '';
    const vertices = strings(route.vertices) ? route.vertices.join(' → ') : '';
    const edges = strings(route.edgeIds) ? route.edgeIds.join(', ') : '';
    return vertices && edges ? `${vertices} (qua các cạnh: ${edges})` : vertices || edges;
  }
  return typeof value === 'string' || typeof value === 'number' ? String(value) : '';
}

/** Omit corrections without a recognized expected value; core's message retains the context. */
export function tutorText(result: GradeResult, task: ProblemSpec['task']['type']) {
  const code = result.errorCode!;
  const expected = valueText(result.facts?.displayExpected);
  return {
    message: result.message,
    reason: result.facts?.claimType === 'dijkstra_label'
      ? 'Nhãn mới phải lấy giá trị nhỏ hơn giữa nhãn cũ và tổng nhãn của đỉnh vừa khoanh với trọng số cạnh nối.'
      : code === 'SAI_DIEU_KIEN' && ['theorem', 'hamilton_exists'].includes(String(result.facts?.claimType))
        ? 'Phải kiểm tra đầy đủ giả thiết trước khi dùng định lý. Điều kiện đủ không được dùng ngược thành điều kiện cần.' : rules[code],
    ...(expected ? { correction: `Tại bước này, kết quả hợp lệ là ${expected}.` } : {}),
    nextStep: task === 'shortest_path'
      ? 'Sửa bước này rồi tiếp tục cập nhật nhãn từ trạng thái hợp lệ, khoanh đỉnh có nhãn nhỏ nhất chưa khoanh và truy vết đến đích.'
      : task === 'tsp' ? 'Sửa lựa chọn hiện tại, tiếp tục theo phương pháp đề yêu cầu rồi kiểm tra việc quay về đỉnh xuất phát.'
        : task === 'euler' || task === 'hamilton' || task === 'postman'
          ? 'Sửa đoạn đang xét rồi kiểm tra các phần tử còn phải đi qua và điều kiện kết thúc của hành trình.'
          : 'Sửa bước này theo dữ kiện đã xác nhận rồi kiểm tra tiếp các bước và kết luận theo yêu cầu đề.',
  };
}

/** Statement IDs, like graph IDs, are references rather than student-facing names. */
export function resultDisplayText(spec: ProblemSpec, text: string): string {
  if (spec.task.type === 'statements') for (const item of spec.task.items) {
    const id = item.id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    text = text.replace(new RegExp(`ý ${id}(?![\\p{L}\\p{N}_])`, 'gu'), () => `ý “${item.text}”`);
  }
  return graphLabels(spec.graph).text(text);
}
