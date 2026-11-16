import type { VietOcrConfig } from './types.js';

export function parseVietOcrConfig(value: unknown): VietOcrConfig {
  if (typeof value !== 'object' || value === null) throw new Error('Invalid VietOCR config.');
  const c = value as Record<string, unknown>;
  for (const key of ['image_height', 'image_min_width', 'image_max_width', 'max_seq_length', 'sos', 'eos', 'offset']) {
    if (typeof c[key] !== 'number' || !Number.isSafeInteger(c[key]) || c[key] < 1) throw new Error('Invalid VietOCR config.');
  }
  const config = c as unknown as VietOcrConfig;
  if (typeof c.vocab !== 'string' || !c.vocab || new Set(Array.from(c.vocab)).size !== Array.from(c.vocab).length
    || config.image_min_width > config.image_max_width || config.image_height > 512 || config.image_max_width > 8192
    || config.max_seq_length > 4096 || config.sos === config.eos || Math.max(config.sos, config.eos) >= config.offset) throw new Error('Invalid VietOCR config.');
  return { ...config };
}

/** All Vietnamese letters, both cases; NFC comparison also accepts decomposed vocabularies. */
export function missingVietnameseChars(vocab: string | readonly string[]): string[] {
  const available = new Set(Array.from((typeof vocab === 'string' ? vocab : vocab.join('')).normalize('NFC')));
  const lower = 'aăâbcdđeêghiklmnoôơpqrstuưvxy';
  const vowels = 'aăâeêioôơuưy';
  const required = new Set(Array.from(lower + lower.toUpperCase()));
  for (const vowel of vowels) for (const tone of ['', '\u0300', '\u0301', '\u0309', '\u0303', '\u0323']) {
    const char = (vowel + tone).normalize('NFC'); required.add(char); required.add(char.toUpperCase());
  }
  return [...required].filter((char) => !available.has(char));
}

/** Symbols used by graph exercises which this recognition vocabulary may not represent. */
export function unsupportedSymbols(vocab: string | readonly string[]): string[] {
  const available = new Set(Array.from((typeof vocab === 'string' ? vocab : vocab.join('')).normalize('NFC')));
  return ['→', '×', '∞', '≥', '≤', '≠'].filter((symbol) => !available.has(symbol));
}
