import { expect, it } from 'vitest';
import { normalizeCharConfidence } from '../src/index.js';

it('aligns probabilities with NFC code points and never fabricates missing scores', () => {
  expect(normalizeCharConfidence('o\u0302\u0301 😀', [0.9, 0.5, 0.7, 0.99, 0.6])).toEqual([0.5, 0.99, 0.6]);
  expect(normalizeCharConfidence('ố', [])).toBeUndefined();
  expect(normalizeCharConfidence('ố', [NaN])).toBeUndefined();
  expect(normalizeCharConfidence('', [])).toEqual([]);
});
