import { expect, it } from 'vitest';
import { resolve } from 'node:path';
import { checkCancellationBoxes, measureStrikes } from '../src/work-strikes.js';

it('measures all 40 synthetic pages without truth cancellation flags in inference', async () => {
  const pages = await measureStrikes(resolve('.'));
  expect(pages).toHaveLength(40);
  expect(pages.reduce((sum, p) => sum + p.positives, 0)).toBe(40);
  expect(pages.reduce((sum, p) => sum + p.lines, 0)).toBe(168);
  expect(pages.reduce((sum, p) => sum + p.fp, 0)).toBe(0);
  expect(pages.reduce((sum, p) => sum + p.fn, 0)).toBe(0);
  // Lô 5.3 rule 4: every truth cancellation is either struck silently (non-claim, safe box) or asked.
  expect(pages.reduce((sum, p) => sum + p.tp + p.asked, 0)).toBe(40);
  expect(pages.flatMap((p) => p.detections).filter((d) => d.asked && !d.truth)).toEqual([]);
  expect(pages.reduce((sum, p) => sum + p.struckAsContent, 0)).toBe(0);
}, 30000);

it('uses cancellation.json boxes as labelled positive regression cases for both fonts and types', async () => {
  for (const style of ['dancing-straight', 'dancing-perspective', 'patrick-straight', 'patrick-perspective']) {
    const detected = await checkCancellationBoxes(resolve('.'), '01-elements-multigraph-' + style);
    expect(detected).toHaveLength(1); expect(detected[0]!.struck, style).toBe(true);
  }
});
