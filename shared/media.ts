/**
 * Logos and photos (a professional's, a consultorio's). The panel shrinks the
 * picked image to LOGO_SIZE_PX on its longest side before uploading, so what
 * travels and what the booking page loads stays a few KB; the API checks the
 * real type from the bytes (never the file name) and the size again.
 */

/** Longest side, in px, of the stored image (shown at 64 px; enough for 3× screens). */
export const LOGO_SIZE_PX = 256;
/** Upper bound of a stored logo; a 256 px WebP/PNG is usually 5–60 KB. */
export const MAX_LOGO_BYTES = 300_000;
/** Base64 length of MAX_LOGO_BYTES (4 chars per 3 bytes, padded). */
export const MAX_LOGO_BASE64 = Math.ceil(MAX_LOGO_BYTES / 3) * 4;

export type ImageType = 'image/png' | 'image/jpeg' | 'image/webp';

export const IMAGE_EXTENSIONS: Record<ImageType, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' };

/** The image type from its first bytes (PNG, JPEG or WebP), or null for anything else. */
export function sniffImageType(bytes: Uint8Array): ImageType | null {
  const at = (i: number, ...values: number[]) => values.every((v, k) => bytes[i + k] === v);
  if (bytes.length >= 8 && at(0, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return 'image/png';
  if (bytes.length >= 3 && at(0, 0xff, 0xd8, 0xff)) return 'image/jpeg';
  if (bytes.length >= 12 && at(0, 0x52, 0x49, 0x46, 0x46) && at(8, 0x57, 0x45, 0x42, 0x50)) return 'image/webp';
  return null;
}

/** Stored logos live under this site path (served by the CDN with a year-long cache: names are content hashes). */
export const MEDIA_PREFIX = '/media/';
export const isMediaPath = (path: string): boolean => /^\/media\/(pros|teams)\/[a-z0-9]+\/[a-f0-9]{16}\.(png|jpg|webp)$/.test(path);
