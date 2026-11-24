import { describe, expect, it } from 'vitest';
import { suggestTask } from '../src/index.js';

const labels = ['A', 'B', 'C', 'D', 'E'];

describe('suggestTask', () => {
  it.each([
    ['Liệt kê số đỉnh và số cạnh của đồ thị.', 'elements'],
    ['Tính bậc của các đỉnh.', 'degree'],
    ['Kiểm tra đồ thị có liên thông không.', 'connectivity'],
    ['Tìm đường đi từ A đến E.', 'path'],
    ['Tìm chu trình Euler xuất phát từ A.', 'euler'],
    ['Tìm chu trình Hamilton.', 'hamilton'],
    ['Tìm đường đi ngắn nhất từ A đến E.', 'shortest_path'],
    ['Người du lịch dùng láng giềng gần nhất xuất phát từ A.', 'tsp'],
    ['Người đưa thư xuất phát từ A.', 'postman'],
    ['Cho biết các mệnh đề đúng sai.', 'statements'],
  ] as const)('covers %s', (text, type) => {
    const result = suggestTask(text, labels);
    expect(result.task?.type).toBe(type);
    expect(result.uncertain).toContain('task.type');
  });

  it.each([
    ['Tim duong di ngan nhat tu A den E.', 'shortest_path'],
    ['Tim chu trinh Culer xuat phat tu A.', 'euler'],
  ] as const)('accepts accentless or one-character vocabulary errors: %s', (text, type) => {
    expect(suggestTask(text, labels).task?.type).toBe(type);
  });

  it('uses only valid graph labels for endpoints and never leaves a suggested task unconfirmed', () => {
    expect(suggestTask('Tìm đường đi từ A đến E.', labels).task).toMatchObject({ from: 'A', to: 'E' });
    expect(suggestTask('Tìm đường đi từ A đến Z.', labels).task).toBeNull();
    const result = suggestTask('Tìm đường đi ngắn nhất từ A đến E.', labels);
    expect(result.uncertain).toEqual(expect.arrayContaining(['task.type', 'task.from', 'task.to']));
  });

  it('keeps a student-like connectivity sentence free of a fabricated numeric parameter', () => {
    expect(suggestTask('Có 2 thành phần liên thông.', labels).task).toEqual({ type: 'connectivity' });
  });

  it('returns no task for contradictory categories and recognizes question formats from vocabulary', () => {
    expect(suggestTask('Tìm chu trình Euler và Hamilton.', labels).task).toBeNull();
    expect(suggestTask('Câu trắc nghiệm: chọn đáp án đúng.', labels).questionFormat).toBe('trac_nghiem');
    expect(suggestTask('Các ý đúng sai.', labels).questionFormat).toBe('dung_sai');
    expect(suggestTask('Trả lời ngắn.', labels).questionFormat).toBe('tra_loi_ngan');
  });
});
