import type { PreparedImage } from './types.js';

/** Deterministic center-sampled bilinear RGBA resize; never upscales. */
export function resizeImage(image: PreparedImage, maxLongEdge = 1536): PreparedImage {
  const { width, height, pixels } = image;
  if (!Number.isSafeInteger(maxLongEdge) || maxLongEdge < 1 || maxLongEdge > 16384
    || !Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1
    || !(pixels instanceof Uint8ClampedArray) || pixels.length !== width * height * 4) throw new Error('Invalid image dimensions.');
  const scale = Math.min(1, maxLongEdge / Math.max(width, height));
  if (scale === 1) return image;
  const outWidth = Math.max(1, Math.round(width * scale)), outHeight = Math.max(1, Math.round(height * scale));
  const output = new Uint8ClampedArray(outWidth * outHeight * 4);
  for (let y = 0; y < outHeight; y++) {
    const sy = Math.max(0, Math.min(height - 1, (y + 0.5) * height / outHeight - 0.5));
    const y0 = Math.floor(sy), y1 = Math.min(y0 + 1, height - 1), dy = sy - y0;
    for (let x = 0; x < outWidth; x++) {
      const sx = Math.max(0, Math.min(width - 1, (x + 0.5) * width / outWidth - 0.5));
      const x0 = Math.floor(sx), x1 = Math.min(x0 + 1, width - 1), dx = sx - x0;
      for (let c = 0; c < 4; c++) {
        const top = pixels[(y0 * width + x0) * 4 + c]! * (1 - dx) + pixels[(y0 * width + x1) * 4 + c]! * dx;
        const bottom = pixels[(y1 * width + x0) * 4 + c]! * (1 - dx) + pixels[(y1 * width + x1) * 4 + c]! * dx;
        output[(y * outWidth + x) * 4 + c] = Math.round(top * (1 - dy) + bottom * dy);
      }
    }
  }
  return { width: outWidth, height: outHeight, pixels: output, ...(image.source === undefined ? {} : { source: image.source }) };
}
