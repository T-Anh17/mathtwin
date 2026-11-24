import type { WorkVocabulary } from './types.js';

/**
 * Common Vietnamese words in graph-theory questions and worked solutions.
 * Source: the "Mất dấu" examples in docs/prompts/05-sua-nhanh-anh-that.md,
 * extended only with the same recurring graph-theory wording from docs/spec.md.
 * This is orthographic evidence only; it never considers a claim or its result.
 */
const familiarVietnameseWords = [
  'bậc', 'cạnh', 'chu', 'có', 'của', 'đáp', 'đường', 'đỉnh', 'đồ', 'độ',
  'đúng', 'được', 'đều', 'đi', 'đó', 'giải', 'hành', 'hình', 'không', 'kết',
  'là', 'lần', 'lẻ', 'liên', 'lời', 'một', 'nên', 'ngắn', 'nhất', 'nhỏ',
  'nối', 'phát', 'quả', 'quay', 'số', 'thành', 'thị', 'tìm', 'tổng', 'trình',
  'trọng', 'từ', 'và', 'về', 'vì', 'với', 'xuất', 'yêu',
] as const;

const words = (text: string): string[] => text.normalize('NFC').match(/\p{L}+/gu) ?? [];
const normalized = (text: string): string => text.normalize('NFD').toLocaleLowerCase('vi-VN');
const withoutDiacritics = (text: string): string => normalized(text).replace(/[\u0300-\u036f]/gu, '').replaceAll('đ', 'd');
const hasVietnameseDiacritic = (text: string): boolean => /đ|[\u0300-\u036f]/u.test(normalized(text));

function vocabularyWords(vocab: WorkVocabulary): string[] {
  const labels = new Set(vocab.vertexLabels.map(withoutDiacritics));
  return vocab.questionText.flatMap(words).filter((word) => hasVietnameseDiacritic(word)
    && withoutDiacritics(word) !== normalized(word) && !labels.has(withoutDiacritics(word)));
}

export interface LostDiacriticsInspection {
  lost: boolean;
  matchedWords: string[];
}

/** Inspect only spelling evidence, keeping vertex labels, numbers and notation out of the count. */
export function inspectLostDiacritics(text: string, vocab: WorkVocabulary): LostDiacriticsInspection {
  if (hasVietnameseDiacritic(text)) return { lost: false, matchedWords: [] };
  // A word spelled the same with and without accents ("chu") is no evidence of loss.
  const candidates = new Set([...familiarVietnameseWords.filter(hasVietnameseDiacritic), ...vocabularyWords(vocab)].map(withoutDiacritics));
  const labels = new Set(vocab.vertexLabels.map(withoutDiacritics));
  const matchedWords = words(text).filter((word) => {
    const key = withoutDiacritics(word);
    return !labels.has(key) && candidates.has(key);
  });
  return { lost: matchedWords.length >= 3, matchedWords };
}

/** A whole line without Vietnamese accents is uncertain only with at least three familiar-word matches. */
export function lostDiacritics(text: string, vocab: WorkVocabulary): boolean {
  return inspectLostDiacritics(text, vocab).lost;
}
