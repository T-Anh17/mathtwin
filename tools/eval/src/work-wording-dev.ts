import type { WordingFamily } from './work-wording.js';
export const devFamilies: WordingFamily[] = [
  { id: 'dev-direct', split: 'dev', table: false,
    count: (s, n) => `${s} là ${n}.`, list: (s, v) => `${s}: ${v || 'không có'}.`, degree: (v, n) => `Bậc của ${v} là ${n}.`,
    conclusion: (s) => `${s}.`, select: (v) => `Khoanh tròn ${v}.`, label: (v, n, via) => `n(${v}) = ${n}${via ? ` (qua ${via})` : ''}.`, answer: (v) => `Đáp số: ${v}.` },
  { id: 'dev-symbolic', split: 'dev', table: false,
    count: (s, n) => `${s} = ${n}.`, list: (s, v) => `${s} = {${v}}.`, degree: (v, n) => `deg(${v}) = ${n}.`,
    conclusion: (s) => `Em ghi: ${s}.`, select: (v) => `Chọn ${v}.`, label: (v, n, via) => `L(${v}) = ${n}${via ? ` qua ${via}` : ''}.`, answer: (v) => `KL: ${v}.` },
  { id: 'dev-table', split: 'dev', table: true,
    count: (s, n) => `${s}: ${n}.`, list: (s, v) => `${s} gồm ${v || 'tập rỗng'}.`, degree: (v, n) => `${v} có bậc ${n}.`,
    conclusion: (s) => `Kết quả: ${s}.`, select: (v) => `Đỉnh được chọn: ${v}.`, label: (v, n, via) => `Tại ${v}, nhãn bằng ${n}${via ? ` qua ${via}` : ''}.`, answer: (v) => `Vậy kết quả là ${v}.` },
];
