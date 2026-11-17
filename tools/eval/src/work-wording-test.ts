// Held-out wording families. Do not import this file into parser development or tuning.
import type { WordingFamily } from './work-wording.js';
export const testFamilies: WordingFamily[] = [
  { id: 'test-student', split: 'test', table: false,
    count: (s, n) => `Em đếm được ${s.toLowerCase()} bằng ${n}.`, list: (s, v) => `Em liệt kê ${s.toLowerCase()} là ${v || 'không có phần tử'}.`, degree: (v, n) => `Đếm các đầu cạnh tại ${v}, em được bậc ${n}.`,
    conclusion: (s) => `Em nhận thấy ${s.charAt(0).toLowerCase() + s.slice(1)}.`, select: (v) => `Em khoanh đỉnh ${v}.`, label: (v, n, via) => `Em ghi nhãn tại ${v}: ${n}${via ? `, đi qua ${via}` : ''}.`, answer: (v) => `Em kết luận đáp số bằng ${v}.` },
  { id: 'test-notes', split: 'test', table: true,
    count: (s, n) => `Ghi nhận ${s.toLowerCase()} có giá trị ${n}.`, list: (s, v) => `Ghi lại ${s.toLowerCase()}: ${v || 'rỗng'}.`, degree: (v, n) => `d(${v}): ${n}.`,
    conclusion: (s) => `Nhận xét của em: ${s}.`, select: (v) => `Đánh dấu chọn đỉnh ${v}.`, label: (v, n, via) => `Nhãn ${v}: ${n}${via ? ` (${via})` : ''}.`, answer: (v) => `Kết quả cuối cùng: ${v}.` },
];
