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

  it.each([
    ['Kho chính', 'Bắt đầu và kết thúc tại kho chính (A), đi qua tất cả các tuyến đường ít nhất một lần.', 'A'],
    ['Bưu điện', 'Người đưa thư bắt đầu hành trình từ bưu điện tại điểm A, phải đi qua mỗi con đường ít nhất một lần và quay trở lại điểm xuất phát.', 'A'],
  ])('recognizes postman wording from %s and extracts its start label', (_place, text, start) => {
    expect(suggestTask(text, labels).task).toEqual({ type: 'postman', start });
  });

  it('recognizes a depot round trip described as the shortest route to finish the work', () => {
    expect(suggestTask('Xe bắt đầu và kết thúc tại gara chính (G). Hãy xác định tuyến đường ngắn nhất để hoàn thành công việc.', [...labels, 'G']).task)
      .toEqual({ type: 'postman', start: 'G' });
  });

  it('keeps an unspecified postman start empty and uncertain instead of choosing a vertex', () => {
    const result = suggestTask('Xe thu gom rác đi qua toàn bộ các con đường ít nhất một lần rồi quay về.', labels);
    expect(result.task).toEqual({ type: 'postman', start: '' });
    expect(result.uncertain).toContain('task.start');
  });

  it('does not use a parenthesized location label that is absent from the graph', () => {
    const result = suggestTask('Bắt đầu và kết thúc tại gara chính (Z), đi qua tất cả các tuyến đường ít nhất một lần.', labels);
    expect(result.task).toEqual({ type: 'postman', start: '' });
  });

  it('recognizes the visit-each-once-and-return wording for the travelling salesperson', () => {
    expect(suggestTask('Người bán hàng đi qua mỗi thành phố đúng một lần rồi trở về điểm xuất phát.', labels).task)
      .toMatchObject({ type: 'tsp' });
  });

  it('recognizes shortest-path endpoints written as between two vertices', () => {
    expect(suggestTask('Tìm đường đi ngắn nhất giữa A và E.', labels).task).toEqual({ type: 'shortest_path', from: 'A', to: 'E' });
  });

  it('does not merge separate subquestions with different task types', () => {
    const result = suggestTask('a) Đồ thị có chu trình Hamilton không? b) Đồ thị có chu trình Euler không?', labels);
    expect(result).toMatchObject({ task: null, reason: 'multiple_task_types' });
  });

  it('recognizes the wording “Ghi Đúng hoặc Sai” as a true-false format', () => {
    expect(suggestTask('Ghi Đúng hoặc Sai vào mỗi mệnh đề.', labels).questionFormat).toBe('dung_sai');
  });

  it('does not call an unmatched question a request for multiple task types', () => {
    expect(suggestTask('Hãy cho biết đồ thị này có đẹp không?', labels)).toMatchObject({ task: null, uncertain: [] });
    expect(suggestTask('Hãy cho biết đồ thị này có đẹp không?', labels).reason).toBeUndefined();
  });

  it.each([
    'Xe đi qua tất cả các tuyến phố ít nhất 1 lần rồi quay về.',
    'Xe đi qua toàn bộ các phố ít nhất một lần rồi quay về.',
    'Xe đi qua mọi tuyến đg ít nhất 1 lần rồi quay về.',
    'Xe đi qua tất cả các con đg ít nhất một lần rồi quay về.',
  ])('recognizes common road nouns and a numeric “ít nhất 1 lần”: %s', (text) => {
    expect(suggestTask(text, labels).task).toEqual({ type: 'postman', start: '' });
  });

  it('recognizes a garbage collection route even when no start or return is stated', () => {
    const result = suggestTask('Xe cần đi thu gom rác trên toàn bộ các con đường. Hỏi xe cần đi ít nhất bao nhiêu km để quét sạch tất cả các tuyến đường?', labels);
    expect(result.task).toEqual({ type: 'postman', start: '' });
    expect(result.uncertain).toContain('task.start');
  });

  it.each([
    'Bắt đầu và kết thúc tại bãi rác (A), đi qua mọi cạnh ít nhất một lần.',
    'Đi qua mọi cạnh ít nhất một lần, tại điểm (A).',
    'Đi qua mọi cạnh ít nhất một lần, tại kho chính (A).',
  ])('uses a single valid parenthesized location label as the start: %s', (text) => {
    expect(suggestTask(text, labels).task).toEqual({ type: 'postman', start: 'A' });
  });

  it.each([
    ['Tìm đường đi ngắn nhất từ A - E.', 'shortest_path'],
    ['Tìm đường đi từ A tới E.', 'path'],
  ] as const)('recognizes endpoints written with %s', (text, type) => {
    expect(suggestTask(text, labels).task).toEqual({ type, from: 'A', to: 'E' });
  });

  it('keeps Euler and Hamilton together as an intentionally unresolved multiple-task question', () => {
    expect(suggestTask('Đồ thị có chu trình Euler hoặc chu trình Hamilton hay không?', labels))
      .toMatchObject({ task: null, reason: 'multiple_task_types' });
  });
});
