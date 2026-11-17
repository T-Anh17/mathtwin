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

// Full Cartesian product: prefix × noun synonym × connector × value order.
// Every combination is a distinct dev subfamily, each with noise variants a–d.
const synonyms: Record<string, string[]> = {
  'Số đỉnh': ['Số đỉnh', 'Số lượng đỉnh'], 'Số cạnh': ['Số cạnh', 'Số lượng cạnh'],
  'Số khuyên': ['Số khuyên', 'Số lượng khuyên'],
  'Số đỉnh bậc lẻ': ['Số đỉnh bậc lẻ', 'Số lượng đỉnh có bậc lẻ'],
  'Số thành phần liên thông': ['Số thành phần liên thông', 'Số nhóm liên thông'],
  'Tổng bậc': ['Tổng bậc', 'Tổng các bậc'], 'Độ dài': ['Độ dài', 'Tổng quãng đường'],
  'Các đỉnh': ['Các đỉnh', 'Tập đỉnh'], 'Các cạnh': ['Các cạnh', 'Tập cạnh'],
  'Các đỉnh bậc lẻ': ['Các đỉnh bậc lẻ', 'Tập đỉnh có bậc lẻ'],
};
for (const [p, prefix] of ['', 'Em nhận thấy '].entries())
  for (const synonym of [0, 1]) for (const [c, connector] of [' là ', ' bằng '].entries())
    for (const reverse of [false, true]) {
      const noun = (s: string): string => synonyms[s]?.[synonym] ?? s;
      const sentence = (s: string, v: string): string => reverse
        ? `${prefix}${v}${connector}${noun(s).toLowerCase()}.`
        : `${prefix}${noun(s)}${connector}${v}.`;
      devFamilies.push({ id: p + synonym + c + Number(reverse) === 0 ? 'dev-paraphrase' : `dev-paraphrase-${p}${synonym}${c}${Number(reverse)}`,
        split: 'dev', table: false,
        count: (s, n) => sentence(s, String(n)),
        list: (s, v) => sentence(s, v || 'tập rỗng'),
        degree: (v, n) => sentence(`Bậc của ${v}`, String(n)),
        conclusion: (s) => `${prefix}${s}.`,
        select: (v) => `Khoanh tròn ${v}.`,
        label: (v, n, via) => `n(${v}) = ${n}${via ? ` (qua ${via})` : ''}.`,
        answer: (v) => `Đáp số: ${v}.`,
      });
    }

// General Vietnamese padding × linking verb, with each reviewed construction.
// Append families so existing seeds (including the held-out split) stay stable.
for (const [p, prefix] of ['', 'Em kiểm tra rồi '].entries())
  for (const [c, connector] of ['ghi nhận được', 'tổng hợp lại được'].entries()) {
    devFamilies.push({ id: `dev-paraphrase-open-${p}${c}`, split: 'dev', table: false,
      count: (s, n) => `${prefix}${s}, em ${connector} ${n}.`,
      list: (s, v) => `${s}: ${v || 'tập rỗng'}.`,
      degree: (v, n) => `${prefix}Đếm các đầu cạnh tại ${v}, em ${connector} bậc ${n}.`,
      conclusion: (s) => `${s}.`, select: (v) => `Khoanh tròn ${v}.`,
      label: (v, n, via) => `n(${v}) = ${n}${via ? ` (qua ${via})` : ''}.`,
      answer: (v) => `${prefix}đáp số em ${connector} ${v}.`,
    });
  }
