import { resizeImage } from '@mathtwin/reader';
import type { PreparedImage } from '@mathtwin/reader';
import { defaultMaxImageSide } from '@mathtwin/reader-llamacpp-shared';

export interface DecodedImage { original: PreparedImage; resized: PreparedImage; encoded: string }
/** Browser decoding applies EXIF orientation; all canvases/data URLs stay in memory. */
export async function decodeImage(dataUrl: string, maxImageSide = defaultMaxImageSide): Promise<DecodedImage> {
  if (!/^data:image\/(?:png|jpeg);base64,[A-Za-z0-9+/]+=*$/.test(dataUrl) || dataUrl.length > 14_000_000) throw { code: 'image_invalid' };
  const img = new Image(); img.src = dataUrl;
  try { await img.decode(); } catch { throw { code: 'image_invalid' }; }
  const width = img.naturalWidth, height = img.naturalHeight;
  if (width < 1 || height < 1 || width * height > 40_000_000) throw { code: 'image_invalid' };
  const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext('2d'); if (!ctx) throw { code: 'image_invalid' };
  ctx.drawImage(img, 0, 0);
  const original = { width, height, pixels: ctx.getImageData(0, 0, width, height).data };
  const resized = resizeImage(original, maxImageSide);
  canvas.width = resized.width; canvas.height = resized.height;
  ctx.putImageData(new ImageData(new Uint8ClampedArray(resized.pixels), resized.width, resized.height), 0, 0);
  const encoded = canvas.toDataURL('image/png');
  canvas.width = 0; canvas.height = 0;
  return { original, resized, encoded };
}
