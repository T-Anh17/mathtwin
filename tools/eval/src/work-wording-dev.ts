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
    conclusion: (s) => `Em ghi: ${s}.`, select: (v) => `Đỉnh được chọn: ${v}.`, label: (v, n, via) => `Tại ${v}, nhãn bằng ${n}${via ? ` qua ${via}` : ''}.`, answer: (v) => `Vậy kết quả là ${v}.` },
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

// Full products stay in memory for parser tests; only four rotating families go on disk.
export const cartesianDevFamilies: WordingFamily[] = [];
// Select slots: action × optional noun × every vertex in the core fixtures.
for (const [a, action] of ['Chọn', 'Khoanh', 'Khoanh tròn', 'Đánh dấu', 'Cố định'].entries())
  for (const [n, noun] of ['', 'đỉnh ', 'điểm '].entries()) cartesianDevFamilies.push({
    ...devFamilies[0]!, id: `dev-paraphrase-select-${a}${n}`, select: (v) => `${action} ${noun}${v}.`,
  });
// Open prefixes and value connectors for each topic, including label predecessors.
for (const [p, prefix] of ['Nhận xét:', 'Ghi lại:', 'Ghi nhận'].entries())
  for (const [c, connector] of [':', 'là', 'bằng', 'có giá trị'].entries())
    for (const [v, viaWord] of ['qua', 'đi qua', 'từ'].entries()) cartesianDevFamilies.push({
      ...devFamilies[0]!, id: `dev-paraphrase-topic-${p}${c}${v}`,
      count: (s, n) => `${prefix} ${s} ${connector} ${n}.`,
      degree: (s, n) => `${prefix} Bậc của ${s} ${connector} ${n}.`,
      label: (s, n, via) => `${prefix} Nhãn của đỉnh ${s} ${connector} ${n}${via ? `, ${viaWord} ${via}` : ''}.`,
    });
for (const [c, conclusion] of ['Vậy', 'KL:', 'Kết luận:', 'Kết quả:', 'Kết quả cuối cùng:', 'Đáp số:'].entries()) cartesianDevFamilies.push({
  ...devFamilies[0]!, id: `dev-paraphrase-final-${c}`, answer: (v) => `${conclusion} ${v}.`,
});

// Location/possession slots × optional noun × connector × explicit predecessor.
// These combinations are rendered exhaustively by work-paraphrase.test.ts.
for (const [p, preposition] of ['', 'của ', 'tại ', 'ở ', 'cho ', 'đến ', 'tới '].entries())
  for (const [n, noun] of ['', 'đỉnh ', 'điểm '].entries())
    for (const [c, connector] of [':', 'là', 'bằng', '='].entries())
      for (const withVia of [false, true]) cartesianDevFamilies.push({
        ...devFamilies[0]!, id: `dev-paraphrase-label-${p}${n}${c}${Number(withVia)}`, omitLabelVia: !withVia,
        label: (v, value, via) => `Nhãn ${preposition}${noun}${v} ${connector} ${value}${withVia && via ? `, qua ${via}` : ''}.`,
      });

export const rotatingDevGroups = ['select', 'topic', 'final', 'label'] as const;
for (const group of rotatingDevGroups) devFamilies.push({
  ...devFamilies[0]!, id: `dev-paraphrase-${group}`,
});

/** Numbered source fixture IDs provide a stable rotation, shared by noise variants a–d. */
export function sampleWordingFamily(family: WordingFamily, sampleId: string): WordingFamily {
  const group = rotatingDevGroups.find((name) => family.id === `dev-paraphrase-${name}`);
  if (!group) return family;
  const fixtureNumber = Number.parseInt(sampleId, 10);
  if (!Number.isInteger(fixtureNumber) || fixtureNumber < 1) throw new Error('Expected a numbered source fixture ID.');
  const choices = cartesianDevFamilies.filter((f) => f.id.startsWith(`${family.id}-`));
  // 37 is coprime to each product size, spreading all slots across the 60 fixtures.
  return { ...choices[((fixtureNumber - 1) * 37) % choices.length]!, id: family.id };
}
