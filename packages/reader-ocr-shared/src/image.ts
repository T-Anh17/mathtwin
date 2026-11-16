import type { PreparedImage } from '@mathtwin/reader';
import type { Box, VietOcrConfig } from './types.js';

export function validateImage(image: PreparedImage): void {
  if (!Number.isSafeInteger(image.width) || !Number.isSafeInteger(image.height) || image.width < 1 || image.height < 1
    || image.pixels.length !== image.width * image.height * 4) throw new Error('Invalid RGBA image.');
}
/** Bilinear resize into NCHW. White compositing avoids dark halos on transparent images. */
export function imageTensor(image: PreparedImage, box: Box, width: number, height: number, detector = false): Float32Array {
  const result = new Float32Array(3 * width * height);
  const [left, top, right, bottom] = box;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const sx = Math.max(left, Math.min(right - 1, left + (x + 0.5) * (right - left) / width - 0.5));
    const sy = Math.max(top, Math.min(bottom - 1, top + (y + 0.5) * (bottom - top) / height - 0.5));
    const x0 = Math.floor(sx), y0 = Math.floor(sy), x1 = Math.min(right - 1, x0 + 1), y1 = Math.min(bottom - 1, y0 + 1);
    const dx = sx - x0, dy = sy - y0;
    const p00 = (y0 * image.width + x0) * 4, p10 = (y0 * image.width + x1) * 4;
    const p01 = (y1 * image.width + x0) * 4, p11 = (y1 * image.width + x1) * 4;
    for (let channel = 0; channel < 3; channel++) {
      const c = detector ? 2 - channel : channel;
      const v00 = 255 + (image.pixels[p00 + c]! - 255) * image.pixels[p00 + 3]! / 255;
      const v10 = 255 + (image.pixels[p10 + c]! - 255) * image.pixels[p10 + 3]! / 255;
      const v01 = 255 + (image.pixels[p01 + c]! - 255) * image.pixels[p01 + 3]! / 255;
      const v11 = 255 + (image.pixels[p11 + c]! - 255) * image.pixels[p11 + 3]! / 255;
      const value = (v00 * (1 - dx) + v10 * dx) * (1 - dy) + (v01 * (1 - dx) + v11 * dx) * dy;
      result[channel * width * height + y * width + x] = detector ? (value / 255 - 0.5) / 0.5 : value / 255;
    }
  }
  return result;
}
/** RapidOCR 3.9.2: short side 736, multiples of 32; cap long side at 2000 for low RAM. */
export function detectorSize(image: PreparedImage): { width: number; height: number } {
  const scale = Math.min(Math.max(1, 736 / Math.min(image.width, image.height)), 2000 / Math.max(image.width, image.height));
  return { width: Math.max(32, Math.round(image.width * scale / 32) * 32), height: Math.max(32, Math.round(image.height * scale / 32) * 32) };
}
export function cropBox(box: Box, width: number, height: number): Box {
  const margin = Math.max(2, Math.ceil((box[3] - box[1]) * 0.15));
  return [Math.max(0, Math.floor(box[0]) - 2), Math.max(0, Math.floor(box[1]) - margin),
    Math.min(width, Math.ceil(box[2]) + 2), Math.min(height, Math.ceil(box[3]) + margin)];
}
export function lineSize(box: Box, config: VietOcrConfig): { width: number; height: number } {
  const raw = Math.floor(config.image_height * (box[2] - box[0]) / (box[3] - box[1]));
  return { width: Math.min(config.image_max_width, Math.max(config.image_min_width, Math.ceil(raw / 10) * 10)), height: config.image_height };
}
export function normalizedBox(box: Box, image: PreparedImage): Box {
  return box.map((value, i) => Math.max(0, Math.min(1000, Math.round(value / (i % 2 === 0 ? image.width : image.height) * 1000)))) as Box;
}
