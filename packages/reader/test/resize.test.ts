import { expect, it } from 'vitest';
import { resizeImage } from '../src/index.js';
function image(width: number, height: number) { return { width, height, pixels: new Uint8ClampedArray(width * height * 4) }; }
it('caps phone photos at 1536px without upscaling, preserving aspect ratio within rounding', () => {
  expect(resizeImage(image(4000, 3000))).toMatchObject({ width: 1536, height: 1152 });
  expect(resizeImage(image(3000, 4000))).toMatchObject({ width: 1152, height: 1536 });
  const small = image(100, 200); expect(resizeImage(small)).toBe(small);
  expect(resizeImage(image(7, 3), 5)).toMatchObject({ width: 5, height: 2 });
});
it('bilinear output is deterministic, preserves all RGBA channels and never changes input pixels', () => {
  const input = { width: 2, height: 2, pixels: new Uint8ClampedArray([0, 10, 20, 0, 100, 110, 120, 100, 20, 30, 40, 100, 80, 90, 100, 200]) };
  const original = input.pixels.slice();
  expect(resizeImage(input, 1).pixels).toEqual(new Uint8ClampedArray([50, 60, 70, 100]));
  expect(resizeImage(input, 1)).toEqual(resizeImage(input, 1)); expect(input.pixels).toEqual(original);
});
it('rejects invalid dimensions, pixel buffers and resize policies', () => {
  for (const limit of [0, -1, 1.5, 16385, Number.NaN]) expect(() => resizeImage(image(1, 1), limit)).toThrow();
  expect(() => resizeImage({ width: 2, height: 2, pixels: new Uint8ClampedArray(1) })).toThrow();
});
