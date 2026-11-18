/** Orthographic normalization only. Never repair numbers or labels. */
export function symbols(text: string): string {
  return text.normalize('NFC').replace(/[₀-₉]/gu, (s) => String(s.charCodeAt(0) - 0x2080))
    .replace(/⟶|⟹|->|[–—]/gu, '→').replace(/−/gu, '-').replace(/\+?∞|vô cùng/giu, '∞')
    .replace(/×|\*/gu, '×').replace(/(?<=\d)\s+[x.]\s+(?=\d)/gu, ' × ').replace(/\s+/gu, ' ').trim();
}
export function fold(text: string): string {
  return symbols(text).normalize('NFD').replace(/\p{M}/gu, '').replace(/[đĐ]/gu, 'd').toLowerCase();
}
export function labelKey(text: string): string { return symbols(text).toLowerCase(); }
export function escapeRegex(text: string): string { return text.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&'); }
export function editDistance(a: string, b: string): number {
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) row[j] = Math.min(row[j - 1]! + 1, previous[j]! + 1, previous[j - 1]! + Number(a[i - 1] !== b[j - 1]));
    previous = row;
  }
  return previous[b.length]!;
}
const keywords = ('khac khoi tao doi qua tai thanh buoc duoc chon do thi co so dinh canh khuyen cac la gom tap rong khong bac cua bang tong le thanh phan lien thong '
  + 'chu trinh duong di euler hamilton ve duoc mot net theo thoa dieu kien dirac ore nen ly do bat buoc da tim thay '
  + 'do dai quang ngan nhat tu den ket qua vay kl dap an chon phuong dung sai nhan khoanh tron gan cap nhat lap lai them '
  + 'nguoi du lich hanh trinh dua thu em dem duoc liet ke '
  + 'toi minh chung ta ban nhan xet rang thay quan sat tinh ghi viet xac dinh '
  + 'da dang se vua van tat ca nhung nay tren hinh thanh chia nhu sau lan luot '
  + 'thu tim suy ra do vay kiem tra thong ke moi cuoi cung luong nhom hop khoang cach chua biet hoac hon kem chac luan' ).split(' ');
export function language(text: string, labels: string[]): string {
  const protectedLabels = new Set(labels.map(labelKey));
  return symbols(text).replace(/[\p{L}\p{N}_]+/gu, (word) => {
    if (protectedLabels.has(labelKey(word))) return labelKey(word);
    const token = fold(word);
    if (keywords.includes(token) || token.length < 4 || /\d/u.test(token)) return token;
    const close = [...new Set(keywords)].filter((key) => key.length >= 4 && editDistance(token, key) === 1);
    return close.length === 1 ? close[0]! : token;
  });
}
/** Near question match: folded character edit similarity >= 0.92; short lines exact. */
export function sameQuestion(text: string, question: string): boolean {
  const clean = (s: string): string => fold(s).replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  const a = clean(text); const b = clean(question);
  return a === b || Math.min(a.length, b.length) >= 20 && editDistance(a, b) / Math.max(a.length, b.length) <= 0.08;
}
