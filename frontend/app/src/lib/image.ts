/**
 * Logos and photos are shrunk here, before they travel: a square of
 * LOGO_SIZE_PX (WebP where the browser can encode it, PNG otherwise), so a
 * 4 MB phone photo uploads — and the booking page downloads — as a few KB.
 * Wide or tall logos are fitted inside the square on white; near-square images
 * (photos, square logos) fill it, centered.
 */
import { LOGO_SIZE_PX, MAX_LOGO_BYTES } from '@shared/media';

/** Files the picker accepts (GIF/SVG are refused: animation and scripts). */
export const LOGO_ACCEPT = 'image/png,image/jpeg,image/webp,image/heic,image/heif';
/** Largest original we try to read (a phone photo is ~2–8 MB). */
export const MAX_ORIGINAL_BYTES = 20 * 1024 * 1024;

export class ImageError extends Error {}

/** cover for near-square images, contain (letterboxed on white) for wide or tall ones. */
export function fitOf(width: number, height: number, size = LOGO_SIZE_PX): { sx: number; sy: number; sw: number; sh: number; dx: number; dy: number; dw: number; dh: number } {
  const ratio = width / height;
  if (ratio > 0.8 && ratio < 1.25) {
    const side = Math.min(width, height);
    return { sx: (width - side) / 2, sy: (height - side) / 2, sw: side, sh: side, dx: 0, dy: 0, dw: size, dh: size };
  }
  const scale = size / Math.max(width, height);
  const dw = Math.round(width * scale);
  const dh = Math.round(height * scale);
  return { sx: 0, sy: 0, sw: width, sh: height, dx: Math.round((size - dw) / 2), dy: Math.round((size - dh) / 2), dw, dh };
}

async function decode(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file);
    } catch {
      // Older Safari: fall back to an <img>.
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

/** Base64 (no `data:` prefix) of the shrunk image, ready for `PUT …/logo`. */
export async function shrinkImage(file: File): Promise<string> {
  if (!file.type.startsWith('image/') || file.type === 'image/gif' || file.type === 'image/svg+xml') {
    throw new ImageError('Elige una imagen PNG, JPG o WebP.');
  }
  if (file.size > MAX_ORIGINAL_BYTES) throw new ImageError('La imagen es muy pesada. Elige una de menos de 20 MB.');
  let source: ImageBitmap | HTMLImageElement;
  try {
    source = await decode(file);
  } catch {
    throw new ImageError('No pudimos leer esa imagen. Prueba con otra (PNG o JPG).');
  }
  const canvas = document.createElement('canvas');
  canvas.width = LOGO_SIZE_PX;
  canvas.height = LOGO_SIZE_PX;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new ImageError('Tu navegador no pudo preparar la imagen.');
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, LOGO_SIZE_PX, LOGO_SIZE_PX);
  ctx.imageSmoothingQuality = 'high';
  const f = fitOf(source.width, source.height);
  ctx.drawImage(source, f.sx, f.sy, f.sw, f.sh, f.dx, f.dy, f.dw, f.dh);
  if ('close' in source) source.close();
  const blob = (await toBlob(canvas, 'image/webp', 0.85)) ?? (await toBlob(canvas, 'image/png'));
  if (!blob) throw new ImageError('Tu navegador no pudo preparar la imagen.');
  if (blob.size > MAX_LOGO_BYTES) throw new ImageError('La imagen quedó muy pesada. Prueba con otra.');
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new ImageError('No pudimos leer esa imagen.'));
    reader.readAsDataURL(blob);
  });
  return dataUrl.slice(dataUrl.indexOf(',') + 1);
}
